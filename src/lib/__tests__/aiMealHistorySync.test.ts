import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMealHistoryEntry,
  applyCoachDiffToMeal,
  buildCompactMealTimelineForAi,
  clearCoachEditBadgesOnMeal,
  computeMealItemChanges,
  computeShortPhotoHash,
  mergeMealPhotoStore,
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
import type {
  AiConversationTraceRecord,
  LoggedFoodItem,
  LoggedMealEntry,
  PendingAiMealJob,
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
