import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMealHistoryEntry,
  applyCoachDiffToMeal,
  buildCompactMealTimelineForAi,
  clearCoachEditBadgesOnMeal,
  computeMealItemChanges,
  computeShortPhotoHash,
  doesMealMatchHistorySnapshot,
  mergeMealPhotoStore,
  resolveMealPhotos,
} from '../mealHistory';
import {
  AI_JOB_STALE_TIMEOUT_MS,
  isAiJobAwaitingClarification,
  normalizePendingAiJobs,
} from '../aiJobs';
import {
  AI_TRACE_CRASHED_CAP,
  AI_TRACE_HISTORY_CAP,
  pruneQueueInMemory,
} from '../aiTracePruning';
import {
  buildUserDiagnosticsSummary,
  measureTraineeHealthSnapshot,
} from '../telemetry/diagnosticsSummary';
import { shouldPersistApiLogToDb } from '../telemetry/filterRules';
import {
  sanitizeTraineeForRosterList,
  serializeSyncTimestampRows,
  trimTraineeLogsToWindow,
} from '../traineeSanitize';
import type {
  AiConversationTraceRecord,
  LoggedFoodItem,
  LoggedMealEntry,
  PendingAiMealJob,
  TraineeProfile,
} from '@/types/nutrition';

function makeFood(
  id: string,
  name: string,
  grams: number,
  calories: number,
  protein = 10
): LoggedFoodItem {
  return {
    id,
    name,
    unitLabel: 'גרם',
    quantity: grams,
    grams,
    macros: { calories, protein, carbs: 20, fat: 5 },
    source: 'catalog',
  };
}

