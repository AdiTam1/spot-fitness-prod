import {
  calculateMacrosForGrams,
  ISRAELI_FOOD_CATALOG,
} from '@/data/israeliFoodCatalog';
import {
  areDietaryAttributesCompatible,
  scoreSynonymTextMatch,
} from '@/lib/foodSynonyms';
import { getSemanticSearchEnabledFast } from '@/lib/serverStore';
import {
  getOrCreateQueryEmbeddingText,
  searchFoodCatalogSql,
} from '@/lib/supabase';
import {
  clampGrams,
  hasCompositeComponents,
  recalculateParentDish,
  stripNestedComponents,
} from '@/lib/compositeDishes';
import { FoodCatalogItem, LoggedFoodItem, MacroTargets } from '@/types/nutrition';

const PREP_GROUPS: Record<string, string[]> = {
  cooked_moist: ['מבושל', 'מבושלת', 'מבושלים', 'מאודה', 'מאודים', 'שלוק', 'מוכן'],
  dry_raw: ['יבש', 'יבשה', 'גולמי', 'אבקה', 'תערובת'],
  fried: ['מטוגן', 'מטוגנת', 'מטוגנים', 'בשמן עמוק'],
  baked_grilled: ['אפוי', 'אפויה', 'אפויים', 'בתנור', 'צלוי', 'צלויה', 'גריל', 'מנגל', 'על האש'],
};

const STOP_WORDS = new Set([
  'של',
  'עם',
  'בלי',
  'ללא',
  'בתוספת',
  'ומעט',
  'קצת',
  'בצד',
  'ביתי',
  'ביתית',
  'מנה',
  'יחידה',
  'גרם',
  'כף',
  'כפות',
]);

const MODIFIER_CONFLICTS: [string, string][] = [
  ['חלב', 'מריר'],
  ['מלא', 'לבן'],
  ['דיאט', 'רגיל'],
  ['זירו', 'רגיל'],
  ['עוף', 'בקר'],
  ['עוף', 'תירס'],
  ['עוף', 'טופו'],
  ['בקר', 'טופו'],
];

const DB_LOOKUP_TIMEOUT_MS = 1400;

function normalizeFoodTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[״"'`׳(),./\\\-–—+]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function getCoreTokens(raw: string): string[] {
  return normalizeFoodTokens(raw).filter((t) => !STOP_WORDS.has(t));
}

function extractPrepSet(rawName: string): Set<string> {
  const lower = rawName.toLowerCase();
  const matched = new Set<string>();
  if (lower.includes('לא מבושל') || lower.includes('לא מבושלת')) {
    matched.add('dry_raw');
    return matched;
  }
  for (const [group, words] of Object.entries(PREP_GROUPS)) {
    if (words.some((w) => lower.includes(w))) {
      matched.add(group);
    }
  }
  return matched;
}

