import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  generateSecureId,
  getSessionFromRequest,
  hashPassword,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  buildCoachDirectory,
  canCoachAccessTrainee,
  canCoachEditTemplate,
  canCoachManageGroup,
  canCoachViewTemplate,
  deleteCoachWithOrphanProtection,
  deleteGroupOnServer,
  deleteTemplateOnServer,
  deleteTraineeOnServer,
  getQuickChipsContextForTrainee,
  getServerDbState,
  getSingleCoachFromServer,
  getSingleTraineeFromServer,
  isPrimaryOwnerOfTrainee,
  isSuperAdmin,
  sanitizeCoachForClient,
  sanitizeTraineeForClient,
  updateServerDbState,
} from '@/lib/serverStore';
import { DEFAULT_TEMPLATES, getTodayIso } from '@/data/israeliFoodCatalog';
import { diagnoseSupabaseError } from '@/lib/supabase';
import {
  AccountStatus,
  CoachProfile,
  DailyLog,
  DayType,
  LoggedFoodItem,
  NutritionTemplate,
  QuickChipCategory,
  QuickContextChip,
  ReferenceObjectKind,
  SavedMealPreset,
  ServingToolKind,
  TraineeCustomUnit,
  TraineeGroup,
  TraineeProfile,
  TraineeServingTool,
} from '@/types/nutrition';

function mergeLogsPreservingPendingAi(
  existing: TraineeProfile,
  incomingLogs?: Record<string, DailyLog>
): Record<string, DailyLog> {
  if (!incomingLogs) return existing.logs;
  const merged = { ...incomingLogs };
  const unackedCompleted = (existing.pendingAiJobs || []).filter(
    (j) => j.status === 'completed' && !j.acknowledged && j.autoSyncedToLog
  );
  for (const job of unackedCompleted) {
    const serverMeal = existing.logs[job.date]?.meals?.[job.mealSlotId];
    if (!serverMeal || !serverMeal.items?.length) continue;
    const clientDay = merged[job.date] || existing.logs[job.date];
    const clientMeal = clientDay?.meals?.[job.mealSlotId];
    const clientItemIds = new Set((clientMeal?.items || []).map((i) => i.id));
    const missingFromClient = serverMeal.items.filter(
      (i) => !clientItemIds.has(i.id)
    );
    if (missingFromClient.length > 0 && clientDay) {
      merged[job.date] = {
        ...clientDay,
        meals: {
          ...clientDay.meals,
          [job.mealSlotId]: {
            ...(clientMeal || serverMeal),
            items: [...(clientMeal?.items || []), ...missingFromClient],
            photoDataUrl: clientMeal?.photoDataUrl || serverMeal.photoDataUrl,
          },
        },
      };
    }
  }
  return merged;
}

const ALLOWED_CHIP_CATEGORIES = new Set<QuickChipCategory>([
  'sauce',
  'prep',
  'portion',
  'drink',
  'source',
  'tool-hint',
]);

const ALLOWED_TOOL_KINDS = new Set<ServingToolKind>([
  'plate',
  'bowl',
  'box',
  'cup',
  'spoon',
  'custom',
]);

const ALLOWED_REF_KINDS = new Set<ReferenceObjectKind>([
  'credit-card',
  'coin-10',
  'coin-5',
  'cutlery',
  'none',
]);

function sanitizeServingTools(raw: unknown): TraineeServingTool[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 50)
    .map((item) => {
      const obj = (item || {}) as Partial<TraineeServingTool>;
      const name = sanitizeText(obj.name, 60);
      if (!name) return null;
      const kind = ALLOWED_TOOL_KINDS.has(obj.kind as ServingToolKind)
        ? (obj.kind as ServingToolKind)
        : 'plate';
      const refObj = ALLOWED_REF_KINDS.has(obj.referenceObject as ReferenceObjectKind)
        ? (obj.referenceObject as ReferenceObjectKind)
        : undefined;
      return {
        id: sanitizeText(obj.id, 60) || generateSecureId('tool'),
        name,
        kind,
        diameterCm:
          obj.diameterCm !== undefined
            ? sanitizeNumber(obj.diameterCm, 2, 60, 0) || undefined
            : undefined,
        depthCm:
          obj.depthCm !== undefined
            ? sanitizeNumber(obj.depthCm, 0.5, 40, 0) || undefined
            : undefined,
        volumeMl:
          obj.volumeMl !== undefined
            ? sanitizeNumber(obj.volumeMl, 5, 5000, 0) || undefined
            : undefined,
        defaultFoodGrams:
          obj.defaultFoodGrams !== undefined
            ? sanitizeNumber(obj.defaultFoodGrams, 1, 3000, 0) || undefined
            : undefined,
        notes: obj.notes ? sanitizeText(obj.notes, 180) : undefined,
        measuredByAi: Boolean(obj.measuredByAi),
        referenceObject: refObj,
        confidenceNote: obj.confidenceNote
          ? sanitizeText(obj.confidenceNote, 180)
          : undefined,
        updatedAt: new Date().toISOString(),
      } as TraineeServingTool;
    })
    .filter((x): x is TraineeServingTool => Boolean(x));
}

function sanitizeCustomUnits(raw: unknown): TraineeCustomUnit[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 80)
    .map((item) => {
      const obj = (item || {}) as Partial<TraineeCustomUnit>;
      const unitName = sanitizeText(obj.unitName, 60);
      if (!unitName) return null;
      return {
        id: sanitizeText(obj.id, 60) || generateSecureId('unit'),
        unitName,
        foodNameKeyword: obj.foodNameKeyword
          ? sanitizeText(obj.foodNameKeyword, 60)
          : undefined,
        grams: sanitizeNumber(obj.grams, 1, 3000, 100),
        servingToolId: obj.servingToolId
          ? sanitizeText(obj.servingToolId, 60)
          : undefined,
        notes: obj.notes ? sanitizeText(obj.notes, 140) : undefined,
        updatedAt: new Date().toISOString(),
      } as TraineeCustomUnit;
    })
    .filter((x): x is TraineeCustomUnit => Boolean(x));
}

function sanitizeQuickChips(
  raw: unknown,
  scope: 'user' | 'group' | 'global',
  maxCount: number,
  groupId?: string
): QuickContextChip[] {
  if (!Array.isArray(raw)) return [];
  const list = raw
    .slice(0, maxCount)
    .map((item) => {
      const obj = (item || {}) as Partial<QuickContextChip>;
      const label = sanitizeText(obj.label, 50);
      if (!label) return null;
      const category = ALLOWED_CHIP_CATEGORIES.has(obj.category as QuickChipCategory)
        ? (obj.category as QuickChipCategory)
        : 'prep';
      return {
        id: sanitizeText(obj.id, 60) || generateSecureId('chip'),
        label,
        category,
        scope,
        groupId: scope === 'group' ? groupId || obj.groupId : undefined,
        createdBy: obj.createdBy ? sanitizeText(obj.createdBy, 60) : undefined,
        lastUsedAt: obj.lastUsedAt || new Date().toISOString(),
        useCount: sanitizeNumber(obj.useCount, 0, 100000, 1),
      } as QuickContextChip;
    })
    .filter((x): x is QuickContextChip => Boolean(x));

  return list.sort((a, b) =>
    (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '')
  );
}