describe('mealHistory helpers', () => {
  it('deduplicates identical photo hashes and respects 20-entry cap while preserving active photos', () => {
    const initialStore: Record<string, string> = {};
    for (let i = 0; i < 19; i++) {
      const dataUrl = `data:image/webp;base64,OLD_${i}_${'x'.repeat(20)}`;
      initialStore[computeShortPhotoHash(dataUrl)] = dataUrl;
    }
    const newImgA = 'data:image/webp;base64,LABEL_MILKY_DATA_12345';
    const newImgB = 'data:image/webp;base64,PLATE_SALAD_DATA_98765';

    const res = mergeMealPhotoStore(initialStore, [
      { dataUrl: newImgA, angle: 'label', labelProductName: 'מילקי שוקולד' },
      { dataUrl: newImgA, angle: 'label', labelProductName: 'מילקי שוקולד' },
      { dataUrl: newImgB, angle: 'top-down' },
    ]);

    assert.equal(res.metas.length, 3);
    assert.equal(res.metas[0].hash, res.metas[1].hash);
    assert.equal(res.metas[0].labelProductName, 'מילקי שוקולד');
    assert.ok(Object.keys(res.photoStore).length <= 20);
    assert.equal(res.photoStore[res.metas[0].hash], newImgA);
    assert.equal(res.photoStore[res.metas[2].hash], newImgB);
  });

  it('records added/updated/removed changes and ignores no-op saves', () => {
    const egg = makeFood('egg-1', 'ביצה קשה', 60, 90, 7);
    const bread = makeFood('bread-1', 'לחם כוסמין', 70, 175, 6);
    const meal: LoggedMealEntry = {
      mealSlotId: 'breakfast',
      items: [egg, bread],
      mealTime: '08:30',
      updatedAt: '2026-11-26T08:30:00.000Z',
    };

    const noop = appendMealHistoryEntry(meal, [egg, bread], {
      kind: 'manual_edit',
      actorId: 't1',
      actorName: 'דני',
      actorRole: 'trainee',
      nextMealTime: '08:30',
    });
    assert.equal(noop.entry, null);

    const cheese = makeFood('cheese-1', 'קוטג׳ 5%', 100, 95, 11);
    const biggerEgg = makeFood('egg-1', 'ביצה קשה', 120, 180, 14);
    const edited = appendMealHistoryEntry(meal, [biggerEgg, cheese], {
      kind: 'manual_edit',
      actorId: 't1',
      actorName: 'דני',
      actorRole: 'trainee',
      nextMealTime: '08:30',
    });

    assert.ok(edited.entry);
    assert.equal(edited.entry!.deltaCalories, 180 + 95 - (90 + 175));
    assert.equal(edited.itemChanges.length, 3);
    const changes = computeMealItemChanges(meal.items, [biggerEgg, cheese]);
    assert.deepEqual(
      changes.map((c) => `${c.itemId}:${c.changeKind}`),
      ['egg-1:updated', 'cheese-1:added', 'bread-1:removed']
    );

    // שינוי שעה או מאקרו ללא שינוי בגרם/קלוריות מציג תמיד את ההבדל האמיתי ולא טקסט זהה
    const drinkOrig = makeFood('dr-1', 'משקה חלבון', 350, 221, 25.2);
    const drinkTimeChanged: LoggedFoodItem = { ...drinkOrig, itemTime: '08:15' };
    const subDiff = computeMealItemChanges([drinkOrig], [drinkTimeChanged]);
    assert.equal(subDiff.length, 1);
    assert.notEqual(subDiff[0].summary, subDiff[0].prevSummary);
    assert.ok(subDiff[0].summary.includes('08:15'));
  });

  it('applies coach diff badges, deleted item restore notices, and clears badges completely on clearCoachEditBadgesOnMeal', () => {
    const chicken = makeFood('chk-1', 'חזה עוף', 150, 240, 45);
    const rice = makeFood('ric-1', 'אורז לבן', 150, 195, 4);
    const prevMeal: LoggedMealEntry = {
      mealSlotId: 'lunch',
      items: [chicken, rice],
      updatedAt: '2026-11-26T11:30:00.000Z',
    };

    const updatedChicken = makeFood('chk-1', 'חזה עוף', 200, 320, 60);
    const tahini = makeFood('tah-1', 'טחינה גולמית', 15, 95, 3);

    const diff = applyCoachDiffToMeal({
      prevMeal,
      nextMeal: {
        mealSlotId: 'lunch',
        items: [updatedChicken, tahini],
        updatedAt: '2026-11-26T12:00:00.000Z',
      },
      coachId: 'coach-1',
      coachName: 'מאמן אדיר',
      nowIso: '2026-11-26T12:00:00.000Z',
    });

    assert.equal(diff.changed, true);
    assert.equal(diff.addedOrUpdatedCount, 2);
    assert.equal(diff.removedCount, 1);
    assert.equal(diff.meal.coachEditState?.unreadBanner, true);
    assert.equal(diff.meal.coachEditState?.unreadBadges, true);
    assert.equal(diff.meal.items[0].coachBadge, 'edited');
    assert.ok(diff.meal.items[0].coachPrevSummary?.includes('150g'));
    assert.equal(diff.meal.items[1].coachBadge, 'new');
    assert.equal(diff.meal.pendingCoachDeletedItems?.length, 1);
    assert.equal(diff.meal.pendingCoachDeletedItems?.[0].item.name, 'אורז לבן');
    assert.equal(
      diff.meal.pendingCoachDeletedItems?.[0].historyEventId,
      diff.meal.history?.[0].id
    );

    const cleared = clearCoachEditBadgesOnMeal(diff.meal);
    assert.equal(cleared.coachEditState?.unreadBadges, false);
    assert.equal(cleared.coachEditState?.unreadBanner, false);
    assert.equal(cleared.items[0].coachBadge, undefined);
    assert.equal(cleared.items[1].coachBadge, undefined);
  });

  it('builds compact meal timeline string with live snapshot and clarification metadata', () => {
    const timeline = buildCompactMealTimelineForAi({
      mealSlotId: 'snack',
      updatedAt: '2026-11-26T10:00:00.000Z',
      items: [makeFood('i1', 'חטיף חלבון', 60, 210, 20)],
      history: [
        {
          id: 'h1',
          timestamp: '2026-11-26T10:00:00.000Z',
          timeLabel: '10:00',
          kind: 'ai_clarify',
          actorId: 'u1',
          actorName: 'עמית',
          actorRole: 'trainee',
          summary: 'הושלם זיהוי תווית ערכים',
          deltaCalories: 210,
          aiDetail: {
            mode: 'clarify',
            photos: [
              { hash: 'abc', angle: 'label', labelProductName: 'חטיף חלבון AllIn' },
            ],
            clarificationAnswers: [
              {
                questionId: 'q1',
                selectedOption: 'אחר',
                isCustomOther: true,
                customProductName: 'חטיף חלבון AllIn',
                gramsOrPortionText: 'יחידה 60 גרם',
                answeredAt: '2026-11-26T10:00:30.000Z',
              },
            ],
          },
        },
      ],
    });

    assert.ok(timeline.includes('חטיף חלבון: 60g'));
    assert.ok(timeline.includes('תווית(חטיף חלבון AllIn)'));
    assert.ok(timeline.includes('יחידה 60 גרם'));
  });
});

