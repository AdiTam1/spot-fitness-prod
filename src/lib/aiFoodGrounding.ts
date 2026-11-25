import {
  calculateMacrosForGrams,
  ISRAELI_FOOD_CATALOG,
} from '@/data/israeliFoodCatalog';
import { searchFoodCatalogSql } from '@/lib/supabase';
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
  skipCaloriePlausibility = false
): number {
  if (!candidate.per100g || !Number.isFinite(candidate.per100g.calories)) {
    return 0;
  }
  if (!areFoodVariantsCompatible(queryName, candidate.name)) {
    return 0;
  }

  const qTokens = getCoreTokens(queryName);
  const cTokens = getCoreTokens(candidate.name);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const matchedCount = qTokens.filter((qt) =>
    cTokens.some((ct) => ct === qt || ct.includes(qt) || qt.includes(ct))
  ).length;

  // דרוש כיסוי מלא של מילות המפתח העיקריות שהמשתמש/המודל כתב
  if (matchedCount < qTokens.length) return 0;

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

  let score = 100 - extraTokens * 8;
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
  const safeGrams = grams > 0 ? grams : 100;
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
  skipCaloriePlausibility = false
): FoodCatalogItem | undefined {
  let best: FoodCatalogItem | undefined;
  let bestScore = 0;
  for (const cand of pool) {
    const score = scoreCatalogMatch(
      queryName,
      cand,
      aiPer100g,
      skipCaloriePlausibility || cand.source === 'custom'
    );
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return bestScore >= 76 ? best : undefined;
}

async function querySupabaseCatalogWithTimeout(
  query: string
): Promise<FoodCatalogItem[]> {
  try {
    const cleanQ = getCoreTokens(query).slice(0, 3).join(' ');
    if (cleanQ.length < 2) return [];
    const lookupPromise = searchFoodCatalogSql({
      query: cleanQ,
      sourceMode: 'all',
      limit: 6,
    }).then((res) => (res.tableReady ? res.items : []));

    const timeoutPromise = new Promise<FoodCatalogItem[]>((resolve) =>
      setTimeout(() => resolve([]), DB_LOOKUP_TIMEOUT_MS)
    );
    return await Promise.race([lookupPromise, timeoutPromise]);
  } catch {
    return [];
  }
}

/**
 * Split-Brain DB Grounding & Deterministic Macro Scaler:
 * נועל שמות ומצבי הכנה תואמים למאגר הישראלי המאומת (כאשר יש התאמה בביטחון גבוה)
 * ומחשב את הקלוריות והמאקרו דטרמיניסטית מתוך (grams / 100) * per100g כדי לבטל טעויות חשבון.
 */
export async function groundAndNormalizeAiItems(
  items: LoggedFoodItem[],
  priorityCatalog?: FoodCatalogItem[]
): Promise<LoggedFoodItem[]> {
  if (!Array.isArray(items) || items.length === 0) return [];

  return Promise.all(
    items.map(async (item) => {
      const grams = item.grams > 0 ? item.grams : 100;
      const validAiPer100g =
        sanitizePer100g(item.per100g) || derivePer100gFromMacros(item.macros, grams);

      let matched =
        Array.isArray(priorityCatalog) && priorityCatalog.length > 0
          ? findBestCandidate(item.name, priorityCatalog, validAiPer100g, true)
          : undefined;

      if (!matched) {
        matched = findBestCandidate(item.name, ISRAELI_FOOD_CATALOG, validAiPer100g);
      }

      if (!matched) {
        const dbCandidates = await querySupabaseCatalogWithTimeout(item.name);
        if (dbCandidates.length > 0) {
          matched = findBestCandidate(item.name, dbCandidates, validAiPer100g);
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
    })
  );
}
