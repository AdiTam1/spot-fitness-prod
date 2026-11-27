import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { ISRAELI_FOOD_CATALOG, calculateMacrosForGrams } from '@/data/israeliFoodCatalog';
import {
  getMergedCatalogItems,
  searchSqlAndCachedCatalog,
} from '@/lib/scrapers/scraperStore';
import {
  AiClarificationAnswer,
  AiClarificationQuestion,
  AiContextParams,
  AiTraceStepItem,
  FoodCatalogItem,
  FoodComponentRole,
  FoodInputConfidence,
  LoggedFoodItem,
  LoggedMealEntry,
  MealHistoryAiDetail,
  PendingAiMealJob,
  PhotoAngleKind,
  ReferenceObjectKind,
  ServingToolKind,
  SubmittedMealPhotoMeta,
  TraineeCustomUnit,
} from '@/types/nutrition';
import {
  buildSelectiveScopedPayload,
  clampGrams,
  filterUnacceptedSuggestedExtras,
  mergeScopedAdjustmentResult,
  recalculateParentDish,
  stripNestedComponents,
} from '@/lib/compositeDishes';
import {
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  buildRateLimitBlockedPayload,
  consumeRoleRateLimit,
  recordRateLimitTelemetry,
} from '@/lib/roleRateLimit';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { normalizeHhMmTime } from '@/lib/numericInput';
import {
  authorizeTraineeAiTargetOnServer,
  canCoachAccessTrainee,
  getSingleTraineeFromServer,
  getTraineePendingAiJobsOnServer,
  updateTraineeAtomic,
} from '@/lib/serverStore';
import {
  CallGeminiOptions,
  GEMINI_VISION_MODELS,
  GeminiContentPart,
  callGeminiJson,
  cleanGeminiKey,
} from '@/lib/geminiClient';
import { normalizePendingAiJobs } from '@/lib/aiJobs';
import {
  appendMealHistoryEntry,
  applyCoachDiffToMeal,
  buildCompactMealTimelineForAi,
  computeShortPhotoHash,
  mergeMealPhotoStore,
} from '@/lib/mealHistory';
import { recordAiConversationTrace } from '@/lib/aiTracing';
import {
  sendUnifiedPushToTrainee,
  shouldNotifyTraineeCoachMealChange,
  shouldNotifyUnifiedAiCompletion,
  stripDeadPushTargetsFromTrainee,
} from '@/lib/pushDispatcher';
import {
  buildMealAlertEvent,
  notifySubscribedCoachesForEvents,
} from '@/lib/coachAlertEngine';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';
import { finalizeAiRouteResponse } from '@/lib/telemetry/aiTelemetry';
import { resolveVisibleCustomCatalogForActor } from '@/lib/customFoodsServer';
import { buildCompactAnalyzeContext } from '@/lib/aiTraineeContext';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * מנתח טקסט עברי חכם (גיבוי לזיהוי טקסטואלי כשאין חיבור ל-Gemini)
 * מזהה כמויות ומאכלים מתוך טקסט חופשי בעברית ("2 ביצים, כף טחינה, פסטה")
 */