function extractFatPercents(rawName: string): string[] {
  const matches = rawName.match(/\d+(?:\.\d+)?%/g);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

function areFoodVariantsCompatible(queryName: string, candidateName: string): boolean {
  const qLower = queryName.toLowerCase();
  const cLower = candidateName.toLowerCase();

  const qPrep = extractPrepSet(qLower);
  const cPrep = extractPrepSet(cLower);

  if (qPrep.has('cooked_moist') && cPrep.has('dry_raw')) return false;
  if (qPrep.has('dry_raw') && cPrep.has('cooked_moist')) return false;
  if (qPrep.has('baked_grilled') && cPrep.has('fried')) return false;
  if (qPrep.has('fried') && cPrep.has('baked_grilled')) return false;

  // אם הצרכן ביקש במפורש אפוי/מבושל, אל תתאים מועמד שצובר קלוריות מגרסה יבשה או מטוגנת שלא צוינה
  if ((qPrep.has('cooked_moist') || qPrep.has('baked_grilled')) && cPrep.size > 0) {
    const sharesPrep = Array.from(qPrep).some((p) => cPrep.has(p));
    if (!sharesPrep && (cPrep.has('dry_raw') || cPrep.has('fried'))) {
      return false;
    }
  }

  const qPercents = extractFatPercents(qLower);
  const cPercents = extractFatPercents(cLower);
  if (qPercents.length > 0 && cPercents.length > 0) {
    if (!qPercents.some((p) => cPercents.includes(p))) return false;
  }

  for (const [a, b] of MODIFIER_CONFLICTS) {
    const qHasA = qLower.includes(a);
    const qHasB = qLower.includes(b);
    const cHasA = cLower.includes(a);
    const cHasB = cLower.includes(b);
    if ((qHasA && cHasB && !qHasB) || (qHasB && cHasA && !qHasA)) {
      return false;
    }
  }

  return true;
}

function scoreCatalogMatch(
  queryName: string,
  candidate: FoodCatalogItem,
  aiPer100g?: MacroTargets,
  skipCaloriePlausibility = false,
  semanticEnabled = false,
  isSemanticDbPool = false
): number {
  if (!candidate.per100g || !Number.isFinite(candidate.per100g.calories)) {
    return 0;
  }
  if (!areFoodVariantsCompatible(queryName, candidate.name)) {
    return 0;
  }
  if (
    semanticEnabled &&
    !areDietaryAttributesCompatible(queryName, candidate.name, candidate.category || '')
  ) {
    return 0;
  }

  const qTokens = getCoreTokens(queryName);
  const cTokens = getCoreTokens(candidate.name);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const matchedCount = qTokens.filter((qt) =>
    cTokens.some((ct) => ct === qt || ct.includes(qt) || qt.includes(ct))
  ).length;
  const synBonus = semanticEnabled
    ? scoreSynonymTextMatch(queryName, `${candidate.name} ${candidate.brand || ''}`)
    : 0;

  // במצב רגיל דרוש כיסוי טוקנים מלא; במצב סמנטי מתאפשרת גם התאמה נרדפת או וקטורית בתנאי סבירות קלורית
  if (matchedCount < qTokens.length) {
    if (!semanticEnabled) return 0;
    const semanticOk = synBonus >= 66 || (isSemanticDbPool && matchedCount >= Math.max(1, qTokens.length - 1));
    if (!semanticOk) return 0;
  }

  // מנע התאמה לתבשיל מורכב בעל הרבה מילים עודפות (למשל "שניצל תירס עם רוטב...")
  const extraTokens = cTokens.length - qTokens.length;
  if (extraTokens > 3) return 0;

  // שער סבירות קלורי: מונע קפיצות חדות ממאגר חיצוני עקב מצב צבירה שונה
  // במוצרים אישיים שהמשתמש הגדיר בעצמו — מכבדים את הערכים שבחר ללא פסילה
  if (
    !skipCaloriePlausibility &&
    aiPer100g &&
    aiPer100g.calories >= 30 &&
    candidate.per100g.calories >= 0
  ) {
    const ratio = candidate.per100g.calories / aiPer100g.calories;
    if (ratio < 0.55 || ratio > 1.75) {
      return 0;
    }
  }

  let score =
    matchedCount >= qTokens.length
      ? 100 - extraTokens * 8
      : Math.max(76, synBonus) - Math.max(0, extraTokens) * 5;
  if (candidate.source === 'custom') score += 45;
  if (candidate.source === 'local') score += 15;
  if (candidate.source === 'moh' || candidate.sourceSiteId === 'moh_gov') score += 10;

  const qPrep = extractPrepSet(queryName);
  const cPrep = extractPrepSet(candidate.name);
  if (qPrep.size > 0 && Array.from(qPrep).some((p) => cPrep.has(p))) {
    score += 20;
  }

  return score;
}

function roundMacro(val: number): number {
  return Math.round(Math.max(0, val) * 10) / 10;
}

function sanitizePer100g(raw?: MacroTargets): MacroTargets | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cal = Number(raw.calories);
  const pro = Number(raw.protein);
  const carb = Number(raw.carbs);
  const fat = Number(raw.fat);
  if (!Number.isFinite(cal) || cal < 0 || cal > 950) return undefined;
  return {
    calories: Math.round(cal),
    protein: Number.isFinite(pro) ? Math.min(100, roundMacro(pro)) : 0,
    carbs: Number.isFinite(carb) ? Math.min(100, roundMacro(carb)) : 0,
    fat: Number.isFinite(fat) ? Math.min(100, roundMacro(fat)) : 0,
  };
}

function derivePer100gFromMacros(macros: MacroTargets, grams: number): MacroTargets {
  const safeGrams = grams >= 0.1 ? grams : 100;
  const factor = 100 / safeGrams;
  return {
    calories: Math.min(950, Math.round(Math.max(0, macros.calories) * factor)),
    protein: Math.min(100, roundMacro(macros.protein * factor)),
    carbs: Math.min(100, roundMacro(macros.carbs * factor)),
    fat: Math.min(100, roundMacro(macros.fat * factor)),
  };
}

