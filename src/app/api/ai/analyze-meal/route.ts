import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ISRAELI_FOOD_CATALOG, calculateMacrosForGrams } from '@/data/israeliFoodCatalog';
import { LoggedFoodItem } from '@/types/nutrition';
import {
  checkRateLimit,
  clearSessionCookie,
  getSessionFromRequest,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  getSingleCoachFromServer,
  getSingleTraineeFromServer,
} from '@/lib/serverStore';

function cleanKey(raw?: string): string {
  return (raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]+/g, '')
    .trim();
}

function safeParseGeminiJson(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as Record<string, unknown>;
}

/**
 * מנתח טקסט עברי חכם (גיבוי לזיהוי טקסטואלי כשאין חיבור ל-Gemini)
 * מזהה כמויות ומאכלים מתוך טקסט חופשי בעברית ("2 ביצים, כף טחינה, פסטה")
 */
function smartHebrewMealParser(
  text: string,
  sourceType: 'ai-photo' | 'ai-text'
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
        const directMatch = ISRAELI_FOOD_CATALOG.find((c) =>
          c.name.toLowerCase().includes(cleanedWord)
        );
        matchedCatalogId = directMatch?.id;
      }
    }

    if (!matchedCatalogId) continue;
    if (usedCatalogIds.has(`${matchedCatalogId}-${seg}`)) continue;
    const catalogItem = ISRAELI_FOOD_CATALOG.find((c) => c.id === matchedCatalogId);
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
    const totalGrams = Math.round(baseUnit.grams * multiplier);

    matchedItems.push({
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: catalogItem.name,
      unitLabel:
        multiplier === 1
          ? baseUnit.label
          : `${multiplier} × ${baseUnit.label.replace(/\s*\(\d+\s*גרם\)/, '')} (${totalGrams} גרם)`,
      quantity: multiplier,
      grams: totalGrams,
      macros: calculateMacrosForGrams(catalogItem.per100g, totalGrams),
      source: sourceType,
    });
  }

  return matchedItems;
}