function smartHebrewMealParser(
  text: string,
  sourceType: 'ai-photo' | 'ai-text',
  customUnits?: TraineeCustomUnit[],
  catalogPool: FoodCatalogItem[] = ISRAELI_FOOD_CATALOG
): LoggedFoodItem[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const matchedItems: LoggedFoodItem[] = [];

  const keywordMap: {
    keywords: string[];
    catalogId: string;
    defaultUnitIdx: number;
  }[] = [
    { keywords: ['פסטה', 'מקרוני', 'פנה', 'ריגטוני', 'ספגטי', 'פוזילי', 'פטוציני', 'אטריות', 'פתיתים', 'קוסקוס'], catalogId: 'pasta-cooked', defaultUnitIdx: 0 },
    { keywords: ['קרמבו'], catalogId: 'krembo-strauss', defaultUnitIdx: 0 },
    { keywords: ['קוטג׳ 3', "קוטג' 3"], catalogId: 'cottage-tnuva-3', defaultUnitIdx: 1 },
    { keywords: ['קוטג', 'קוטג׳', "קוטג'"], catalogId: 'cottage-tnuva-5', defaultUnitIdx: 1 },
    { keywords: ['גבינה לבנה'], catalogId: 'white-cheese-tnuva-5', defaultUnitIdx: 0 },
    { keywords: ['שניצל'], catalogId: 'schnitzel-homemade', defaultUnitIdx: 0 },
    { keywords: ['חזה עוף', 'עוף', 'פרגית'], catalogId: 'chicken-breast-grilled', defaultUnitIdx: 0 },
    { keywords: ['אורז'], catalogId: 'basmati-rice-cooked', defaultUnitIdx: 0 },
    { keywords: ['ביצים', 'ביצה', 'חביתה', 'מקושקשת'], catalogId: 'egg-whole', defaultUnitIdx: 0 },
    { keywords: ['טחינה גולמית'], catalogId: 'raw-tahini', defaultUnitIdx: 0 },
    { keywords: ['טחינה'], catalogId: 'prepared-tahini', defaultUnitIdx: 0 },
    { keywords: ['לחם קל'], catalogId: 'light-bread', defaultUnitIdx: 1 },
    { keywords: ['לחם', 'כוסמין', 'פרוסות', 'פרוסה', 'טוסט'], catalogId: 'spelt-bread-sliced', defaultUnitIdx: 0 },
    { keywords: ['במבה'], catalogId: 'bamba-osem', defaultUnitIdx: 0 },
    { keywords: ['מילקי'], catalogId: 'milky-strauss', defaultUnitIdx: 0 },
    { keywords: ['דנונה', 'יוגורט', 'פרו', 'pro'], catalogId: 'danone-pro-20', defaultUnitIdx: 0 },
    { keywords: ['משקה חלבון', 'go'], catalogId: 'go-protein-milkshake', defaultUnitIdx: 0 },
    { keywords: ['טונה בשמן'], catalogId: 'tuna-in-oil', defaultUnitIdx: 0 },
    { keywords: ['טונה'], catalogId: 'tuna-in-water', defaultUnitIdx: 0 },
    { keywords: ['שיבולת שועל', 'קוואקר', 'דייסה'], catalogId: 'oats-quaker', defaultUnitIdx: 1 },
    { keywords: ['סלמון', 'דג'], catalogId: 'salmon-fillet-baked', defaultUnitIdx: 0 },
    { keywords: ['שמן זית', 'שמן'], catalogId: 'olive-oil', defaultUnitIdx: 1 },
    { keywords: ['אבוקדו'], catalogId: 'avocado-fresh', defaultUnitIdx: 1 },
    { keywords: ['בטטה'], catalogId: 'sweet-potato-baked', defaultUnitIdx: 0 },
    { keywords: ['גבינה צהובה 28', 'עמק 28'], catalogId: 'emek-cheese-28', defaultUnitIdx: 0 },
    { keywords: ['גבינה צהובה', 'עמק'], catalogId: 'emek-cheese-9', defaultUnitIdx: 0 },
    { keywords: ['שוקולד מריר'], catalogId: 'dark-chocolate-70', defaultUnitIdx: 0 },
    { keywords: ['שוקולד'], catalogId: 'chocolate-para-milk', defaultUnitIdx: 0 },
    { keywords: ['עוגייה', 'עוגיות'], catalogId: 'chocolate-chip-cookie', defaultUnitIdx: 0 },
    { keywords: ['סקופ', 'אבקת חלבון', 'שייק חלבון', 'חלבון'], catalogId: 'whey-protein-scoop', defaultUnitIdx: 0 },
    { keywords: ['בננה'], catalogId: 'banana-fresh', defaultUnitIdx: 0 },
    { keywords: ['תפוח'], catalogId: 'apple-fresh', defaultUnitIdx: 0 },
    { keywords: ['שקדים', 'אגוזים'], catalogId: 'almonds-natural', defaultUnitIdx: 0 },
    { keywords: ['סלט', 'ירקות'], catalogId: 'israeli-salad', defaultUnitIdx: 0 },
    { keywords: ['בקר', 'סטייק', 'סינטה'], catalogId: 'Beef-lean-steak', defaultUnitIdx: 0 },
    { keywords: ['יין אדום יבש'], catalogId: 'red-wine-dry', defaultUnitIdx: 0 },
    { keywords: ['יין לבן'], catalogId: 'white-wine', defaultUnitIdx: 0 },
    { keywords: ['יין חצי יבש', 'יין אדום', 'יין'], catalogId: 'red-wine-semi-dry', defaultUnitIdx: 0 },
    { keywords: ['בירה'], catalogId: 'beer-lager', defaultUnitIdx: 0 },
    { keywords: ['חלב'], catalogId: 'milk-tnuva-3', defaultUnitIdx: 0 },
  ];

  // פיצול המשפט לפי פסיקים או ו' החיבור
  const segments = normalized
    .split(/[,+\n]|(?:\s+ו(?=[^\s]))/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const usedCatalogIds = new Set<string>();

  for (const seg of segments.length > 0 ? segments : [normalized]) {
    const segLower = seg.toLowerCase();
    let matchedCatalogId: string | undefined;

    for (const entry of keywordMap) {
      if (entry.keywords.some((kw) => segLower.includes(kw))) {
        matchedCatalogId = entry.catalogId;
        break;
      }
    }

    // גיבוי כללי לפי התאמה לשמות המוצרים בקטלוג הישראלי
    if (!matchedCatalogId) {
      const cleanedWord = segLower
        .replace(/\d+(?:\.\d+)?/g, '')
        .replace(/(?:גרם|ק"ג|מ"ל|מ׳ל|מ״ל|מל|יחידות|יחידה|כוסות|כוס|כפות|כף|פרוסות|פרוסה|גביע|חצי|ml)/gi, '')
        .trim();
      if (cleanedWord.length >= 2) {
        const directMatch = catalogPool.find((c) =>
          c.name.toLowerCase().includes(cleanedWord)
        );
        matchedCatalogId = directMatch?.id;
      }
    }

    if (!matchedCatalogId) continue;
    if (usedCatalogIds.has(`${matchedCatalogId}-${seg}`)) continue;
    const catalogItem = catalogPool.find((c) => c.id === matchedCatalogId);
    if (!catalogItem) continue;

    usedCatalogIds.add(`${matchedCatalogId}-${seg}`);

    // בדיקה אם צוין משקל/נפח מפורש בגרמים או במ"ל (למשל "200 גרם יין" / "200 מ״ל חלב")
    const gramsOrMlMatch = seg.match(/(\d+)\s*(?:(גרם|ג'|ג׳|gr|g)|(מ"ל|מ׳ל|מ״ל|מל|ml))/i);
    if (gramsOrMlMatch) {
      const rawAmount = Number(gramsOrMlMatch[1]);
      const isMl = Boolean(gramsOrMlMatch[3]);
      // שמן בצפיפות ~0.92g/ml אם הוזן במ"ל; נוזלים מימיים/יין/בירה/חלב קרובים ל-1g/ml
      const explicitGrams =
        isMl && catalogItem.id === 'olive-oil'
          ? Math.max(1, Math.round(rawAmount * 0.92))
          : rawAmount;
      matchedItems.push({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: catalogItem.name,
        unitLabel: isMl ? `${rawAmount} מ"ל (${explicitGrams} גרם)` : `${explicitGrams} גרם`,
        quantity: 1,
        grams: explicitGrams,
        macros: calculateMacrosForGrams(catalogItem.per100g, explicitGrams),
        source: sourceType,
      });
      continue;
    }

    // בדיקה אם צוין מספר יחידות
    let multiplier = 1;
    const numMatch = seg.match(/(?:^|\s)(\d+(?:\.\d+)?)\s+/);
    if (numMatch) {
      multiplier = Number(numMatch[1]);
    } else if (seg.includes('שתי ') || seg.includes('שני ') || seg.includes('פעמיים')) {
      multiplier = 2;
    } else if (seg.includes('שלוש ') || seg.includes('שלושה ')) {
      multiplier = 3;
    } else if (seg.includes('חצי ')) {
      multiplier = 0.5;
    }

    const baseUnit = catalogItem.units[0];
    const matchedCustomUnit = (customUnits || []).find(
      (u) =>
        (u.unitName && segLower.includes(u.unitName.toLowerCase())) ||
        (u.foodNameKeyword &&
          segLower.includes(u.foodNameKeyword.toLowerCase()) &&
          (!u.unitName || segLower.includes('צלחת') || segLower.includes('קערה') || segLower.includes('קופס')))
    );
    const unitGrams = matchedCustomUnit ? matchedCustomUnit.grams : baseUnit.grams;
    const unitNameLabel = matchedCustomUnit ? matchedCustomUnit.unitName : baseUnit.label;
    const totalGrams = Math.round(unitGrams * multiplier);

    matchedItems.push({
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: catalogItem.name,
      unitLabel:
        multiplier === 1
          ? unitNameLabel.includes('גרם')
            ? unitNameLabel
            : `${unitNameLabel} (${totalGrams} גרם)`
          : `${multiplier} × ${unitNameLabel.replace(/\s*\(\d+\s*גרם\)/, '')} (${totalGrams} גרם)`,
      quantity: multiplier,
      grams: totalGrams,
      macros: calculateMacrosForGrams(catalogItem.per100g, totalGrams),
      source: sourceType,
    });
  }

  return matchedItems;
}

type GeminiPart = GeminiContentPart;

interface ValidatedAiImage {
  mimeType: string;
  data: string;
  rawDataUrl: string;
  hash: string;
  angle: PhotoAngleKind;
  angleLabel: string;
  labelProductName?: string;
}

function extractValidatedImages(
  imageDataUrl?: string,
  imageDataUrls?: string[],
  imageAngles?: ('top-down' | 'side-45' | 'label' | 'other' | 'unset')[],
  imageLabelProducts?: (string | undefined)[]
): ValidatedAiImage[] {
  const rawList =
    Array.isArray(imageDataUrls) && imageDataUrls.length > 0
      ? imageDataUrls
      : imageDataUrl
      ? [imageDataUrl]
      : [];

  const angleMap: Record<string, string> = {
    'top-down': 'צילום 90° ישירות מלמעלה (קובע קוטר שוליים ושטח)',
    'side-45': 'צילום פרופיל/צד 35°-45° (קובע גובה, עומק ונפח תלת-ממדי)',
    label: 'צילום תווית / טבלת ערכים תזונתיים',
    other: 'זווית צילום נוספת',
    unset: 'זווית כללית (סווג אוטומטית האם צלחת, מוצר או טבלת ערכים)',
  };

  const out: ValidatedAiImage[] = [];
  for (let i = 0; i < Math.min(rawList.length, 8); i++) {
    const url = rawList[i];
    if (
      typeof url !== 'string' ||
      !url.startsWith('data:image/') ||
      url.endsWith(',DEMO') ||
      url.length < 100 ||
      url.length > 3_500_000
    ) {
      continue;
    }
    const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) continue;
    const rawAngle = imageAngles?.[i];
    const angle: PhotoAngleKind =
      rawAngle === 'label' ||
      rawAngle === 'top-down' ||
      rawAngle === 'side-45' ||
      rawAngle === 'other' ||
      rawAngle === 'unset'
        ? rawAngle
        : 'unset';
    const rawProduct = sanitizeText(imageLabelProducts?.[i], 80);
    const labelProductName =
      angle === 'label' && rawProduct ? rawProduct : undefined;
    const baseLabel = angleMap[angle] || `תמונה ${i + 1}`;
    const fullLabel = labelProductName
      ? `${baseLabel} — שייך למוצר שהזין המתאמן: "${labelProductName}"`
      : baseLabel;
    out.push({
      mimeType: match[1],
      data: match[2],
      rawDataUrl: url,
      hash: computeShortPhotoHash(url),
      angle,
      angleLabel: fullLabel,
      labelProductName,
    });
  }
  return out;
}

async function callGeminiStructured(
  apiKey: string,
  parts: GeminiPart[],
  options?: CallGeminiOptions
): Promise<{
  parsed: Record<string, unknown> | null;
  modelName?: string;
  errorMsg?: string;
  cancelled?: boolean;
}> {
  return callGeminiJson(apiKey, parts, GEMINI_VISION_MODELS, options);
}

function formatContextParamsPrompt(ctx?: AiContextParams): string {
  if (!ctx) return '';
  const lines: string[] = [];
  if (ctx.servingToolLabel) {
    const dims = [
      ctx.servingToolDiameterCm ? `קוטר ${ctx.servingToolDiameterCm} ס"מ` : '',
      ctx.servingToolDepthCm ? `עומק ${ctx.servingToolDepthCm} ס"מ` : '',
      ctx.servingToolVolumeMl ? `נפח ${ctx.servingToolVolumeMl} מ"ל` : '',
    ]
      .filter(Boolean)
      .join(', ');
    lines.push(`- כלי הגשה בשימוש: ${ctx.servingToolLabel}${dims ? ` (${dims})` : ''}`);
  }
  const activeChips = Array.isArray(ctx.activeChipLabels) ? ctx.activeChipLabels : [];
  const hasExplicitNoOilChip = activeChips.some((l) => /ללא שמן בכלל|רוטב מתבלינים בלבד/i.test(l));
  const hasExplicitOilOrFriedChip = activeChips.some((l) => /עם שמן|מטוגן|בטיגון/i.test(l));
  const hasBakedChip = activeChips.some((l) => /אפוי|גריל/i.test(l));

  if (hasExplicitNoOilChip && hasExplicitOilOrFriedChip) {
    lines.push(
      '- מדיניות סתירת תגיות שמן (כלל ההחמרה הקלורית!): המשתמש סימן במקביל גם "ללא שמן" וגם תג מחייב שמן/טיגון — פסק לחומרה: קיים שמן בישול/טיגון ויש לחשוף אותו כשורת מרכיב גלויה.'
    );
  } else if (hasExplicitOilOrFriedChip) {
    lines.push(
      '- שמן בישול / טיגון: המשתמש ציין שימוש בשמן או טיגון — כלול במפורש שורת מרכיב של שמן בישול/טיגון עם componentRole="cooking-oil".'
    );
  } else if (hasExplicitNoOilChip) {
    lines.push(
      '- שמן בישול: המשתמש סימן מפורשות "ללא שמן בכלל" / "תיבול יבש בלבד" — אל תוסיף שורת שמן בישול.'
    );
  } else if (hasBakedChip) {
    lines.push(
      '- שיטת הכנה: המשתמש סימן אפוי/גריל — אל תניח טיגון בשמן עמוק.'
    );
  } else {
    lines.push(
      '- שמן בישול / טיגון (שקוף ומופרד מרטבים): לא צוין אחרת — במנות שנראות מטוגנות/מושחמות/מוקפצות (שניצל מצופה פריך, בצל מושחם במג׳דרה, חביתה), הצג שורת מרכיב גלויה של שמן טיגון (visual-estimate) כדי שהמשתמש יראה וידייק אם אפוי/ספריי; במזונות נקיים ולא שומניים אל תמציא שמן.'
    );
  }

  if (ctx.chipQuantities && Object.keys(ctx.chipQuantities).length > 0) {
    const qtyParts = Object.entries(ctx.chipQuantities)
      .filter(([, q]) => q && Number.isFinite(q.amount) && q.amount > 0)
      .map(([chipLabel, q]) => {
        const unitHe =
          q.unit === 'tbsp'
            ? 'כפות'
            : q.unit === 'tsp'
            ? 'כפיות'
            : q.unit === 'ml'
            ? 'מ"ל'
            : 'גרם';
        return `${chipLabel}: ${q.amount} ${unitHe}`;
      });
    if (qtyParts.length > 0) {
      lines.push(`- כמויות מדויקות שנבחרו מתוך התגיות: ${qtyParts.join(' | ')}`);
    }
  }

  if (ctx.saucesAndOils && ctx.saucesAndOils.trim()) {
    lines.push(`- רטבים ותוספות נוזליות: ${ctx.saucesAndOils.trim()}`);
  }
  if (ctx.portionOrGrams?.trim()) {
    lines.push(`- כמויות/משקל שדווחו: ${ctx.portionOrGrams.trim()}`);
  }
  if (ctx.netFoodWeightGrams && Number.isFinite(ctx.netFoodWeightGrams) && ctx.netFoodWeightGrams > 0) {
    lines.push(
      `- משקל האוכל הכולל במנה (נטו בגרם, ללא הצלחת/קערה): ${Math.round(ctx.netFoodWeightGrams)} גרם — הקפד שסכום הגרמים של כלל המרכיבים שתזהה יהיה תואם למשקל נטו זה.`
    );
  }
  if (ctx.prepState?.trim()) {
    lines.push(`- מצב צבירה/בישול/חיתוך: ${ctx.prepState.trim()}`);
  }
  if (ctx.drinksAndSides?.trim()) {
    lines.push(`- שתייה ותוספות בצד: ${ctx.drinksAndSides.trim()}`);
  }
  if (ctx.mealSource) {
    const srcMap: Record<string, string> = {
      home: 'הכנה ביתית (בדר"כ פחות שמן נסתר)',
      restaurant: 'אוכל ממסעדה / משלוח (קח בחשבון שמן בישול סביר במנות מוקפצות/צלויות)',
      packaged: 'מוצר ארוז / מותג',
    };
    lines.push(`- מקור המנה: ${srcMap[ctx.mealSource] || ctx.mealSource}`);
  }
  if (ctx.strictUserList) {
    lines.push(
      '- נעילת רשימה קפדנית (strictUserList=true): המתאמן אישר כי פירט במדויק את כל המרכיבים שאכל! אסור בהחלט להוסיף או לנחש מרכיבים שלא צוינו בטקסט (גם אם נראה בצלחת רכיב דומה כמו סלק במקום כבד — הצמד לשם ולגרמים שהמתאמן כתב!). החזר suggestedExtras כמערך ריק [].'
    );
  }
  if (Array.isArray(ctx.activeChipLabels) && ctx.activeChipLabels.length > 0) {
    lines.push(`- צ׳יפים/תגיות מהירות שנבחרו: ${ctx.activeChipLabels.join(', ')}`);
  }
  if (Array.isArray(ctx.customUnits) && ctx.customUnits.length > 0) {
    lines.push(
      `- יחידות מידה אישיות שהמתאמן הגדיר מראש: ${ctx.customUnits
        .slice(0, 15)
        .map((u) => `${u.unitName}${u.foodNameKeyword ? ` (${u.foodNameKeyword})` : ''} = ${u.grams}g`)
        .join(' | ')}`
    );
  }
  if (Array.isArray(ctx.imageLabelProducts) && ctx.imageLabelProducts.some(Boolean)) {
    const lblEntries = ctx.imageLabelProducts
      .map((name, idx) => (name ? `תמונה ${idx + 1}: "${name}"` : ''))
      .filter(Boolean);
    if (lblEntries.length > 0) {
      lines.push(`- שמות מוצרים שהוזנו לתוויות ערכים: ${lblEntries.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

function mapSingleRawGeminiItem(
  it: Record<string, unknown>,
  sourceType: 'ai-photo' | 'ai-text',
  modelName: string,
  allowComponents: boolean,
  idx: number
): LoggedFoodItem {
  const macros = (it.macros as Record<string, number>) || {};
  const rawPer100 = (it.per100g as Record<string, number>) || null;
  const grams = clampGrams(it.grams, 100);
  const parsedPer100g =
    rawPer100 && Number.isFinite(Number(rawPer100.calories))
      ? {
          calories: Math.round(sanitizeNumber(rawPer100.calories, 0, 950, 0)),
          protein: Math.round(sanitizeNumber(rawPer100.protein, 0, 100, 0) * 10) / 10,
          carbs: Math.round(sanitizeNumber(rawPer100.carbs, 0, 100, 0) * 10) / 10,
          fat: Math.round(sanitizeNumber(rawPer100.fat, 0, 100, 0) * 10) / 10,
        }
      : undefined;
  const visualReason = sanitizeText(it.visualReason, 160) || undefined;
  const fromUserText = typeof it.fromUserText === 'boolean' ? it.fromUserText : undefined;

  const rawRole = it.componentRole;
  const componentRole: FoodComponentRole | undefined =
    rawRole === 'ingredient' ||
    rawRole === 'cooking-oil' ||
    rawRole === 'spice-group' ||
    rawRole === 'sauce'
      ? rawRole
      : undefined;

  const rawConf = it.inputConfidence;
  const inputConfidence: FoodInputConfidence | undefined =
    fromUserText
      ? 'reported'
      : rawConf === 'reported' || rawConf === 'visual-estimate' || rawConf === 'catalog'
      ? rawConf
      : 'visual-estimate';

  const spiceDetails = Array.isArray(it.spiceDetails)
    ? (it.spiceDetails as unknown[])
        .map((s) => sanitizeText(s, 36))
        .filter(Boolean)
        .slice(0, 15)
    : undefined;

  const rawComponents =
    allowComponents && Array.isArray(it.components) && it.components.length > 0
      ? (it.components as Record<string, unknown>[])
          .slice(0, 20)
          .map((comp, cIdx) =>
            mapSingleRawGeminiItem(comp, sourceType, modelName, false, cIdx)
          )
      : undefined;

  const baseItem: LoggedFoodItem = {
    id: `gemini-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    name: sanitizeText(it.name, 120) || 'פריט מזון',
    unitLabel: sanitizeText(it.unitLabel, 80) || `${grams} גרם`,
    quantity: sanitizeNumber(it.quantity, 0.1, 100, 1),
    grams,
    per100g: parsedPer100g,
    macros: {
      calories: Math.round(sanitizeNumber(macros.calories, 0, 10000, 0)),
      protein: Math.round(sanitizeNumber(macros.protein, 0, 1000, 0) * 10) / 10,
      carbs: Math.round(sanitizeNumber(macros.carbs, 0, 1000, 0) * 10) / 10,
      fat: Math.round(sanitizeNumber(macros.fat, 0, 1000, 0) * 10) / 10,
    },
    source: sourceType,
    aiEngine: modelName,
    isAiFallback: false,
    fromUserText,
    visualReason,
    ...(componentRole ? { componentRole } : {}),
    ...(spiceDetails && spiceDetails.length > 0 ? { spiceDetails } : {}),
    inputConfidence,
    ...(rawComponents ? { components: rawComponents } : {}),
  };

  return rawComponents && rawComponents.length > 0
    ? recalculateParentDish(baseItem)
    : baseItem;
}

function mapRawGeminiItems(
  rawItems: Record<string, unknown>[],
  sourceType: 'ai-photo' | 'ai-text',
  modelName: string
): LoggedFoodItem[] {
  return rawItems.map((it, idx) =>
    mapSingleRawGeminiItem(it, sourceType, modelName, true, idx)
  );
}

function adjustMealFallback(
  baseItems: LoggedFoodItem[],
  adjustmentPrompt: string
): LoggedFoodItem[] {
  const cleanPrompt = adjustmentPrompt.trim();
  const cleanLower = cleanPrompt.toLowerCase();
  let next = [...baseItems];

  // 1. הסרת פריטים לפי ניסוחים נפוצים: "בלי X", "ללא X", "הסר את X", "תוריד X", "לא אכלתי X", או "במקום X"
  const removeMatches = Array.from(
    cleanPrompt.matchAll(
      /(?:בלי|ללא|הסר(?:\s+את)?|תוריד(?:\s+את)?|מחק(?:\s+את)?|לא\s+אכלתי(?:\s+את)?|במקום)\s+([^\s,.;]+)/gi
    )
  );
  for (const m of removeMatches) {
    const kw = (m[1] || '').toLowerCase();
    if (kw.length >= 2) {
      next = next.filter((it) => !it.name.toLowerCase().includes(kw));
    }
  }

  // גם זיהוי "X הוא בעצם Y" / "לא X אלא Y": הסר X
  const replaceFromMatches = Array.from(
    cleanPrompt.matchAll(/(?:ה?([^\s,.;]{2,})\s+הוא\s+בעצם|לא\s+([^\s,.;]{2,})\s+אלא)/gi)
  );
  for (const m of replaceFromMatches) {
    const kw = (m[1] || m[2] || '').toLowerCase().replace(/^ה/, '');
    if (kw.length >= 2) {
      next = next.filter((it) => !it.name.toLowerCase().includes(kw));
    }
  }

  const gramsOverride = cleanPrompt.match(/(\d+)\s*(?:גרם|ג'|ג׳|gr|g)/i);
  if (gramsOverride && next.length > 0 && removeMatches.length === 0 && replaceFromMatches.length === 0) {
    const newGrams = sanitizeNumber(gramsOverride[1], 1, 5000, next[0].grams);
    let targetIdx = next.findIndex((it) =>
      cleanLower.includes(it.name.toLowerCase().split(' ')[0])
    );
    if (targetIdx < 0) targetIdx = 0;
    const target = next[targetIdx];
    const ratio = target.grams > 0 ? newGrams / target.grams : 1;
    next[targetIdx] = {
      ...target,
      grams: newGrams,
      unitLabel: `${newGrams} גרם (הותאם)`,
      macros: {
        calories: Math.round(target.macros.calories * ratio),
        protein: Math.round(target.macros.protein * ratio * 10) / 10,
        carbs: Math.round(target.macros.carbs * ratio * 10) / 10,
        fat: Math.round(target.macros.fat * ratio * 10) / 10,
      },
    };
  } else if (cleanPrompt.includes('חצי') && next.length > 0) {
    next = next.map((it) => ({
      ...it,
      grams: Math.max(1, Math.round(it.grams * 0.5)),
      unitLabel: `חצי מנה (${Math.max(1, Math.round(it.grams * 0.5))} גרם)`,
      macros: {
        calories: Math.round(it.macros.calories * 0.5),
        protein: Math.round(it.macros.protein * 0.5 * 10) / 10,
        carbs: Math.round(it.macros.carbs * 0.5 * 10) / 10,
        fat: Math.round(it.macros.fat * 0.5 * 10) / 10,
      },
    }));
  } else if (cleanPrompt.includes('כפול') && next.length > 0) {
    next = next.map((it) => ({
      ...it,
      grams: Math.round(it.grams * 2),
      unitLabel: `מנה כפולה (${Math.round(it.grams * 2)} גרם)`,
      macros: {
        calories: Math.round(it.macros.calories * 2),
        protein: Math.round(it.macros.protein * 2 * 10) / 10,
        carbs: Math.round(it.macros.carbs * 2 * 10) / 10,
        fat: Math.round(it.macros.fat * 2 * 10) / 10,
      },
    }));
  }

  return next;
}

export const POST = withTelemetryHandler('/api/ai/analyze-meal', async (request, ctx) => {
  const aiStartedAt = Date.now();
  let telemetryMode = 'analyze';
  let telemetryTargetTraineeId: string | undefined;
  let telemetryImageCount = 0;
  let telemetryImageKB = 0;

  const response = await (async (): Promise<NextResponse> => {
  try {
    // 0. הגנת CSRF
    if (!verifyCsrfOrigin(request)) {
      ctx.setErrorCode('CSRF_BLOCKED', 'בקשה אינה מורשית');
      return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
    }

    // 1. אימות סשן חי מלא מול מסד הנתונים (חתימה, סטטוס פעיל ו-sessionVersion)
    const auth = await authenticateActiveSession(request, { touchLastSeen: true });
    if (!auth.ok) {
      ctx.setErrorCode(auth.code, auth.message);
      return auth.response;
    }
    const sessionUser = auth.session;
    telemetryTargetTraineeId = sessionUser.id;
    ctx.setActor(sessionUser);

    // 2. הגנת Rate-Limit לפי תפקיד (דקה / שעה / יום)
    const rl = await consumeRoleRateLimit(sessionUser, 'ai_analyze');
    if (!rl.allowed) {
      const fallback = 'הגעת למכסת פענוחי ה-AI. ניתן להזין מוצרים מהמאגר.';
      recordRateLimitTelemetry(ctx, rl, { fallbackMessageHe: fallback });
      const errRes = buildRateLimitBlockedPayload(rl, fallback);
      return NextResponse.json(errRes.body, {
        status: 429,
        headers: errRes.headers,
      });
    }

    const body = await request.json();
    const {
      mode = 'analyze',
      imageDataUrl,
      imageDataUrls,
      audioDataUrl,
      textPrompt,
      customApiKey,
      contextParams,
      referenceObject = 'credit-card',
      toolKind = 'plate',
      toolName,
      baseItems,
      selectedTargetIds,
      correctionHistory,
      adjustmentPrompt,
      traineeId: bodyTraineeId,
      date: bodyDate,
      mealSlotId: bodyMealSlotId,
      clarificationJobId,
      clarificationQuestions: incomingClarificationQuestions,
      clarificationAnswers: incomingClarificationAnswers,
      dryRun: bodyDryRun,
      backgroundJob,
    } = body as {
      mode?:
        | 'analyze'
        | 'adjust-meal'
        | 'clarify-meal'
        | 'measure-tool'
        | 'transcribe-audio';
      imageDataUrl?: string;
      imageDataUrls?: string[];
      audioDataUrl?: string;
      textPrompt?: string;
      customApiKey?: string;
      contextParams?: AiContextParams;
      referenceObject?: ReferenceObjectKind;
      toolKind?: ServingToolKind;
      toolName?: string;
      baseItems?: LoggedFoodItem[];
      selectedTargetIds?: string[];
      correctionHistory?: { beforeNames?: string[]; prompt: string; at?: string }[];
      adjustmentPrompt?: string;
      traineeId?: string;
      date?: string;
      mealSlotId?: string;
      clarificationJobId?: string;
      clarificationQuestions?: AiClarificationQuestion[];
      clarificationAnswers?: AiClarificationAnswer[];
      dryRun?: boolean;
      backgroundJob?: {
        jobId: string;
        traineeId: string;
        date: string;
        mealSlotId: string;
        mealSlotName: string;
        mode?: 'photo' | 'text' | 'adjust';
        summaryHint?: string;
      };
    };
    const isDryRun = Boolean(bodyDryRun && sessionUser.role === 'admin');
    const resolvedDate = sanitizeText(backgroundJob?.date || bodyDate || '', 20);
    const resolvedSlotId = sanitizeText(
      backgroundJob?.mealSlotId || bodyMealSlotId || '',
      60
    );
    telemetryMode = mode;
    if (backgroundJob?.traineeId || bodyTraineeId) {
      telemetryTargetTraineeId = backgroundJob?.traineeId || bodyTraineeId;
    }

    const aiTraceId = `aitrace-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const aiTraceSteps: AiTraceStepItem[] = [];
    const pushTraceStep = (
      stage: string,
      summary: string,
      status: AiTraceStepItem['status'] = 'info',
      details?: unknown
    ) => {
      aiTraceSteps.push({
        stage,
        status,
        timestamp: new Date().toISOString(),
        summary,
        ...(details !== undefined ? { details } : {}),
      });
    };
    pushTraceStep('request', `התקבלה בקשת ${mode}${isDryRun ? ' (Sandbox Replay)' : ''}`, 'ok');

    if (textPrompt && textPrompt.length > 600) {
      return NextResponse.json(
        { error: 'תיאור הארוחה ארוך מדי (מקסימום 600 תווים)' },
        { status: 400 }
      );
    }
    if (adjustmentPrompt && adjustmentPrompt.length > 500) {
      return NextResponse.json(
        { error: 'תיאור השינוי ארוך מדי (מקסימום 500 תווים)' },
        { status: 400 }
      );
    }

    const safeCustomKey =
      (sessionUser.role === 'admin' || sessionUser.role === 'coach') &&
      customApiKey
        ? cleanGeminiKey(customApiKey)
        : '';
    const apiKey = safeCustomKey || cleanGeminiKey(process.env.GEMINI_API_KEY);

    // 3א. תמלול הקלטה קולית מהמיקרופון (פתרון מלא ל-iOS / PWA שבהם SpeechRecognition אינו זמין)
    if (mode === 'transcribe-audio') {
      const rawAudio = typeof audioDataUrl === 'string' ? audioDataUrl.trim() : '';
      const audioMatch = rawAudio.match(
        /^data:((?:audio\/[a-z0-9.+-]+)|video\/mp4)(?:;[^,;]+)*;base64,([A-Za-z0-9+/=\s]+)$/i
      );
      if (!audioMatch || audioMatch[2].length > 3_200_000) {
        return NextResponse.json(
          { error: 'קובץ השמע אינו תקין או ארוך מדי (נסה הקלטה קצרה יותר)' },
          { status: 400 }
        );
      }
      if (!apiKey) {
        return NextResponse.json(
          { error: 'תמלול הקלטה דורש מפתח GEMINI_API_KEY פעיל בשרת' },
          { status: 422 }
        );
      }
      const rawMime = audioMatch[1].toLowerCase();
      const mimeType = rawMime === 'video/mp4' ? 'audio/mp4' : rawMime;
      const cleanB64 = audioMatch[2].replace(/\s+/g, '');

      const transcribeRes = await callGeminiStructured(apiKey, [
        {
          text:
            'תמלל לעברית מדויקת, טבעית ונקייה בלבד את מה שנאמר בהקלטה (תיאור ארוחה או שם מוצר מזון שהמשתמש מחפש). החזר JSON בלבד במבנה {"transcript": "..."}. אם אין דיבור ברור החזר {"transcript": ""}.',
        },
        {
          inlineData: {
            mimeType,
            data: cleanB64,
          },
        },
      ]);

      if (!transcribeRes.parsed) {
        return NextResponse.json(
          {
            error: `תמלול ההקלטה נכשל (${transcribeRes.errorMsg || 'נסה לדבר קרוב יותר למיקרופון'})`,
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        mode: 'transcribe-audio',
        transcript: sanitizeText(transcribeRes.parsed.transcript, 500) || '',
        engine: transcribeRes.modelName,
      });
    }

    const validatedImages = extractValidatedImages(
      imageDataUrl,
      imageDataUrls,
      contextParams?.imageAngles,
      contextParams?.imageLabelProducts
    );
    const hasRealImage = validatedImages.length > 0;
    const sourceType: 'ai-photo' | 'ai-text' = hasRealImage ? 'ai-photo' : 'ai-text';
    telemetryMode = mode;
    telemetryTargetTraineeId = backgroundJob?.traineeId || bodyTraineeId || sessionUser.id;
    telemetryImageCount = validatedImages.length;
    telemetryImageKB = Math.round(
      validatedImages.reduce((acc, im) => acc + ((im.data?.length || 0) * 0.75) / 1024, 0)
    );
    if (hasRealImage) {
      pushTraceStep(
        'media',
        `אומתו ${validatedImages.length} תמונות (${telemetryImageKB}KB)`,
        'ok',
        validatedImages.map((v, idx) => ({
          idx: idx + 1,
          angle: v.angle,
          labelProductName: v.labelProductName,
        }))
      );
    }

    const persistAiTrace = (params: {
      queueType: 'history' | 'crashed';
      crashStage?: 'client' | 'validation' | 'vision_api' | 'parser' | 'db_save' | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      model?: string;
      clarificationQuestions?: AiClarificationQuestion[];
      clarificationAnswers?: AiClarificationAnswer[];
      parsedItems?: LoggedFoodItem[];
      rawResponseSummary?: string;
      targetName?: string;
      slotName?: string;
    }) => {
      const thumbnails = validatedImages
        .filter((v) => v.rawDataUrl.length <= 260_000)
        .map((v) => ({
          hash: v.hash,
          angle: v.angle,
          labelProductName: v.labelProductName,
          dataUrl: v.rawDataUrl,
        }));
      const tracePromise = recordAiConversationTrace({
        id: aiTraceId,
        userId: telemetryTargetTraineeId || sessionUser.id,
        userName: params.targetName || sessionUser.name,
        userRole: sessionUser.role,
        mealSlotId: resolvedSlotId || undefined,
        mealSlotName: params.slotName || backgroundJob?.mealSlotName || undefined,
        mealDate: resolvedDate || undefined,
        mode,
        queueType: params.queueType,
        crashStage: params.crashStage || null,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage || null,
        durationMs: Date.now() - aiStartedAt,
        model: params.model,
        imageCount: telemetryImageCount,
        totalImageKB: telemetryImageKB,
        isSandboxReplay: isDryRun,
        promptText: (adjustmentPrompt || textPrompt || '').slice(0, 500) || undefined,
        activeChips: contextParams?.activeChipLabels,
        clarificationQuestions: params.clarificationQuestions,
        clarificationAnswers: params.clarificationAnswers,
        parsedItems: params.parsedItems,
        stepsTimeline: aiTraceSteps,
        rawResponseSummary: params.rawResponseSummary,
        thumbnails,
      }).catch(() => {});
      try {
        waitUntil(tracePromise);
      } catch {
        // ignore outside Vercel
      }
    };

    // 3ב. אם הבקשה כוללת סנכרון ברקע (backgroundJob) ואינה Replay: רשום סטטוס "processing" ב-DB מראש
    let authorizedBgJob: PendingAiMealJob | null = null;
    let pendingSuggestedExtras: LoggedFoodItem[] = [];
    if (
      !isDryRun &&
      backgroundJob?.jobId &&
      backgroundJob?.traineeId &&
      backgroundJob?.date &&
      backgroundJob?.mealSlotId
    ) {
      const targetAuth = await authorizeTraineeAiTargetOnServer(
        sessionUser,
        backgroundJob.traineeId
      );

      if (!targetAuth.ok) {
        ctx.setErrorCode(targetAuth.reasonCode, targetAuth.error);
        return NextResponse.json(
          { error: targetAuth.error },
          { status: targetAuth.status }
        );
      }

      const startNowIso = new Date().toISOString();
      const jobMode: 'photo' | 'text' | 'adjust' =
        backgroundJob.mode === 'adjust'
          ? 'adjust'
          : backgroundJob.mode === 'text'
          ? 'text'
          : 'photo';
      const compactRetryPayload = {
        traineeId: backgroundJob.traineeId,
        date: sanitizeText(backgroundJob.date, 20),
        mealSlotId: sanitizeText(backgroundJob.mealSlotId, 60),
        mode: jobMode,
        ...(textPrompt ? { textPrompt: sanitizeText(textPrompt, 600) } : {}),
        ...(adjustmentPrompt
          ? { adjustmentPrompt: sanitizeText(adjustmentPrompt, 500) }
          : {}),
        ...(Array.isArray(selectedTargetIds) && selectedTargetIds.length > 0
          ? {
              selectedTargetIds: selectedTargetIds
                .slice(0, 40)
                .map((id) => sanitizeText(id, 80))
                .filter(Boolean),
            }
          : {}),
        ...(contextParams ? { contextParams } : {}),
        ...(contextParams?.includePreviousMealPhotos
          ? { includePreviousMealPhotos: true }
          : {}),
        failedAt: startNowIso,
      };
      authorizedBgJob = {
        id: sanitizeText(backgroundJob.jobId, 60),
        targetTraineeId: backgroundJob.traineeId,
        date: sanitizeText(backgroundJob.date, 20),
        mealSlotId: sanitizeText(backgroundJob.mealSlotId, 60),
        mealSlotName: sanitizeText(backgroundJob.mealSlotName, 60) || 'ארוחה',
        mode: jobMode,
        replaceMealItems: jobMode === 'adjust',
        summaryHint:
          sanitizeText(
            backgroundJob.summaryHint || adjustmentPrompt || textPrompt || '',
            80
          ) || undefined,
        retryPayload: compactRetryPayload,
        status: 'processing',
        startedAt: startNowIso,
        lastHeartbeatAt: startNowIso,
        stageText:
          jobMode === 'adjust'
            ? 'המשימה נרשמה בשרת — מעדכן ומתקן ארוחה...'
            : hasRealImage
            ? 'המשימה נרשמה בשרת — מכין תמונות למודל ה-AI...'
            : 'המשימה נרשמה בשרת — פונה למודל ה-AI...',
        acknowledged: false,
      };

      let wasPreCancelled = false;
      await updateTraineeAtomic(authorizedBgJob.targetTraineeId, (t) => {
        const cleaned = normalizePendingAiJobs(t.pendingAiJobs).jobs;
        const existingSelf = cleaned.find((j) => j.id === authorizedBgJob!.id);
        if (existingSelf?.acknowledged) {
          wasPreCancelled = true;
          return { ...t, pendingAiJobs: cleaned };
        }
        const prevJobs = cleaned.filter(
          (j) => j.id !== authorizedBgJob!.id && !j.acknowledged
        );
        return {
          ...t,
          pendingAiJobs: [authorizedBgJob!, ...prevJobs].slice(0, 12),
        };
      });

      if (wasPreCancelled) {
        return NextResponse.json({ cancelled: true, items: [] });
      }
    }

    const checkBgJobCancelled = async (): Promise<boolean> => {
      if (!authorizedBgJob || isDryRun) return false;
      try {
        const jobs = await getTraineePendingAiJobsOnServer(
          authorizedBgJob.targetTraineeId
        );
        const match = jobs?.find(
          (j) => j.id === authorizedBgJob!.id
        );
        return Boolean(match && match.acknowledged);
      } catch {
        return false;
      }
    };

    const updateBgJobStage = async (stageText: string): Promise<void> => {
      if (!authorizedBgJob || isDryRun) return;
      const hbIso = new Date().toISOString();
      await updateTraineeAtomic(authorizedBgJob.targetTraineeId, (t) => {
        const target = (t.pendingAiJobs || []).find(
          (j) => j.id === authorizedBgJob!.id
        );
        if (!target || target.status !== 'processing' || target.acknowledged) {
          return null;
        }
        return {
          ...t,
          pendingAiJobs: (t.pendingAiJobs || []).map((j) =>
            j.id === authorizedBgJob!.id
              ? { ...j, lastHeartbeatAt: hbIso, stageText }
              : j
          ),
        };
      }).catch(() => {});
    };

    const syncAnalyzeResultToServer = async (params: {
      items?: LoggedFoodItem[];
      clarificationQuestions?: AiClarificationQuestion[];
      clarificationAnswers?: AiClarificationAnswer[];
      isClarifyResponse?: boolean;
      overrideJobId?: string;
      engine?: string;
      isAiFallback?: boolean;
      fallbackReason?: string;
      errorMsg?: string;
      errorStage?: 'client' | 'validation' | 'vision_api' | 'parser' | 'db_save';
      replaceItems?: boolean;
    }): Promise<PendingAiMealJob | undefined> => {
      const targetJobId = params.overrideJobId || authorizedBgJob?.id;
      const targetTid = authorizedBgJob?.targetTraineeId || telemetryTargetTraineeId;
      const targetDate = authorizedBgJob?.date || resolvedDate;
      const targetSlotId = authorizedBgJob?.mealSlotId || resolvedSlotId;
      const targetSlotName = authorizedBgJob?.mealSlotName || 'ארוחה';

      if (isDryRun || !targetTid || !targetDate || !targetSlotId) return undefined;

      const nowIso = new Date().toISOString();
      const nowTime = new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const validPhotosForStore = validatedImages
        .filter((v) => v.rawDataUrl.length < 750_000)
        .slice(0, 8);
      const sanitizedPhotos = validPhotosForStore.map((v) => v.rawDataUrl);

      const hasClarifications =
        Array.isArray(params.clarificationQuestions) &&
        params.clarificationQuestions.length > 0;
      const hasItems = Array.isArray(params.items) && params.items.length > 0;
      const isExplicitScopedEmpty = Boolean(
        params.replaceItems && !params.errorMsg && Array.isArray(params.items)
      );
      const succeeded = hasItems || isExplicitScopedEmpty;
      const isReplace = Boolean(
        params.replaceItems || authorizedBgJob?.mode === 'adjust'
      );
      const isCoachActor =
        sessionUser.role === 'coach' || sessionUser.role === 'admin';

      const jobStatus: PendingAiMealJob['status'] = hasClarifications
        ? 'awaiting_clarification'
        : succeeded
        ? 'completed'
        : 'failed';

      const finishedJob: PendingAiMealJob = {
        id:
          targetJobId ||
          `aijob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        targetTraineeId: targetTid,
        date: targetDate,
        mealSlotId: targetSlotId,
        mealSlotName: targetSlotName,
        mode:
          authorizedBgJob?.mode ||
          (mode === 'adjust-meal' ? 'adjust' : hasRealImage ? 'photo' : 'text'),
        replaceMealItems: isReplace,
        startedAt: authorizedBgJob?.startedAt || nowIso,
        summaryHint:
          authorizedBgJob?.summaryHint ||
          sanitizeText(adjustmentPrompt || textPrompt || '', 80) ||
          undefined,
        status: jobStatus,
        lastHeartbeatAt: nowIso,
        stageText: hasClarifications
          ? 'ממתין להבהרה קצרה על תווית הערכים'
          : succeeded
          ? isReplace
            ? 'התיקון הושלם וסונכרן ליומן'
            : 'הושלם וסונכרן ליומן'
          : isReplace
          ? 'תיקון הארוחה נכשל'
          : 'הפענוח נכשל',
        completedAt: hasClarifications ? undefined : nowIso,
        engine: params.engine,
        isAiFallback: params.isAiFallback,
        fallbackReason: params.fallbackReason,
        itemsCount: hasItems ? params.items!.length : 0,
        errorMsg: params.errorMsg,
        errorStage: params.errorStage,
        clarificationQuestions: hasClarifications
          ? params.clarificationQuestions
          : undefined,
        photoDataUrls: sanitizedPhotos.length > 0 ? sanitizedPhotos : undefined,
        photoMetas:
          validPhotosForStore.length > 0
            ? validPhotosForStore.map((v) => ({
                hash: v.hash,
                angle: v.angle,
                ...(v.labelProductName ? { labelProductName: v.labelProductName } : {}),
              }))
            : undefined,
        ...(authorizedBgJob?.retryPayload ? { retryPayload: authorizedBgJob.retryPayload } : {}),
        autoSyncedToLog: succeeded,
        acknowledged: false,
      };

      const labelNamesLearned = (contextParams?.imageLabelProducts || [])
        .map((s) => sanitizeText(s, 70))
        .filter(Boolean);

      let cancelledBeforeSave = false;
      const { next: latestTrainee } = await updateTraineeAtomic(targetTid, (t) => {
        const cleaned = normalizePendingAiJobs(t.pendingAiJobs).jobs;
        const existingSelf = targetJobId
          ? cleaned.find((j) => j.id === targetJobId)
          : undefined;
        if (existingSelf?.acknowledged && !params.isClarifyResponse) {
          cancelledBeforeSave = true;
          return { ...t, pendingAiJobs: cleaned };
        }

        const nextJobs = authorizedBgJob || params.isClarifyResponse || jobStatus === 'failed'
          ? existingSelf
            ? cleaned.map((j) => (j.id === finishedJob.id ? finishedJob : j))
            : [finishedJob, ...cleaned].slice(0, 12)
          : cleaned;

        const mergedRecentLabels =
          labelNamesLearned.length > 0
            ? Array.from(
                new Set([...labelNamesLearned, ...(t.recentLabelProducts || [])])
              ).slice(0, 40)
            : t.recentLabelProducts;

        const existingLog = t.logs[targetDate] || {
          date: targetDate,
          dayType: 'workout' as const,
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const existingMeal = existingLog.meals[targetSlotId] || {
          mealSlotId: targetSlotId,
          items: [],
          updatedAt: nowTime,
        };

        const photoStoreRes = mergeMealPhotoStore(
          existingMeal.photoStore,
          validPhotosForStore.map((v) => ({
            dataUrl: v.rawDataUrl,
            angle: v.angle,
            labelProductName: v.labelProductName,
          }))
        );

        const aiDetail: MealHistoryAiDetail = {
          jobId: finishedJob.id,
          mode: params.isClarifyResponse
            ? 'clarify'
            : isReplace
            ? 'adjust'
            : hasRealImage
            ? 'photo'
            : 'text',
          prompt: textPrompt ? sanitizeText(textPrompt, 500) : undefined,
          chips: contextParams?.activeChipLabels,
          chipQuantities: contextParams?.chipQuantities,
          photos:
            photoStoreRes.metas.length > 0
              ? photoStoreRes.metas
              : undefined,
          clarificationQuestions: params.clarificationQuestions,
          clarificationAnswers: params.clarificationAnswers,
          adjustmentPrompt: adjustmentPrompt
            ? sanitizeText(adjustmentPrompt, 400)
            : undefined,
          selectedTargetIds: Array.isArray(selectedTargetIds)
            ? selectedTargetIds
            : undefined,
          engine: params.engine,
          isFallback: params.isAiFallback,
          errorMsg: params.errorMsg,
          errorStage: params.errorStage,
          retryDraftPayload:
            jobStatus === 'failed'
              ? {
                  traineeId: targetTid,
                  date: targetDate,
                  mealSlotId: targetSlotId,
                  mode: isReplace ? 'adjust' : hasRealImage ? 'photo' : 'text',
                  photos: validPhotosForStore.map((v) => ({
                    dataUrl: v.rawDataUrl,
                    angle: v.angle,
                    ...(v.labelProductName
                      ? { labelProductName: v.labelProductName }
                      : {}),
                  })),
                  textPrompt: textPrompt ? sanitizeText(textPrompt, 500) : undefined,
                  adjustmentPrompt: adjustmentPrompt
                    ? sanitizeText(adjustmentPrompt, 400)
                    : undefined,
                  selectedTargetIds: Array.isArray(selectedTargetIds)
                    ? selectedTargetIds
                    : undefined,
                  activeChipLabels: contextParams?.activeChipLabels,
                  chipQuantities: contextParams?.chipQuantities,
                  contextParams,
                  includePreviousMealPhotos: Boolean(
                    contextParams?.includePreviousMealPhotos
                  ),
                  errorMsg: params.errorMsg,
                  failedAt: nowIso,
                }
              : undefined,
        };

        const existingPhotos =
          Array.isArray(existingMeal.photoDataUrls) &&
          existingMeal.photoDataUrls.length > 0
            ? existingMeal.photoDataUrls
            : existingMeal.photoDataUrl
            ? [existingMeal.photoDataUrl]
            : [];
        const mergedPhotos = [...sanitizedPhotos, ...existingPhotos]
          .filter((u, i, arr) => arr.indexOf(u) === i)
          .slice(0, 16);

        const nextItemsList = succeeded
          ? isReplace
            ? params.items!
            : [...existingMeal.items, ...params.items!]
          : existingMeal.items;

        const histKind =
          jobStatus === 'failed'
            ? 'ai_failed'
            : isCoachActor
            ? 'coach_ai'
            : params.isClarifyResponse
            ? 'ai_clarify'
            : isReplace
            ? 'ai_adjust'
            : 'ai_analyze';

        const histRes = appendMealHistoryEntry(existingMeal, nextItemsList, {
          timestamp: nowIso,
          kind: histKind,
          actorId: sessionUser.id,
          actorName: sessionUser.name,
          actorRole: sessionUser.role,
          summary:
            jobStatus === 'failed'
              ? `שליחת AI נכשלה: ${params.errorMsg || 'שגיאה זמנית'}`
              : hasClarifications && !hasItems
              ? 'זוהתה תווית ערכים — ממתין להבהרת מוצר'
              : params.isClarifyResponse
              ? 'הושלם זיהוי תווית ערכים לפי בחירתך'
              : isReplace
              ? `הארוחה עודכנה ב-AI`
              : hasClarifications
              ? `פוענחו ${params.items!.length} פריטים (תווית אחת ממתינה להבהרה)`
              : undefined,
          aiDetail,
        });

        let updatedMeal: LoggedMealEntry = {
          ...existingMeal,
          items: nextItemsList,
          aiSuggestedExtras: (() => {
            if (isReplace) return undefined;
            const candidate =
              pendingSuggestedExtras.length > 0
                ? pendingSuggestedExtras
                : existingMeal.aiSuggestedExtras;
            const cleanedExtras = filterUnacceptedSuggestedExtras(candidate, nextItemsList);
            return cleanedExtras.length > 0 ? cleanedExtras : undefined;
          })(),
          photoDataUrl: sanitizedPhotos[0] || existingMeal.photoDataUrl,
          photoDataUrls: mergedPhotos.length > 0 ? mergedPhotos : undefined,
          photoMetas:
            photoStoreRes.metas.length > 0
              ? photoStoreRes.metas
              : existingMeal.photoMetas,
          photoStore:
            Object.keys(photoStoreRes.photoStore).length > 0
              ? photoStoreRes.photoStore
              : existingMeal.photoStore,
          photoNote:
            (textPrompt ? sanitizeText(textPrompt, 500) : undefined) ||
            existingMeal.photoNote,
          history: histRes.history,
          updatedAt: nowTime,
        };

        let nextCoachAlerts = t.coachMealAlerts || [];
        if (isCoachActor && succeeded) {
          const coachDiff = applyCoachDiffToMeal({
            prevMeal: existingMeal,
            nextMeal: updatedMeal,
            coachId: sessionUser.id,
            coachName: sessionUser.name,
            nowIso,
            slotName: targetSlotName,
          });
          updatedMeal = coachDiff.meal;
          if (coachDiff.changed) {
            nextCoachAlerts = [
              {
                id: `calert-${finishedJob.id}`,
                coachId: sessionUser.id,
                coachName: sessionUser.name,
                date: targetDate,
                mealSlotId: targetSlotId,
                mealSlotName: targetSlotName,
                summaryText:
                  updatedMeal.coachEditState?.summaryText ||
                  `המאמן ${sessionUser.name} עדכן את ${targetSlotName}`,
                editedAt: nowIso,
                shownOnJournalVisit: false,
                dismissed: false,
              },
              ...nextCoachAlerts.filter(
                (a) => !(a.date === targetDate && a.mealSlotId === targetSlotId)
              ),
            ].slice(0, 15);
          }
        }

        return {
          ...t,
          recentLabelProducts: mergedRecentLabels,
          pendingAiJobs: nextJobs,
          coachMealAlerts: nextCoachAlerts,
          logs: {
            ...t.logs,
            [targetDate]: {
              ...existingLog,
              meals: {
                ...existingLog.meals,
                [targetSlotId]: updatedMeal,
              },
            },
          },
        };
      });

      // פושים רק כשאין תוצאה ממתינה בלבד או בעדכון אמיתי
      if (!cancelledBeforeSave && latestTrainee) {
        const tasks: Promise<unknown>[] = [];

        if (succeeded && hasItems && sessionUser.role === 'trainee') {
          const mealEvent = buildMealAlertEvent({
            slotName: finishedJob.mealSlotName || finishedJob.mealSlotId,
            items: params.items!,
            date: finishedJob.date,
          });
          tasks.push(
            notifySubscribedCoachesForEvents({
              trainee: latestTrainee,
              events: [mealEvent],
              origin: request.nextUrl.origin,
            }).catch((err) => console.error('AI meal coach alert error:', err))
          );
        }

        const canSendTraineeAiPush = isCoachActor
          ? succeeded && shouldNotifyTraineeCoachMealChange(latestTrainee)
          : (succeeded || hasClarifications) &&
            shouldNotifyUnifiedAiCompletion(latestTrainee);

        if (canSendTraineeAiPush) {
          const itemsList = params.items || [];
          const dishNames = itemsList.map((i) => i.name).filter(Boolean);
          const dishLabel =
            dishNames.length === 0
              ? finishedJob.mealSlotName
              : dishNames.length === 1
              ? dishNames[0]
              : dishNames.length === 2
              ? `${dishNames[0]} ו${dishNames[1]}`
              : `${dishNames[0]}, ${dishNames[1]} ועוד ${dishNames.length - 2}`;
          const totalCalories = Math.round(
            itemsList.reduce((sum, i) => sum + (Number(i.macros?.calories) || 0), 0)
          );

          const pushTitle = hasClarifications
            ? `שאלה קצרה על ${finishedJob.mealSlotName}`
            : isCoachActor
            ? `המאמן ${sessionUser.name} עדכן את ${finishedJob.mealSlotName} ✨`
            : finishedJob.mode === 'adjust'
            ? `תיקון ${finishedJob.mealSlotName} הושלם ✨`
            : `זיהוי ${finishedJob.mealSlotName} הושלם ✨`;

          const pushBody = hasClarifications
            ? params.clarificationQuestions![0]?.questionText ||
              'זוהתה תווית ערכים תזונתיים — לחץ לבחירת המוצר'
            : isCoachActor
            ? `${dishLabel} (${totalCalories} קלוריות)`
            : finishedJob.mode === 'adjust'
            ? `הארוחה עודכנה: "${dishLabel} (${totalCalories} קלוריות)"`
            : `זיהוי הארוחה הושלם: "${dishLabel} (${totalCalories} קלוריות)"`;

          tasks.push(
            sendUnifiedPushToTrainee(latestTrainee, {
              pushId: finishedJob.id,
              title: pushTitle,
              body: pushBody,
              kind: isCoachActor ? 'coach' : 'ai-meal',
              screen: 'meal',
              mealSlotId: finishedJob.mealSlotId,
              date: finishedJob.date,
              origin: request.nextUrl.origin,
            })
              .then(async (sendRes) => {
                const hasDead =
                  sendRes.invalidFcmTokens.length > 0 ||
                  sendRes.expiredWebEndpoints.length > 0;
                const recordCoachHist = isCoachActor && sendRes.sentCount > 0;
                if (hasDead || recordCoachHist) {
                  await updateTraineeAtomic(latestTrainee.id, (t) => {
                    const cleaned = stripDeadPushTargetsFromTrainee(
                      t,
                      sendRes.invalidFcmTokens,
                      sendRes.expiredWebEndpoints
                    );
                    return recordCoachHist
                      ? {
                          ...cleaned,
                          pushHistory: [
                            {
                              id: finishedJob.id,
                              title: pushTitle,
                              body: pushBody,
                              sentAt: new Date().toISOString(),
                              sentByCoachName: sessionUser.name,
                              targetScreen: 'meal' as const,
                              targetMealSlotId: finishedJob.mealSlotId,
                            },
                            ...(cleaned.pushHistory || []),
                          ].slice(0, 20),
                        }
                      : cleaned;
                  }).catch(() => {});
                }
              })
              .catch(() => {})
          );
        }

        if (tasks.length > 0) {
          await Promise.all(tasks);
        }
      }

      return cancelledBeforeSave ? undefined : finishedJob;
    };

    // הגנת waitUntil: ממשיכה להריץ את הפענוח, השמירה והפוש ב-Vercel גם אם המשתמש סגר את האפליקציה
    const executeAnalyzePipeline = async (): Promise<NextResponse> => {

    // =========================================================================
    // מצב A: מדידת כלי הגשה (צלחת / קערה / קופסה / כוס) בעזרת AI + אובייקט ייחוס
    // =========================================================================
    if (mode === 'measure-tool') {
      if (!hasRealImage) {
        return NextResponse.json(
          { error: 'למדידת כלי עם AI יש להעלות לפחות תמונה אחת (רצוי 2: מלמעלה + מהצד).' },
          { status: 400 }
        );
      }
      if (!apiKey) {
        return NextResponse.json(
          {
            error: 'לא הוגדר מפתח GEMINI_API_KEY בשרת למדידת כלים בתמונה. ניתן להזין מידות ידנית.',
            isAiFallback: true,
            fallbackReason: 'לא הוגדר GEMINI_API_KEY בשרת',
          },
          { status: 422 }
        );
      }

      const refSpecs: Record<string, string> = {
        'credit-card':
          'כרטיס סטנדרטי ISO/IEC 7810 ID-1 (רב-קו / תעודה / כרטיס מועדון / אשראי הפוך): רוחב מדויק 8.56 ס"מ (85.60 מ"מ) × גובה 5.40 ס"מ (53.98 מ"מ), יחס צדדים 1.586:1',
        'coin-10': 'מטבע 10 שקלים (10 NIS): קוטר 2.30 ס"מ (23.0 מ"מ), טבעת כסופה וליבה מוזהבת',
        'coin-5': 'מטבע 5 שקלים (5 NIS): קוטר 2.40 ס"מ (24.0 מ"מ)',
        cutlery: 'סכו"ם שולחני סטנדרטי (מזלג/כף מרק ~19.0 ס"מ, כפית ~14.0 ס"מ — שגיאה אפשרית 15%-25%)',
        none: 'ללא אובייקט ייחוס רשמי — הערך על סמך פרופורציות סטנדרטיות וציין רמת ודאות בינונית/נמוכה',
      };

      const measurePrompt = `אתה מומחה Computer Vision ומדידות פיזיקליות לכלי הגשה.
המשתמש רוצה למדוד כלי הגשה מסוג "${toolKind}"${toolName ? ` (${sanitizeText(toolName, 60)})` : ''} מתוך התמונות המצורפות.
אובייקט הייחוס שהוצב ליד הכלי: ${refSpecs[referenceObject] || refSpecs['credit-card']}.

בצע שלב-אחר-שלב (חובה להישען על קואורדינטות לפני חישוב):
1. זהה את אובייקט הייחוס (4 פינות אם כרטיס, או קוטר מעגל אם מטבע) בתיבת [ymin, xmin, ymax, xmax] מנורמלת 0-1000.
2. חשב יחס ס"מ-ליחידה מנורמלת במישור השולחן. אם אובייקט הייחוס על השולחן והכלי גבוה (מעל 4 ס"מ), קזז את התרחבות הפרלקסה של שפת הכלי העליונה כלפי מטה ב-8%-15%.
3. מדוד את קוטר/רוחב הכלי (diameterCm), עומק/גובה פנימי משוער (depthCm), ונפח שימושי במ"ל (volumeMl).
4. הערך משקל ממוצע בגרם למילוי אופייני סביר של הכלי (defaultFoodGrams, למשל פסטה/אורז/סלט/מרק בכמות יומיומית סבירה בכלי זה).
5. תן המלצת כיול/התראת צילום קצרה בעברית (confidenceNote).

החזר JSON בלבד במבנה הבא:
{
  "recommendedName": "שם קצר וברור לכלי בעברית",
  "diameterCm": 26.0,
  "depthCm": 3.5,
  "volumeMl": 850,
  "defaultFoodGrams": 220,
  "referenceDetected": true,
  "confidence": "high",
  "confidenceNote": "הסבר קצר על הזווית, אובייקט הייחוס ורמת הדיוק"
}`;

      const parts: GeminiPart[] = [{ text: measurePrompt }];
      validatedImages.forEach((img, idx) => {
        parts.push({ text: `תמונה ${idx + 1}: ${img.angleLabel}` });
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });

      const res = await callGeminiStructured(apiKey, parts);
      if (res.parsed) {
        return NextResponse.json({
          mode: 'measure-tool',
          recommendedName: sanitizeText(res.parsed.recommendedName, 60) || toolName || 'כלי מדוד',
          diameterCm: sanitizeNumber(res.parsed.diameterCm, 2, 55, 24),
          depthCm: sanitizeNumber(res.parsed.depthCm, 0.5, 35, 3),
          volumeMl: Math.round(sanitizeNumber(res.parsed.volumeMl, 10, 5000, 600)),
          defaultFoodGrams: Math.round(
            sanitizeNumber(res.parsed.defaultFoodGrams, 10, 3000, 200)
          ),
          referenceDetected: Boolean(res.parsed.referenceDetected ?? true),
          confidence: String(res.parsed.confidence || 'medium'),
          confidenceNote:
            sanitizeText(res.parsed.confidenceNote, 200) ||
            'המידות חולצו מתמונת הכלי ביחס לאובייקט הייחוס.',
          engine: res.modelName,
          isAiFallback: false,
        });
      }

      return NextResponse.json(
        {
          error: `מדידת הכלי ב-AI נכשלה (${res.errorMsg}). ניתן להזין מידות ידנית או לנסות לצלם שוב באור טוב.`,
          isAiFallback: true,
          fallbackReason: res.errorMsg,
        },
        { status: 422 }
      );
    }

    // =========================================================================
    // מצב B0: תשובת הבהרה של משתמש על תווית ערכים (1-Round Completion)
    // =========================================================================
    if (mode === 'clarify-meal') {
      const questions = Array.isArray(incomingClarificationQuestions)
        ? incomingClarificationQuestions.slice(0, 4)
        : [];
      const answers = Array.isArray(incomingClarificationAnswers)
        ? incomingClarificationAnswers.slice(0, 4)
        : [];
      if (answers.length === 0) {
        return NextResponse.json(
          { error: 'נא לבחור או להזין תשובה לשאלת ההבהרה' },
          { status: 400 }
        );
      }
      const effTid =
        sessionUser.role === 'trainee'
          ? sessionUser.id
          : backgroundJob?.traineeId || bodyTraineeId;
      const [priorityCustomCatalog, targetTraineeClar] = await Promise.all([
        resolveVisibleCustomCatalogForActor(sessionUser, effTid),
        effTid
          ? getSingleTraineeFromServer(effTid).catch(() => null)
          : Promise.resolve(null),
      ]);
      pushTraceStep(
        'clarify',
        `התקבלה תשובת הבהרה מהמשתמש (${answers.length} תשובות)`,
        'ok',
        answers
      );

      const resolvedItems: LoggedFoodItem[] = [];
      const nonSkippedPairs: {
        q?: AiClarificationQuestion;
        a: AiClarificationAnswer;
      }[] = [];

      for (const ans of answers) {
        const matchedQ = questions.find((q) => q.id === ans.questionId);
        const chosenName = (ans.customProductName || ans.selectedOption || '').trim();
        if (!chosenName || chosenName === '__skip__' || chosenName === 'דלג') {
          if (matchedQ?.perServingEstimate || matchedQ?.per100gEstimate) {
            const per100 = matchedQ.per100gEstimate || matchedQ.perServingEstimate!;
            const grams = matchedQ.servingGramsHint || matchedQ.defaultGramsHint || 100;
            const macros = matchedQ.perServingEstimate && !matchedQ.per100gEstimate
              ? matchedQ.perServingEstimate
              : calculateMacrosForGrams(per100, grams);
            resolvedItems.push({
              id: `clar-skip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              name: matchedQ.extractedTableSummary.slice(0, 50) || 'מוצר מתווית ערכים',
              unitLabel: `${grams} גרם (לפי תווית)`,
              quantity: 1,
              grams,
              per100g: per100,
              macros,
              source: 'ai-photo',
              inputConfidence: 'visual-estimate',
            });
          }
          continue;
        }
        nonSkippedPairs.push({ q: matchedQ, a: ans });
      }

      let clarModelName: string | undefined;
      if (nonSkippedPairs.length > 0 && apiKey) {
        const existingMealClar =
          targetTraineeClar && resolvedDate && resolvedSlotId
            ? targetTraineeClar.logs?.[resolvedDate]?.meals?.[resolvedSlotId]
            : undefined;
        const mealTimelineClar = buildCompactMealTimelineForAi(existingMealClar);
        const clarPrompt = `אתה תזונאי קליני וספורט בישראל.
קודם לכן זוהתה טבלת ערכים תזונתיים של מוצר אחד או יותר, והמשתמש הבהיר כעת מהו המוצר (וכמה אכל ממנו אם צוין).
${mealTimelineClar ? `\n${mealTimelineClar}\n` : ''}
פרטי הטבלה ותשובות המשתמש:
${nonSkippedPairs
  .map(
    ({ q, a }, i) =>
      `${i + 1}. סיכום הטבלה שחולץ: "${q?.extractedTableSummary || 'תווית ערכים'}"` +
      (q?.per100gEstimate
        ? ` | ל-100g: ${q.per100gEstimate.calories} קק"ל, ח:${q.per100gEstimate.protein}, פ:${q.per100gEstimate.carbs}, ש:${q.per100gEstimate.fat}`
        : '') +
      `\n   זיהוי שבחר המשתמש: "${a.customProductName || a.selectedOption}"${
        a.gramsOrPortionText ? ` | כמות שדווחה: "${a.gramsOrPortionText}"` : ''
      }`
  )
  .join('\n')}

החזר JSON בלבד במבנה {"summary": "...", "items": [{ "name": "שם המוצר המלא בעברית", "unitLabel": "תיאור יחידה ומשקל", "quantity": 1, "grams": 100, "fromUserText": true, "inputConfidence": "reported", "per100g": {...}, "macros": {...} }]} לפי נתוני הטבלה והכמות.`;

        const clarRes = await callGeminiStructured(apiKey, [{ text: clarPrompt }], {
          perAttemptTimeoutMs: 20_000,
          totalBudgetMs: 45_000,
        });
        clarModelName = clarRes.modelName;
        if (clarRes.parsed && Array.isArray(clarRes.parsed.items)) {
          const { groundAndNormalizeAiItems } = await import('@/lib/aiFoodGrounding');
          const mapped = mapRawGeminiItems(
            clarRes.parsed.items as Record<string, unknown>[],
            'ai-photo',
            clarModelName || GEMINI_VISION_MODELS[0]
          );
          const grounded = await groundAndNormalizeAiItems(mapped, priorityCustomCatalog);
          resolvedItems.push(...grounded);
        }
      }

      // גיבוי דטרמיניסטי לתוויות ערכים אם Gemini לא החזיר תוצאה בתשובת הבהרה
      if (resolvedItems.length === 0 && nonSkippedPairs.length > 0) {
        for (const { q, a } of nonSkippedPairs) {
          const name = (a.customProductName || a.selectedOption).trim();
          const parsedGramsMatch = a.gramsOrPortionText?.match(/(\d+(?:\.\d+)?)/);
          const grams = parsedGramsMatch
            ? Math.max(1, Math.min(2000, Number(parsedGramsMatch[1])))
            : q?.servingGramsHint || q?.defaultGramsHint || 100;
          const per100 = q?.per100gEstimate ||
            q?.perServingEstimate || { calories: 200, protein: 8, carbs: 20, fat: 8 };
          resolvedItems.push({
            id: `clar-det-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name,
            unitLabel: a.gramsOrPortionText || `${grams} גרם`,
            quantity: 1,
            grams,
            per100g: per100,
            macros: calculateMacrosForGrams(per100, grams),
            source: 'ai-photo',
            fromUserText: true,
            inputConfidence: 'reported',
          });
        }
      }

      pushTraceStep(
        'clarify_done',
        `הבהרה הושלמה — נוספו ${resolvedItems.length} פריטים`,
        'ok'
      );
      const syncedJob = await syncAnalyzeResultToServer({
        items: resolvedItems,
        clarificationQuestions: questions,
        clarificationAnswers: answers,
        isClarifyResponse: true,
        overrideJobId: sanitizeText(clarificationJobId, 60) || undefined,
        engine: clarModelName || 'label-resolver',
        isAiFallback: !clarModelName,
      });

      persistAiTrace({
        queueType: 'history',
        model: clarModelName || 'label-resolver',
        clarificationQuestions: questions,
        clarificationAnswers: answers,
        parsedItems: resolvedItems,
        rawResponseSummary: `השלמת הבהרה (${resolvedItems.length} פריטים)`,
        targetName: targetTraineeClar?.name,
        slotName: backgroundJob?.mealSlotName,
      });

      return NextResponse.json({
        items: resolvedItems,
        summary: 'תווית הערכים זוהתה ונוספה לארוחה לפי בחירתך',
        engine: clarModelName || 'label-resolver',
        isAiFallback: !clarModelName,
        syncedJob,
      });
    }

    // =========================================================================
    // מצב B: התאמת / תיקון ארוחה עם AI ("תקן" / "תחליף סלק לכבד אפוי 150 גרם")
    // =========================================================================
    if (mode === 'adjust-meal') {
      const cleanBaseItems = Array.isArray(baseItems) ? baseItems.slice(0, 30) : [];
      const cleanAdjustment = (adjustmentPrompt || textPrompt || '').trim();
      if (cleanBaseItems.length === 0) {
        return NextResponse.json(
          { error: 'לא נמצאו מרכיבים קודמים להתאמה' },
          { status: 400 }
        );
      }
      if (!cleanAdjustment && !hasRealImage) {
        return NextResponse.json(
          { error: 'יש לכתוב מה לתקן בארוחה או לצרף תמונה מעודכנת' },
          { status: 400 }
        );
      }

      const effectiveTraineeId =
        sessionUser.role === 'trainee'
          ? sessionUser.id
          : backgroundJob?.traineeId || bodyTraineeId;
      const [priorityCustomCatalog, targetTrainee] = await Promise.all([
        resolveVisibleCustomCatalogForActor(sessionUser, effectiveTraineeId),
        effectiveTraineeId
          ? getSingleTraineeFromServer(effectiveTraineeId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const traineeProfileContext =
        targetTrainee &&
        (sessionUser.role === 'trainee' ||
          canCoachAccessTrainee(sessionUser, targetTrainee))
          ? buildCompactAnalyzeContext(targetTrainee)
          : '';
      const existingMealForAdj =
        targetTrainee && resolvedDate && resolvedSlotId
          ? targetTrainee.logs?.[resolvedDate]?.meals?.[resolvedSlotId]
          : undefined;
      const mealTimelineForAdj = buildCompactMealTimelineForAi(existingMealForAdj);
      const customFoodsHint =
        priorityCustomCatalog.length > 0
          ? `\nמוצרים אישיים מוגדרים של המשתמש (עדיפות עליונה לשם ולערכים ל-100 גרם אם מוזכרים!): ${priorityCustomCatalog
              .slice(0, 35)
              .map(
                (cf) =>
                  `${cf.name} (${Math.round(cf.per100g.calories)} קק״ל/100g, ח:${cf.per100g.protein}, פ:${cf.per100g.carbs}, ש:${cf.per100g.fat})`
              )
              .join(' | ')}`
          : '';

      const contextBlock = formatContextParamsPrompt(contextParams);
      const cleanSelectedIds = Array.isArray(selectedTargetIds)
        ? selectedTargetIds
            .map((id) => sanitizeText(id, 80))
            .filter(Boolean)
            .slice(0, 40)
        : [];
      const cleanHistory = Array.isArray(correctionHistory)
        ? correctionHistory
            .slice(-6)
            .map((h) => ({
              beforeNames: Array.isArray(h?.beforeNames)
                ? h.beforeNames.map((n) => sanitizeText(n, 60)).filter(Boolean).slice(0, 15)
                : [],
              prompt: sanitizeText(h?.prompt, 240),
            }))
            .filter((h) => h.prompt)
        : [];

      const isScoped = cleanSelectedIds.length > 0;
      const scopedPayload = isScoped
        ? buildSelectiveScopedPayload(cleanBaseItems, new Set(cleanSelectedIds))
        : null;
      if (isScoped && scopedPayload && scopedPayload.targetItems.length === 0) {
        return NextResponse.json(
          { error: 'לא נמצאו פריטים תואמים לבחירה לתיקון' },
          { status: 400 }
        );
      }

      let geminiErrorMsg = '';
      if (apiKey) {
        const historyBlock =
          cleanHistory.length > 0
            ? `\nהיסטוריית תיקונים שכבר בוצעו בארוחה זו (הקשר רציף כדי לא להחזיר טעויות קודמות!):\n${cleanHistory
                .map(
                  (h, idx) =>
                    `${idx + 1}. לפני כן: [${h.beforeNames.join(', ') || 'מנה'}] -> בקשת משתמש: "${h.prompt}"`
                )
                .join('\n')}`
            : '';

        const scopedPromptBlock =
          isScoped && scopedPayload
            ? `מצב תיקון ממוקד (Scoped Edit — המשתמש בחר ספציפית מה לתקן!):
הארוחה המלאה עד כה (כולל המרכיבים והשינויים הקודמים):
${JSON.stringify(cleanBaseItems)}
${historyBlock}

חלקים נעולים לקריאה בלבד (אסור לשנות, להסיר או להחזיר אותם במערך התשובה!):
${JSON.stringify(scopedPayload.lockedContextItems)}

המטרה היחידה לתיקון ועדכון כעת (targetItems):
${JSON.stringify(scopedPayload.targetItems)}
${
  scopedPayload.partialParentMap.length > 0
    ? `\nהערת שיוך חשוב: המרכיבים שנבחרו שייכים למנת האב: ${scopedPayload.partialParentMap
        .map(
          (p) =>
            `"${p.parentName}" (מרכיבים נעולים אחרים באותה מנה: ${p.lockedComponentNames.join(', ') || 'אין'})`
        )
        .join(' | ')}. החזר במערך "items" אך ורק את המרכיב/ים המתוקנים שמחליפים את היעד (ללא מנת האב השלמה וללא המרכיבים הנעולים!).`
    : '\nהחזר במערך "items" אך ורק את הגרסה המתוקנת של targetItems (ללא הפריטים מהחלק הנעול!).'
}`
            : `מרכיבי הבסיס הקיימים כרגע בארוחה (JSON):
${JSON.stringify(cleanBaseItems)}
${historyBlock}`;

        const adjustInstruction = `אתה תזונאי קליני וספורט מומחה בישראל.
המתאמן מבקש לתקן, להחליף, להסיר או לעדכן ארוחה שכבר פוענחה.
${scopedPromptBlock}
${mealTimelineForAdj ? `\nהיסטוריית השליחות והעריכות הכללית של הארוחה:\n${mealTimelineForAdj}\n` : ''}
${cleanAdjustment ? `הוראת התיקון של המתאמן (עובדה מחייבת — עדיפות עליונה!): "${cleanAdjustment}"` : ''}
${contextBlock ? `\nנתוני הקשר של הארוחה:\n${contextBlock}` : ''}${traineeProfileContext ? `\n\n${traineeProfileContext}` : ''}${customFoodsHint}

כללי חובה להבנת כוונת התיקון (החלפה / הסרה / שימור / מנות מורכבות):
1. ${
          isScoped
            ? 'במצב ממוקד זה החזר במערך "items" אך ורק את המנות/מרכיבים שנבחרו לאחר התיקון (ואם מוחקים את כל הבחירה החזר [] או הוסר ב-summary).'
            : 'אתה מחזיר במערך "items" את **הרשימה המלאה והסופית של כל הארוחה אחרי התיקון** (לעולם אל תשכפל פריטים!).'
        }
2. **החלפה ("הסלק הוא בעצם כבד", "במקום X זה Y", "לא X אלא Y", "שנה שניצל מטוגן לאפוי"):** מחק לחלוטין את הפריט/מרכיב הישן (X) והחזר במקומו רק את המתוקן (Y).
3. **הסרה ("בלי X", "תוריד X", "הסר X", "לא אכלתי X"):** מחק את X לחלוטין.
4. **עדכון כמות ("האורז הוא 120 גרם", "רק חצי שניצל", "פחות שמן"):** עדכן רק את הגרמים, היחידה והמאקרו של הפריט הקיים — אל תיצור שורה חדשה נוספת!
5. **שמירה על מבנה מנה ומרכיבים (\`components\`):** אם הפריט הוא מנה מורכבת ואיננו במצב בחירה חלקית, השב את המנה כולה עם \`components\` מעודכנים ומאוחדים; עדכן שמן/תבלינים בצורה מפורשת (\`componentRole\`: \`"cooking-oil"\` / \`"spice-group"\` עם \`spiceDetails\`).
6. אם המתאמן ציין שם מאכל מתוקן, שיטת הכנה (אפוי/מבושל/מטוגן) או משקל מפורש בגרמים — אלה נתוני אמת נעולים ו-\`inputConfidence: "reported"\`.
7. לכל פריט/מרכיב חדש או מעודכן, ספק "per100g" לפי מצב ההכנה המוכן והמדויק בישראל (כגון אורז מבושל ~130 קק"ל, כבד עוף אפוי ~172 קק"ל, שניצל אפוי ~165 קק"ל), וחשב את "macros" לפי grams * per100g / 100.
8. אם המשתמש ציין העדפה עקרונית שחוזרת על עצמה ("אני תמיד אופה שניצל בלי שמן", "הקפה שלי תמיד עם חלב סויה"), ציין אותה בקצרה בשדה האופציונלי "learnedRuleHint" (עד 70 תווים), אחרת null.

החזר JSON תקני בלבד:
{
  "summary": "סיכום קצר בעברית של מה הוסר, מה הוחלף ומה נשאר",
  "learnedRuleHint": null,
  "items": [
    {
      "name": "שם המאכל או המנה בעברית",
      "unitLabel": "תיאור יחידה ומשקל",
      "quantity": 1,
      "grams": 150,
      "fromUserText": true,
      "inputConfidence": "reported",
      "per100g": { "calories": 172, "protein": 25.8, "carbs": 1.1, "fat": 6.4 },
      "macros": { "calories": 258, "protein": 38.7, "carbs": 1.7, "fat": 9.6 }
    }
  ]
}`;
        const parts: GeminiPart[] = [{ text: adjustInstruction }];
        validatedImages.forEach((img, idx) => {
          parts.push({ text: `תמונה מהארוחה ${idx + 1}: ${img.angleLabel}` });
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        });

        const res = await callGeminiStructured(apiKey, parts, {
          perAttemptTimeoutMs: 28_000,
          fallbackAttemptTimeoutMs: 23_500,
          totalBudgetMs: 120_000,
          shouldCancel: checkBgJobCancelled,
          onAttemptModel: (m, _idx, meta) =>
            updateBgJobStage(
              meta?.isRetry
                ? `עומס זמני במודל ${m} — מנסה שוב אוטומטית...`
                : `מתקן את הארוחה מול מודל ${m}...`
            ),
        });
        if (res.cancelled) {
          return NextResponse.json({ cancelled: true, items: [] });
        }
        if (res.parsed && Array.isArray(res.parsed.items)) {
          const isExplicitClearInScoped = isScoped && res.parsed.items.length === 0;
          if (res.parsed.items.length > 0 || isExplicitClearInScoped) {
            const { groundAndNormalizeAiItems } = await import('@/lib/aiFoodGrounding');
            const rawMapped = mapRawGeminiItems(
              res.parsed.items as Record<string, unknown>[],
              sourceType,
              res.modelName || GEMINI_VISION_MODELS[0]
            );
            let normalizedTargets =
              rawMapped.length > 0
                ? await groundAndNormalizeAiItems(rawMapped, priorityCustomCatalog)
                : [];

            // הגנה מפני מצב ש-Gemini החזיר מנת אב עטופה גם כשנבחרו מרכיבים חלקיים מתוכה
            if (
              isScoped &&
              scopedPayload?.selectionKind === 'partial-components' &&
              scopedPayload.partialParentMap.length === 1 &&
              normalizedTargets.length === 1 &&
              Array.isArray(normalizedTargets[0].components) &&
              normalizedTargets[0].components.length > 0
            ) {
              const pName = scopedPayload.partialParentMap[0].parentName.trim().toLowerCase();
              if (normalizedTargets[0].name.trim().toLowerCase() === pName) {
                const lockedNames = new Set(
                  scopedPayload.partialParentMap[0].lockedComponentNames.map((s) =>
                    s.split(' (')[0].trim().toLowerCase()
                  )
                );
                normalizedTargets = normalizedTargets[0].components.filter(
                  (c) => !lockedNames.has(c.name.trim().toLowerCase())
                );
              }
            }

            const baseTimeByName = new Map<string, string>();
            for (const bi of cleanBaseItems as LoggedFoodItem[]) {
              const nt = normalizeHhMmTime(bi?.itemTime);
              if (bi?.name && nt) {
                baseTimeByName.set(bi.name.trim().toLowerCase(), nt);
              }
            }
            const timedTargets = normalizedTargets.map((it) => {
              if (it.itemTime) return it;
              const prevTime = baseTimeByName.get(it.name.trim().toLowerCase());
              return prevTime ? { ...it, itemTime: prevTime } : it;
            });

            const items = isScoped
              ? mergeScopedAdjustmentResult({
                  currentItems: cleanBaseItems,
                  selectedTargetIds: cleanSelectedIds,
                  adjustedItems: timedTargets.map((it) =>
                    scopedPayload?.selectionKind === 'partial-components'
                      ? stripNestedComponents(it)
                      : it
                  ),
                })
              : timedTargets;

            const learnedRuleHint =
              typeof res.parsed.learnedRuleHint === 'string' &&
              res.parsed.learnedRuleHint.trim().length >= 4
                ? sanitizeText(res.parsed.learnedRuleHint, 80)
                : undefined;

            const syncedJob = await syncAnalyzeResultToServer({
              items,
              engine: res.modelName,
              isAiFallback: false,
              replaceItems: true,
            });
            const adjSummary =
              sanitizeText(res.parsed.summary, 240) ||
              'הארוחה עודכנה בהצלחה לפי בקשתך';
            pushTraceStep('adjust_done', `תיקון הושלם בהצלחה (${items.length} פריטים)`, 'ok');
            persistAiTrace({
              queueType: 'history',
              model: res.modelName,
              parsedItems: items,
              rawResponseSummary: adjSummary,
              targetName: targetTrainee?.name,
            });
            return NextResponse.json({
              dryRun: isDryRun || undefined,
              stepsTimeline: isDryRun ? aiTraceSteps : undefined,
              items,
              summary: adjSummary,
              ...(learnedRuleHint ? { learnedRuleHint } : {}),
              engine: res.modelName,
              isAiFallback: false,
              syncedJob,
            });
          }
        }
        geminiErrorMsg = res.errorMsg || 'מודל Gemini לא החזיר תוצאה';
      }

      const fallbackReason = !apiKey
        ? 'לא הוגדר GEMINI_API_KEY בשרת'
        : geminiErrorMsg || 'מודל Gemini לא החזיר תוצאה';

      const fallbackSource =
        isScoped && scopedPayload ? scopedPayload.targetItems : cleanBaseItems;
      const fallbackAdjustedTargets = adjustMealFallback(fallbackSource, cleanAdjustment).map(
        (it) => ({
          ...it,
          aiEngine: 'smart-hebrew-builtin',
          isAiFallback: true,
          fallbackReason,
        })
      );
      const adjusted = isScoped
        ? mergeScopedAdjustmentResult({
            currentItems: cleanBaseItems,
            selectedTargetIds: cleanSelectedIds,
            adjustedItems: fallbackAdjustedTargets,
          })
        : fallbackAdjustedTargets;

      if (adjusted.length > 0) {
        const syncedJob = await syncAnalyzeResultToServer({
          items: adjusted,
          engine: 'smart-hebrew-builtin',
          isAiFallback: true,
          fallbackReason,
          replaceItems: true,
        });
        pushTraceStep('adjust_fallback', `תיקון דטרמיניסטי (${fallbackReason})`, 'warn');
        persistAiTrace({
          queueType: 'history',
          model: 'smart-hebrew-builtin',
          parsedItems: adjusted,
          rawResponseSummary: `Fallback: ${fallbackReason}`,
          targetName: targetTrainee?.name,
        });
        return NextResponse.json({
          dryRun: isDryRun || undefined,
          stepsTimeline: isDryRun ? aiTraceSteps : undefined,
          items: adjusted,
          summary: `הארוחה הותאמה דטרמיניסטית (${adjusted.length} מרכיבים).`,
          engine: 'smart-hebrew-builtin',
          isAiFallback: true,
          fallbackReason,
          syncedJob,
        });
      }

      const errMsg = `לא הצלחנו לעדכן את הארוחה (${fallbackReason}).`;
      pushTraceStep('adjust_failed', errMsg, 'error');
      const syncedJob = await syncAnalyzeResultToServer({
        items: [],
        errorMsg: errMsg,
        errorStage: apiKey ? 'vision_api' : 'validation',
        replaceItems: true,
      });
      persistAiTrace({
        queueType: 'crashed',
        crashStage: apiKey ? 'vision_api' : 'validation',
        errorCode: 'ADJUST_FAILED',
        errorMessage: errMsg,
        targetName: targetTrainee?.name,
      });
      return NextResponse.json({ error: errMsg, syncedJob }, { status: 422 });
    }

    // =========================================================================
    // מצב C (ברירת מחדל): ניתוח תמונות מרובות + הקשר מדויק + טקסט
    // =========================================================================
    const effectiveTraineeIdC =
      sessionUser.role === 'trainee'
        ? sessionUser.id
        : backgroundJob?.traineeId || bodyTraineeId;
    const [priorityCustomCatalog, targetTraineeC] = await Promise.all([
      resolveVisibleCustomCatalogForActor(sessionUser, effectiveTraineeIdC),
      effectiveTraineeIdC
        ? getSingleTraineeFromServer(effectiveTraineeIdC).catch(() => null)
        : Promise.resolve(null),
    ]);
    const traineeProfileContextC =
      targetTraineeC &&
      (sessionUser.role === 'trainee' ||
        canCoachAccessTrainee(sessionUser, targetTraineeC))
        ? buildCompactAnalyzeContext(targetTraineeC)
        : '';
    const existingMealC =
      targetTraineeC && resolvedDate && resolvedSlotId
        ? targetTraineeC.logs?.[resolvedDate]?.meals?.[resolvedSlotId]
        : undefined;
    const mealTimelineC = buildCompactMealTimelineForAi(existingMealC);
    const prevPhotosForComparison =
      contextParams?.includePreviousMealPhotos && existingMealC
        ? (
            existingMealC.photoDataUrls?.length
              ? existingMealC.photoDataUrls
              : existingMealC.photoDataUrl
              ? [existingMealC.photoDataUrl]
              : []
          )
            .filter(
              (u) =>
                typeof u === 'string' &&
                u.startsWith('data:image/') &&
                !validatedImages.some((v) => v.rawDataUrl === u)
            )
            .slice(0, Math.max(0, 8 - validatedImages.length))
        : [];

    const contextBlock = formatContextParamsPrompt(contextParams);
    const hasUserText = Boolean(textPrompt && textPrompt.trim().length >= 2);
    const strictUserList = Boolean(contextParams?.strictUserList);
    let geminiErrorMsg = '';
    if (apiKey) {
      const systemInstruction = `אתה תזונאי קליני וספורט מומחה בישראל עם התמחות בניתוח נפח, זיהוי מנות ישראליות ושמירה קפדנית על דברי המתאמן.
תפקידך לנתח ארוחה מ-1 עד 8 תמונות (משולבות: צלחות, כלי הגשה, מוצרים וטבלאות ערכים תזונתיים) ו/או מתיאור טקסטואלי בעברית ולהחזיר JSON בלבד במבנה הבא:
{
  "summary": "תיאור קצר בעברית של מה שזוהה והערכת כמות",
  "items": [
    {
      "name": "שם המנה או המאכל בעברית (למשל: מג׳דרה / שניצל מטוגן / קפה הפוך / בננה)",
      "unitLabel": "תיאור היחידה והמשקל, למשל: מנה (250 גרם)",
      "quantity": 1,
      "grams": 250,
      "fromUserText": false,
      "inputConfidence": "visual-estimate",
      "per100g": { "calories": 136, "protein": 4.8, "carbs": 18.2, "fat": 4.9 },
      "macros": { "calories": 340, "protein": 12, "carbs": 45.5, "fat": 12.2 },
      "components": [
        {
          "name": "אורז לבן מבושל",
          "unitLabel": "120 גרם",
          "quantity": 1,
          "grams": 120,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "ingredient",
          "per100g": { "calories": 130, "protein": 2.7, "carbs": 28.2, "fat": 0.3 },
          "macros": { "calories": 156, "protein": 3.2, "carbs": 33.8, "fat": 0.4 }
        },
        {
          "name": "שמן טיגון / בישול",
          "unitLabel": "10 גרם",
          "quantity": 1,
          "grams": 10,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "cooking-oil",
          "visualReason": "בצל מושחם והברקת טיגון — ניתן לערוך אם בושל ללא שמן",
          "per100g": { "calories": 884, "protein": 0, "carbs": 0, "fat": 100 },
          "macros": { "calories": 88, "protein": 0, "carbs": 0, "fat": 10 }
        }
      ]
    }
  ],
  "clarificationQuestions": [
    {
      "photoIndex": 1,
      "extractedTableSummary": "סיכום הטבלה (למשל: 420 קק\"ל ל-100g, 18g חלבון)",
      "questionText": "זיהיתי טבלת ערכים בתמונה 2 — לאיזה מוצר היא שייכת?",
      "suggestedOptions": ["חטיף חלבון שבצד", "הרוטב של הסלט", "גבינה / ממרח בצלחת"],
      "defaultGramsHint": 100,
      "per100gEstimate": { "calories": 420, "protein": 18, "carbs": 45, "fat": 18 }
    }
  ],
  "suggestedExtras": [
    {
      "name": "פריט או מנה נוספת שנראית בבירור בתמונה אך לא נכתבה בטקסט (למשל סלט ירקות עם תירס, אבוקדו וזיתים)",
      "unitLabel": "קערית (100 גרם)",
      "quantity": 1,
      "grams": 100,
      "fromUserText": false,
      "inputConfidence": "visual-estimate",
      "visualReason": "זוהה חזותית בצלחת לצד המנות שצוינו",
      "per100g": { "calories": 76, "protein": 1.6, "carbs": 7.6, "fat": 5.0 },
      "macros": { "calories": 76, "protein": 1.6, "carbs": 7.6, "fat": 5.0 },
      "components": [
        {
          "name": "ירקות טריים חתוכים (חסה / עגבנייה / מלפפון)",
          "unitLabel": "50 גרם",
          "quantity": 1,
          "grams": 50,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "ingredient",
          "per100g": { "calories": 18, "protein": 1.0, "carbs": 3.5, "fat": 0.2 },
          "macros": { "calories": 9, "protein": 0.5, "carbs": 1.8, "fat": 0.1 }
        },
        {
          "name": "תירס גרעינים",
          "unitLabel": "20 גרם",
          "quantity": 1,
          "grams": 20,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "ingredient",
          "per100g": { "calories": 86, "protein": 3.2, "carbs": 19.0, "fat": 1.2 },
          "macros": { "calories": 17, "protein": 0.6, "carbs": 3.8, "fat": 0.2 }
        },
        {
          "name": "אבוקדו",
          "unitLabel": "20 גרם",
          "quantity": 1,
          "grams": 20,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "ingredient",
          "per100g": { "calories": 160, "protein": 2.0, "carbs": 8.5, "fat": 14.7 },
          "macros": { "calories": 32, "protein": 0.4, "carbs": 1.7, "fat": 2.9 }
        },
        {
          "name": "זיתים",
          "unitLabel": "10 גרם",
          "quantity": 1,
          "grams": 10,
          "fromUserText": false,
          "inputConfidence": "visual-estimate",
          "componentRole": "ingredient",
          "per100g": { "calories": 180, "protein": 1.0, "carbs": 3.0, "fat": 18.0 },
          "macros": { "calories": 18, "protein": 0.1, "carbs": 0.3, "fat": 1.8 }
        }
      ]
    }
  ]
}

היררכיית אמת, זיהוי טבלאות ערכים ודיוק מחייבת (חובה לקיים בסדר הבא!):
0. **סיווג אוטומטי של צלחת מול טבלת ערכים + הבהרה אך ורק בעת הצורך:**
   - זהה עבור כל תמונה אוטומטית אם זו **צלחת/מאכל** או **טבלת ערכים תזונתיים**.
   - אם בתמונה מופיעה **טבלת ערכים תזונתיים**:
     * אם המשתמש כבר הזין עבור התמונה שם מוצר (תחת "שייך למוצר שהזין המתאמן") או ששם המותג/המוצר ברור מהאריזה או מהקשר הטקסט — חלץ את הערכים המדויקים ל-100 גרם/מנה, הכפל בכמות הסבירה/מדווחת וכלול ישירות ב-"items" (ואל תשאל שאלת הבהרה).
     * אם לא צוין שם מוצר על התווית ואין בתמונה/טקסט אינדיקציה ברורה *של איזה מוצר הטבלה* (או למה בצלחת היא מתייחסת) — **אל תנחש סתם ואל תכניס קלוריות שגויות ל-"items"**! הכנס ל-"items" רק את הפריטים הברורים האחרים (אם קיימים), והחזר שאלה ב-"clarificationQuestions" עם 2–4 אפשרויות סבירות + הערכים שחולצו מהטבלה ב-"per100gEstimate". (החזר clarificationQuestions ריק [] כשהכל ברור).
1. **פיצול מנות מורכבות למרכיבים (\`components\`) — רמה 3 מקסימום (תקף גם ל-"items" וגם ל-"suggestedExtras"!):**
   - כאשר המנה בצלחת (בין אם ב-"items" ובין אם בהצעה ב-"suggestedExtras") היא **מנה מעורבת/מורכבת/מבושלת** (כגון מג׳דרה, שקשוקה, מוקפץ, פסטה ברוטב, שניצל מטוגן, סלט ירקות עם תוספות כמו תירס/אבוקדו/זיתים/גבינה/רוטב, כריך, קפה עם חלב) — **לעולם אל תאחד אותה לפריט שטוח בודד ללא פירוט**! החזר אותה כפריט אב אחד (למשל \`"מג׳דרה"\` או \`"סלט ירקות עם תוספות"\`) והכנס ל-\`"components"\` את המרכיבים השונים המרכיבים אותה (למשל אורז מבושל, עדשים ירוקות, בצל מטוגן, שמן בישול; או ירקות טריים, תירס, אבוקדו, זיתים, שמן/רוטב), כך שסכום המשקל והמאקרו של המרכיבים יהיה תואם לסך המנה.
   - פריט פשוט, שלם או ארוז (בננה, ביצה קשה, גביע קוטג׳, תפוח, פיתה ריקה) נשאר פריט שטוח **ללא \`components\`**. אסור לקנן \`components\` בתוך \`components\`.
2. **איחוד תבלינים ושקיפות שמן בישול vs רטבים:**
   - תבלינים זניחים (מלח, פלפל, מעט עשבי תיבול) שסכומם המצטבר מתחת ל־**10 קק״ל** במנה — **אל תוסיף שורה עבורם**.
   - אם סך התבלינים במנה הוא **10 קק״ל ומעלה** — אחד את כולם לשורת מרכיב **אחת בלבד** עם \`name: "תבלינים"\`, \`componentRole: "spice-group"\`, ורשימת השמות במערך \`"spiceDetails": ["פפריקה", "כמון", ...]\`.
   - **שמן בישול / טיגון נפרד מרטבים:** במנות שרואים בהן טיגון, השחמה או בישול משומן (בצל מטוגן במג׳דרה, שניצל מטוגן פריך, חביתה, מוקפץ), הצג במפורש מרכיב \`componentRole: "cooking-oil"\` ו-\`inputConfidence: "visual-estimate"\` (כדי שהמשתמש יראה וידייק את הגרמים או ימחק אם אפוי/ספריי) — אלא אם צוין מפורשות \`ללא שמן בכלל\` / \`אפוי בתנור\`.
3. טקסט ומשקלים שכתב המתאמן גוברים על הראייה הממוחשבת (Text Overrides Pixels!):
   - כל שם מאכל, שיטת הכנה (אפוי / צלוי / מבושל / מטוגן) ומשקל מפורש בגרם/יחידות שהמתאמן כתב הם **עובדה מוחלטת** (\`fromUserText: true\`, \`inputConfidence: "reported"\`).
   - **לעולם אל תשנה גרמים** שדווחו מפורשות עבור פריט, **לעולם אל תשמיט פריט** שהמתאמן ציין, ו**לעולם אל תחליף פריט מדווח בפריט אחר** בגלל צבע/מראה דומה.
   - אם המתאמן ציין פריט בשם בלבד *ללא משקל*, הערך את הגרמים שלו מהתמונה ומכלי ההגשה. אם ניתן משקל נטו כולל של המנה ("netFoodWeightGrams"), שמור גרמים מפורשים כפי שהם והתאם רק את הפריטים חסרי המשקל לסה"כ הנטו.
4. מדיניות פריטים נוספים שלא הוזכרו בטקסט (strict vs hybrid):
   - אם "strictUserList=true": המתאמן אישר כי פירט הכל. החזר ב-"items" **אך ורק** את הפריטים שצוינו בטקסט, והחזר "suggestedExtras": [] (מערך ריק).
   - אם המתאמן כתב תיאור ארוחה חלקי (ללא strictUserList=true): הכנס ל-"items" את כל הפריטים שציין בטקסט במדויק ("fromUserText": true). אם אתה מזהה בתמונה *בביטחון גבוה* רכיב או מנה נפרדת נוספת ש*אינה* אחד המרכיבים שהמתאמן כבר הזכיר (ושלא נחשב כשמן טיגון של מנה קיימת), הוסף אותו אך ורק ל-"suggestedExtras" עם הסבר קצר ב-"visualReason". **חובה**: אם ההצעה ב-"suggestedExtras" מורכבת מכמה מרכיבים (למשל סלט עם תירס/אבוקדו/זיתים/גבינה/רוטב, טוסט או שייק), פרט אותם בתוך \`"components"\` של אותו פריט (בדיוק לפי כלל 1, עם שם, גרם, \`per100g\` ו-\`macros\` לכל תת־מרכיב) כדי שהמתאמן יוכל לפתוח ולערוך כל מרכיב בנפרד!
   - אם המתאמן לא כתב תיאור רכיבים כלל (תמונה בלבד): הכנס את כל המנות והמרכיבים ל-"items" ואת "suggestedExtras": [].
5. דיוק נפח וזוויות צילום (כשמצורפות תמונות):
   - 2 תמונות (מלמעלה + ~45°): למעלה לשטח/קוטר ומהצד לגובה/עובי; קזז אפקט זווית וקח בחשבון Packing Fraction.
6. חישוב "per100g", נוזלים, אלכוהול ומצב הכנה מוכן לאכילה:
   - עבור כל פריט/מרכיב, ציין ערכים ל-100 גרם לפי מצב ההכנה *המוכן* (אורז *מבושל* ~130 קק"ל ל-100g ולא יבש ~360 קק"ל; שניצל *אפוי* ~165 קק"ל ולא מטוגן ~225 קק"ל), וחשב "macros" כ-"per100g * (grams / 100)" בהתאמה לנתוני משרד הבריאות / מוצרים ישראליים.
   - במשקאות אלכוהוליים (יין ~83-85 קק"ל/100g, בירה ~43 קק"ל/100g), שמור את הקלוריות הכוללות גם של האלכוהול (~7 קק"ל/גרם אלכוהול).`;

      const parts: GeminiPart[] = [{ text: systemInstruction }];

      if (textPrompt && textPrompt.trim()) {
        parts.push({
          text: `רשימת המאכלים והפירוט שכתב המתאמן (עובדת בסיס קשיחה — אל תשנה שמות, שיטות הכנה או גרמים שצוינו כאן!):\n"${textPrompt.trim()}"`,
        });
      }
      if (contextBlock) {
        parts.push({ text: `פרמטרי דיוק שנבחרו ע"י המתאמן:\n${contextBlock}` });
      }
      if (traineeProfileContextC) {
        parts.push({ text: traineeProfileContextC });
      }
      if (mealTimelineC) {
        parts.push({
          text: `הקשר רציף והיסטוריית הארוחה עד כה (אל תכפיל פריטים שכבר רשומים ביומן אלא אם המתאמן ביקש לשנות/לתקן!):\n${mealTimelineC}`,
        });
      }
      if (priorityCustomCatalog.length > 0) {
        parts.push({
          text: `מוצרים אישיים מוגדרים של המשתמש (עדיפות עליונה לשמות ולערכי המאקרו אם מוזכרים או תואמים!): ${priorityCustomCatalog
            .slice(0, 35)
            .map(
              (cf) =>
                `${cf.name} (${Math.round(cf.per100g.calories)} קק״ל/100g, ח:${cf.per100g.protein}, פ:${cf.per100g.carbs}, ש:${cf.per100g.fat})`
            )
            .join(' | ')}`,
        });
      }
      validatedImages.forEach((img, idx) => {
        parts.push({ text: `תמונה ${idx + 1}: ${img.angleLabel}` });
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });
      prevPhotosForComparison.forEach((pUrl, idx) => {
        const m = pUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (m) {
          parts.push({
            text: `תמונה קודמת מהארוחה #${idx + 1} להשוואה בלבד (כבר נספרה ביומן — אין להוסיף שוב אלא רק אם נדרש לתקן):`,
          });
          parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
        }
      });

      const res = await callGeminiStructured(apiKey, parts, {
        perAttemptTimeoutMs: 28_000,
        fallbackAttemptTimeoutMs: 23_500,
        totalBudgetMs: 120_000,
        shouldCancel: checkBgJobCancelled,
        onAttemptModel: (m, _idx, meta) =>
          updateBgJobStage(
            meta?.isRetry
              ? `עומס זמני במודל ${m} — מנסה שוב אוטומטית...`
              : `מפענח מרכיבים, תוויות וכמויות מול מודל ${m}...`
          ),
      });
      if (res.cancelled) {
        return NextResponse.json({ cancelled: true, items: [] });
      }
      const rawQuestions = Array.isArray(res.parsed?.clarificationQuestions)
        ? (res.parsed!.clarificationQuestions as Record<string, unknown>[])
        : [];
      const clarificationQuestions: AiClarificationQuestion[] = rawQuestions
        .map((rq, idx): AiClarificationQuestion | null => {
          const questionText = sanitizeText(rq?.questionText, 180);
          const extractedTableSummary =
            sanitizeText(rq?.extractedTableSummary, 180) || 'נתוני תווית ערכים';
          if (!questionText) return null;
          const pIdxRaw = Number(rq?.photoIndex);
          const photoIndex =
            Number.isFinite(pIdxRaw) && pIdxRaw >= 1 && pIdxRaw <= validatedImages.length
              ? Math.round(pIdxRaw) - 1
              : Math.max(
                  0,
                  validatedImages.findIndex((v) => v.angle === 'label' && !v.labelProductName)
                );
          const targetImg = validatedImages[photoIndex];
          // אם המשתמש כבר מילא שם מוצר ידנית על תמונה זו — מדלגים על שאלת ההבהרה!
          if (targetImg?.labelProductName) return null;
          const suggestedOptions = Array.isArray(rq?.suggestedOptions)
            ? rq.suggestedOptions
                .map((o) => sanitizeText(o, 70))
                .filter(Boolean)
                .slice(0, 4)
            : [];
          const est100 = rq?.per100gEstimate as Record<string, unknown> | undefined;
          const per100gEstimate =
            est100 && typeof est100 === 'object'
              ? {
                  calories: sanitizeNumber(est100.calories, 0, 2000, 150),
                  protein: sanitizeNumber(est100.protein, 0, 100, 5),
                  carbs: sanitizeNumber(est100.carbs, 0, 100, 15),
                  fat: sanitizeNumber(est100.fat, 0, 100, 5),
                }
              : undefined;
          return {
            id: `cq-${Date.now().toString(36)}-${idx}`,
            photoIndex,
            photoHash: targetImg?.hash,
            extractedTableSummary,
            questionText,
            suggestedOptions,
            allowCustomOther: true,
            defaultGramsHint: sanitizeNumber(rq?.defaultGramsHint, 1, 2000, 100),
            per100gEstimate,
          };
        })
        .filter((q): q is AiClarificationQuestion => q !== null)
        .slice(0, 2);

      const hasParsedItems =
        Boolean(res.parsed && Array.isArray(res.parsed.items) && res.parsed.items.length > 0);
      if (res.parsed && (hasParsedItems || clarificationQuestions.length > 0)) {
        const modelName = res.modelName || GEMINI_VISION_MODELS[0];
        const { groundAndNormalizeAiItems } = await import('@/lib/aiFoodGrounding');

        const rawItems = hasParsedItems
          ? mapRawGeminiItems(
              res.parsed.items as Record<string, unknown>[],
              sourceType,
              modelName
            )
          : [];

        const existingNamesLower = rawItems.map((i) => i.name.toLowerCase());
        const rawExtras =
          !strictUserList &&
          hasUserText &&
          Array.isArray(res.parsed.suggestedExtras)
            ? mapRawGeminiItems(
                res.parsed.suggestedExtras as Record<string, unknown>[],
                sourceType,
                modelName
              )
                .filter((ex) => {
                  const exLower = ex.name.toLowerCase();
                  return !existingNamesLower.some(
                    (en) => en === exLower || en.includes(exLower) || exLower.includes(en)
                  );
                })
                .slice(0, 6)
            : [];

        const [items, suggestedExtras] = await Promise.all([
          rawItems.length > 0
            ? groundAndNormalizeAiItems(rawItems, priorityCustomCatalog)
            : Promise.resolve([]),
          rawExtras.length > 0
            ? groundAndNormalizeAiItems(rawExtras, priorityCustomCatalog)
            : Promise.resolve([]),
        ]);

        pendingSuggestedExtras = suggestedExtras;
        const syncedJob = await syncAnalyzeResultToServer({
          items,
          clarificationQuestions:
            clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
          engine: res.modelName,
          isAiFallback: false,
        });
        const finalSummary =
          sanitizeText(res.parsed.summary, 240) ||
          (clarificationQuestions.length > 0
            ? 'זוהתה תווית ערכים שממתינה להבהרת מוצר'
            : 'הארוחה פוענחה בהצלחה באמצעות AI');
        pushTraceStep(
          clarificationQuestions.length > 0 ? 'clarification_needed' : 'analyze_done',
          `פוענחו ${items.length} פריטים${
            clarificationQuestions.length > 0
              ? ` · ${clarificationQuestions.length} שאלות הבהרה`
              : ''
          }`,
          'ok'
        );
        persistAiTrace({
          queueType: 'history',
          model: res.modelName,
          clarificationQuestions:
            clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
          parsedItems: items,
          rawResponseSummary: finalSummary,
          targetName: targetTraineeC?.name,
        });
        return NextResponse.json({
          dryRun: isDryRun || undefined,
          stepsTimeline: isDryRun ? aiTraceSteps : undefined,
          items,
          suggestedExtras,
          clarificationQuestions:
            clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
          summary: finalSummary,
          engine: res.modelName,
          isAiFallback: false,
          syncedJob,
        });
      }
      geminiErrorMsg = res.errorMsg || 'מודל Gemini לא החזיר תוצאה';
    }

    const fallbackReason = !apiKey
      ? 'לא הוגדר GEMINI_API_KEY בשרת'
      : geminiErrorMsg || 'מודל Gemini לא החזיר תוצאה';

    // גיבוי טקסטואלי דטרמיניסטי: משלב גם טקסט וגם שדות הקשר (רטבים/שתייה/יחידות מותאמות)
    const combinedFallbackText = [
      textPrompt || '',
      contextParams?.netFoodWeightGrams && contextParams.netFoodWeightGrams > 0
        ? `${Math.round(contextParams.netFoodWeightGrams)} גרם`
        : '',
      contextParams?.portionOrGrams || '',
      contextParams?.saucesAndOils || '',
      contextParams?.drinksAndSides || '',
    ]
      .filter((s) => s && !s.includes('ללא'))
      .join(', ');

    const [cachedPool, sqlFallbackRes] = await Promise.all([
      getMergedCatalogItems().catch(() => ISRAELI_FOOD_CATALOG),
      textPrompt
        ? searchSqlAndCachedCatalog({ query: textPrompt.slice(0, 60), limit: 35 }).catch(() => ({
            items: [] as FoodCatalogItem[],
            sqlCount: 0,
          }))
        : Promise.resolve({ items: [] as FoodCatalogItem[], sqlCount: 0 }),
    ]);
    const mergedCatalogPool = [
      ...priorityCustomCatalog,
      ...sqlFallbackRes.items,
      ...cachedPool,
    ];
    let items = smartHebrewMealParser(
      combinedFallbackText,
      sourceType,
      contextParams?.customUnits,
      mergedCatalogPool
    ).map((it) => ({
      ...it,
      aiEngine: 'smart-hebrew-builtin',
      isAiFallback: true,
      fallbackReason,
    }));

    // אם המתאמן הזין משקל מנה נטו או בחר כלי מוגדר עם משקל ברירת מחדל ויש מרכיב מרכזי אחד ללא משקל מפורש — הצמד משקל
    if (
      items.length === 1 &&
      !(textPrompt && /\d+\s*(?:גרם|ג'|g)/i.test(textPrompt)) &&
      ((contextParams?.netFoodWeightGrams && contextParams.netFoodWeightGrams > 0) ||
        contextParams?.servingToolLabel)
    ) {
      const catMatch = mergedCatalogPool.find((c) => c.name === items[0].name);
      const customGrams = contextParams?.portionOrGrams?.match(/(\d+)\s*(?:גרם|g)/i)?.[1];
      const toolGrams =
        contextParams?.netFoodWeightGrams && contextParams.netFoodWeightGrams > 0
          ? Math.round(contextParams.netFoodWeightGrams)
          : customGrams
          ? Number(customGrams)
          : undefined;
      if (catMatch && toolGrams && toolGrams > 0) {
        const labelPrefix = contextParams?.servingToolLabel
          ? contextParams.servingToolLabel
          : 'משקל מנה מדווח';
        items = [
          {
            ...items[0],
            grams: toolGrams,
            unitLabel: `${labelPrefix} (${toolGrams} גרם)`,
            macros: calculateMacrosForGrams(catMatch.per100g, toolGrams),
          },
        ];
      }
    }

    if (items.length > 0) {
      const syncedJob = await syncAnalyzeResultToServer({
        items,
        engine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
      });
      const fbSummary = apiKey
        ? `מנוע התמונות לא הגיב כרגע — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`
        : `מנוע התמונות אינו זמין ללא מפתח Gemini בשרת — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`;
      pushTraceStep('fallback', `זיהוי גיבוי מקומי (${fallbackReason})`, 'warn');
      persistAiTrace({
        queueType: 'history',
        model: 'smart-hebrew-builtin',
        parsedItems: items,
        rawResponseSummary: fbSummary,
        targetName: targetTraineeC?.name,
      });
      return NextResponse.json({
        dryRun: isDryRun || undefined,
        stepsTimeline: isDryRun ? aiTraceSteps : undefined,
        items,
        summary: fbSummary,
        engine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
        syncedJob,
      });
    }

    const errMsg = apiKey
      ? `מנוע זיהוי התמונות של AI נכשל זמנית (${geminiErrorMsg || 'נסה שוב'}). ניתן לתאר את הארוחה במילים (למשל: "פסטה 200 גרם") או לחפש במאגר.`
      : 'לזיהוי מתמונה בלבד נדרש חיבור מפתח GEMINI_API_KEY תקף בשרת. כתוב שם מאכל (למשל: "פסטה") או הוסף ממאגר המזון.';

    const crashStage = apiKey ? 'vision_api' : 'validation';
    pushTraceStep('failed', errMsg, 'error');
    const syncedJob = await syncAnalyzeResultToServer({
      items: [],
      errorMsg: errMsg,
      errorStage: crashStage,
    });
    persistAiTrace({
      queueType: 'crashed',
      crashStage,
      errorCode: 'ANALYZE_FAILED',
      errorMessage: errMsg,
      targetName: targetTraineeC?.name,
    });

    return NextResponse.json(
      {
        error: errMsg,
        syncedJob,
        stepsTimeline: isDryRun ? aiTraceSteps : undefined,
      },
      { status: 422 }
    );
    };

    const workPromise = (async () => {
      try {
        return await executeAnalyzePipeline();
      } catch (pipelineErr) {
        console.error('Execute analyze pipeline error:', pipelineErr);
        const crashMsg =
          pipelineErr instanceof Error
            ? pipelineErr.message
            : 'שגיאת שרת פנימית בלתי צפויה';
        pushTraceStep('crash', crashMsg, 'error');
        const failedJob = await syncAnalyzeResultToServer({
          items: [],
          errorMsg: 'הפענוח הופסק עקב שגיאת שרת זמנית — ניתן לנסות שוב.',
          errorStage: 'parser',
        }).catch(() => undefined);
        persistAiTrace({
          queueType: 'crashed',
          crashStage: 'parser',
          errorCode: 'PIPELINE_EXCEPTION',
          errorMessage: crashMsg,
        });
        return NextResponse.json(
          { error: 'שגיאה בפענוח הארוחה', syncedJob: failedJob },
          { status: 500 }
        );
      }
    })();
    try {
      waitUntil(workPromise.then(() => undefined).catch(() => undefined));
    } catch {
      // בסביבת Node רגילה מחוץ ל-Vercel waitUntil אינו פעיל
    }
    return await workPromise;
  } catch (error) {
    console.error('AI analyze error:', error);
    ctx.setErrorCode('AI_ANALYZE_ERROR', error instanceof Error ? error.message : '');
    return NextResponse.json({ error: 'שגיאה בפענוח הארוחה' }, { status: 500 });
  }
  })();

  return await finalizeAiRouteResponse(ctx, response, {
    endpoint: 'analyze-meal',
    defaultMode: telemetryMode,
    targetTraineeId: telemetryTargetTraineeId,
    imageCount: telemetryImageCount,
    totalImageKB: telemetryImageKB,
    durationMs: Date.now() - aiStartedAt,
  });
});
