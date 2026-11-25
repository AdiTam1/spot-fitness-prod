/**
 * מילון מילים נרדפות תזונתיות בעברית ואנגלית, בדיקת אילוצי תזונה (אחוז שומן/דיאט/טבעוני),
 * והחלטת הסלמה לחיפוש סמנטי (משותף ללקוח ולשרת ללא תלויות צד-שרת).
 */

export const ISRAELI_FOOD_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['חלבון', 'פרוטאין', 'protein', 'pro'],
  ['חטיף חלבון', 'חטיף פרוטאין', 'protein bar'],
  ['משקה חלבון', 'שייק חלבון', 'פרוטאין שייק', 'protein shake'],
  ['אבקת חלבון', 'מי גבינה', 'whey', 'whey protein', 'פרוטאין אבקה'],
  ['שיבולת שועל', 'קוואקר', 'quaker', 'oats', 'oatmeal'],
  ['סקיר', 'סקייר', 'skyr', 'יוגורט יווני', 'יוגורט חלבון'],
  ['קוטג', 'גבינת קוטג', 'cottage', 'cottage cheese'],
  ['גבינה לבנה', 'גבינה רכה'],
  ['גבינת שמנת', 'שמנת למריחה', 'פילדלפיה', 'נפוליאון', 'סימפוניה'],
  ['גבינה צהובה', 'גבנצ', 'עמק', 'גאודה', 'מוצרלה'],
  ['כריך', 'סנדוויץ', 'סנדויץ', 'טוסט'],
  ['חטיף אנרגיה', 'חטיף דגנים', 'גרנולה בר', 'granola bar'],
  ['פריכיות', 'פריכית', 'פריכיות אורז', 'קרקר אורז', 'rice cake'],
  ['חמאת בוטנים', 'ממרח בוטנים', 'peanut butter'],
  ['טחינה', 'ממרח שומשום', 'טחינה גולמית', 'tahini'],
  ['טופו', 'סויה', 'חלבון סויה', 'tofu'],
  ['טבעוני', 'טבעונית', 'צמחי', 'צמחית', 'פרווה', 'vegan', 'plant based'],
  ['ללא סוכר', 'בלי סוכר', 'דיאט', 'זירו', 'zero', 'sugar free'],
  ['דל שומן', 'לייט', 'רזה', 'low fat'],
  ['חזה עוף', 'פילה עוף', 'chicken breast'],
  ['שניצל', 'חזה עוף מצופה'],
  ['טונה', 'טונה במים', 'טונה בשמן', 'tuna'],
  ['סלמון', 'פילה סלמון', 'דג סלמון', 'salmon'],
  ['אדממה', 'פולי סויה', 'edamame'],
  ['קינואה', 'quinoa'],
  ['כוסמת', 'buckwheat'],
  ['בורגול', 'bulgur'],
  ['אורז', 'אורז בסמטי', 'אורז יסמין', 'אורז לבן', 'אורז מלא', 'rice'],
  ['בטטה', 'sweet potato'],
  ['תפוח אדמה', 'תפוא', 'פירה', 'potato'],
  ['ביצה', 'ביצים', 'חביתה', 'ביצת עין', 'מקושקשת', 'egg', 'eggs'],
  ['אבוקדו', 'גוואקמולי', 'avocado'],
  ['בננה', 'banana'],
  ['תפוח', 'תפוח עץ', 'apple'],
  ['תמרים', 'תמר', 'מגהול', 'מג הולי', 'dates'],
  ['שקדים', 'almonds'],
  ['אגוזים', 'אגוזי מלך', 'קשיו', 'פקאן', 'nuts', 'walnuts'],
  ['לחם מלא', 'לחם כוסמין', 'לחם שיפון', 'לחם קל'],
  ['משקה סויה', 'חלב סויה', 'soy milk'],
  ['משקה שיבולת שועל', 'חלב שיבולת שועל', 'oat milk'],
  ['משקה שקדים', 'חלב שקדים', 'almond milk'],
  ['פסטרמה', 'חזה הודו', 'נקניק הודו'],
  ['מעדן', 'מעדן חלבון', 'פודינג חלבון', 'דנונה פרו', 'יופלה גו', 'מולר פרו'],
  ['שמן זית', 'olive oil'],
];