function sanitizeLoggedItems(raw: unknown): LoggedFoodItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 35).map((item) => {
    const obj = (item || {}) as Partial<LoggedFoodItem>;
    const grams = sanitizeNumber(obj.grams, 1, 5000, 100);
    return {
      id: sanitizeText(obj.id, 60) || generateSecureId('food'),
      name: sanitizeText(obj.name, 90) || 'פריט מזון',
      unitLabel: sanitizeText(obj.unitLabel, 40) || 'גרם',
      quantity: sanitizeNumber(obj.quantity, 0.05, 500, 1),
      grams,
      macros: {
        calories: sanitizeNumber(obj.macros?.calories, 0, 10000, 0),
        protein: sanitizeNumber(obj.macros?.protein, 0, 1000, 0),
        carbs: sanitizeNumber(obj.macros?.carbs, 0, 1000, 0),
        fat: sanitizeNumber(obj.macros?.fat, 0, 1000, 0),
      },
      source:
        obj.source === 'ai-photo' ||
        obj.source === 'ai-text' ||
        obj.source === 'catalog' ||
        obj.source === 'barcode' ||
        obj.source === 'manual'
          ? obj.source
          : 'manual',
      aiEngine: obj.aiEngine ? sanitizeText(obj.aiEngine, 60) : undefined,
      isAiFallback: obj.isAiFallback !== undefined ? Boolean(obj.isAiFallback) : undefined,
      fallbackReason: obj.fallbackReason
        ? sanitizeText(obj.fallbackReason, 160)
        : undefined,
    };
  });
}

