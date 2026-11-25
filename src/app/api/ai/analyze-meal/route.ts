import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { ISRAELI_FOOD_CATALOG, calculateMacrosForGrams } from '@/data/israeliFoodCatalog';
import {
  getMergedCatalogItems,
  searchSqlAndCachedCatalog,
} from '@/lib/scrapers/scraperStore';
import {
  AiContextParams,
  FoodCatalogItem,
  LoggedFoodItem,
  PendingAiMealJob,
  ReferenceObjectKind,
  ServingToolKind,
  TraineeCustomUnit,
} from '@/types/nutrition';
import {
  checkRateLimit,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { authenticateActiveSession } from '@/lib/liveAuth';
import {
  canCoachAccessTrainee,
  getSingleTraineeFromServer,
  updateServerDbState,
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
  sendUnifiedPushToTrainee,
  shouldNotifyUnifiedAiCompletion,
  stripDeadPushTargetsFromTrainee,
} from '@/lib/pushDispatcher';
import {
  buildMealAlertEvent,
  notifySubscribedCoachesForEvents,
} from '@/lib/coachAlertEngine';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';
import { finalizeAiRouteResponse } from '@/lib/telemetry/aiTelemetry';

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
        .replace(/(?:גרם|ק"ג|יחידות|יחידה|כוסות|כוס|כפות|כף|פרוסות|פרוסה|גביע|חצי)/g, '')
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

    // בדיקה אם צוין משקל מפורש בגרמים (למשל "200 גרם פסטה")
    const gramsMatch = seg.match(/(\d+)\s*(?:גרם|ג'|ג׳|gr|g)/i);
    if (gramsMatch) {
      const explicitGrams = Number(gramsMatch[1]);
      matchedItems.push({
        id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: catalogItem.name,
        unitLabel: `${explicitGrams} גרם`,
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

function extractValidatedImages(
  imageDataUrl?: string,
  imageDataUrls?: string[],
  imageAngles?: ('top-down' | 'side-45' | 'label' | 'other')[]
): { mimeType: string; data: string; angleLabel: string }[] {
  const rawList = Array.isArray(imageDataUrls) && imageDataUrls.length > 0
    ? imageDataUrls
    : imageDataUrl
    ? [imageDataUrl]
    : [];

  const angleMap: Record<string, string> = {
    'top-down': 'צילום 90° ישירות מלמעלה (קובע קוטר שוליים ושטח)',
    'side-45': 'צילום פרופיל/צד 35°-45° (קובע גובה, עומק ונפח תלת-ממדי)',
    label: 'צילום תווית / טבלת ערכים תזונתיים',
    other: 'זווית צילום נוספת',
  };

  const out: { mimeType: string; data: string; angleLabel: string }[] = [];
  for (let i = 0; i < Math.min(rawList.length, 3); i++) {
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
    const angleKey = imageAngles?.[i] || (i === 0 ? 'top-down' : i === 1 ? 'side-45' : 'other');
    out.push({
      mimeType: match[1],
      data: match[2],
      angleLabel: angleMap[angleKey] || `תמונה ${i + 1}`,
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
  lines.push(
    `- שומנים נסתרים / רטבים: ${
      ctx.saucesAndOils && ctx.saucesAndOils.trim()
        ? ctx.saucesAndOils.trim()
        : 'ללא תוספת שמן/רטבים נסתרים (אלא אם נראה בבירור בתמונה)'
    }`
  );
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
  return lines.join('\n');
}

function mapRawGeminiItems(
  rawItems: Record<string, unknown>[],
  sourceType: 'ai-photo' | 'ai-text',
  modelName: string
): LoggedFoodItem[] {
  return rawItems.map((it, idx) => {
    const macros = (it.macros as Record<string, number>) || {};
    const rawPer100 = (it.per100g as Record<string, number>) || null;
    const grams = sanitizeNumber(it.grams, 1, 5000, 100);
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
    return {
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
      fromUserText: typeof it.fromUserText === 'boolean' ? it.fromUserText : undefined,
      visualReason,
    };
  });
}

function adjustMealFallback(
  baseItems: LoggedFoodItem[],
  adjustmentPrompt: string
): LoggedFoodItem[] {
  const cleanPrompt = adjustmentPrompt.trim();
  const gramsOverride = cleanPrompt.match(/(\d+)\s*(?:גרם|ג'|ג׳|g)/i);
  const withoutMatch = cleanPrompt.match(/בלי\s+([^\s,]+)/i);
  let next = [...baseItems];

  if (withoutMatch) {
    const keyword = withoutMatch[1].toLowerCase();
    next = next.filter((it) => !it.name.toLowerCase().includes(keyword));
  }

  if (gramsOverride && next.length > 0) {
    const newGrams = sanitizeNumber(gramsOverride[1], 1, 5000, next[0].grams);
    // התאם את הרכיב העיקרי (או הרכיב שמוזכר בטקסט)
    let targetIdx = next.findIndex((it) =>
      cleanPrompt.toLowerCase().includes(it.name.toLowerCase().split(' ')[0])
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

    // 2. הגנת Rate-Limit על מכסת ה-AI (עד 50 קריאות בשעה למשתמש)
    const rl = checkRateLimit(`ai-${sessionUser.id}`, 50, 3600);
    if (!rl.allowed) {
      ctx.setErrorCode('RATE_LIMITED', 'מכסת AI שעתית מוצתה');
      return NextResponse.json(
        { error: 'הגעת למכסת פענוחי ה-AI לשעה זו. ניתן להזין מוצרים מהמאגר.' },
        { status: 429 }
      );
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
      adjustmentPrompt,
      backgroundJob,
    } = body as {
      mode?: 'analyze' | 'adjust-meal' | 'measure-tool' | 'transcribe-audio';
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
      adjustmentPrompt?: string;
      backgroundJob?: {
        jobId: string;
        traineeId: string;
        date: string;
        mealSlotId: string;
        mealSlotName: string;
        mode?: 'photo' | 'text';
        summaryHint?: string;
      };
    };
    telemetryMode = mode;
    if (backgroundJob?.traineeId) {
      telemetryTargetTraineeId = backgroundJob.traineeId;
    }

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
      contextParams?.imageAngles
    );
    const hasRealImage = validatedImages.length > 0;
    const sourceType: 'ai-photo' | 'ai-text' = hasRealImage ? 'ai-photo' : 'ai-text';
    telemetryMode = mode;
    telemetryTargetTraineeId = backgroundJob?.traineeId || sessionUser.id;
    telemetryImageCount = validatedImages.length;
    telemetryImageKB = Math.round(
      validatedImages.reduce((acc, im) => acc + ((im.data?.length || 0) * 0.75) / 1024, 0)
    );

    // 3ב. אם הבקשה כוללת סנכרון ברקע (backgroundJob): רשום סטטוס "processing" ב-DB מראש
    let authorizedBgJob: PendingAiMealJob | null = null;
    let pendingSuggestedExtras: LoggedFoodItem[] = [];
    if (backgroundJob?.jobId && backgroundJob?.traineeId && backgroundJob?.date && backgroundJob?.mealSlotId) {
      const targetTrainee = await getSingleTraineeFromServer(backgroundJob.traineeId);
      const isAllowedTarget =
        targetTrainee &&
        (sessionUser.role === 'trainee'
          ? targetTrainee.id === sessionUser.id
          : canCoachAccessTrainee(sessionUser, targetTrainee));

      if (!isAllowedTarget) {
        return NextResponse.json(
          { error: 'אין הרשאה לסנכרן משימת AI למתאמן זה' },
          { status: 403 }
        );
      }

      const startNowIso = new Date().toISOString();
      authorizedBgJob = {
        id: sanitizeText(backgroundJob.jobId, 60),
        targetTraineeId: backgroundJob.traineeId,
        date: sanitizeText(backgroundJob.date, 20),
        mealSlotId: sanitizeText(backgroundJob.mealSlotId, 60),
        mealSlotName: sanitizeText(backgroundJob.mealSlotName, 60) || 'ארוחה',
        mode: backgroundJob.mode === 'text' ? 'text' : 'photo',
        summaryHint: sanitizeText(backgroundJob.summaryHint || textPrompt || '', 80) || undefined,
        status: 'processing',
        startedAt: startNowIso,
        lastHeartbeatAt: startNowIso,
        stageText: hasRealImage
          ? 'המשימה נרשמה בשרת — מכין תמונות למודל ה-AI...'
          : 'המשימה נרשמה בשרת — פונה למודל ה-AI...',
        acknowledged: false,
      };

      let wasPreCancelled = false;
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== authorizedBgJob!.targetTraineeId) return t;
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
        }),
      }));

      if (wasPreCancelled) {
        return NextResponse.json({ cancelled: true, items: [] });
      }
    }

    const checkBgJobCancelled = async (): Promise<boolean> => {
      if (!authorizedBgJob) return false;
      try {
        const latest = await getSingleTraineeFromServer(authorizedBgJob.targetTraineeId);
        const match = latest?.pendingAiJobs?.find((j) => j.id === authorizedBgJob!.id);
        return Boolean(match && match.acknowledged);
      } catch {
        return false;
      }
    };

    const updateBgJobStage = async (stageText: string): Promise<void> => {
      if (!authorizedBgJob) return;
      const hbIso = new Date().toISOString();
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== authorizedBgJob!.targetTraineeId) return t;
          const target = (t.pendingAiJobs || []).find((j) => j.id === authorizedBgJob!.id);
          if (!target || target.status !== 'processing' || target.acknowledged) {
            return t;
          }
          return {
            ...t,
            pendingAiJobs: (t.pendingAiJobs || []).map((j) =>
              j.id === authorizedBgJob!.id
                ? { ...j, lastHeartbeatAt: hbIso, stageText }
                : j
            ),
          };
        }),
      })).catch(() => {});
    };

    const syncAnalyzeResultToServer = async (params: {
      items?: LoggedFoodItem[];
      engine?: string;
      isAiFallback?: boolean;
      fallbackReason?: string;
      errorMsg?: string;
    }): Promise<PendingAiMealJob | undefined> => {
      if (!authorizedBgJob) return undefined;
      const nowIso = new Date().toISOString();
      const nowTime = new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const sanitizedPhotos: string[] = hasRealImage
        ? [
            ...(Array.isArray(imageDataUrls) ? imageDataUrls : []),
            ...(imageDataUrl ? [imageDataUrl] : []),
          ]
            .filter(
              (u): u is string =>
                typeof u === 'string' &&
                u.startsWith('data:image/') &&
                u.length < 400000
            )
            .filter((u, idx, arr) => arr.indexOf(u) === idx)
            .slice(0, 3)
        : [];

      const succeeded = Array.isArray(params.items) && params.items.length > 0;
      const finishedJob: PendingAiMealJob = {
        ...authorizedBgJob,
        status: succeeded ? 'completed' : 'failed',
        lastHeartbeatAt: nowIso,
        stageText: succeeded ? 'הושלם וסונכרן ליומן' : 'הפענוח נכשל',
        completedAt: nowIso,
        engine: params.engine,
        isAiFallback: params.isAiFallback,
        fallbackReason: params.fallbackReason,
        itemsCount: succeeded ? params.items!.length : 0,
        errorMsg: params.errorMsg,
        photoDataUrls: sanitizedPhotos.length > 0 ? sanitizedPhotos : undefined,
        autoSyncedToLog: succeeded,
        acknowledged: false,
      };

      let cancelledBeforeSave = false;
      const updatedState = await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== authorizedBgJob!.targetTraineeId) return t;
          const cleaned = normalizePendingAiJobs(t.pendingAiJobs).jobs;
          const existingSelf = cleaned.find((j) => j.id === finishedJob.id);
          if (existingSelf?.acknowledged) {
            cancelledBeforeSave = true;
            return { ...t, pendingAiJobs: cleaned };
          }
          const nextJobs = existingSelf
            ? cleaned.map((j) => (j.id === finishedJob.id ? finishedJob : j))
            : [finishedJob, ...cleaned].slice(0, 12);

          if (!succeeded) {
            return { ...t, pendingAiJobs: nextJobs };
          }

          const dateKey = finishedJob.date;
          const existingLog = t.logs[dateKey] || {
            date: dateKey,
            dayType: 'workout' as const,
            waterCups: 0,
            waterGoal: 12,
            weightKg: t.currentWeight,
            meals: {},
          };
          const existingMeal = existingLog.meals[finishedJob.mealSlotId] || {
            mealSlotId: finishedJob.mealSlotId,
            items: [],
            updatedAt: nowTime,
          };

          const existingPhotos =
            Array.isArray(existingMeal.photoDataUrls) && existingMeal.photoDataUrls.length > 0
              ? existingMeal.photoDataUrls
              : existingMeal.photoDataUrl
              ? [existingMeal.photoDataUrl]
              : [];
          const mergedPhotos = [...sanitizedPhotos, ...existingPhotos]
            .filter((u, i, arr) => arr.indexOf(u) === i)
            .slice(0, 3);

          return {
            ...t,
            pendingAiJobs: nextJobs,
            logs: {
              ...t.logs,
              [dateKey]: {
                ...existingLog,
                meals: {
                  ...existingLog.meals,
                  [finishedJob.mealSlotId]: {
                    ...existingMeal,
                    items: [...existingMeal.items, ...params.items!],
                    aiSuggestedExtras:
                      pendingSuggestedExtras.length > 0
                        ? pendingSuggestedExtras
                        : existingMeal.aiSuggestedExtras,
                    photoDataUrl: sanitizedPhotos[0] || existingMeal.photoDataUrl,
                    photoDataUrls: mergedPhotos.length > 0 ? mergedPhotos : undefined,
                    photoNote:
                      existingMeal.photoNote ||
                      (textPrompt ? sanitizeText(textPrompt, 500) : undefined),
                    updatedAt: nowTime,
                  },
                },
              },
            },
          };
        }),
      }));

      // פוש אוטומטי למתאמן (רק ביציאה) + התראה למאמנים עוקבים (ברגע השמירה)
      if (succeeded && !cancelledBeforeSave) {
        const latestTrainee = updatedState.trainees.find(
          (t) => t.id === authorizedBgJob!.targetTraineeId
        );
        if (latestTrainee) {
          const itemsList = params.items!;
          const tasks: Promise<unknown>[] = [];

          // 1. התראת מאמן בזמן אמת (למאמנים העוקבים אחרי מתאמן זה / קבוצתו על ארוחות)
          if (sessionUser.role === 'trainee') {
            const mealEvent = buildMealAlertEvent({
              slotName: finishedJob.mealSlotName || finishedJob.mealSlotId,
              items: itemsList,
              date: finishedJob.date,
            });
            tasks.push(
              notifySubscribedCoachesForEvents({
                trainee: latestTrainee,
                events: [mealEvent],
                origin: request.nextUrl.origin,
              }).catch((err) =>
                console.error('AI meal coach alert error:', err)
              )
            );
          }

          // 2. פוש למתאמן עצמו (רק אם יצא מהאפליקציה בזמן הטעינה)
          if (shouldNotifyUnifiedAiCompletion(latestTrainee)) {
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
              itemsList.reduce(
                (sum, i) => sum + (Number(i.macros?.calories) || 0),
                0
              )
            );

            tasks.push(
              sendUnifiedPushToTrainee(latestTrainee, {
                pushId: finishedJob.id,
                title: `זיהוי ${finishedJob.mealSlotName} הושלם ✨`,
                body: `זיהוי הארוחה הושלם: "${dishLabel} (${totalCalories} קלוריות)"`,
                kind: 'ai-meal',
                screen: 'meal',
                mealSlotId: finishedJob.mealSlotId,
                date: finishedJob.date,
                origin: request.nextUrl.origin,
              })
                .then(async (sendRes) => {
                  if (
                    sendRes &&
                    (sendRes.invalidFcmTokens.length > 0 ||
                      sendRes.expiredWebEndpoints.length > 0)
                  ) {
                    await updateServerDbState((prev) => ({
                      ...prev,
                      trainees: prev.trainees.map((t) =>
                        t.id === latestTrainee.id
                          ? stripDeadPushTargetsFromTrainee(
                              t,
                              sendRes.invalidFcmTokens,
                              sendRes.expiredWebEndpoints
                            )
                          : t
                      ),
                    })).catch(() => {});
                  }
                })
                .catch(() => {})
            );
          }

          if (tasks.length > 0) {
            await Promise.all(tasks);
          }
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

      const contextBlock = formatContextParamsPrompt(contextParams);
      let geminiErrorMsg = '';
      if (apiKey) {
        const adjustInstruction = `אתה תזונאי קליני וספורט מומחה בישראל.
המתאמן מבקש לתקן או לעדכן ארוחה שכבר פוענחה.
מרכיבי הבסיס הקיימים כרגע (JSON):
${JSON.stringify(cleanBaseItems)}

${cleanAdjustment ? `הוראת התיקון של המתאמן (עובדה מחייבת — עדיפות עליונה!): "${cleanAdjustment}"` : ''}
${contextBlock ? `\nנתוני הקשר של הארוחה:\n${contextBlock}` : ''}

כללי חובה בעת תיקון:
1. שמור את כל המרכיבים שהמתאמן לא ביקש לשנות/להסיר עם השם, הגרמים והמאקרו המקוריים שלהם ללא פגיעה.
2. אם המתאמן ציין שם מאכל מתוקן, שיטת הכנה (אפוי/מבושל/מטוגן) או משקל מפורש בגרמים — אלה נתוני אמת נעולים! לעולם אל תחליף או תשנה אותם למספר אחר.
3. לכל פריט חדש או מעודכן, ספק "per100g" לפי מצב ההכנה המוכן והמדויק בישראל (כגון אורז מבושל ~130 קק"ל, כבד עוף אפוי ~172 קק"ל, שניצל אפוי ~165 קק"ל), וחשב את "macros" לפי grams * per100g / 100.
4. אם המתאמן ביקש להסיר פריט — הסר אותו לחלוטין מהמערך.

החזר JSON תקני בלבד:
{
  "summary": "סיכום קצר בעברית של מה שתוקן",
  "items": [
    {
      "name": "שם המאכל בעברית",
      "unitLabel": "תיאור יחידה ומשקל",
      "quantity": 1,
      "grams": 150,
      "fromUserText": true,
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

        const res = await callGeminiStructured(apiKey, parts);
        if (res.parsed && Array.isArray(res.parsed.items) && res.parsed.items.length > 0) {
          const { groundAndNormalizeAiItems } = await import('@/lib/aiFoodGrounding');
          const rawMapped = mapRawGeminiItems(
            res.parsed.items as Record<string, unknown>[],
            sourceType,
            res.modelName || GEMINI_VISION_MODELS[0]
          );
          const items = await groundAndNormalizeAiItems(rawMapped);
          return NextResponse.json({
            items,
            summary:
              sanitizeText(res.parsed.summary, 240) ||
              'הארוחה עודכנה בהצלחה לפי בקשתך',
            engine: res.modelName,
            isAiFallback: false,
          });
        }
        geminiErrorMsg = res.errorMsg || 'מודל Gemini לא החזיר תוצאה';
      }

      const fallbackReason = !apiKey
        ? 'לא הוגדר GEMINI_API_KEY בשרת'
        : geminiErrorMsg || 'מודל Gemini לא החזיר תוצאה';

      const adjusted = adjustMealFallback(cleanBaseItems, cleanAdjustment).map(
        (it) => ({
          ...it,
          aiEngine: 'smart-hebrew-builtin',
          isAiFallback: true,
          fallbackReason,
        })
      );

      return NextResponse.json({
        items: adjusted,
        summary: `הארוחה הותאמה דטרמיניסטית (${adjusted.length} מרכיבים).`,
        engine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
      });
    }

    // =========================================================================
    // מצב C (ברירת מחדל): ניתוח תמונות מרובות + הקשר מדויק + טקסט
    // =========================================================================
    const contextBlock = formatContextParamsPrompt(contextParams);
    const hasUserText = Boolean(textPrompt && textPrompt.trim().length >= 2);
    const strictUserList = Boolean(contextParams?.strictUserList);
    let geminiErrorMsg = '';
    if (apiKey) {
      const systemInstruction = `אתה תזונאי קליני וספורט מומחה בישראל עם התמחות בניתוח נפח, זיהוי מנות ישראליות ושמירה קפדנית על דברי המתאמן.
תפקידך לנתח ארוחה מ-1 עד 3 תמונות ו/או מתיאור טקסטואלי בעברית ולהחזיר JSON בלבד במבנה הבא:
{
  "summary": "תיאור קצר בעברית של מה שזוהה והערכת כמות",
  "items": [
    {
      "name": "שם המאכל בעברית",
      "unitLabel": "תיאור היחידה והמשקל, למשל: מנה (150 גרם)",
      "quantity": 1,
      "grams": 150,
      "fromUserText": true,
      "per100g": { "calories": 172, "protein": 25.8, "carbs": 1.1, "fat": 6.4 },
      "macros": { "calories": 258, "protein": 38.7, "carbs": 1.7, "fat": 9.6 }
    }
  ],
  "suggestedExtras": [
    {
      "name": "פריט נוסף שנראה בבירור בתמונה אך לא נכתב בטקסט",
      "unitLabel": "הערכת כמות (למשל כוס סלט / 100 גרם)",
      "quantity": 1,
      "grams": 100,
      "fromUserText": false,
      "visualReason": "זוהה חזותית בצלחת לצד המנות שצוינו",
      "per100g": { "calories": 35, "protein": 1.2, "carbs": 6.5, "fat": 0.3 },
      "macros": { "calories": 35, "protein": 1.2, "carbs": 6.5, "fat": 0.3 }
    }
  ]
}

היררכיית אמת ודיוק מחייבת (חובה לקיים בסדר הבא!):
1. טקסט ומשקלים שכתב המתאמן גוברים על הראייה הממוחשבת (Text Overrides Pixels!):
   - כל שם מאכל, שיטת הכנה (אפוי / צלוי / מבושל / מטוגן) ומשקל מפורש בגרם/יחידות שהמתאמן כתב הם **עובדה מוחלטת**.
   - **לעולם אל תשנה גרמים** שדווחו מפורשות עבור פריט, **לעולם אל תשמיט פריט** שהמתאמן ציין, ו**לעולם אל תחליף פריט מדווח בפריט אחר** בגלל צבע/מראה דומה (למשל: "כבד אפוי" בצבע כהה הוא כבד אפוי — לעולם אל תחליף אותו ב"סלק" או תנחש שהוא משהו אחר!).
   - אם המתאמן ציין פריט בשם בלבד *ללא משקל*, הערך את הגרמים שלו מהתמונה ומכלי ההגשה. אם ניתן משקל נטו כולל של המנה ("netFoodWeightGrams"), שמר גרמים מפורשים כפי שהם והתאם רק את הפריטים חסרי המשקל לסה"כ הנטו.
2. מדיניות פריטים נוספים שלא הוזכרו בטקסט (strict vs hybrid):
   - אם "strictUserList=true": המתאמן אישר כי פירט הכל. החזר ב-"items" **אך ורק** את הפריטים שצוינו בטקסט, והחזר "suggestedExtras": [] (מערך ריק).
   - אם המתאמן כתב תיאור ארוחה חלקי (ללא strictUserList=true): הכנס ל-"items" את כל הפריטים שציין בטקסט במדויק ("fromUserText": true). אם אתה מזהה בתמונה *בביטחון גבוה* רכיב נפרד נוסף ש*אינו* אחד המרכיבים שהמתאמן כבר הזכיר (ושלא נחשב כשמן נסתר), הוסף אותו אך ורק ל-"suggestedExtras" עם הסבר קצר ב-"visualReason" — כדי שהמתאמן יאשר או יסיר אותו בלחיצה!
   - אם המתאמן לא כתב תיאור רכיבים כלל (תמונה בלבד): הכנס את כל רכיבי המנה ל-"items" ואת "suggestedExtras": [].
3. דיוק נפח וזוויות צילום (כשמצורפות תמונות):
   - 2 תמונות (מלמעלה + ~45°): למעלה לשטח/קוטר ומהצד לגובה/עובי.
   - קזז אפקט זווית וקח בחשבון כלי הגשה ו-Packing Fraction (עלים ~0.4, פסטה ~0.65, אורז ~0.85, בשר/מוצק ~0.95).
   - שומנים נסתרים: אם המתאמן הזין ללא תוספת שמן/רטבים, אל תמציא שמן זית/טחינה.
4. חישוב "per100g" ומצב הכנה מוכן לאכילה:
   - עבור כל פריט, ציין ערכים ל-100 גרם לפי המנה *המוכנה* (אורז *מבושל* ~130 קק"ל ל-100g ולא יבש ~360 קק"ל; שניצל *אפוי* ~165 קק"ל ולא מטוגן ~225 קק"ל; כבד עוף *אפוי* ~172 קק"ל), וחשב "macros" כ-"per100g * (grams / 100)" בהתאמה לנתוני משרד הבריאות / מוצרים ישראליים.`;

      const parts: GeminiPart[] = [{ text: systemInstruction }];

      if (textPrompt && textPrompt.trim()) {
        parts.push({
          text: `רשימת המאכלים והפירוט שכתב המתאמן (עובדת בסיס קשיחה — אל תשנה שמות, שיטות הכנה או גרמים שצוינו כאן!):\n"${textPrompt.trim()}"`,
        });
      }
      if (contextBlock) {
        parts.push({ text: `פרמטרי דיוק שנבחרו ע"י המתאמן:\n${contextBlock}` });
      }
      validatedImages.forEach((img, idx) => {
        parts.push({ text: `תמונה ${idx + 1}: ${img.angleLabel}` });
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });

      const res = await callGeminiStructured(apiKey, parts, {
        perAttemptTimeoutMs: 32_000,
        totalBudgetMs: 95_000,
        shouldCancel: checkBgJobCancelled,
        onAttemptModel: (m) =>
          updateBgJobStage(`מפענח מרכיבים וכמויות מול מודל ${m}...`),
      });
      if (res.cancelled) {
        return NextResponse.json({ cancelled: true, items: [] });
      }
      if (res.parsed && Array.isArray(res.parsed.items) && res.parsed.items.length > 0) {
        const modelName = res.modelName || GEMINI_VISION_MODELS[0];
        const { groundAndNormalizeAiItems } = await import('@/lib/aiFoodGrounding');

        const rawItems = mapRawGeminiItems(
          res.parsed.items as Record<string, unknown>[],
          sourceType,
          modelName
        );

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
          groundAndNormalizeAiItems(rawItems),
          rawExtras.length > 0
            ? groundAndNormalizeAiItems(rawExtras)
            : Promise.resolve([]),
        ]);

        pendingSuggestedExtras = suggestedExtras;
        const syncedJob = await syncAnalyzeResultToServer({
          items,
          engine: res.modelName,
          isAiFallback: false,
        });
        return NextResponse.json({
          items,
          suggestedExtras,
          summary:
            sanitizeText(res.parsed.summary, 240) ||
            'הארוחה פוענחה בהצלחה באמצעות AI',
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
    const mergedCatalogPool = [...sqlFallbackRes.items, ...cachedPool];
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
      return NextResponse.json({
        items,
        summary: apiKey
          ? `מנוע התמונות לא הגיב כרגע — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`
          : `מנוע התמונות אינו זמין ללא מפתח Gemini בשרת — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`,
        engine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
        syncedJob,
      });
    }

    const errMsg = apiKey
      ? `מנוע זיהוי התמונות של AI נכשל זמנית (${geminiErrorMsg || 'נסה שוב'}). ניתן לתאר את הארוחה במילים (למשל: "פסטה 200 גרם") או לחפש במאגר.`
      : 'לזיהוי מתמונה בלבד נדרש חיבור מפתח GEMINI_API_KEY תקף בשרת. כתוב שם מאכל (למשל: "פסטה") או הוסף ממאגר המזון.';

    const syncedJob = await syncAnalyzeResultToServer({
      items: [],
      errorMsg: errMsg,
    });

    return NextResponse.json(
      {
        error: errMsg,
        syncedJob,
      },
      { status: 422 }
    );
    };

    const workPromise = (async () => {
      try {
        return await executeAnalyzePipeline();
      } catch (pipelineErr) {
        console.error('Execute analyze pipeline error:', pipelineErr);
        const failedJob = await syncAnalyzeResultToServer({
          items: [],
          errorMsg: 'הפענוח הופסק עקב שגיאת שרת זמנית — ניתן לנסות שוב.',
        }).catch(() => undefined);
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
