import { calculateMacrosForGrams, sumMacros } from '../data/israeliFoodCatalog';
import {
  FoodInputConfidence,
  LoggedFoodItem,
  MacroTargets,
} from '@/types/nutrition';

function round1(val: number): number {
  return Math.round((Number(val) || 0) * 10) / 10;
}

function round2(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

export function clampGrams(val: unknown, fallback = 100): number {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(10000, Math.max(0.1, round1(num)));
}

export function hasCompositeComponents(
  item?: Pick<LoggedFoodItem, 'components'> | null
): boolean {
  return Boolean(item && Array.isArray(item.components) && item.components.length > 0);
}

/**
 * אוכף עומק של עד 3 רמות בלבד (ארוחה -> מנה -> מרכיבים):
 * למרכיב בתוך מנה לעולם לא יכולים להיות תתי-מרכיבים.
 */
export function stripNestedComponents(item: LoggedFoodItem): LoggedFoodItem {
  if (!item.components) return item;
  const copy = { ...item };
  delete copy.components;
  return copy;
}

export function derivePer100gSafe(
  macros: MacroTargets,
  grams: number
): MacroTargets | undefined {
  const safeGrams = Number(grams) || 0;
  if (safeGrams < 0.1) return undefined;
  const factor = 100 / safeGrams;
  const cal100 = Math.round((Number(macros.calories) || 0) * factor);
  const p100 = round2((Number(macros.protein) || 0) * factor);
  const c100 = round2((Number(macros.carbs) || 0) * factor);
  const f100 = round2((Number(macros.fat) || 0) * factor);

  const hasAny = cal100 > 0 || p100 > 0 || c100 > 0 || f100 > 0;
  if (!hasAny || cal100 > 950 || p100 > 100 || c100 > 100 || f100 > 100) {
    return undefined;
  }
  return {
    calories: Math.max(0, cal100),
    protein: Math.max(0, p100),
    carbs: Math.max(0, c100),
    fat: Math.max(0, f100),
  };
}

/**
 * מסכם מנה מורכבת מתוך המרכיבים שלה כך שהגרמים והמאקרו של כותרת המנה תמיד תואמים ב-100%.
 */
export function recalculateParentDish(dish: LoggedFoodItem): LoggedFoodItem {
  if (!hasCompositeComponents(dish)) return dish;

  const cleanComponents = dish.components!.map(stripNestedComponents);
  const totalGrams = round1(
    cleanComponents.reduce((acc, c) => acc + clampGrams(c.grams, 0), 0)
  );
  const safeGrams = Math.max(0.1, totalGrams);
  const totalMacros = sumMacros(cleanComponents.map((c) => c.macros));
  const per100g = derivePer100gSafe(totalMacros, safeGrams);
  const count = cleanComponents.length;

  return {
    ...dish,
    grams: safeGrams,
    macros: totalMacros,
    ...(per100g ? { per100g } : {}),
    unitLabel: `מנה (${Math.round(safeGrams)} גרם · ${count} מרכיבים)`,
    components: cleanComponents,
  };
}

function scaleSimpleItemMacros(
  item: LoggedFoodItem,
  newGrams: number
): MacroTargets {
  if (item.per100g) {
    return calculateMacrosForGrams(item.per100g, newGrams);
  }
  const prevGrams = Math.max(0.1, Number(item.grams) || 100);
  const ratio = newGrams / prevGrams;
  return {
    calories: Math.max(0, Math.round((item.macros.calories || 0) * ratio)),
    protein: round1(Math.max(0, (item.macros.protein || 0) * ratio)),
    carbs: round1(Math.max(0, (item.macros.carbs || 0) * ratio)),
    fat: round1(Math.max(0, (item.macros.fat || 0) * ratio)),
  };
}

export function scaleSimpleFoodItemGrams(
  item: LoggedFoodItem,
  targetGrams: number
): LoggedFoodItem {
  const grams = clampGrams(targetGrams, item.grams || 100);
  const per100g = item.per100g || derivePer100gSafe(item.macros, item.grams);
  const macros = scaleSimpleItemMacros({ ...item, per100g }, grams);
  return {
    ...item,
    grams,
    ...(per100g ? { per100g } : {}),
    macros,
    unitLabel: `${grams % 1 === 0 ? Math.round(grams) : grams} גרם`,
  };
}

/**
 * משנה כמות של מנה מורכבת לפי פקטור (למשל 0.5x / 1.5x / 2x) או פריט בודד.
 */
export function scaleCompositeDishByFactor(
  item: LoggedFoodItem,
  factor: number
): LoggedFoodItem {
  const safeFactor = Math.max(0.05, Math.min(20, Number(factor) || 1));
  if (!hasCompositeComponents(item)) {
    return scaleSimpleFoodItemGrams(item, clampGrams(item.grams * safeFactor, item.grams));
  }
  const scaledChildren = item.components!.map((comp) =>
    scaleSimpleFoodItemGrams(comp, clampGrams(comp.grams * safeFactor, comp.grams))
  );
  return recalculateParentDish({
    ...item,
    quantity: round1((item.quantity || 1) * safeFactor),
    components: scaledChildren,
  });
}

export function scaleLoggedItemToGrams(
  item: LoggedFoodItem,
  targetGrams: number
): LoggedFoodItem {
  const nextGrams = clampGrams(targetGrams, item.grams || 100);
  if (!hasCompositeComponents(item)) {
    return scaleSimpleFoodItemGrams(item, nextGrams);
  }
  const curGrams = Math.max(0.1, Number(item.grams) || nextGrams);
  return scaleCompositeDishByFactor(item, nextGrams / curGrams);
}

/**
 * מחשבון "סיר ביתי" (גלם -> מוכן):
 * מקבל את מרכיבי הסיר המלא (לפני בישול), את משקל הסיר המוכן הכולל ואת משקל הצלחת שנלקח,
 * ומחזיר מנה מורכבת מדויקת עם היחס המדויק של שמן וכל מרכיב בצלחת.
 */
export function computeYieldPortionDish(params: {
  title: string;
  rawIngredients: LoggedFoodItem[];
  cookedYieldGrams: number;
  servingGrams: number;
  source?: LoggedFoodItem['source'];
  sourcePresetId?: string;
}): LoggedFoodItem {
  const yieldG = clampGrams(params.cookedYieldGrams, 100);
  const serveG = clampGrams(params.servingGrams, yieldG);
  const ratio = serveG / yieldG;

  const portionComponents = params.rawIngredients.map((raw, idx) => {
    const clean = stripNestedComponents(raw);
    const derivedPer100 = clean.per100g || derivePer100gSafe(clean.macros, clean.grams);
    const scaledRawGrams = clampGrams(clean.grams * ratio, 0.1);
    const scaledMacros: MacroTargets = {
      calories: Math.max(0, Math.round((clean.macros.calories || 0) * ratio)),
      protein: round1(Math.max(0, (clean.macros.protein || 0) * ratio)),
      carbs: round1(Math.max(0, (clean.macros.carbs || 0) * ratio)),
      fat: round1(Math.max(0, (clean.macros.fat || 0) * ratio)),
    };
    return {
      ...clean,
      id: clean.id || `pot-${Date.now()}-${idx}`,
      grams: scaledRawGrams,
      ...(derivedPer100 ? { per100g: derivedPer100 } : {}),
      macros: scaledMacros,
      unitLabel: `${scaledRawGrams % 1 === 0 ? Math.round(scaledRawGrams) : scaledRawGrams} גרם (גלם יחסי)`,
    };
  });

  const totalMacros = sumMacros(portionComponents.map((c) => c.macros));
  const per100g = derivePer100gSafe(totalMacros, serveG);

  return {
    id: `potdish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: params.title.trim() || 'תבשיל ביתי',
    grams: serveG,
    quantity: 1,
    macros: totalMacros,
    ...(per100g ? { per100g } : {}),
    unitLabel: `מנה מהסיר (${Math.round(serveG)} גרם · מתוך ${Math.round(yieldG)}g)`,
    source: params.source || 'manual',
    ...(params.sourcePresetId ? { sourcePresetId: params.sourcePresetId } : {}),
    recipeYieldGrams: yieldG,
    components: portionComponents,
  };
}

/**
 * מאחד רשימת פריטים למנה מורכבת אחת (למשל: חלב + אספרסו + סוכר -> "קפה").
 */
export function groupItemsAsCompositeDish(
  items: LoggedFoodItem[],
  dishTitle: string,
  options?: { sourcePresetId?: string; id?: string }
): LoggedFoodItem {
  const flatChildren = items.flatMap((it) =>
    hasCompositeComponents(it)
      ? it.components!.map(stripNestedComponents)
      : [stripNestedComponents(it)]
  );
  const firstSrc = flatChildren[0]?.source || 'manual';
  const baseDish: LoggedFoodItem = {
    id: options?.id || `dish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: dishTitle.trim() || 'מנה מורכבת',
    unitLabel: 'מנה',
    quantity: 1,
    grams: 1,
    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    source: firstSrc,
    ...(options?.sourcePresetId ? { sourcePresetId: options.sourcePresetId } : {}),
    components: flatChildren,
  };
  return recalculateParentDish(baseDish);
}

/**
 * מוחק פריטים שלמים או מרכיבים בודדים מתוך מנות, ומחשב מחדש מנות הורה שנותרו עם מרכיבים.
 */
export function removeSelectedFromItems(
  items: LoggedFoodItem[],
  selectedIds: Set<string>
): LoggedFoodItem[] {
  const next: LoggedFoodItem[] = [];
  for (const item of items) {
    if (selectedIds.has(item.id)) {
      continue;
    }
    if (hasCompositeComponents(item)) {
      const remainingComps = item.components!.filter((c) => !selectedIds.has(c.id));
      if (remainingComps.length === 0) {
        continue;
      }
      if (remainingComps.length !== item.components!.length) {
        next.push(recalculateParentDish({ ...item, components: remainingComps }));
        continue;
      }
    }
    next.push(item);
  }
  return next;
}

/**
 * מחלץ עותק נקי של הפריטים/מנות/מרכיבים שנבחרו לצורך שמירה בארוחות שמורות.
 */
export function extractSelectedItemsForPreset(
  items: LoggedFoodItem[],
  selectedIds: Set<string>
): LoggedFoodItem[] {
  const picked: LoggedFoodItem[] = [];
  for (const item of items) {
    if (selectedIds.has(item.id)) {
      picked.push(cloneFoodItemWithFreshIds(item, 'preset'));
      continue;
    }
    if (hasCompositeComponents(item)) {
      const pickedComps = item.components!.filter((c) => selectedIds.has(c.id));
      if (pickedComps.length > 0) {
        if (pickedComps.length === item.components!.length) {
          picked.push(cloneFoodItemWithFreshIds(item, 'preset'));
        } else if (pickedComps.length === 1) {
          picked.push(cloneFoodItemWithFreshIds(pickedComps[0], 'preset'));
        } else {
          picked.push(
            recalculateParentDish({
              ...cloneFoodItemWithFreshIds(item, 'preset'),
              components: pickedComps.map((c) =>
                cloneFoodItemWithFreshIds(stripNestedComponents(c), 'preset')
              ),
            })
          );
        }
      }
    }
  }
  return picked;
}

export interface ScopedSelectionPayload {
  selectionKind: 'whole-meal' | 'top-level' | 'partial-components';
  targetItems: LoggedFoodItem[];
  lockedContextItems: LoggedFoodItem[];
  partialParentMap: Array<{
    parentId: string;
    parentName: string;
    selectedComponentIds: string[];
    lockedComponentNames: string[];
  }>;
}

export function buildSelectiveScopedPayload(
  items: LoggedFoodItem[],
  selectedIds: Set<string>
): ScopedSelectionPayload {
  if (selectedIds.size === 0) {
    return {
      selectionKind: 'whole-meal',
      targetItems: items,
      lockedContextItems: [],
      partialParentMap: [],
    };
  }

  const targetItems: LoggedFoodItem[] = [];
  const lockedContextItems: LoggedFoodItem[] = [];
  const partialParentMap: ScopedSelectionPayload['partialParentMap'] = [];

  for (const item of items) {
    if (selectedIds.has(item.id)) {
      targetItems.push(item);
      continue;
    }
    if (hasCompositeComponents(item)) {
      const selComps = item.components!.filter((c) => selectedIds.has(c.id));
      const lockedComps = item.components!.filter((c) => !selectedIds.has(c.id));
      if (selComps.length > 0) {
        targetItems.push(...selComps);
        partialParentMap.push({
          parentId: item.id,
          parentName: item.name,
          selectedComponentIds: selComps.map((c) => c.id),
          lockedComponentNames: lockedComps.map((c) => `${c.name} (${c.grams}g)`),
        });
        if (lockedComps.length > 0) {
          lockedContextItems.push({ ...item, components: lockedComps });
        }
        continue;
      }
    }
    lockedContextItems.push(item);
  }

  return {
    selectionKind: partialParentMap.length > 0 ? 'partial-components' : 'top-level',
    targetItems,
    lockedContextItems,
    partialParentMap,
  };
}

/**
 * ממזג תשובת תיקון AI סלקטיבית חזרה לארוחה מבלי לגעת במנות או מרכיבים שלא נבחרו.
 */
export function mergeScopedAdjustmentResult(params: {
  currentItems: LoggedFoodItem[];
  selectedTargetIds: string[];
  adjustedItems: LoggedFoodItem[];
}): LoggedFoodItem[] {
  const { currentItems, selectedTargetIds, adjustedItems } = params;
  if (!Array.isArray(selectedTargetIds) || selectedTargetIds.length === 0) {
    return adjustedItems;
  }

  const selSet = new Set(selectedTargetIds);
  const scoped = buildSelectiveScopedPayload(currentItems, selSet);

  // מקרה א': נבחרו רק רכיבים חלקיים מתוך מנת אב אחת -> החלף בתוכה בלבד וחשב מחדש
  if (scoped.partialParentMap.length === 1 && scoped.targetItems.length > 0) {
    const partial = scoped.partialParentMap[0];
    const hasTopLevelSelected = currentItems.some((it) => selSet.has(it.id));
    if (!hasTopLevelSelected) {
      return currentItems.map((it) => {
        if (it.id !== partial.parentId || !it.components) return it;
        const firstSelIdx = it.components.findIndex((c) => selSet.has(c.id));
        const kept = it.components.filter((c) => !selSet.has(c.id));
        const cleanedAdjusted = adjustedItems.map(stripNestedComponents);
        const mergedComps = [
          ...kept.slice(0, Math.max(0, firstSelIdx)),
          ...cleanedAdjusted,
          ...kept.slice(Math.max(0, firstSelIdx)),
        ];
        if (mergedComps.length === 0) return it;
        return recalculateParentDish({ ...it, components: mergedComps });
      });
    }
  }

  // מקרה ב': נבחרו מנות/פריטים מלאים (ואולי גם חלקיים) -> משמר את מיקום הבחירה הראשונה
  const cleanedWithoutSelected = removeSelectedFromItems(currentItems, selSet);
  const firstTopIdx = currentItems.findIndex(
    (it) =>
      selSet.has(it.id) ||
      (hasCompositeComponents(it) && it.components!.some((c) => selSet.has(c.id)))
  );
  const insertAt = firstTopIdx >= 0 ? Math.min(firstTopIdx, cleanedWithoutSelected.length) : cleanedWithoutSelected.length;

  return [
    ...cleanedWithoutSelected.slice(0, insertAt),
    ...adjustedItems,
    ...cleanedWithoutSelected.slice(insertAt),
  ];
}

export function cloneFoodItemWithFreshIds(
  item: LoggedFoodItem,
  prefix = 'copy',
  overrides?: Partial<LoggedFoodItem>
): LoggedFoodItem {
  const rand = () => Math.random().toString(36).slice(2, 6);
  const ts = Date.now();
  const basePer100 =
    item.per100g || derivePer100gSafe(item.macros, item.grams);
  const nextComps = hasCompositeComponents(item)
    ? item.components!.map((c, idx) => {
        const stripped = stripNestedComponents(c);
        const cPer100 =
          stripped.per100g || derivePer100gSafe(stripped.macros, stripped.grams);
        return {
          ...stripped,
          ...(cPer100 ? { per100g: cPer100 } : {}),
          id: `${prefix}-c-${ts}-${idx}-${rand()}`,
        };
      })
    : undefined;

  const nextItem: LoggedFoodItem = {
    ...item,
    ...(basePer100 ? { per100g: basePer100 } : {}),
    ...(nextComps ? { components: nextComps } : {}),
    ...overrides,
    id: overrides?.id || `${prefix}-${ts}-${rand()}`,
  };
  return hasCompositeComponents(nextItem) ? recalculateParentDish(nextItem) : nextItem;
}

export function resolveConfidenceLabelHe(confidence?: FoodInputConfidence): string | null {
  if (confidence === 'visual-estimate') return 'הערכת AI';
  if (confidence === 'reported') return 'מדווח';
  return null;
}

export {
  filterUnacceptedSuggestedExtras,
  normalizeSuggestedExtraName,
} from './mealHistory';