describe('aiJobs normalization', () => {
  it('retains awaiting_clarification up to 24h while marking stale processing jobs as failed', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    const clarifyRecent: PendingAiMealJob = {
      id: 'job-clarify',
      targetTraineeId: 't1',
      date: '2026-11-26',
      mealSlotId: 'lunch',
      mealSlotName: 'צהריים',
      mode: 'photo',
      status: 'awaiting_clarification',
      startedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    };
    const clarifyExpired: PendingAiMealJob = {
      ...clarifyRecent,
      id: 'job-clarify-old',
      startedAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
    };
    const staleProcessing: PendingAiMealJob = {
      ...clarifyRecent,
      id: 'job-stale',
      status: 'processing',
      startedAt: new Date(now - (AI_JOB_STALE_TIMEOUT_MS + 5000)).toISOString(),
    };

    const res = normalizePendingAiJobs(
      [clarifyRecent, clarifyExpired, staleProcessing],
      now
    );

    assert.equal(res.changed, true);
    assert.equal(res.jobs.length, 2);
    assert.equal(res.jobs[0].id, 'job-clarify');
    assert.equal(res.jobs[0].status, 'awaiting_clarification');
    assert.equal(isAiJobAwaitingClarification(res.jobs[0]), true);
    assert.equal(res.jobs[1].id, 'job-stale');
    assert.equal(res.jobs[1].status, 'failed');
  });
});

