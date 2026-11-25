import { NextRequest, NextResponse } from 'next/server';
import { authenticateActiveSession } from '@/lib/liveAuth';
import {
  checkRateLimit,
  generateSecureId,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  canCoachAccessTrainee,
  getCustomFoodsContextForUser,
  getServerDbState,
  getSingleTraineeFromServer,
  isSuperAdmin,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  computePer100gFromServing,
  resolveVisibleCustomFoodsForCoach,
  resolveVisibleCustomFoodsForTrainee,
} from '@/lib/customFoods';
import {
  CustomFoodItem,
  CustomFoodScope,
  FoodUnit,
  MacroTargets,
} from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_TRAINEE_CUSTOM_FOODS = 150;
const MAX_COACH_CUSTOM_FOODS = 250;
const MAX_GLOBAL_CUSTOM_FOODS = 300;

function sanitizeUnitsList(
  rawUnits: unknown,
  defaultServingLabel?: string,
  defaultServingGrams?: number
): FoodUnit[] {
  const result: FoodUnit[] = [];
  const seen = new Set<string>();

  const pushUnit = (labelRaw: string, gramsRaw: number) => {
    const label = sanitizeText(labelRaw, 70);
    const grams = Math.round(sanitizeNumber(gramsRaw, 1, 5000, 0));
    if (!label || grams <= 0) return;
    const key = `${label.toLowerCase()}:${grams}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label, grams });
  };

  if (defaultServingLabel && defaultServingGrams && defaultServingGrams > 0) {
    const cleanLbl = sanitizeText(defaultServingLabel, 50);
    const roundedG = Math.round(sanitizeNumber(defaultServingGrams, 1, 5000, 100));
    const displayLabel = cleanLbl.includes('גרם')
      ? cleanLbl
      : `${cleanLbl} (${roundedG} גרם)`;
    pushUnit(displayLabel, roundedG);
  }

  if (Array.isArray(rawUnits)) {
    for (const u of rawUnits.slice(0, 8)) {
      if (!u || typeof u !== 'object') continue;
      const obj = u as { label?: unknown; grams?: unknown };
      pushUnit(String(obj.label || ''), Number(obj.grams));
    }
  }

  pushUnit('100 גרם', 100);
  return result.slice(0, 8);
}

function buildSanitizedCustomFood(
  body: Record<string, unknown>,
  opts: {
    scope: CustomFoodScope;
    ownerId: string;
    ownerRole: 'trainee' | 'coach' | 'admin';
    ownerName: string;
    traineeId?: string;
    existingItem?: CustomFoodItem;
  }
): { item?: CustomFoodItem; error?: string } {
  const name = sanitizeText(body.name, 140);
  if (name.length < 2) {
    return { error: 'יש להזין שם מוצר (לפחות 2 תווים)' };
  }

  const inputMode = body.inputMode === 'serving' ? 'serving' : 'per100g';
  const rawMacros = (body.macros && typeof body.macros === 'object'
    ? body.macros
    : body) as Record<string, unknown>;

  let per100g: MacroTargets;
  let defaultServingLabel: string | undefined;
  let defaultServingGrams: number | undefined;

  if (inputMode === 'serving') {
    const sGrams = sanitizeNumber(body.defaultServingGrams ?? body.servingGrams, 1, 5000, 0);
    if (sGrams <= 0) {
      return { error: 'בהזנה לפי מנה יש להזין משקל מנה תקין בגרמים (1 עד 5000)' };
    }
    const sLabel = sanitizeText(body.defaultServingLabel ?? body.servingLabel, 50) || 'מנה';
    const servingMacros: MacroTargets = {
      calories: sanitizeNumber(rawMacros.calories, 0, 10000, 0),
      protein: sanitizeNumber(rawMacros.protein, 0, 1000, 0),
      carbs: sanitizeNumber(rawMacros.carbs, 0, 1000, 0),
      fat: sanitizeNumber(rawMacros.fat, 0, 1000, 0),
    };
    per100g = computePer100gFromServing(servingMacros, sGrams);
    defaultServingLabel = sLabel;
    defaultServingGrams = Math.round(sGrams);
  } else {
    per100g = {
      calories: Math.round(sanitizeNumber(rawMacros.calories, 0, 950, 0)),
      protein: Math.round(sanitizeNumber(rawMacros.protein, 0, 100, 0) * 100) / 100,
      carbs: Math.round(sanitizeNumber(rawMacros.carbs, 0, 100, 0) * 100) / 100,
      fat: Math.round(sanitizeNumber(rawMacros.fat, 0, 100, 0) * 100) / 100,
    };
    const optLabel = sanitizeText(body.defaultServingLabel ?? body.servingLabel, 50);
    const optGrams = sanitizeNumber(body.defaultServingGrams ?? body.servingGrams, 0, 5000, 0);
    if (optLabel && optGrams > 0) {
      defaultServingLabel = optLabel;
      defaultServingGrams = Math.round(optGrams);
    }
  }

  const brand = sanitizeText(body.brand, 70) || undefined;
  const category = sanitizeText(body.category, 60) || 'מוצרים אישיים';
  const rawBarcode = typeof body.barcode === 'string' ? body.barcode.replace(/[^0-9]/g, '').slice(0, 20) : '';
  const barcode = rawBarcode.length >= 6 ? rawBarcode : undefined;

  const units = sanitizeUnitsList(body.units, defaultServingLabel, defaultServingGrams);
  const nowIso = new Date().toISOString();

  return {
    item: {
      id: opts.existingItem?.id || generateSecureId('cfood'),
      name,
      brand,
      category,
      barcode,
      per100g,
      units,
      inputMode,
      defaultServingLabel,
      defaultServingGrams,
      scope: opts.scope,
      ownerId: opts.existingItem?.ownerId || opts.ownerId,
      ownerRole: opts.existingItem?.ownerRole || opts.ownerRole,
      ownerName: opts.existingItem?.ownerName || opts.ownerName,
      traineeId: opts.scope === 'trainee' ? opts.traineeId : undefined,
      createdAt: opts.existingItem?.createdAt || nowIso,
      updatedAt: nowIso,
    },
  };
}

export const GET = withTelemetryHandler(
  '/api/food/custom',
  async (request: NextRequest, ctx) => {
    const auth = await authenticateActiveSession(request);
    if (!auth.ok) return auth.response;
    const session = auth.session;
    ctx.setActor(session);
    ctx.setActionName('custom_foods_list');

    if (session.role === 'trainee') {
      const trainee = await getSingleTraineeFromServer(session.id);
      if (!trainee || trainee.status !== 'active') {
        return NextResponse.json({ error: 'חשבון מתאמן אינו פעיל' }, { status: 403 });
      }
      const coachIds = [
        trainee.primaryCoachId,
        ...(trainee.sharedCoachIds || []),
      ].filter(Boolean);
      const foodsCtx = await getCustomFoodsContextForUser({ coachIds });
      const items = resolveVisibleCustomFoodsForTrainee(
        trainee,
        foodsCtx.coachCustomFoods,
        foodsCtx.globalCustomFoods
      );
      return NextResponse.json({ customFoods: items });
    }

    const { searchParams } = new URL(request.url);
    const traineeId = sanitizeText(searchParams.get('traineeId') || '', 60);
    const state = await getServerDbState();

    if (traineeId) {
      const trainee = state.trainees.find((t) => t.id === traineeId);
      if (!trainee || !canCoachAccessTrainee(session, trainee)) {
        return NextResponse.json({ error: 'אין הרשאה למתאמן זה' }, { status: 403 });
      }
      return NextResponse.json({
        customFoods: resolveVisibleCustomFoodsForTrainee(
          trainee,
          state.coachCustomFoods,
          state.globalCustomFoods
        ),
        traineeCustomFoods: trainee.customFoods || [],
        myCoachCustomFoods: state.coachCustomFoods?.[session.id] || [],
        globalCustomFoods: state.globalCustomFoods || [],
      });
    }

    return NextResponse.json({
      customFoods: resolveVisibleCustomFoodsForCoach(
        session.id,
        session.role,
        state.coachCustomFoods,
        state.globalCustomFoods
      ),
      myCoachCustomFoods: state.coachCustomFoods?.[session.id] || [],
      globalCustomFoods: state.globalCustomFoods || [],
    });
  }
);

export const POST = withTelemetryHandler(
  '/api/food/custom',
  async (request: NextRequest, ctx) => {
    if (!verifyCsrfOrigin(request)) {
      ctx.setErrorCode('CSRF_BLOCKED', 'בקשה אינה מורשית');
      return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
    }

    const auth = await authenticateActiveSession(request, { touchLastSeen: true });
    if (!auth.ok) return auth.response;
    const session = auth.session;
    ctx.setActor(session);

    const rl = checkRateLimit(`custom-foods:${session.id}`, 45, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'בקשות רבות מדי, המתן רגע' }, { status: 429 });
    }

    try {
      const body = (await request.json()) as Record<string, unknown>;
      const op = sanitizeText(body.op, 40) || 'upsert';
      ctx.setActionName(`custom_food_${op}`);

      const state = await getServerDbState();

      // -----------------------------------------------------------------------
      // 1. מחיקת מוצר אישי עם RBAC קפדני לפי scope
      // -----------------------------------------------------------------------
      if (op === 'delete') {
        const foodId = sanitizeText(body.id, 80);
        const scope = (sanitizeText(body.scope, 30) || 'trainee') as CustomFoodScope;
        if (!foodId) {
          return NextResponse.json({ error: 'חסר מזהה מוצר למחיקה' }, { status: 400 });
        }

        if (scope === 'global') {
          if (!isSuperAdmin(session)) {
            return NextResponse.json(
              { error: 'רק מנהל ראשי רשאי למחוק מוצר מערכתי' },
              { status: 403 }
            );
          }
          const nextGlobal = (state.globalCustomFoods || []).filter(
            (c) => c.id !== foodId
          );
          await updateServerDbState((prev) => ({
            ...prev,
            globalCustomFoods: nextGlobal,
          }));
          return NextResponse.json({ ok: true, globalCustomFoods: nextGlobal });
        }

        if (scope === 'coach-private' || scope === 'coach-trainees') {
          if (session.role === 'trainee') {
            return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
          }
          const ownerCoachId = session.id;
          const prevList = state.coachCustomFoods?.[ownerCoachId] || [];
          const nextList = prevList.filter((c) => c.id !== foodId);
          await updateServerDbState((prev) => ({
            ...prev,
            coachCustomFoods: {
              ...(prev.coachCustomFoods || {}),
              [ownerCoachId]: nextList,
            },
          }));
          return NextResponse.json({ ok: true, myCoachCustomFoods: nextList });
        }

        const targetTraineeId =
          session.role === 'trainee'
            ? session.id
            : sanitizeText(body.traineeId, 60);
        if (!targetTraineeId) {
          return NextResponse.json({ error: 'חסר מזהה מתאמן' }, { status: 400 });
        }
        const trainee = state.trainees.find((t) => t.id === targetTraineeId);
        if (
          !trainee ||
          (session.role === 'trainee'
            ? trainee.id !== session.id
            : !canCoachAccessTrainee(session, trainee))
        ) {
          return NextResponse.json({ error: 'אין הרשאה למחוק מוצר זה' }, { status: 403 });
        }

        const nextTraineeFoods = (trainee.customFoods || []).filter(
          (c) => c.id !== foodId
        );
        await updateServerDbState((prev) => ({
          ...prev,
          trainees: prev.trainees.map((t) =>
            t.id === targetTraineeId ? { ...t, customFoods: nextTraineeFoods } : t
          ),
        }));
        return NextResponse.json({
          ok: true,
          traineeId: targetTraineeId,
          traineeCustomFoods: nextTraineeFoods,
        });
      }

      // -----------------------------------------------------------------------
      // 2. קידום / שיתוף מוצר קיים של מתאמן (או של המאמן) לכלל מתאמני המאמן
      // -----------------------------------------------------------------------
      if (op === 'share-to-trainees') {
        if (session.role === 'trainee') {
          return NextResponse.json(
            { error: 'רק מאמן רשאי לשתף מוצרים לשאר המתאמנים' },
            { status: 403 }
          );
        }
        const sourceItemId = sanitizeText(body.sourceItemId ?? body.id, 80);
        const sourceTraineeId = sanitizeText(body.sourceTraineeId ?? body.traineeId, 60);

        let sourceItem: CustomFoodItem | undefined;
        if (sourceTraineeId) {
          const tr = state.trainees.find((t) => t.id === sourceTraineeId);
          if (!tr || !canCoachAccessTrainee(session, tr)) {
            return NextResponse.json({ error: 'אין הרשאה למתאמן זה' }, { status: 403 });
          }
          sourceItem = (tr.customFoods || []).find((c) => c.id === sourceItemId);
        } else {
          sourceItem = (state.coachCustomFoods?.[session.id] || []).find(
            (c) => c.id === sourceItemId
          );
        }

        if (!sourceItem) {
          return NextResponse.json({ error: 'המוצר המבוקש לא נמצא' }, { status: 404 });
        }

        const nowIso = new Date().toISOString();
        const ownerCoachId = session.id;
        const currentCoachFoods = [...(state.coachCustomFoods?.[ownerCoachId] || [])];
        const existingIdx = currentCoachFoods.findIndex(
          (c) =>
            c.id === sourceItem!.id ||
            (c.name.trim().toLowerCase() === sourceItem!.name.trim().toLowerCase() &&
              c.per100g.calories === sourceItem!.per100g.calories)
        );

        const sharedItem: CustomFoodItem = {
          ...sourceItem,
          id: existingIdx >= 0 ? currentCoachFoods[existingIdx].id : generateSecureId('cfood'),
          scope: 'coach-trainees',
          ownerId: ownerCoachId,
          ownerRole: session.role,
          ownerName: session.name,
          traineeId: undefined,
          updatedAt: nowIso,
        };

        if (existingIdx >= 0) {
          currentCoachFoods[existingIdx] = sharedItem;
        } else {
          currentCoachFoods.unshift(sharedItem);
        }

        const trimmed = currentCoachFoods.slice(0, MAX_COACH_CUSTOM_FOODS);
        await updateServerDbState((prev) => ({
          ...prev,
          coachCustomFoods: {
            ...(prev.coachCustomFoods || {}),
            [ownerCoachId]: trimmed,
          },
        }));

        return NextResponse.json({
          ok: true,
          item: sharedItem,
          myCoachCustomFoods: trimmed,
        });
      }

      // -----------------------------------------------------------------------
      // 3. קידום / שיתוף מוצר לכולם באפליקציה (מנהל ראשי בלבד!)
      // -----------------------------------------------------------------------
      if (op === 'share-global') {
        if (!isSuperAdmin(session)) {
          return NextResponse.json(
            { error: 'רק מנהל המערכת הראשי רשאי לשתף מוצר לכלל המשתמשים' },
            { status: 403 }
          );
        }
        const sourceItemId = sanitizeText(body.sourceItemId ?? body.id, 80);
        const sourceTraineeId = sanitizeText(body.sourceTraineeId ?? body.traineeId, 60);

        let sourceItem: CustomFoodItem | undefined;
        if (sourceTraineeId) {
          const tr = state.trainees.find((t) => t.id === sourceTraineeId);
          sourceItem = tr?.customFoods?.find((c) => c.id === sourceItemId);
        }
        if (!sourceItem) {
          for (const coachList of Object.values(state.coachCustomFoods || {})) {
            const hit = coachList.find((c) => c.id === sourceItemId);
            if (hit) {
              sourceItem = hit;
              break;
            }
          }
        }
        if (!sourceItem) {
          return NextResponse.json({ error: 'המוצר המבוקש לא נמצא' }, { status: 404 });
        }

        const nowIso = new Date().toISOString();
        const currentGlobal = [...(state.globalCustomFoods || [])];
        const existingIdx = currentGlobal.findIndex(
          (c) =>
            c.id === sourceItem!.id ||
            (c.name.trim().toLowerCase() === sourceItem!.name.trim().toLowerCase() &&
              c.per100g.calories === sourceItem!.per100g.calories)
        );
        const globalItem: CustomFoodItem = {
          ...sourceItem,
          id: existingIdx >= 0 ? currentGlobal[existingIdx].id : generateSecureId('gcfood'),
          scope: 'global',
          ownerId: 'coach-admin',
          ownerRole: 'admin',
          ownerName: session.name,
          traineeId: undefined,
          updatedAt: nowIso,
        };
        if (existingIdx >= 0) currentGlobal[existingIdx] = globalItem;
        else currentGlobal.unshift(globalItem);

        const trimmed = currentGlobal.slice(0, MAX_GLOBAL_CUSTOM_FOODS);
        await updateServerDbState((prev) => ({
          ...prev,
          globalCustomFoods: trimmed,
        }));
        return NextResponse.json({
          ok: true,
          item: globalItem,
          globalCustomFoods: trimmed,
        });
      }

      // -----------------------------------------------------------------------
      // 4. יצירה או עריכה (upsert) של מוצר אישי בכל היקף מורשה
      // -----------------------------------------------------------------------
      const requestedScope = sanitizeText(body.scope, 30) as CustomFoodScope;
      const effectiveScope: CustomFoodScope =
        session.role === 'trainee'
          ? 'trainee'
          : requestedScope || 'coach-trainees';

      if (session.role === 'trainee' && requestedScope && requestedScope !== 'trainee') {
        return NextResponse.json(
          { error: 'מתאמן רשאי ליצור מוצרים אישיים עבור עצמו בלבד' },
          { status: 403 }
        );
      }
      if (effectiveScope === 'global' && !isSuperAdmin(session)) {
        return NextResponse.json(
          { error: 'רק מנהל המערכת הראשי רשאי ליצור מוצר מערכתי לכל המשתמשים' },
          { status: 403 }
        );
      }

      const itemId = sanitizeText(body.id, 80);

      if (effectiveScope === 'global') {
        const currentGlobal = [...(state.globalCustomFoods || [])];
        const existing = itemId ? currentGlobal.find((c) => c.id === itemId) : undefined;
        const built = buildSanitizedCustomFood(body, {
          scope: 'global',
          ownerId: 'coach-admin',
          ownerRole: 'admin',
          ownerName: session.name,
          existingItem: existing,
        });
        if (!built.item) {
          return NextResponse.json({ error: built.error || 'נתונים לא תקינים' }, { status: 400 });
        }
        const nextGlobal = existing
          ? currentGlobal.map((c) => (c.id === built.item!.id ? built.item! : c))
          : [built.item, ...currentGlobal].slice(0, MAX_GLOBAL_CUSTOM_FOODS);
        // אם המוצר היה קודם ברשימת המאמן האדמין (שינוי היקף בעריכה) — נקה משם
        const adminCoachFoods = (state.coachCustomFoods?.['coach-admin'] || []).filter(
          (c) => c.id !== built.item!.id
        );
        await updateServerDbState((prev) => ({
          ...prev,
          globalCustomFoods: nextGlobal,
          ...(prev.coachCustomFoods?.['coach-admin']
            ? {
                coachCustomFoods: {
                  ...prev.coachCustomFoods,
                  'coach-admin': adminCoachFoods,
                },
              }
            : {}),
        }));
        return NextResponse.json({
          ok: true,
          item: built.item,
          globalCustomFoods: nextGlobal,
          ...(isSuperAdmin(session) ? { myCoachCustomFoods: adminCoachFoods } : {}),
        });
      }

      if (effectiveScope === 'coach-private' || effectiveScope === 'coach-trainees') {
        if (session.role === 'trainee') {
          return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
        }
        const coachId = session.id;
        const currentList = [...(state.coachCustomFoods?.[coachId] || [])];
        const existing = itemId ? currentList.find((c) => c.id === itemId) : undefined;
        const built = buildSanitizedCustomFood(body, {
          scope: effectiveScope,
          ownerId: coachId,
          ownerRole: session.role,
          ownerName: session.name,
          existingItem: existing,
        });
        if (!built.item) {
          return NextResponse.json({ error: built.error || 'נתונים לא תקינים' }, { status: 400 });
        }
        const nextList = existing
          ? currentList.map((c) => (c.id === built.item!.id ? built.item! : c))
          : [built.item, ...currentList].slice(0, MAX_COACH_CUSTOM_FOODS);
        const nextGlobal = isSuperAdmin(session)
          ? (state.globalCustomFoods || []).filter((c) => c.id !== built.item!.id)
          : state.globalCustomFoods;

        await updateServerDbState((prev) => ({
          ...prev,
          coachCustomFoods: {
            ...(prev.coachCustomFoods || {}),
            [coachId]: nextList,
          },
          ...(isSuperAdmin(session) ? { globalCustomFoods: nextGlobal } : {}),
        }));
        return NextResponse.json({
          ok: true,
          item: built.item,
          myCoachCustomFoods: nextList,
          ...(isSuperAdmin(session) ? { globalCustomFoods: nextGlobal } : {}),
        });
      }

      // scope === 'trainee'
      const targetTraineeId =
        session.role === 'trainee'
          ? session.id
          : sanitizeText(body.traineeId, 60);
      if (!targetTraineeId) {
        return NextResponse.json({ error: 'יש לבחור מתאמן למוצר האישי' }, { status: 400 });
      }
      const trainee = state.trainees.find((t) => t.id === targetTraineeId);
      if (
        !trainee ||
        (session.role === 'trainee'
          ? trainee.status !== 'active'
          : !canCoachAccessTrainee(session, trainee))
      ) {
        return NextResponse.json({ error: 'אין הרשאה למתאמן זה' }, { status: 403 });
      }

      const currentTraineeFoods = [...(trainee.customFoods || [])];
      const existing = itemId ? currentTraineeFoods.find((c) => c.id === itemId) : undefined;
      const built = buildSanitizedCustomFood(body, {
        scope: 'trainee',
        ownerId: session.id,
        ownerRole: session.role,
        ownerName: session.name,
        traineeId: targetTraineeId,
        existingItem: existing,
      });
      if (!built.item) {
        return NextResponse.json({ error: built.error || 'נתונים לא תקינים' }, { status: 400 });
      }
      const nextTraineeFoods = existing
        ? currentTraineeFoods.map((c) => (c.id === built.item!.id ? built.item! : c))
        : [built.item, ...currentTraineeFoods].slice(0, MAX_TRAINEE_CUSTOM_FOODS);

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === targetTraineeId ? { ...t, customFoods: nextTraineeFoods } : t
        ),
      }));

      return NextResponse.json({
        ok: true,
        item: built.item,
        traineeId: targetTraineeId,
        traineeCustomFoods: nextTraineeFoods,
      });
    } catch {
      return NextResponse.json({ error: 'בקשה אינה תקינה' }, { status: 400 });
    }
  }
);