export async function POST(request: NextRequest) {
  try {
    // 0. הגנת CSRF
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
    }

    // 1. אימות סשן חתום קריפטוגרפית בשרת (HttpOnly Cookie)
    const sessionUser = getSessionFromRequest(request);
    if (!sessionUser || sessionUser.status !== 'active') {
      return NextResponse.json(
        { error: 'גישה נדחתה: נדרשת התחברות פעילה למערכת לשימוש ב-AI' },
        { status: 401 }
      );
    }

    // אימות חי מול מסד הנתונים שחשבון המתאמן או המאמן לא הושהה או נמחק
    if (sessionUser.role === 'trainee') {
      const liveTrainee = await getSingleTraineeFromServer(sessionUser.id);
      if (!liveTrainee || liveTrainee.status !== 'active') {
        const res = NextResponse.json(
          { error: 'החשבון אינו פעיל' },
          { status: 403 }
        );
        return clearSessionCookie(res);
      }
    } else if (sessionUser.role === 'coach') {
      const liveCoach = await getSingleCoachFromServer(sessionUser.id);
      if (!liveCoach || liveCoach.status !== 'active') {
        const res = NextResponse.json(
          { error: 'חשבון המאמן מושהה' },
          { status: 403 }
        );
        return clearSessionCookie(res);
      }
    }

    // 2. הגנת Rate-Limit על מכסת ה-AI (עד 25 קריאות בשעה למשתמש)
    const rl = checkRateLimit(`ai-${sessionUser.id}`, 25, 3600);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'הגעת למכסת פענוחי ה-AI לשעה זו. ניתן להזין מוצרים מהמאגר.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { imageDataUrl, textPrompt, customApiKey } = body as {
      imageDataUrl?: string;
      textPrompt?: string;
      customApiKey?: string;
    };

    // 3. בדיקת תקינות וגודל הקלט למניעת הזרקות ועומס
    if (textPrompt && textPrompt.length > 600) {
      return NextResponse.json(
        { error: 'תיאור הארוחה ארוך מדי (מקסימום 600 תווים)' },
        { status: 400 }
      );
    }
    if (imageDataUrl && imageDataUrl.length > 3_500_000) {
      return NextResponse.json(
        { error: 'קובץ התמונה גדול מדי' },
        { status: 400 }
      );
    }

    // שימוש במפתח חיצוני מותר אך ורק אם המשתמש המחובר הוא מנהל ראשי או מאמן
    const safeCustomKey =
      (sessionUser.role === 'admin' || sessionUser.role === 'coach') &&
      customApiKey
        ? cleanKey(customApiKey)
        : '';
    const apiKey = safeCustomKey || cleanKey(process.env.GEMINI_API_KEY);
    const hasRealImage = Boolean(
      imageDataUrl &&
        imageDataUrl.startsWith('data:image/') &&
        !imageDataUrl.endsWith(',DEMO') &&
        imageDataUrl.length > 100
    );
    const sourceType: 'ai-photo' | 'ai-text' = hasRealImage ? 'ai-photo' : 'ai-text';

    // אם הוגדר מפתח Gemini API, נשתמש במודל Vision של Gemini (עם ניסיון גיבוי בין גרסאות Flash)
    let geminiErrorMsg = '';
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      const systemInstruction = `אתה תזונאי קליני וספורט מומחה בישראל.
תפקידך לנתח ארוחה מתמונה ו/או מתיאור טקסטואלי בעברית ולהחזיר אובייקט JSON בלבד במבנה הבא:
{
  "summary": "תיאור קצר בעברית של מה שזוהה בארוחה",
  "items": [
    {
      "name": "שם המאכל בעברית",
      "unitLabel": "תיאור היחידה והמשקל, למשל: יחידה (25 גרם) או מנה (150 גרם)",
      "quantity": 1,
      "grams": 150,
      "macros": {
        "calories": 248,
        "protein": 46.5,
        "carbs": 0,
        "fat": 5.4
      }
    }
  ]
}
הקפד על ערכים תזונתיים מדויקים לפי מוצרים ישראליים (משרד הבריאות, תנובה, שטראוס, אסם וכו'). אם המשתמש ציין הקשר (כמו פסטה, כף שמן זית או אחוז שומן), התחשב בו במדויק.`;

      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
        { text: systemInstruction },
      ];

      if (textPrompt && textPrompt.trim()) {
        parts.push({ text: `תיאור / הערת המתאמן לארוחה: "${textPrompt.trim()}"` });
      }

      if (hasRealImage && imageDataUrl) {
        const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (match) {
          parts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            },
          });
        }
      }

      for (const modelName of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json',
            },
          });

          const result = await model.generateContent(parts);
          const rawText = result.response.text();
          const parsed = safeParseGeminiJson(rawText);

          if (Array.isArray(parsed.items) && parsed.items.length > 0) {
            const items: LoggedFoodItem[] = parsed.items.map(
              (it: Record<string, unknown>, idx: number) => {
                const macros = (it.macros as Record<string, number>) || {};
                const grams = sanitizeNumber(it.grams, 1, 5000, 100);
                return {
                  id: `gemini-${Date.now()}-${idx}`,
                  name: sanitizeText(it.name, 120) || 'פריט מזון',
                  unitLabel:
                    sanitizeText(it.unitLabel, 80) || `${grams} גרם`,
                  quantity: sanitizeNumber(it.quantity, 0.1, 100, 1),
                  grams,
                  macros: {
                    calories: Math.round(
                      sanitizeNumber(macros.calories, 0, 10000, 0)
                    ),
                    protein:
                      Math.round(
                        sanitizeNumber(macros.protein, 0, 1000, 0) * 10
                      ) / 10,
                    carbs:
                      Math.round(
                        sanitizeNumber(macros.carbs, 0, 1000, 0) * 10
                      ) / 10,
                    fat:
                      Math.round(sanitizeNumber(macros.fat, 0, 1000, 0) * 10) /
                      10,
                  },
                  source: sourceType,
                  aiEngine: modelName,
                  isAiFallback: false,
                };
              }
            );

            return NextResponse.json({
              items,
              summary:
                sanitizeText(parsed.summary, 200) ||
                'הארוחה פוענחה בהצלחה באמצעות AI',
              engine: modelName,
              isAiFallback: false,
            });
          }
        } catch (geminiErr) {
          geminiErrorMsg =
            geminiErr instanceof Error ? geminiErr.message : 'Gemini call failed';
          console.warn(`Gemini API error (${modelName}):`, geminiErrorMsg);
        }
      }
    }

    const fallbackReason = !apiKey
      ? 'לא הוגדר GEMINI_API_KEY בשרת'
      : geminiErrorMsg || 'מודל Gemini לא החזיר תוצאה';

    // גיבוי טקסטואלי: לעולם לא ממציא חזה עוף ואורז כשתמונה לא זוהתה!
    const items = smartHebrewMealParser(textPrompt || '', sourceType).map(
      (it) => ({
        ...it,
        aiEngine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
      })
    );
    if (items.length > 0) {
      return NextResponse.json({
        items,
        summary: apiKey
          ? `מנוע התמונות לא הגיב כרגע — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`
          : `מנוע התמונות אינו זמין ללא מפתח Gemini בשרת — זוהה לפי התיאור שכתבת (${items.length} מרכיבים).`,
        engine: 'smart-hebrew-builtin',
        isAiFallback: true,
        fallbackReason,
      });
    }

    return NextResponse.json(
      {
        error: apiKey
          ? `מנוע זיהוי התמונות של AI נכשל זמנית (${geminiErrorMsg || 'נסה שוב'}). ניתן לתאר את הארוחה במילים (למשל: "פסטה 200 גרם") או לחפש במאגר.`
          : 'לזיהוי מתמונה בלבד נדרש חיבור מפתח GEMINI_API_KEY תקף בשרת. כתוב שם מאכל (למשל: "פסטה") או הוסף ממאגר המזון.',
      },
      { status: 422 }
    );
  } catch (error) {
    console.error('AI analyze error:', error);
    return NextResponse.json({ error: 'שגיאה בפענוח הארוחה' }, { status: 500 });
  }
}