function findBestCandidate(
  queryName: string,
  pool: FoodCatalogItem[],
  aiPer100g?: MacroTargets,
  skipCaloriePlausibility = false,
  semanticEnabled = false,
  isSemanticDbPool = false
): FoodCatalogItem | undefined {
  let best: FoodCatalogItem | undefined;
  let bestScore = 0;
  for (const cand of pool) {
    const score = scoreCatalogMatch(
      queryName,
      cand,
      aiPer100g,
      skipCaloriePlausibility || cand.source === 'custom',
      semanticEnabled,
      isSemanticDbPool
    );
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return bestScore >= 76 ? best : undefined;
}

async function querySupabaseCatalogWithTimeout(
  query: string,
  semanticEnabled = false
): Promise<{ items: FoodCatalogItem[]; usedSemanticRrf: boolean }> {
  try {
    const cleanQ = getCoreTokens(query).slice(0, 3).join(' ');
    if (cleanQ.length < 2) return { items: [], usedSemanticRrf: false };

    const execLookup = async (): Promise<{
      items: FoodCatalogItem[];
      usedSemanticRrf: boolean;
    }> => {
      let vecText: string | null = null;
      if (semanticEnabled) {
        const emb = await getOrCreateQueryEmbeddingText(cleanQ, {
          allowGeminiCall: true,
        }).catch(() => ({ vectorText: null, cacheHit: false }));
        vecText = emb.vectorText;
      }
      const res = await searchFoodCatalogSql({
        query: cleanQ,
        sourceMode: 'all',
        queryEmbeddingText: vecText,
        semanticWeight: vecText ? 0.9 : 0,
        limit: 8,
      });
      return {
        items: res.tableReady ? res.items : [],
        usedSemanticRrf: Boolean(res.usedSemanticRrf),
      };
    };

    const budgetMs = semanticEnabled ? 2400 : DB_LOOKUP_TIMEOUT_MS;
    const timeoutPromise = new Promise<{
      items: FoodCatalogItem[];
      usedSemanticRrf: boolean;
    }>((resolve) =>
      setTimeout(() => resolve({ items: [], usedSemanticRrf: false }), budgetMs)
    );
    return await Promise.race([execLookup(), timeoutPromise]);
  } catch {
    return { items: [], usedSemanticRrf: false };
  }
}

async function groundSingleFlatItem(
  item: LoggedFoodItem,
  priorityCatalog: FoodCatalogItem[] | undefined,
  semanticEnabled: boolean
): Promise<LoggedFoodItem> {
  const grams = clampGrams(item.grams, 100);
  const validAiPer100g =
    sanitizePer100g(item.per100g) || derivePer100gFromMacros(item.macros, grams);

  // תבלינים מאוחדים שומרים על חישוב המודל ופירוט השמות בלי שיחליפו אותם בתבלין בודד מהמאגר
  if (item.componentRole === 'spice-group') {
    return {
      ...item,
      grams,
      per100g: validAiPer100g,
      macros: calculateMacrosForGrams(validAiPer100g, grams),
    };
  }

  let matched =
    Array.isArray(priorityCatalog) && priorityCatalog.length > 0
      ? findBestCandidate(
          item.name,
          priorityCatalog,
          validAiPer100g,
          true,
          semanticEnabled,
          false
        )
      : undefined;

  if (!matched) {
    matched = findBestCandidate(
      item.name,
      ISRAELI_FOOD_CATALOG,
      validAiPer100g,
      false,
      semanticEnabled,
      false
    );
  }

  if (!matched) {
    const dbLookup = await querySupabaseCatalogWithTimeout(
      item.name,
      semanticEnabled
    );
    if (dbLookup.items.length > 0) {
      matched = findBestCandidate(
        item.name,
        dbLookup.items,
        validAiPer100g,
        false,
        semanticEnabled,
        dbLookup.usedSemanticRrf
      );
    }
  }

  const resolvedPer100g = matched
    ? sanitizePer100g(matched.per100g) || validAiPer100g
    : validAiPer100g;

  return {
    ...item,
    grams,
    per100g: resolvedPer100g,
    macros: calculateMacrosForGrams(resolvedPer100g, grams),
    matchedCatalogId: matched?.id ?? item.matchedCatalogId,
  };
}

/**
 * Split-Brain DB Grounding & Deterministic Macro Scaler:
 * נועל שמות ומצבי הכנה תואמים למאגר הישראלי המאומת (כאשר יש התאמה בביטחון גבוה),
 * עובר גם על רכיבי משנה של מנות מורכבות ומחשב את המנה הכוללת דטרמיניסטית מסך המרכיבים.
 */
export async function groundAndNormalizeAiItems(
  items: LoggedFoodItem[],
  priorityCatalog?: FoodCatalogItem[]
): Promise<LoggedFoodItem[]> {
  if (!Array.isArray(items) || items.length === 0) return [];
  const semanticEnabled = await getSemanticSearchEnabledFast().catch(() => false);

  return Promise.all(
    items.map(async (item) => {
      if (hasCompositeComponents(item)) {
        const groundedChildren = await Promise.all(
          item.components!.map((comp) =>
            groundSingleFlatItem(
              stripNestedComponents(comp),
              priorityCatalog,
              semanticEnabled
            )
          )
        );
        return recalculateParentDish({
          ...item,
          components: groundedChildren,
        });
      }
      return groundSingleFlatItem(item, priorityCatalog, semanticEnabled);
    })
  );
}