describe('aiTracePruning FIFO + Pin caps', () => {
  const makeTrace = (
    idx: number,
    queueType: 'history' | 'crashed',
    isSaved = false
  ): AiConversationTraceRecord => ({
    id: `${queueType}-${idx}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, idx)).toISOString(),
    userId: 'u1',
    userName: 'טסט',
    userRole: 'trainee',
    mode: 'photo',
    queueType,
    isSaved,
    stepsTimeline: [],
  });

  it('keeps history cap at 250 by dropping oldest unsaved items and never deleting pinned items', () => {
    const pinnedOld = makeTrace(0, 'history', true);
    const rows: AiConversationTraceRecord[] = [pinnedOld];
    for (let i = 1; i <= 260; i++) {
      rows.push(makeTrace(i, 'history', false));
    }
    const crashedSample = makeTrace(1, 'crashed', false);
    rows.push(crashedSample);

    const pruned = pruneQueueInMemory(rows, 'history');
    const historyOut = pruned.filter((r) => r.queueType === 'history');
    const crashedOut = pruned.filter((r) => r.queueType === 'crashed');

    assert.equal(historyOut.length, AI_TRACE_HISTORY_CAP);
    assert.equal(crashedOut.length, 1);
    assert.ok(historyOut.some((r) => r.id === pinnedOld.id), 'pinned trace must survive pruning');
    assert.ok(!historyOut.some((r) => r.id === 'history-1'), 'oldest unpinned trace should drop');
    assert.ok(historyOut.some((r) => r.id === 'history-260'), 'newest trace must survive');
  });

  it('keeps crashed queue cap at 100 and counts pinned crashed traces in the cap', () => {
    const pinnedOldest = makeTrace(0, 'crashed', true);
    const rows: AiConversationTraceRecord[] = [pinnedOldest];
    for (let i = 1; i <= 115; i++) {
      rows.push(makeTrace(i, 'crashed', i === 5));
    }
    const pruned = pruneQueueInMemory(rows, 'crashed');
    const crashedOut = pruned.filter((r) => r.queueType === 'crashed');

    assert.equal(crashedOut.length, AI_TRACE_CRASHED_CAP);
    assert.ok(crashedOut.some((r) => r.id === 'crashed-0'));
    assert.ok(crashedOut.some((r) => r.id === 'crashed-5'));
    assert.ok(!crashedOut.some((r) => r.id === 'crashed-1'));
  });
});

describe('resolveMealPhotos & doesMealMatchHistorySnapshot', () => {
  it('resolves photos from photoDataUrls/photoDataUrl and falls back to photoMetas + photoStore', () => {
    const imgA = 'data:image/jpeg;base64,AAA111';
    const imgB = 'data:image/webp;base64,BBB222';
    const imgC = 'data:image/jpeg;base64,CCC333';
    const hashB = computeShortPhotoHash(imgB);
    const hashC = computeShortPhotoHash(imgC);

    const direct = resolveMealPhotos({
      photoDataUrl: imgA,
      photoDataUrls: ['data:image/png;base64,DEMO', imgA, imgB],
      photoStore: { [hashC]: imgC },
      photoMetas: [{ hash: hashC, angle: 'top-down' }],
    });
    assert.deepEqual(direct, [imgA, imgB, imgC]);

    const fromStoreOnly = resolveMealPhotos({
      photoStore: { [hashC]: imgC, [hashB]: imgB },
      photoMetas: [
        { hash: hashB, angle: 'top-down' },
        { hash: hashC, angle: 'label' },
      ],
    });
    assert.deepEqual(fromStoreOnly, [imgB, imgC]);
  });

  it('hides rollback when meal matches snapshot even after manual revert with a new item id', () => {
    const chicken = makeFood('chk-1', 'חזה עוף', 150, 240, 45);
    const rice = makeFood('rice-1', 'אורז בסמטי', 120, 156, 3);
    const initialMeal: LoggedMealEntry = {
      mealSlotId: 'lunch',
      items: [chicken, rice],
      mealTime: '13:00',
      updatedAt: '2026-11-26T13:00:00.000Z',
    };

    const recorded = appendMealHistoryEntry(
      { ...initialMeal, items: [chicken] },
      [chicken, rice],
      {
        kind: 'manual_edit',
        actorId: 't1',
        actorName: 'דני',
        actorRole: 'trainee',
        nextMealTime: '13:00',
      }
    );
    assert.ok(recorded.entry);
    const snapEntry = recorded.entry!;

    // Current meal matches snapshot right after creation
    assert.equal(doesMealMatchHistorySnapshot(initialMeal, snapEntry), true);

    // Meal was edited later -> differs from snapshot, rollback should be offered
    const editedMeal: LoggedMealEntry = {
      ...initialMeal,
      items: [chicken, makeFood('rice-1', 'אורז בסמטי', 200, 260, 5)],
    };
    assert.equal(doesMealMatchHistorySnapshot(editedMeal, snapEntry), false);

    // Meal time alone differs -> differs from snapshot, rollback should be offered
    const timeEditedMeal: LoggedMealEntry = {
      ...initialMeal,
      mealTime: '14:15',
    };
    assert.equal(doesMealMatchHistorySnapshot(timeEditedMeal, snapEntry), false);

    // User manually deletes and re-adds rice with identical macros/grams -> new id, still matches!
    const manuallyRevertedMeal: LoggedMealEntry = {
      ...initialMeal,
      items: [makeFood('rice-new-id', 'אורז בסמטי', 120, 156, 3), chicken],
    };
    assert.equal(doesMealMatchHistorySnapshot(manuallyRevertedMeal, snapEntry), true);
  });
});

describe('telemetry diagnostics summary & persistence rules', () => {
  it('persists non-empty cookie auth rejections and heavy /api/data payloads while dropping anonymous noise', () => {
    assert.equal(
      shouldPersistApiLogToDb({
        requestId: 'r1',
        method: 'GET',
        routePattern: '/api/auth/heartbeat',
        statusCode: 401,
        durationMs: 120,
        errorCode: 'UNAUTHENTICATED_NO_COOKIE',
      }),
      false
    );

    assert.equal(
      shouldPersistApiLogToDb({
        requestId: 'r2',
        method: 'GET',
        routePattern: '/api/auth/heartbeat',
        statusCode: 401,
        durationMs: 140,
        errorCode: 'COOKIE_EXPIRED',
      }),
      true
    );

    assert.equal(
      shouldPersistApiLogToDb({
        requestId: 'r3',
        method: 'GET',
        routePattern: '/api/auth/session',
        actionName: 'session_rejected',
        statusCode: 200,
        durationMs: 95,
        errorCode: 'SESSION_REVOKED',
      }),
      true
    );

    assert.equal(
      shouldPersistApiLogToDb({
        requestId: 'r4',
        method: 'GET',
        routePattern: '/api/data',
        statusCode: 200,
        durationMs: 420,
        aiUsage: { diag: { payloadKB: 480 } },
      }),
      true
    );
  });

  it('aggregates startup cookie losses, heavy trainee payload, and slow food searches into findings & timeline', () => {
    const sampleTrainee = {
      id: 'trainee-diag-1',
      email: 'u@example.com',
      name: 'תמר',
      avatar: 'ת',
      phone: '050-0000000',
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      status: 'active' as const,
      sessionVersion: 1,
      goal: 'חיטוב',
      currentWeight: 60,
      targetWeight: 56,
      tolerancePercent: 10,
      workoutTemplate: { id: 'tpl1', name: 'A', description: '', dayType: 'workout' as const, tolerancePercent: 10, meals: [] },
      restTemplate: { id: 'tpl2', name: 'B', description: '', dayType: 'rest' as const, tolerancePercent: 10, meals: [] },
      favoriteFoodIds: [],
      weightHistory: [],
      logs: {
        '2026-11-25': {
          date: '2026-11-25',
          dayType: 'workout' as const,
          waterCups: 6,
          waterGoal: 10,
          meals: {
            breakfast: {
              mealSlotId: 'breakfast',
              items: [makeFood('i1', 'טוסט', 90, 250, 12)],
              photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(420_000),
              updatedAt: '2026-11-25T08:00:00.000Z',
            },
          },
        },
      },
    };

    const health = measureTraineeHealthSnapshot(sampleTrainee, {
      platform: 'android-apk',
      appVersionCode: 18,
      appVersionName: '1.0.18',
      webBuildId: 'build-1',
      updatedAt: '2026-11-26T20:00:00.000Z',
    });
    assert.ok(health.profileSizeKB >= 400);
    assert.equal(health.approxPhotosCount, 1);

    const summary = buildUserDiagnosticsSummary({
      actorFilter: sampleTrainee.id,
      traineeHealth: health,
      clientRows: [
        {
          id: 1,
          created_at: '2026-11-26T20:05:00.000Z',
          session_id: 's1',
          user_id: null,
          platform: 'android-apk',
          app_version_code: 18,
          event_type: 'client_error',
          event_name: 'session_lost_on_startup',
          details: {
            lastKnownUserId: sampleTrainee.id,
            diagCode: 'UNAUTHENTICATED_NO_COOKIE',
            priorAgeMin: 45,
          },
        },
        {
          id: 2,
          created_at: '2026-11-26T20:06:00.000Z',
          session_id: 's2',
          user_id: sampleTrainee.id,
          platform: 'android-apk',
          app_version_code: 18,
          event_type: 'client_error',
          event_name: 'food_search_trace',
          details: { mode: 'db', timedOut: true, clientMs: 12005, queryLen: 5 },
        },
      ],
      apiRows: [
        {
          id: 10,
          created_at: '2026-11-26T20:05:30.000Z',
          request_id: 'req-10',
          method: 'GET',
          route_pattern: '/api/data',
          status_code: 200,
          duration_ms: 2100,
          actor_id: sampleTrainee.id,
          platform: 'android-apk',
          ai_usage: { diag: { payloadKB: 415, authMs: 80, profileMs: 1900 } },
        },
      ],
      auditRows: [],
    });

    assert.equal(summary.disconnects.startupCookieLost, 1);
    assert.equal(summary.search.errorOrTimeoutCount, 1);
    assert.equal(summary.startup.maxDataKB, 415);
    assert.ok(summary.autoFindings.length >= 3);
    assert.equal(summary.timeline.length, 3);
  });
});

describe('sanitizeTraineeForRosterList payload trimming', () => {
  it('strips heavy meal photos, history, and job retry blobs without mutating source or losing dashboard metrics', () => {
    const bigPhoto = 'data:image/jpeg;base64,' + 'Z'.repeat(50_000);
    const savedThumb = 'data:image/jpeg;base64,SAVED_THUMB';
    const source: TraineeProfile = {
      id: 't-roster-1',
      email: 'roster@example.com',
      password: 'hashed-secret-value',
      status: 'active',
      phone: '050-0000000',
      name: 'רונית',
      avatar: 'ר',
      goal: 'חיטוב',
      currentWeight: 62,
      targetWeight: 58,
      tolerancePercent: 10,
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      workoutTemplate: { id: 'w1', name: 'יום אימון', description: '', dayType: 'workout', tolerancePercent: 10, meals: [] },
      restTemplate: { id: 'r1', name: 'יום מנוחה', description: '', dayType: 'rest', tolerancePercent: 10, meals: [] },
      favoriteFoodIds: ['f1'],
      weightHistory: [{ date: '2026-11-26', weight: 62 }],
      savedMeals: [
        {
          id: 'sm-1',
          title: 'ארוחה שמורה',
          items: [makeFood('i1', 'יוגורט', 150, 90, 12)],
          totalCalories: 90,
          totalProtein: 12,
          totalCarbs: 5,
          totalFat: 2,
          photoDataUrls: [savedThumb, bigPhoto],
          isFavorite: false,
          isPinned: false,
          useCount: 1,
          createdAt: '2026-11-26T10:00:00.000Z',
          updatedAt: '2026-11-26T10:00:00.000Z',
        },
      ],
      pendingAiJobs: [
        {
          id: 'job-1',
          targetTraineeId: 't-roster-1',
          date: '2026-11-26',
          mealSlotId: 'm1',
          mealSlotName: 'בוקר',
          mode: 'photo',
          status: 'processing',
          startedAt: new Date().toISOString(),
          photoDataUrls: [bigPhoto],
          retryPayload: {
            mode: 'photo',
            traineeId: 't-roster-1',
            date: '2026-11-26',
            mealSlotId: 'm1',
            failedAt: '2026-11-26T08:15:00.000Z',
            photos: [{ dataUrl: bigPhoto, angle: 'top-down' }],
          },
        },
      ],
      logs: {
        '2026-11-26': {
          date: '2026-11-26',
          dayType: 'workout',
          waterCups: 7,
          waterGoal: 10,
          sleepHours: 7.5,
          steps: 9400,
          meals: {
            m1: {
              mealSlotId: 'm1',
              items: [makeFood('f1', 'שייק חלבון', 300, 220, 28)],
              mealTime: '08:15',
              photoDataUrl: bigPhoto,
              photoDataUrls: [bigPhoto],
              photoStore: { h1: bigPhoto },
              photoMetas: [{ hash: 'h1', angle: 'top-down' }],
              coachFeedback: 'מעולה!',
              history: [
                {
                  id: 'hist-1',
                  timestamp: '2026-11-26T08:16:00.000Z',
                  timeLabel: '08:16',
                  kind: 'ai_analyze',
                  actorId: 't-roster-1',
                  actorName: 'רונית',
                  actorRole: 'trainee',
                  summary: 'זיהוי AI',
                  itemsSnapshot: [makeFood('f1', 'שייק חלבון', 300, 220, 28)],
                },
              ],
              updatedAt: '2026-11-26T08:16:00.000Z',
            },
          },
        },
      },
    };

    const slim = sanitizeTraineeForRosterList(source);

    // אבטחה ושמירה על ערכי דאשבורד
    assert.equal(slim.password, '');
    assert.equal(slim.logs['2026-11-26'].steps, 9400);
    assert.equal(slim.logs['2026-11-26'].waterCups, 7);
    const slimMeal = slim.logs['2026-11-26'].meals.m1;
    assert.equal(slimMeal.items.length, 1);
    assert.equal(slimMeal.mealTime, '08:15');
    assert.equal(slimMeal.coachFeedback, 'מעולה!');

    // השמטת שדות כבדים ברוסטר
    assert.equal(slimMeal.photoDataUrl, undefined);
    assert.equal(slimMeal.photoDataUrls, undefined);
    assert.equal(slimMeal.photoStore, undefined);
    assert.equal(slimMeal.photoMetas, undefined);
    assert.equal(slimMeal.history, undefined);
    assert.equal(slim.pendingAiJobs?.[0].photoDataUrls, undefined);
    assert.equal(slim.pendingAiJobs?.[0].retryPayload, undefined);

    // שמירה על תמונה יחידה של SavedMeal עבור CoachSavedMealsPanel
    assert.equal(slim.savedMeals?.[0].photoDataUrl, savedThumb);
    assert.equal(slim.savedMeals?.[0].photoDataUrls, undefined);

    // אובייקט המקור לא נפגע במוטציה
    assert.equal(source.logs['2026-11-26'].meals.m1.photoDataUrl, bigPhoto);
    assert.ok(source.logs['2026-11-26'].meals.m1.photoStore?.h1);
    assert.equal(source.logs['2026-11-26'].meals.m1.history?.length, 1);
  });

  it('produces order-independent sync stamps and falls back cleanly if any updated_at is missing', () => {
    const a = serializeSyncTimestampRows([
      { id: 'b', updated_at: '2026-11-26T10:00:00Z' },
      { id: 'a', updated_at: '2026-11-26T09:00:00Z' },
    ]);
    const b = serializeSyncTimestampRows([
      { id: 'a', updated_at: '2026-11-26T09:00:00Z' },
      { id: 'b', updated_at: '2026-11-26T10:00:00Z' },
    ]);
    assert.equal(a, 'a:2026-11-26T09:00:00Z,b:2026-11-26T10:00:00Z');
    assert.equal(a, b);
    assert.equal(
      serializeSyncTimestampRows([
        { id: 'a', updated_at: '2026-11-26T09:00:00Z' },
        { id: 'b', updated_at: null },
      ]),
      null
    );
  });

  it('trims logs older than cutoff while preserving recent and protected dates without mutating source', () => {
    const dayStub = (date: string): TraineeProfile['logs'][string] => ({
      date,
      dayType: 'workout',
      waterCups: 5,
      waterGoal: 10,
      meals: {},
    });
    const base: TraineeProfile = {
      id: 't-win-1',
      email: 'win@example.com',
      name: 'דנה',
      avatar: 'ד',
      phone: '050-0000000',
      status: 'active',
      goal: 'חיטוב',
      currentWeight: 60,
      targetWeight: 56,
      tolerancePercent: 10,
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      workoutTemplate: { id: 'w1', name: 'A', description: '', dayType: 'workout', tolerancePercent: 10, meals: [] },
      restTemplate: { id: 'r1', name: 'B', description: '', dayType: 'rest', tolerancePercent: 10, meals: [] },
      favoriteFoodIds: [],
      weightHistory: [],
      logs: {
        '2026-10-01': dayStub('2026-10-01'),
        '2026-10-15': dayStub('2026-10-15'),
        '2026-11-12': dayStub('2026-11-12'),
        '2026-11-26': dayStub('2026-11-26'),
      },
    };

    const trimmed = trimTraineeLogsToWindow(base, '2026-11-12', ['2026-10-15']);
    assert.equal(trimmed.olderLogsInfo.hasOlderLogs, true);
    assert.equal(trimmed.olderLogsInfo.olderLogsCount, 1);
    assert.equal(trimmed.olderLogsInfo.cutoffDateIso, '2026-11-12');
    assert.deepEqual(Object.keys(trimmed.trainee.logs).sort(), [
      '2026-10-15',
      '2026-11-12',
      '2026-11-26',
    ]);
    // Source logs untouched
    assert.equal(Object.keys(base.logs).length, 4);

    const noOlder = trimTraineeLogsToWindow(base, '2026-09-01');
    assert.equal(noOlder.olderLogsInfo.hasOlderLogs, false);
    assert.equal(noOlder.olderLogsInfo.olderLogsCount, 0);
    assert.equal(noOlder.trainee, base);
  });
});