function buildSanitizedSavedPreset(
  raw: Partial<SavedMealPreset>,
  existing?: SavedMealPreset
): SavedMealPreset | null {
  const title = sanitizeText(raw.title ?? existing?.title, 90);
  const items =
    raw.items !== undefined
      ? sanitizeLoggedItems(raw.items)
      : existing?.items || [];
  if (!title || items.length === 0) return null;

  const totals = items.reduce(
    (acc, it) => ({
      calories: acc.calories + (Number(it.macros?.calories) || 0),
      protein: acc.protein + (Number(it.macros?.protein) || 0),
      carbs: acc.carbs + (Number(it.macros?.carbs) || 0),
      fat: acc.fat + (Number(it.macros?.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const rawPhotos = Array.isArray(raw.photoDataUrls)
    ? raw.photoDataUrls
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 400000)
        .slice(0, 3)
    : existing?.photoDataUrls;
  const singlePhoto =
    typeof raw.photoDataUrl === 'string' && raw.photoDataUrl.length < 400000
      ? raw.photoDataUrl
      : rawPhotos?.[0] || existing?.photoDataUrl;

  const nowIso = new Date().toISOString();
  return {
    id: sanitizeText(raw.id, 60) || existing?.id || generateSecureId('mealpreset'),
    title,
    mealSlotId: raw.mealSlotId
      ? sanitizeText(raw.mealSlotId, 50)
      : existing?.mealSlotId,
    items,
    totalCalories: Math.round(totals.calories),
    totalProtein: Math.round(totals.protein * 10) / 10,
    totalCarbs: Math.round(totals.carbs * 10) / 10,
    totalFat: Math.round(totals.fat * 10) / 10,
    photoDataUrls: rawPhotos,
    photoDataUrl: singlePhoto,
    contextSummary:
      raw.contextSummary !== undefined
        ? sanitizeText(raw.contextSummary, 240)
        : existing?.contextSummary,
    contextParams: raw.contextParams || existing?.contextParams,
    aiEngine:
      raw.aiEngine !== undefined
        ? sanitizeText(raw.aiEngine, 60)
        : existing?.aiEngine,
    isAiFallback:
      raw.isAiFallback !== undefined ? Boolean(raw.isAiFallback) : existing?.isAiFallback,
    fallbackReason:
      raw.fallbackReason !== undefined
        ? sanitizeText(raw.fallbackReason, 160)
        : existing?.fallbackReason,
    isFavorite:
      raw.isFavorite !== undefined ? Boolean(raw.isFavorite) : existing?.isFavorite ?? false,
    isPinned:
      raw.isPinned !== undefined ? Boolean(raw.isPinned) : existing?.isPinned ?? false,
    useCount:
      raw.useCount !== undefined
        ? sanitizeNumber(raw.useCount, 0, 100000, existing?.useCount ?? 1)
        : existing?.useCount ?? 1,
    lastUsedAt: raw.lastUsedAt || existing?.lastUsedAt || nowIso,
    createdAt: existing?.createdAt || raw.createdAt || nowIso,
    updatedAt: nowIso,
    coachQuestion: existing?.coachQuestion,
  };
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: 'לא מחובר' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // 1. מתאמן מחובר: מקבל אך ורק את הפרופיל של עצמו + צ'יפים קבוצתיים/כלליים לקונטקסט AI
  if (session.role === 'trainee') {
    const myProfile = await getSingleTraineeFromServer(session.id);
    if (!myProfile || myProfile.status !== 'active') {
      const res = NextResponse.json(
        { error: 'החשבון אינו פעיל' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
      return clearSessionCookie(res);
    }

    const chipsCtx = await getQuickChipsContextForTrainee(myProfile.groupId);

    return NextResponse.json(
      {
        trainees: [sanitizeTraineeForClient(myProfile)],
        templates: [],
        groups: [],
        coaches: [],
        coachDirectory: [],
        globalQuickChips: chipsCtx.globalQuickChips,
        groupQuickChips: chipsCtx.groupQuickChips,
        role: 'trainee',
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const state = await getServerDbState();

  // 2. מאמן רגיל מחובר: מקבל אך ורק מתאמנים שלו או ששותפו איתו + טמפלייטים מותרים לו
  if (session.role === 'coach') {
    const liveCoach = await getSingleCoachFromServer(session.id);
    if (!liveCoach || liveCoach.status !== 'active') {
      const res = NextResponse.json(
        { error: 'חשבון המאמן מושהה' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
      return clearSessionCookie(res);
    }

    const visibleTrainees = state.trainees
      .filter((t) => canCoachAccessTrainee(session, t))
      .map((t) => sanitizeTraineeForClient(t));

    const visibleTemplates = state.templates.filter((tpl) =>
      canCoachViewTemplate(session, tpl)
    );

    const visibleGroups = state.groups.filter((grp) =>
      canCoachManageGroup(session, grp)
    );

    return NextResponse.json(
      {
        trainees: visibleTrainees,
        templates: visibleTemplates,
        groups: visibleGroups,
        coaches: [], // מאמן רגיל לעולם לא מקבל את טבלת המאמנים המלאה
        myCoachProfile: sanitizeCoachForClient(liveCoach),
        coachDirectory: buildCoachDirectory(state), // שמות בלבד לצורך שיתוף
        coachInviteCode: liveCoach.inviteCode,
        globalQuickChips: state.globalQuickChips || [],
        role: 'coach',
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // 3. מנהל ראשי (Super Admin): גישה מלאה לכל המאמנים, המתאמנים, הקבוצות והטמפלייטים
  const dbError =
    state.readErrors && state.readErrors.length > 0
      ? diagnoseSupabaseError(state.readErrors.join(' | '))
      : undefined;

  return NextResponse.json(
    {
      trainees: state.trainees.map((t) => sanitizeTraineeForClient(t)),
      templates: state.templates,
      groups: state.groups,
      coaches: state.coaches.map((c) => sanitizeCoachForClient(c)),
      coachDirectory: buildCoachDirectory(state),
      coachInviteCode: state.coachInviteCode,
      globalQuickChips: state.globalQuickChips || [],
      role: 'admin',
      dbError,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function POST(request: NextRequest) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }

  // בדיקה חיה שמאמן לא הושהה בזמן אמת
  if (session.role === 'coach') {
    const liveCoach = await getSingleCoachFromServer(session.id);
    if (!liveCoach || liveCoach.status !== 'active') {
      const res = NextResponse.json(
        { error: 'חשבון המאמן אינו פעיל' },
        { status: 403 }
      );
      return clearSessionCookie(res);
    }
  }

  try {
    const body = await request.json();
    const { action } = body as { action: string };

    // =========================================================================
    // 0. פעולות משותפות למתאמן ולמאמן (כלי הגשה, יחידות מידה וצ'יפים מהירים עם RBAC)
    // =========================================================================
    if (action === 'manage-custom-tools-and-units') {
      const requestedId =
        session.role === 'trainee'
          ? session.id
          : String(body.traineeId || session.id);

      if (session.role === 'trainee' && body.traineeId && body.traineeId !== session.id) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }

      const state = await getServerDbState();
      const target = state.trainees.find((t) => t.id === requestedId);
      if (
        !target ||
        (session.role === 'trainee'
          ? target.status !== 'active'
          : !canCoachAccessTrainee(session, target))
      ) {
        return NextResponse.json({ error: 'אין הרשאה לעדכן כלים למתאמן זה' }, { status: 403 });
      }

      const nextTools =
        body.customServingTools !== undefined
          ? sanitizeServingTools(body.customServingTools)
          : target.customServingTools || [];
      const nextUnits =
        body.customFoodUnits !== undefined
          ? sanitizeCustomUnits(body.customFoodUnits)
          : target.customFoodUnits || [];

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === requestedId
            ? {
                ...t,
                customServingTools: nextTools,
                customFoodUnits: nextUnits,
              }
            : t
        ),
      }));

      return NextResponse.json({
        ok: true,
        customServingTools: nextTools,
        customFoodUnits: nextUnits,
      });
    }

    if (action === 'manage-quick-chips') {
      const scope = String(body.scope || 'user') as 'user' | 'group' | 'global';
      const op = String(body.op || 'touch') as 'touch' | 'upsert' | 'delete' | 'replace';
      const state = await getServerDbState();

      if (scope === 'global') {
        if (!isSuperAdmin(session)) {
          return NextResponse.json(
            { error: 'רק מנהל המערכת הראשי רשאי לנהל צ׳יפים לכלל המשתמשים' },
            { status: 403 }
          );
        }
        let nextGlobal = [...(state.globalQuickChips || [])];
        if (op === 'replace') {
          nextGlobal = sanitizeQuickChips(body.chips, 'global', 50);
        } else if (op === 'delete') {
          const chipId = String(body.chipId || '');
          nextGlobal = nextGlobal.filter((c) => c.id !== chipId);
        } else {
          const chipInput = (body.chip || {}) as Partial<QuickContextChip>;
          const label = sanitizeText(chipInput.label, 50);
          if (!label) {
            return NextResponse.json({ error: 'חסר טקסט לצ׳יפ' }, { status: 400 });
          }
          const category = ALLOWED_CHIP_CATEGORIES.has(
            chipInput.category as QuickChipCategory
          )
            ? (chipInput.category as QuickChipCategory)
            : 'prep';
          const existingIdx = nextGlobal.findIndex(
            (c) => c.id === chipInput.id || (c.label === label && c.category === category)
          );
          const nowIso = new Date().toISOString();
          if (existingIdx >= 0) {
            nextGlobal[existingIdx] = {
              ...nextGlobal[existingIdx],
              label,
              category,
              lastUsedAt: nowIso,
              useCount: (nextGlobal[existingIdx].useCount || 0) + 1,
            };
          } else {
            nextGlobal.unshift({
              id: generateSecureId('gchip'),
              label,
              category,
              scope: 'global',
              createdBy: session.name,
              lastUsedAt: nowIso,
              useCount: 1,
            });
          }
          nextGlobal = nextGlobal.slice(0, 50);
        }

        await updateServerDbState((prev) => ({
          ...prev,
          globalQuickChips: nextGlobal,
        }));
        return NextResponse.json({ ok: true, globalQuickChips: nextGlobal });
      }

      if (scope === 'group') {
        if (session.role === 'trainee') {
          return NextResponse.json({ error: 'אין הרשאה לעדכן צ׳יפים קבוצתיים' }, { status: 403 });
        }
        const groupId = String(body.groupId || '');
        const grp = state.groups.find((g) => g.id === groupId);
        if (!grp || !canCoachManageGroup(session, grp)) {
          return NextResponse.json({ error: 'אין הרשאה לקבוצה זו' }, { status: 403 });
        }
        let nextGroupChips = [...(grp.customQuickChips || [])];
        if (op === 'replace') {
          nextGroupChips = sanitizeQuickChips(body.chips, 'group', 40, groupId);
        } else if (op === 'delete') {
          const chipId = String(body.chipId || '');
          nextGroupChips = nextGroupChips.filter((c) => c.id !== chipId);
        } else {
          const chipInput = (body.chip || {}) as Partial<QuickContextChip>;
          const label = sanitizeText(chipInput.label, 50);
          if (!label) {
            return NextResponse.json({ error: 'חסר טקסט לצ׳יפ' }, { status: 400 });
          }
          const category = ALLOWED_CHIP_CATEGORIES.has(
            chipInput.category as QuickChipCategory
          )
            ? (chipInput.category as QuickChipCategory)
            : 'prep';
          const existingIdx = nextGroupChips.findIndex(
            (c) => c.id === chipInput.id || (c.label === label && c.category === category)
          );
          const nowIso = new Date().toISOString();
          if (existingIdx >= 0) {
            nextGroupChips[existingIdx] = {
              ...nextGroupChips[existingIdx],
              label,
              category,
              lastUsedAt: nowIso,
              useCount: (nextGroupChips[existingIdx].useCount || 0) + 1,
            };
          } else {
            nextGroupChips.unshift({
              id: generateSecureId('grpchip'),
              label,
              category,
              scope: 'group',
              groupId,
              createdBy: session.name,
              lastUsedAt: nowIso,
              useCount: 1,
            });
          }
          nextGroupChips = nextGroupChips.slice(0, 40);
        }

        await updateServerDbState((prev) => ({
          ...prev,
          groups: prev.groups.map((g) =>
            g.id === groupId ? { ...g, customQuickChips: nextGroupChips } : g
          ),
        }));
        return NextResponse.json({ ok: true, groupId, customQuickChips: nextGroupChips });
      }

      // scope === 'user': צ'יפים מהירים פר-משתמש מסודרים לפי MRU
      const targetId =
        session.role === 'trainee' ? session.id : String(body.traineeId || '');
      if (session.role === 'trainee' && body.traineeId && body.traineeId !== session.id) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }
      const target = state.trainees.find((t) => t.id === targetId);
      if (
        !target ||
        (session.role === 'trainee'
          ? target.status !== 'active'
          : !canCoachAccessTrainee(session, target))
      ) {
        return NextResponse.json({ error: 'אין הרשאה לעדכן צ׳יפים למשתמש זה' }, { status: 403 });
      }

      let nextUserChips = [...(target.recentContextChips || [])];
      const nowIso = new Date().toISOString();
      if (op === 'replace') {
        nextUserChips = sanitizeQuickChips(body.chips, 'user', 60);
      } else if (op === 'delete') {
        const chipId = String(body.chipId || '');
        nextUserChips = nextUserChips.filter((c) => c.id !== chipId);
      } else {
        const chipsList = Array.isArray(body.chips)
          ? (body.chips as Partial<QuickContextChip>[])
          : body.chip
          ? [body.chip as Partial<QuickContextChip>]
          : [];
        for (const rawC of chipsList) {
          const label = sanitizeText(rawC.label, 50);
          if (!label) continue;
          const category = ALLOWED_CHIP_CATEGORIES.has(rawC.category as QuickChipCategory)
            ? (rawC.category as QuickChipCategory)
            : 'prep';
          const idx = nextUserChips.findIndex(
            (c) => c.label === label && c.category === category
          );
          if (idx >= 0) {
            nextUserChips[idx] = {
              ...nextUserChips[idx],
              lastUsedAt: nowIso,
              useCount: (nextUserChips[idx].useCount || 0) + 1,
            };
          } else {
            nextUserChips.unshift({
              id: generateSecureId('uchip'),
              label,
              category,
              scope: 'user',
              createdBy: session.name,
              lastUsedAt: nowIso,
              useCount: 1,
            });
          }
        }
        nextUserChips = nextUserChips
          .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
          .slice(0, 60);
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === targetId ? { ...t, recentContextChips: nextUserChips } : t
        ),
      }));

      return NextResponse.json({ ok: true, recentContextChips: nextUserChips });
    }

    if (action === 'trainee-manage-saved-meals') {
      const targetId =
        session.role === 'trainee' ? session.id : String(body.traineeId || '');
      if (session.role === 'trainee' && body.traineeId && body.traineeId !== session.id) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }
      const state = await getServerDbState();
      const targetTrainee = state.trainees.find((t) => t.id === targetId);
      if (
        !targetTrainee ||
        (session.role === 'trainee'
          ? targetTrainee.status !== 'active'
          : !canCoachAccessTrainee(session, targetTrainee))
      ) {
        return NextResponse.json({ error: 'אין הרשאה לניהול ארוחות מתאמן זה' }, { status: 403 });
      }

      const op = String(body.op || 'upsert') as
        | 'upsert'
        | 'toggle-pin'
        | 'toggle-favorite'
        | 'increment-use'
        | 'ask-question'
        | 'delete';
      const presetId = sanitizeText(body.presetId, 60);
      const currentMeals = [...(targetTrainee.savedMeals || [])];
      let nextMeals = [...currentMeals];

      if (op === 'delete') {
        nextMeals = currentMeals.filter((m) => m.id !== presetId);
      } else if (op === 'toggle-pin' || op === 'toggle-favorite' || op === 'increment-use') {
        const nowIso = new Date().toISOString();
        nextMeals = currentMeals.map((m) => {
          if (m.id !== presetId) return m;
          if (op === 'toggle-pin') {
            return { ...m, isPinned: !m.isPinned, updatedAt: nowIso };
          }
          if (op === 'toggle-favorite') {
            return { ...m, isFavorite: !m.isFavorite, updatedAt: nowIso };
          }
          return {
            ...m,
            useCount: (m.useCount || 0) + 1,
            lastUsedAt: nowIso,
            updatedAt: nowIso,
          };
        });
      } else if (op === 'ask-question') {
        const question = sanitizeText(body.question, 400);
        if (!question) {
          return NextResponse.json({ error: 'נא להזין שאלה למאמן' }, { status: 400 });
        }
        const nowIso = new Date().toISOString();
        nextMeals = currentMeals.map((m) =>
          m.id === presetId
            ? {
                ...m,
                updatedAt: nowIso,
                coachQuestion: {
                  id: m.coachQuestion?.id || generateSecureId('q'),
                  question,
                  askedAt: nowIso,
                  status: 'pending',
                },
              }
            : m
        );
      } else {
        const rawPreset = (body.preset || {}) as Partial<SavedMealPreset>;
        const existing = rawPreset.id
          ? currentMeals.find((m) => m.id === rawPreset.id)
          : undefined;
        const sanitized = buildSanitizedSavedPreset(rawPreset, existing);
        if (!sanitized) {
          return NextResponse.json(
            { error: 'שם הארוחה או רכיבי המנה חסרים' },
            { status: 400 }
          );
        }
        if (existing) {
          nextMeals = currentMeals.map((m) => (m.id === existing.id ? sanitized : m));
        } else {
          nextMeals = [sanitized, ...currentMeals].slice(0, 120);
        }
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === targetId ? { ...t, savedMeals: nextMeals } : t
        ),
      }));

      return NextResponse.json({ ok: true, savedMeals: nextMeals });
    }

    if (action === 'ack-ai-jobs') {
      const targetId =
        session.role === 'trainee' ? session.id : String(body.traineeId || '');
      if (session.role === 'trainee' && body.traineeId && body.traineeId !== session.id) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }
      const state = await getServerDbState();
      const targetTrainee = state.trainees.find((t) => t.id === targetId);
      if (
        !targetTrainee ||
        (session.role === 'trainee'
          ? targetTrainee.status !== 'active'
          : !canCoachAccessTrainee(session, targetTrainee))
      ) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }

      const jobId = body.jobId ? sanitizeText(body.jobId, 60) : '';
      const clearAllFinished = Boolean(body.clearAllFinished);
      const nextJobs = (targetTrainee.pendingAiJobs || []).filter((j) => {
        if (clearAllFinished && j.status !== 'processing') return false;
        if (jobId && j.id === jobId) return false;
        return true;
      });

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === targetId ? { ...t, pendingAiJobs: nextJobs } : t
        ),
      }));

      return NextResponse.json({ ok: true, pendingAiJobs: nextJobs });
    }

    // =========================================================================
    // 1. פעולת מתאמן: עדכון יומן הארוחות, ספריית הארוחות השמורות והמשקל של עצמו בלבד
    // =========================================================================
    if (session.role === 'trainee') {
      const liveTrainee = await getSingleTraineeFromServer(session.id);
      if (!liveTrainee || liveTrainee.status !== 'active') {
        const res = NextResponse.json(
          { error: 'החשבון אינו פעיל' },
          { status: 403 }
        );
        return clearSessionCookie(res);
      }

      const traineeInput = body.trainee as TraineeProfile | undefined;
      if (
        action !== 'trainee-self-update' ||
        !traineeInput ||
        traineeInput.id !== session.id
      ) {
        return NextResponse.json(
          { error: 'אין הרשאה לבצע פעולה זו' },
          { status: 403 }
        );
      }

      const safeWeight = sanitizeNumber(
        traineeInput.currentWeight,
        30,
        300,
        liveTrainee.currentWeight
      );

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((existing) => {
          if (existing.id !== session.id) return existing;
          return {
            ...existing,
            name: sanitizeText(traineeInput.name, 80) || existing.name,
            currentWeight: safeWeight,
            targetWeight: sanitizeNumber(
              traineeInput.targetWeight,
              30,
              300,
              existing.targetWeight
            ),
            weightHistory: Array.isArray(traineeInput.weightHistory)
              ? traineeInput.weightHistory.slice(-60)
              : existing.weightHistory,
            measurementsHistory: Array.isArray(traineeInput.measurementsHistory)
              ? traineeInput.measurementsHistory.slice(-60)
              : existing.measurementsHistory,
            weeklyCheckIns: Array.isArray(traineeInput.weeklyCheckIns)
              ? traineeInput.weeklyCheckIns.slice(-52)
              : existing.weeklyCheckIns,
            onboarding: traineeInput.onboarding || existing.onboarding,
            favoriteFoodIds: Array.isArray(traineeInput.favoriteFoodIds)
              ? traineeInput.favoriteFoodIds.slice(0, 50)
              : existing.favoriteFoodIds,
            savedMeals: Array.isArray(traineeInput.savedMeals)
              ? traineeInput.savedMeals.slice(0, 120)
              : existing.savedMeals,
            customServingTools: Array.isArray(traineeInput.customServingTools)
              ? sanitizeServingTools(traineeInput.customServingTools)
              : existing.customServingTools,
            customFoodUnits: Array.isArray(traineeInput.customFoodUnits)
              ? sanitizeCustomUnits(traineeInput.customFoodUnits)
              : existing.customFoodUnits,
            recentContextChips: Array.isArray(traineeInput.recentContextChips)
              ? sanitizeQuickChips(traineeInput.recentContextChips, 'user', 60)
              : existing.recentContextChips,
            logs: mergeLogsPreservingPendingAi(existing, traineeInput.logs),
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    // =========================================================================
    // 2. פעולות מאמן ומנהל ראשי (אכיפת הרשאות פרטנית לכל אובייקט - BOLA/BFLA)
    // =========================================================================
    const state = await getServerDbState();

    // השלמת Onboarding למאמן (פרופיל, ברירות מחדל לימי תשקיף, טמפלייטים וקבוצות התחלתיות)
    if (action === 'coach-complete-onboarding') {
      const name = sanitizeText(body.name, 80);
      const phone = sanitizeText(body.phone, 30);
      const newPassword =
        typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
      const onboarding = body.onboarding;
      const starterTemplates = Array.isArray(body.starterTemplates)
        ? (body.starterTemplates as NutritionTemplate[])
        : [];
      const starterGroupNames = Array.isArray(body.starterGroupNames)
        ? (body.starterGroupNames as string[])
        : [];

      const stampedTemplates: NutritionTemplate[] = starterTemplates.map(
        (tpl) => ({
          ...tpl,
          id: generateSecureId('tpl'),
          ownerCoachId: session.id,
        })
      );

      const palette = ['#d2ff28', '#38bdf8', '#ff5e7e', '#ffb800', '#22c55e'];
      const newGroups: TraineeGroup[] = starterGroupNames
        .map((gName) => sanitizeText(gName, 50))
        .filter(Boolean)
        .filter(
          (gName) =>
            !state.groups.some(
              (existingG) =>
                existingG.name === gName &&
                (existingG.ownerCoachId === session.id ||
                  existingG.ownerCoachId === 'coach-admin')
            )
        )
        .map((gName, idx) => ({
          id: generateSecureId('grp'),
          name: gName,
          color: palette[idx % palette.length],
          ownerCoachId: session.id,
        }));

      await updateServerDbState((prev) => ({
        ...prev,
        coaches: prev.coaches.map((c) => {
          if (c.id !== session.id) return c;
          return {
            ...c,
            name: name || c.name,
            phone: phone || c.phone,
            password: newPassword ? hashPassword(newPassword) : c.password,
            onboarding: onboarding || c.onboarding,
          };
        }),
        templates: [...prev.templates, ...stampedTemplates],
        groups: [...prev.groups, ...newGroups],
      }));

      return NextResponse.json({ ok: true });
    }

    // ניהול פיצול יום אימון/מנוחה (enableWorkoutRestSplit) והערות מאמן/למידת AI למתאמן
    if (action === 'coach-update-ai-notes-and-split') {
      const traineeId = String(body.traineeId || '');
      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לערוך הגדרות מתאמן זה' },
          { status: 403 }
        );
      }

      const enableWorkoutRestSplit =
        typeof body.enableWorkoutRestSplit === 'boolean'
          ? body.enableWorkoutRestSplit
          : target.enableWorkoutRestSplit;

      const coachAiNotes =
        typeof body.coachAiNotes === 'string'
          ? sanitizeText(body.coachAiNotes, 500)
          : target.coachAiNotes;

      const aiLearnedPreferences = Array.isArray(body.aiLearnedPreferences)
        ? body.aiLearnedPreferences
            .map((p: unknown) => sanitizeText(p, 200))
            .filter(Boolean)
            .slice(-30)
        : target.aiLearnedPreferences;

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId
            ? {
                ...t,
                enableWorkoutRestSplit,
                coachAiNotes,
                aiLearnedPreferences,
              }
            : t
        ),
      }));

      return NextResponse.json({
        ok: true,
        enableWorkoutRestSplit,
        coachAiNotes,
        aiLearnedPreferences,
      });
    }

    // ניהול יעדי אימונים שבועיים, סוגי אימון, הליכות/ריצות ושעות שינה ע"י המאמן
    if (action === 'coach-update-activity-targets') {
      const traineeId = String(body.traineeId || '');
      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לערוך יעדי אימונים למתאמן זה' },
          { status: 403 }
        );
      }

      const incoming = body.activityTargets || {};
      const nextTargets = {
        weeklyWorkoutsTarget: sanitizeNumber(
          incoming.weeklyWorkoutsTarget,
          0,
          14,
          4
        ),
        workoutTypes: Array.isArray(incoming.workoutTypes)
          ? incoming.workoutTypes
              .map((w: unknown) => sanitizeText(w, 40))
              .filter(Boolean)
              .slice(0, 15)
          : ['אימון כוח A', 'אימון כוח B', 'Full Body'],
        weeklyCardioTarget: sanitizeNumber(
          incoming.weeklyCardioTarget,
          0,
          14,
          3
        ),
        cardioMode: (['walk', 'run', 'both'].includes(incoming.cardioMode)
          ? incoming.cardioMode
          : 'both') as 'walk' | 'run' | 'both',
        cardioTargetMinutes: sanitizeNumber(
          incoming.cardioTargetMinutes,
          5,
          300,
          35
        ),
        dailySleepTargetHours: sanitizeNumber(
          incoming.dailySleepTargetHours,
          4,
          14,
          7.5
        ),
      };

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId ? { ...t, activityTargets: nextTargets } : t
        ),
      }));

      return NextResponse.json({ ok: true, activityTargets: nextTargets });
    }

    // ניהול ימי תשקיף (Observation Days) ומתג חישוב ביעדים ע"י המאמן
    if (action === 'coach-manage-observation-days') {
      const traineeId = String(body.traineeId || '');
      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לערוך ימי תשקיף למתאמן זה' },
          { status: 403 }
        );
      }

      const toggleDate = body.toggleDate
        ? sanitizeText(body.toggleDate, 20)
        : undefined;
      const addFutureDays = Number(body.addFutureDays) || 0;
      const clearAll = Boolean(body.clearAll);
      const toggleCountInStats =
        typeof body.countObservationInStats === 'boolean'
          ? body.countObservationInStats
          : undefined;

      let nextDates = [...(target.observationDates || [])];

      if (clearAll) {
        nextDates = [];
      } else if (toggleDate) {
        if (nextDates.includes(toggleDate)) {
          nextDates = nextDates.filter((d) => d !== toggleDate);
        } else {
          nextDates.push(toggleDate);
        }
      } else if (addFutureDays > 0 && addFutureDays <= 90) {
        for (let i = 0; i < addFutureDays; i++) {
          const iso = getTodayIso(i);
          if (!nextDates.includes(iso)) {
            nextDates.push(iso);
          }
        }
      }

      nextDates.sort();

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId
            ? {
                ...t,
                observationDates: nextDates,
                countObservationInStats:
                  toggleCountInStats !== undefined
                    ? toggleCountInStats
                    : t.countObservationInStats,
              }
            : t
        ),
      }));

      return NextResponse.json({
        ok: true,
        observationDates: nextDates,
        countObservationInStats:
          toggleCountInStats !== undefined
            ? toggleCountInStats
            : target.countObservationInStats,
      });
    }

    // א. שמירת ארוחות/מים/משקל ע"י מאמן בתצוגת מתאמן או עדכון תפריט מתאמן
    if (action === 'update-trainee-plan') {
      const traineeId = String(body.traineeId || '');
      const dayType = (body.dayType as DayType) || 'workout';
      const updatedTemplate = body.updatedTemplate as NutritionTemplate;
      const tolerancePercent = sanitizeNumber(body.tolerancePercent, 1, 30, 10);

      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לערוך מתאמן זה' },
          { status: 403 }
        );
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== traineeId) return t;
          return {
            ...t,
            tolerancePercent,
            ...(dayType === 'workout'
              ? { workoutTemplate: updatedTemplate }
              : { restTemplate: updatedTemplate }),
          };
        }),
      }));
      return NextResponse.json({ ok: true });
    }

    // ב. שמירת יומן מתאמן מתוך תצוגת מאמן ("צפה כמתאמן")
    if (action === 'coach-update-trainee-log') {
      const traineeInput = body.trainee as TraineeProfile | undefined;
      if (!traineeInput) {
        return NextResponse.json({ error: 'חסר מתאמן' }, { status: 400 });
      }
      const target = state.trainees.find((t) => t.id === traineeInput.id);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לערוך יומן של מתאמן זה' },
          { status: 403 }
        );
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeInput.id
            ? {
                ...t,
                name: sanitizeText(traineeInput.name, 80) || t.name,
                logs: mergeLogsPreservingPendingAi(t, traineeInput.logs),
                currentWeight: traineeInput.currentWeight,
                targetWeight:
                  traineeInput.targetWeight || t.targetWeight,
                weightHistory: traineeInput.weightHistory,
                measurementsHistory:
                  traineeInput.measurementsHistory ||
                  t.measurementsHistory,
                onboarding: traineeInput.onboarding || t.onboarding,
                favoriteFoodIds: traineeInput.favoriteFoodIds,
                savedMeals: Array.isArray(traineeInput.savedMeals)
                  ? traineeInput.savedMeals.slice(0, 120)
                  : t.savedMeals,
                customServingTools: Array.isArray(traineeInput.customServingTools)
                  ? sanitizeServingTools(traineeInput.customServingTools)
                  : t.customServingTools,
                customFoodUnits: Array.isArray(traineeInput.customFoodUnits)
                  ? sanitizeCustomUnits(traineeInput.customFoodUnits)
                  : t.customFoodUnits,
                recentContextChips: Array.isArray(traineeInput.recentContextChips)
                  ? sanitizeQuickChips(traineeInput.recentContextChips, 'user', 60)
                  : t.recentContextChips,
              }
            : t
        ),
      }));
      return NextResponse.json({ ok: true });
    }

    // ג2. מענה ממוקד של מאמן לשאלה על ארוחה שמורה (+ אופציה לקדם להמלצת תפריט)
    if (action === 'coach-reply-saved-meal') {
      const traineeId = String(body.traineeId || '');
      const presetId = sanitizeText(body.presetId, 60);
      const reply = sanitizeText(body.reply, 600);
      const promoteToSlotId = body.promoteToSlotId
        ? sanitizeText(body.promoteToSlotId, 50)
        : '';

      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה להגיב למתאמן זה' },
          { status: 403 }
        );
      }
      if (!presetId || !reply) {
        return NextResponse.json(
          { error: 'נא להזין תשובה לשאלת המתאמן' },
          { status: 400 }
        );
      }

      const nowIso = new Date().toISOString();
      let promotedText = '';

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== traineeId) return t;
          const nextSaved = (t.savedMeals || []).map((m) => {
            if (m.id !== presetId) return m;
            if (promoteToSlotId) {
              promotedText = `${m.title} (${m.items.map((i) => i.name).join(' + ')} · ${Math.round(
                m.totalCalories
              )} קק״ל · ${Math.round(m.totalProtein)}g חלבון)`;
            }
            return {
              ...m,
              updatedAt: nowIso,
              coachQuestion: m.coachQuestion
                ? {
                    ...m.coachQuestion,
                    reply,
                    repliedAt: nowIso,
                    repliedBy: session.name,
                    status: 'answered' as const,
                    recommendedPromoted:
                      Boolean(promoteToSlotId) || m.coachQuestion.recommendedPromoted,
                  }
                : {
                    id: generateSecureId('q'),
                    question: 'הערת מאמן על הארוחה',
                    askedAt: nowIso,
                    reply,
                    repliedAt: nowIso,
                    repliedBy: session.name,
                    status: 'answered' as const,
                    recommendedPromoted: Boolean(promoteToSlotId),
                  },
            };
          });

          const addPromoToTemplate = (tpl: NutritionTemplate): NutritionTemplate => {
            if (!promoteToSlotId || !promotedText) return tpl;
            return {
              ...tpl,
              meals: tpl.meals.map((slot) =>
                slot.id === promoteToSlotId
                  ? {
                      ...slot,
                      recommendedOptions: Array.from(
                        new Set([...(slot.recommendedOptions || []), promotedText])
                      ).slice(0, 12),
                    }
                  : slot
              ),
            };
          };

          return {
            ...t,
            savedMeals: nextSaved,
            workoutTemplate: addPromoToTemplate(t.workoutTemplate),
            restTemplate: addPromoToTemplate(t.restTemplate),
          };
        }),
      }));

      return NextResponse.json({
        ok: true,
        repliedBy: session.name,
        repliedAt: nowIso,
        promotedText: promotedText || undefined,
      });
    }

    // ג. שליחת פידבק מאמן על ארוחה (עם חתימת שם המאמן מהעוגייה החתומה!)
    if (action === 'add-coach-feedback') {
      const traineeId = String(body.traineeId || '');
      const date = sanitizeText(body.date, 20);
      const mealSlotId = sanitizeText(body.mealSlotId, 60);
      const feedback = sanitizeText(body.feedback, 400);

      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה להגיב למתאמן זה' },
          { status: 403 }
        );
      }

      const nowTime = new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== traineeId) return t;
          const currentLog = t.logs[date] || {
            date,
            dayType: 'workout',
            waterCups: 0,
            waterGoal: 12,
            meals: {},
          };
          const existingMeal = currentLog.meals[mealSlotId] || {
            mealSlotId,
            items: [],
            updatedAt: nowTime,
          };
          return {
            ...t,
            logs: {
              ...t.logs,
              [date]: {
                ...currentLog,
                meals: {
                  ...currentLog.meals,
                  [mealSlotId]: {
                    ...existingMeal,
                    coachFeedback: feedback,
                    coachFeedbackAuthor: session.name, // חתום מהשרת!
                    coachFeedbackAt: nowTime,
                  },
                },
              },
            },
          };
        }),
      }));

      return NextResponse.json({ ok: true, authorName: session.name });
    }

    // ד. פתיחת מתאמן חדש (ע"י מנהל ראשי או מאמן)
    if (action === 'coach-create-trainee') {
      const name = sanitizeText(body.name, 80);
      const email = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword =
        typeof body.password === 'string' && body.password.trim()
          ? body.password.trim()
          : '123456';
      const phone = sanitizeText(body.phone, 30);
      const goal = sanitizeText(body.goal, 120) || 'חיטוב ותזונה מותאמת';
      const templateId = String(body.templateId || '');
      const groupId = body.groupId ? String(body.groupId) : undefined;

      // בדיקת ייחודיות אימייל גלובלית
      const emailExists =
        email === state.coachEmail.toLowerCase() ||
        state.coaches.some((c) => c.email.toLowerCase() === email) ||
        state.trainees.some((t) => (t.email || '').toLowerCase() === email);

      if (emailExists) {
        return NextResponse.json(
          { error: 'כתובת האימייל כבר קיימת במערכת' },
          { status: 409 }
        );
      }

      // מנהל ראשי יכול לבחור לאיזה מאמן לשייך; מאמן רגיל משייך אך ורק לעצמו
      const primaryCoachId =
        isSuperAdmin(session) && body.primaryCoachId
          ? String(body.primaryCoachId)
          : session.id;

      const tpl =
        state.templates.find((t) => t.id === templateId) ||
        state.templates[0] ||
        DEFAULT_TEMPLATES[0];

      const newTrainee: TraineeProfile = {
        id: generateSecureId('trainee'),
        email,
        password: hashPassword(rawPassword),
        status: 'active',
        name,
        avatar: name.charAt(0) || 'מ',
        phone,
        goal,
        currentWeight: 75,
        targetWeight: 70,
        tolerancePercent: 10,
        primaryCoachId,
        sharedCoachIds: [],
        groupId,
        workoutTemplate: JSON.parse(JSON.stringify(tpl)),
        restTemplate: JSON.parse(JSON.stringify(tpl)),
        favoriteFoodIds: [
          'cottage-tnuva-5',
          'chicken-breast-grilled',
          'krembo-strauss',
        ],
        weightHistory: [{ date: 'התחלה', weight: 75 }],
        logs: {},
      };

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: [...prev.trainees, newTrainee],
      }));

      return NextResponse.json({
        ok: true,
        trainee: sanitizeTraineeForClient(newTrainee),
      });
    }

    // ה. שיתוף מתאמן עם מאמנים נוספים / העברת בעלות (בעלים ראשי או מנהל ראשי בלבד!)
    if (action === 'update-trainee-sharing') {
      const traineeId = String(body.traineeId || '');
      const target = state.trainees.find((t) => t.id === traineeId);

      if (!target || !isPrimaryOwnerOfTrainee(session, target)) {
        return NextResponse.json(
          { error: 'רק המאמן הראשי של המתאמן או המנהל הראשי רשאים לנהל שיתוף' },
          { status: 403 }
        );
      }

      const validCoachIds = new Set([
        'coach-admin',
        ...state.coaches.filter((c) => c.status === 'active').map((c) => c.id),
      ]);

      // רק מנהל ראשי רשאי לשנות את המאמן הראשי (primaryCoachId) של מתאמן קיים
      const nextPrimaryCoachId =
        isSuperAdmin(session) &&
        body.primaryCoachId &&
        validCoachIds.has(String(body.primaryCoachId))
          ? String(body.primaryCoachId)
          : target.primaryCoachId;

      const incomingShared = Array.isArray(body.sharedCoachIds)
        ? (body.sharedCoachIds as string[])
        : target.sharedCoachIds;

      const cleanShared = Array.from(new Set(incomingShared)).filter(
        (id) => validCoachIds.has(id) && id !== nextPrimaryCoachId
      );

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId
            ? {
                ...t,
                primaryCoachId: nextPrimaryCoachId,
                sharedCoachIds: cleanShared,
              }
            : t
        ),
      }));

      return NextResponse.json({
        ok: true,
        primaryCoachId: nextPrimaryCoachId,
        sharedCoachIds: cleanShared,
      });
    }

    // ו. שיוך מתאמן לקבוצה
    if (action === 'update-trainee-group') {
      const traineeId = String(body.traineeId || '');
      const groupId = body.groupId ? String(body.groupId) : undefined;

      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !canCoachAccessTrainee(session, target)) {
        return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
      }

      if (groupId) {
        const grp = state.groups.find((g) => g.id === groupId);
        if (!grp || !canCoachManageGroup(session, grp)) {
          return NextResponse.json(
            { error: 'קבוצה לא חוקית או ללא הרשאה' },
            { status: 403 }
          );
        }
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId ? { ...t, groupId } : t
        ),
      }));

      return NextResponse.json({ ok: true });
    }

    // ז. יצירת קבוצת מתאמנים חדשה
    if (action === 'create-group') {
      const name = sanitizeText(body.name, 60);
      const color = sanitizeText(body.color, 25) || '#d2ff28';
      if (!name) {
        return NextResponse.json({ error: 'חסר שם קבוצה' }, { status: 400 });
      }
      if (state.groups.length >= 60) {
        return NextResponse.json(
          { error: 'הגעת למכסת הקבוצות המקסימלית' },
          { status: 400 }
        );
      }

      const newGroup: TraineeGroup = {
        id: generateSecureId('grp'),
        name,
        color,
        ownerCoachId: session.id,
      };

      await updateServerDbState((prev) => ({
        ...prev,
        groups: [...prev.groups, newGroup],
      }));

      return NextResponse.json({ ok: true, group: newGroup });
    }

    // ח. מחיקת קבוצה (ללא מחיקת המתאמנים שבה!)
    if (action === 'delete-group') {
      const groupId = String(body.groupId || '');
      const grp = state.groups.find((g) => g.id === groupId);
      if (
        !grp ||
        (!isSuperAdmin(session) && grp.ownerCoachId !== session.id)
      ) {
        return NextResponse.json(
          { error: 'אין הרשאה למחוק קבוצה זו' },
          { status: 403 }
        );
      }

      await deleteGroupOnServer(groupId);
      return NextResponse.json({ ok: true });
    }

    // ט. פעולה קבוצתית: הקצאת טמפלייט לכל חברי הקבוצה המורשים למאמן
    if (action === 'bulk-group-assign-template') {
      const groupId = String(body.groupId || '');
      const templateId = String(body.templateId || '');
      const dayType = (body.dayType as DayType) || 'workout';

      const tpl = state.templates.find(
        (t) => t.id === templateId && canCoachViewTemplate(session, t)
      );
      if (!tpl) {
        return NextResponse.json(
          { error: 'טמפלייט לא נמצא' },
          { status: 404 }
        );
      }

      let updatedCount = 0;
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.groupId !== groupId || !canCoachAccessTrainee(session, t)) {
            return t;
          }
          updatedCount++;
          const cloned = JSON.parse(JSON.stringify(tpl));
          return dayType === 'workout'
            ? { ...t, workoutTemplate: cloned }
            : { ...t, restTemplate: cloned };
        }),
      }));

      return NextResponse.json({ ok: true, updatedCount });
    }

    // י. פעולה קבוצתית: שיתוף כל חברי הקבוצה שבבעלות המאמן עם מאמן שותף נוסף
    if (action === 'bulk-group-share-coach') {
      const groupId = String(body.groupId || '');
      const targetCoachId = String(body.targetCoachId || '');

      const validCoach =
        targetCoachId === 'coach-admin' ||
        state.coaches.some(
          (c) => c.id === targetCoachId && c.status === 'active'
        );
      if (!validCoach) {
        return NextResponse.json(
          { error: 'מאמן יעד לא פעיל' },
          { status: 400 }
        );
      }

      let sharedCount = 0;
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          // בדיקת בעלות פרטנית על כל מתאמן בקבוצה!
          if (
            t.groupId !== groupId ||
            !isPrimaryOwnerOfTrainee(session, t) ||
            t.primaryCoachId === targetCoachId
          ) {
            return t;
          }
          sharedCount++;
          const nextShared = Array.from(
            new Set([...(t.sharedCoachIds || []), targetCoachId])
          );
          return { ...t, sharedCoachIds: nextShared };
        }),
      }));

      return NextResponse.json({ ok: true, sharedCount });
    }

    // יא. עדכון סטטוס מתאמן (אישור pending / השהיה / הפעלה) - בעלים ראשי או מנהל ראשי בלבד!
    if (action === 'update-trainee-status') {
      const traineeId = String(body.traineeId || '');
      const status = body.status as AccountStatus;
      const assignPrimaryCoachId = body.primaryCoachId
        ? String(body.primaryCoachId)
        : undefined;

      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !isPrimaryOwnerOfTrainee(session, target)) {
        return NextResponse.json(
          { error: 'רק המאמן הראשי של המתאמן או המנהל הראשי רשאים לשנות סטטוס מנוי' },
          { status: 403 }
        );
      }

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === traineeId
            ? {
                ...t,
                status,
                ...(isSuperAdmin(session) && assignPrimaryCoachId
                  ? { primaryCoachId: assignPrimaryCoachId }
                  : {}),
              }
            : t
        ),
      }));

      return NextResponse.json({ ok: true });
    }

    // יב. איפוס אימייל וסיסמה למתאמן - בעלים ראשי או מנהל ראשי בלבד!
    if (action === 'coach-update-credentials') {
      const traineeId = String(body.traineeId || '');
      const target = state.trainees.find((t) => t.id === traineeId);
      if (!target || !isPrimaryOwnerOfTrainee(session, target)) {
        return NextResponse.json(
          { error: 'אין הרשאה לאפס סיסמה למתאמן זה' },
          { status: 403 }
        );
      }

      const newEmail = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword =
        typeof body.password === 'string' ? body.password.trim() : '';

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== traineeId) return t;
          return {
            ...t,
            email: newEmail || t.email,
            password: rawPassword ? hashPassword(rawPassword) : t.password,
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    // יג. מחיקת מתאמן - בעלים ראשי או מנהל ראשי בלבד!
    if (action === 'coach-delete-trainee') {
      const deleteTraineeId = String(body.deleteTraineeId || '');
      const target = state.trainees.find((t) => t.id === deleteTraineeId);
      if (!target || !isPrimaryOwnerOfTrainee(session, target)) {
        return NextResponse.json(
          { error: 'רק המאמן הראשי או המנהל הראשי רשאים למחוק מתאמן' },
          { status: 403 }
        );
      }

      await deleteTraineeOnServer(deleteTraineeId);
      return NextResponse.json({ ok: true });
    }

    // יד. שמירה / יצירה / שכפול של טמפלייט תזונה (אכיפת בעלות Global מול Personal)
    if (action === 'save-template') {
      const incomingTpl = body.template as NutritionTemplate | undefined;
      if (!incomingTpl || !incomingTpl.id) {
        return NextResponse.json({ error: 'טמפלייט לא תקין' }, { status: 400 });
      }

      const existing = state.templates.find((t) => t.id === incomingTpl.id);
      if (existing && !canCoachEditTemplate(session, existing)) {
        return NextResponse.json(
          {
            error:
              'טמפלייט מערכתי ראשי מוגן לעריכה ע"י המנהל הראשי בלבד. ניתן ללחוץ על "שכפל לטמפלייטים שלי".',
          },
          { status: 403 }
        );
      }

      const stampedTemplate: NutritionTemplate = {
        ...incomingTpl,
        ownerCoachId: existing
          ? existing.ownerCoachId || 'coach-admin'
          : session.id,
      };

      await updateServerDbState((prev) => {
        const exists = prev.templates.some((t) => t.id === stampedTemplate.id);
        return {
          ...prev,
          templates: exists
            ? prev.templates.map((t) =>
                t.id === stampedTemplate.id ? stampedTemplate : t
              )
            : [...prev.templates, stampedTemplate],
        };
      });

      return NextResponse.json({ ok: true, template: stampedTemplate });
    }

    // טו. מחיקת טמפלייט אישי
    if (action === 'delete-template') {
      const templateId = String(body.templateId || '');
      const existing = state.templates.find((t) => t.id === templateId);
      if (!existing || !canCoachEditTemplate(session, existing)) {
        return NextResponse.json(
          { error: 'אין הרשאה למחוק טמפלייט זה' },
          { status: 403 }
        );
      }
      await deleteTemplateOnServer(templateId);
      return NextResponse.json({ ok: true });
    }

    // =========================================================================
    // 3. פעולות מנהל ראשי בלבד (Super Admin Only - ניהול מאמנים)
    // =========================================================================
    if (!isSuperAdmin(session)) {
      return NextResponse.json(
        { error: 'פעולה זו מורשית למנהל הראשי בלבד' },
        { status: 403 }
      );
    }

    if (action === 'admin-create-coach') {
      const name = sanitizeText(body.name, 80);
      const email = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword =
        typeof body.password === 'string' && body.password.trim()
          ? body.password.trim()
          : '123456';
      const phone = sanitizeText(body.phone, 30);
      const inviteCode = sanitizeText(body.inviteCode, 30).toUpperCase();

      if (!name || !email || !inviteCode) {
        return NextResponse.json(
          { error: 'נא למלא שם, אימייל וקוד הזמנה אישי למאמן' },
          { status: 400 }
        );
      }

      const emailExists =
        email === state.coachEmail.toLowerCase() ||
        state.coaches.some((c) => c.email.toLowerCase() === email) ||
        state.trainees.some((t) => (t.email || '').toLowerCase() === email);

      if (emailExists) {
        return NextResponse.json(
          { error: 'כתובת האימייל כבר קיימת במערכת' },
          { status: 409 }
        );
      }

      const codeExists =
        inviteCode === state.coachInviteCode.toUpperCase() ||
        state.coaches.some((c) => c.inviteCode.toUpperCase() === inviteCode);

      if (codeExists) {
        return NextResponse.json(
          { error: 'קוד ההזמנה הזה כבר תפוס ע"י מאמן אחר' },
          { status: 409 }
        );
      }

      const newCoach: CoachProfile = {
        id: generateSecureId('coach'),
        email,
        password: hashPassword(rawPassword),
        name,
        avatar: name.charAt(0) || 'מ',
        phone,
        inviteCode,
        status: 'active',
      };

      const nextState = await updateServerDbState((prev) => ({
        ...prev,
        coaches: [...prev.coaches, newCoach],
      }));

      return NextResponse.json({
        ok: true,
        coach: sanitizeCoachForClient(newCoach),
        coachDirectory: buildCoachDirectory(nextState),
      });
    }

    if (action === 'admin-update-coach-status') {
      const coachId = String(body.coachId || '');
      const status = body.status === 'paused' ? 'paused' : 'active';

      const nextState = await updateServerDbState((prev) => ({
        ...prev,
        coaches: prev.coaches.map((c) =>
          c.id === coachId ? { ...c, status } : c
        ),
      }));

      return NextResponse.json({
        ok: true,
        coachDirectory: buildCoachDirectory(nextState),
      });
    }

    if (action === 'admin-update-coach-credentials') {
      const coachId = String(body.coachId || '');
      const newEmail = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword =
        typeof body.password === 'string' ? body.password.trim() : '';
      const newInviteCode = sanitizeText(body.inviteCode, 30).toUpperCase();

      await updateServerDbState((prev) => ({
        ...prev,
        coaches: prev.coaches.map((c) => {
          if (c.id !== coachId) return c;
          return {
            ...c,
            email: newEmail || c.email,
            inviteCode: newInviteCode || c.inviteCode,
            password: rawPassword ? hashPassword(rawPassword) : c.password,
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    if (action === 'admin-delete-coach') {
      const coachId = String(body.coachId || '');
      const nextState = await deleteCoachWithOrphanProtection(coachId);
      return NextResponse.json({
        ok: true,
        trainees: nextState.trainees.map((t) => sanitizeTraineeForClient(t)),
        coachDirectory: buildCoachDirectory(nextState),
      });
    }

    if (action === 'coach-update-invite-code') {
      const cleanCode =
        sanitizeText(body.inviteCode, 40).toUpperCase() || 'SPOT2026';
      await updateServerDbState((prev) => ({
        ...prev,
        coachInviteCode: cleanCode,
      }));
      return NextResponse.json({ ok: true, coachInviteCode: cleanCode });
    }

    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch (err) {
    console.error('[POST /api/data Error]:', err);
    const rawMsg = err instanceof Error ? err.message : '';
    return NextResponse.json(
      {
        error: rawMsg
          ? diagnoseSupabaseError(rawMsg)
          : 'שגיאת שרת בשמירת נתונים',
      },
      { status: 500 }
    );
  }
}