interface NormalizedSynonymGroup {
  normalizedTerms: string[];
}

export function normalizeSemanticQueryText(raw: string): string {
  return String(raw || '')
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&apos;|&#0?39;|&#0?96;/g, "'")
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/\\_:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_SYNONYM_GROUPS: readonly NormalizedSynonymGroup[] =
  ISRAELI_FOOD_SYNONYM_GROUPS.map((group) => ({
    normalizedTerms: Array.from(
      new Set(group.map((t) => normalizeSemanticQueryText(t)).filter(Boolean))
    ),
  }));

/**
 * מרחיב שאילתת חיפוש לגרסאות נרדפות (עברית <-> אנגלית ומונחי תזונה מקבילים)
 * לשימוש מיידי בצד לקוח, ב-SQL RPC ובסקרייפרים.
 */
export function expandQueryWithFoodSynonyms(
  query: string,
  maxVariants = 4
): string[] {
  const norm = normalizeSemanticQueryText(query);
  if (!norm || norm.length < 2) return [];

  const variants = new Set<string>([norm]);
  const tokens = norm.split(/\s+/).filter(Boolean);

  for (const group of NORMALIZED_SYNONYM_GROUPS) {
    const matchedTerm = group.normalizedTerms.find(
      (term) =>
        norm === term ||
        norm.includes(term) ||
        (tokens.length === 1 && term === tokens[0])
    );
    if (!matchedTerm) continue;

    for (const candidate of group.normalizedTerms) {
      if (candidate === matchedTerm) continue;
      if (norm === matchedTerm) {
        variants.add(candidate);
      } else {
        const replaced = norm.replace(matchedTerm, candidate).replace(/\s+/g, ' ').trim();
        if (replaced) variants.add(replaced);
      }
      if (variants.size >= maxVariants) break;
    }
    if (variants.size >= maxVariants) break;
  }

  return Array.from(variants).slice(0, maxVariants);
}

/**
 * מחלץ ביטויי נרדפות קצרים שמתאימים לטקסט המועמד ונותן בונוס דירוג מבוקר.
 */
export function scoreSynonymTextMatch(query: string, candidateText: string): number {
  const qNorm = normalizeSemanticQueryText(query);
  const cNorm = normalizeSemanticQueryText(candidateText);
  if (!qNorm || !cNorm) return 0;

  const variants = expandQueryWithFoodSynonyms(qNorm, 5).slice(1);
  if (variants.length === 0) return 0;

  let best = 0;
  for (const variant of variants) {
    if (cNorm === variant) return 86;
    if (cNorm.startsWith(`${variant} `)) best = Math.max(best, 78);
    else if (cNorm.startsWith(variant)) best = Math.max(best, 72);
    else if (` ${cNorm} `.includes(` ${variant} `)) best = Math.max(best, 66);
    else {
      const vWords = variant.split(/\s+/).filter((w) => w.length >= 2);
      if (vWords.length > 0 && vWords.every((w) => cNorm.includes(w))) {
        best = Math.max(best, 58);
      }
    }
  }
  return best;
}

const ANIMAL_OR_DAIRY_WORDS = [
  'עוף',
  'בקר',
  'הודו',
  'דג',
  'סלמון',
  'טונה',
  'חלב פרה',
  'גבינה',
  'קוטג',
  'יוגורט',
  'ביצה',
  'ביצים',
  'מי גבינה',
  'whey',
];

const VEGAN_WORDS = ['טבעוני', 'טבעונית', 'טבעונ', 'צמחי', 'צמחית', 'vegan'];
const DIET_ZERO_WORDS = ['דיאט', 'זירו', 'zero', 'ללא סוכר', 'בלי סוכר', 'sugar free'];
const FRIED_WORDS = ['מטוגן', 'מטוגנת', 'מטוגנים', 'בשמן עמוק'];
const BAKED_GRILLED_WORDS = ['אפוי', 'אפויה', 'בתנור', 'צלוי', 'צלויה', 'גריל', 'על האש'];

function extractFatPercentages(raw: string): string[] {
  const matches = String(raw || '').match(/\d+(?:[.,]\d+)?\s*%/g);
  return matches ? matches.map((m) => m.replace(/\s+/g, '').replace(',', '.')) : [];
}

/**
 * מונע "אשליית דמיון" של חיפוש וקטורי בחיפושי מזון:
 * שומר על התאמה קשיחה של אחוזי שומן (למשל 5% מול 9%), זירו/דיאט מול רגיל, טבעוני מול בשרי/חלבי ואופן הכנה.
 */
export function areDietaryAttributesCompatible(
  query: string,
  candidateName: string,
  candidateCategory = ''
): boolean {
  const qRaw = String(query || '').toLowerCase();
  const cRaw = `${candidateName || ''} ${candidateCategory || ''}`.toLowerCase();
  if (!qRaw || !cRaw) return true;

  // 1. שמירת אחוזי שומן מפורשים (קוטג' 5% לעולם לא יחזיר 9% בראש/כבסיס סמנטי)
  const qFats = extractFatPercentages(qRaw);
  const cFats = extractFatPercentages(cRaw);
  if (qFats.length > 0 && cFats.length > 0) {
    if (!qFats.some((p) => cFats.includes(p))) return false;
  }

  // 2. אם המשתמש ביקש במפורש טבעוני/צמחי — לא להציע בשר/דגים/מוצרי חלב
  if (VEGAN_WORDS.some((w) => qRaw.includes(w))) {
    const explicitlyPlant =
      VEGAN_WORDS.some((w) => cRaw.includes(w)) ||
      cRaw.includes('סויה') ||
      cRaw.includes('שקדים') ||
      cRaw.includes('שיבולת שועל') ||
      cRaw.includes('טופו') ||
      cRaw.includes('קוקוס');
    if (
      !explicitlyPlant &&
      ANIMAL_OR_DAIRY_WORDS.some((w) => cRaw.includes(w))
    ) {
      return false;
    }
  }

  // 3. קונפליקט אופן הכנה ברור
  const qFried = FRIED_WORDS.some((w) => qRaw.includes(w));
  const cFried = FRIED_WORDS.some((w) => cRaw.includes(w));
  const qGrilled = BAKED_GRILLED_WORDS.some((w) => qRaw.includes(w));
  const cGrilled = BAKED_GRILLED_WORDS.some((w) => cRaw.includes(w));
  if ((qGrilled && cFried) || (qFried && cGrilled)) {
    return false;
  }

  // 4. חיפוש דיאט/זירו לא יחליף מוצר "רגיל" מוצהר אם סומן כך
  if (DIET_ZERO_WORDS.some((w) => qRaw.includes(w)) && cRaw.includes('רגיל')) {
    return false;
  }

  return true;
}

/**
 * קובע האם שאילתת חיפוש במצב סמנטי צריכה להסלים לחיפוש וקטורי,
 * כדי לשמור על מהירות מיידית בחיפושי מותג/מילה בודדת נפוצה (כמו "במבה").
 */
export function shouldEscalateToSemanticSearch(opts: {
  query: string;
  lexicalStrongHits: number;
  lexicalTotalHits: number;
  isBarcode: boolean;
}): boolean {
  if (opts.isBarcode) return false;
  const norm = normalizeSemanticQueryText(opts.query);
  if (norm.length < 3) return false;

  const words = norm.split(/\s+/).filter(Boolean);
  const hasLatin = /[a-z]/i.test(norm);

  if (opts.lexicalStrongHits < 4 || opts.lexicalTotalHits < 8) {
    return true;
  }
  if (words.length >= 2 || hasLatin) {
    return true;
  }
  return false;
}
