import {
  CustomFoodItem,
  CustomFoodScope,
  FoodCatalogItem,
  FoodUnit,
  MacroTargets,
  TraineeProfile,
  UserRole,
} from '@/types/nutrition';

function roundCal(n: number): number {
  return Math.max(0, Math.min(950, Math.round(Number(n) || 0)));
}

function roundMacro2(n: number): number {
  return Math.round(Math.max(0, Math.min(100, Number(n) || 0)) * 100) / 100;
}

/**
 * מחשב ערכים תזונתיים ל-100 גרם מתוך מנה/יחידה במשקל ידוע.
 */
export function computePer100gFromServing(
  servingMacros: MacroTargets,
  servingGrams: number
): MacroTargets {
  const safeGrams = Math.max(1, Math.min(5000, Number(servingGrams) || 100));
  const factor = 100 / safeGrams;
  return {
    calories: roundCal((Number(servingMacros.calories) || 0) * factor),
    protein: roundMacro2((Number(servingMacros.protein) || 0) * factor),
    carbs: roundMacro2((Number(servingMacros.carbs) || 0) * factor),
    fat: roundMacro2((Number(servingMacros.fat) || 0) * factor),
  };
}

export function getCustomFoodScopeLabel(scope: CustomFoodScope): string {
  switch (scope) {
    case 'trainee':
      return 'מוצר אישי';
    case 'coach-private':
      return 'פרטי למאמן';
    case 'coach-trainees':
      return 'מהמאמן שלי';
    case 'global':
      return 'SPOT מערכתי';
  }
}

/**
 * ממיר מוצר אישי לרשומת קטלוג מלאה עבור החיפוש, הברקוד ומיפוי ה-AI.
 */
export function customFoodToCatalogItem(cf: CustomFoodItem): FoodCatalogItem {
  const seenLabels = new Set<string>();
  const units: FoodUnit[] = [];

  for (const u of cf.units || []) {
    if (!u?.label || !Number.isFinite(u.grams) || u.grams <= 0) continue;
    const key = `${u.label}:${Math.round(u.grams)}`;
    if (!seenLabels.has(key)) {
      seenLabels.add(key);
      units.push({ label: u.label, grams: Math.round(u.grams) });
    }
  }

  if (!seenLabels.has('100 גרם:100')) {
    units.push({ label: '100 גרם', grams: 100 });
  }

  const scopeBadge = getCustomFoodScopeLabel(cf.scope);
  return {
    id: cf.id,
    name: cf.name,
    brand: cf.brand || undefined,
    category: cf.category || 'מוצרים אישיים',
    barcode: cf.barcode || undefined,
    ...(cf.imageDataUrl ? { imageDataUrl: cf.imageDataUrl } : {}),
    per100g: cf.per100g,
    units,
    isPopular: true,
    source: 'custom',
    sourceSiteName:
      cf.ownerName && cf.scope === 'coach-trainees'
        ? `${scopeBadge} · ${cf.ownerName}`
        : scopeBadge,
    customScope: cf.scope,
    customFoodOwnerId: cf.ownerId,
    updatedAt: cf.updatedAt,
  };
}

/**
 * אוסף את כל המוצרים האישיים הגלויים למתאמן (לפי סדר עדיפות: אישיים -> מאמן -> גלובלי).
 */
export function resolveVisibleCustomFoodsForTrainee(
  trainee?: Pick<TraineeProfile, 'id' | 'primaryCoachId' | 'sharedCoachIds' | 'customFoods'> | null,
  coachCustomFoods?: Record<string, CustomFoodItem[]>,
  globalCustomFoods?: CustomFoodItem[]
): CustomFoodItem[] {
  const seenIds = new Set<string>();
  const merged: CustomFoodItem[] = [];

  const pushUnique = (list?: CustomFoodItem[], allowedScopes?: Set<CustomFoodScope>) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item?.id || !item?.name || seenIds.has(item.id)) continue;
      if (allowedScopes && !allowedScopes.has(item.scope)) continue;
      seenIds.add(item.id);
      merged.push(item);
    }
  };

  if (trainee) {
    pushUnique(trainee.customFoods);
    const coachIds = [
      trainee.primaryCoachId,
      ...(Array.isArray(trainee.sharedCoachIds) ? trainee.sharedCoachIds : []),
    ].filter(Boolean);
    const sharedOnly = new Set<CustomFoodScope>(['coach-trainees']);
    for (const cId of coachIds) {
      pushUnique(coachCustomFoods?.[cId], sharedOnly);
    }
  }

  pushUnique(globalCustomFoods, new Set<CustomFoodScope>(['global']));
  return merged;
}

/**
 * אוסף את המוצרים האישיים שרואה מאמן או מנהל ראשי (הספרייה שלו + גלובליים).
 */
export function resolveVisibleCustomFoodsForCoach(
  actorId: string,
  _actorRole: UserRole,
  coachCustomFoods?: Record<string, CustomFoodItem[]>,
  globalCustomFoods?: CustomFoodItem[]
): CustomFoodItem[] {
  const seenIds = new Set<string>();
  const merged: CustomFoodItem[] = [];

  for (const item of coachCustomFoods?.[actorId] || []) {
    if (!item?.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    merged.push(item);
  }
  for (const item of globalCustomFoods || []) {
    if (!item?.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    merged.push(item);
  }
  return merged;
}
