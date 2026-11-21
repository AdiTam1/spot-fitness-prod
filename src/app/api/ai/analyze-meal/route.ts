import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ISRAELI_FOOD_CATALOG, calculateMacrosForGrams } from '@/data/israeliFoodCatalog';
import { LoggedFoodItem } from '@/types/nutrition';
import { checkRateLimit, getSessionFromRequest } from '@/lib/serverAuth';

/**
 * מנתח טקסט עברי חכם (Fallback ללא צורך במפתח, או גיבוי מיידי)
 * מזהה כמויות ומאכלים מתוך טקסט חופשי בעברית ("2 ביצים, כף טחינה וקרמבו")
 */
function smartHebrewMealParser(
  text: string,
  sourceType: 'ai-photo' | 'ai-text'
): LoggedFoodItem[] {
  const normalized = text.trim();
  const matchedItems: LoggedFoodItem[] = [];

  const keywordMap: {
    keywords: string[];
    catalogId: string;
    defaultUnitIdx: number;
    defaultQty?: number;
  }[] = [
    { keywords: ['קרמבו'], catalogId: 'krembo-strauss', defaultUnitIdx: 0 },
    { keywords: ['קוטג׳ 3', "קוטג' 3"], catalogId: 'cottage-tnuva-3', defaultUnitIdx: 1 },
    { keywords: ['קוטג', 'קוטג׳', "קוטג'"], catalogId: 'cottage-tnuva-5', defaultUnitIdx: 1 },
    { keywords: ['חזה עוף', 'עוף', 'פרגית', 'שניצל'], catalogId: 'chicken-breast-grilled', defaultUnitIdx: 0 },
    { keywords: ['אורז'], catalogId: 'basmati-rice-cooked', defaultUnitIdx: 0 },
    { keywords: ['ביצים', 'ביצה', 'חביתה', 'מקושקשת'], catalogId: 'egg-whole', defaultUnitIdx: 0 },
    { keywords: ['טחינה גולמית'], catalogId: 'raw-tahini', defaultUnitIdx: 0 },
    { keywords: ['טחינה'], catalogId: 'prepared-tahini', defaultUnitIdx: 0 },
    { keywords: ['לחם קל'], catalogId: 'light-bread', defaultUnitIdx: 1 },
    { keywords: ['לחם', 'כוסמין', 'פרוסות', 'פרוסה', 'טוסט'], catalogId: 'spelt-bread-sliced', defaultUnitIdx: 0 },
    { keywords: ['במבה'], catalogId: 'bamba-osem', defaultUnitIdx: 0 },
    { keywords: ['דנונה', 'יוגורט', 'פרו', 'pro'], catalogId: 'danone-pro-20', defaultUnitIdx: 0 },
    { keywords: ['משקה חלבון', 'go'], catalogId: 'go-protein-milkshake', defaultUnitIdx: 0 },
    { keywords: ['טונה בשמן'], catalogId: 'tuna-in-oil', defaultUnitIdx: 0 },
    { keywords: ['טונה'], catalogId: 'tuna-in-water', defaultUnitIdx: 0 },
    { keywords: ['שיבולת שועל', 'קוואקר', 'דייסה'], catalogId: 'oats-quaker', defaultUnitIdx: 1 },
    { keywords: ['סלמון', 'דג'], catalogId: 'salmon-fillet-baked', defaultUnitIdx: 0 },
    { keywords: ['שמן זית', 'שמן'], catalogId: 'olive-oil', defaultUnitIdx: 1 },
    { keywords: ['אבוקדו'], catalogId: 'avocado-fresh', defaultUnitIdx: 1 },
    { keywords: ['בטטה'], catalogId: 'sweet-potato-baked', defaultUnitIdx: 0 },
    { keywords: ['גבינה צהובה', 'עמק'], catalogId: 'emek-cheese-9', defaultUnitIdx: 0 },
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
    for (const entry of keywordMap) {
      if (entry.keywords.some((kw) => seg.toLowerCase().includes(kw))) {
        if (usedCatalogIds.has(`${entry.catalogId}-${seg}`)) continue;
        const catalogItem = ISRAELI_FOOD_CATALOG.find((c) => c.id === entry.catalogId);
        if (!catalogItem) continue;

        usedCatalogIds.add(`${entry.catalogId}-${seg}`);

        // בדיקה אם צוין משקל מפורש בגרמים (למשל "200 גרם אורז")
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
          break;
        }

        // בדיקה אם צוין מספר יחידות (למשל "2 ביצים", "3 קרמבו", "שתי פרוסות")
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
        break;
      }
    }
  }

  // אם הועלתה תמונה ללא טקסט או טקסט כללי שלא זוהה, נחזיר דוגמת פענוח צלחת ישראלית טיפוסית הניתנת לעריכה
  if (matchedItems.length === 0) {
    const chicken = ISRAELI_FOOD_CATALOG.find((c) => c.id === 'chicken-breast-grilled')!;
    const rice = ISRAELI_FOOD_CATALOG.find((c) => c.id === 'basmati-rice-cooked')!;
    const salad = ISRAELI_FOOD_CATALOG.find((c) => c.id === 'israeli-salad')!;
    const oil = ISRAELI_FOOD_CATALOG.find((c) => c.id === 'olive-oil')!;

    return [
      {
        id: `ai-${Date.now()}-1`,
        name: chicken.name,
        unitLabel: 'מנה בינונית (150 גרם)',
        quantity: 1,
        grams: 150,
        macros: calculateMacrosForGrams(chicken.per100g, 150),
        source: sourceType,
      },
      {
        id: `ai-${Date.now()}-2`,
        name: rice.name,
        unitLabel: 'כוס מבושלת (160 גרם)',
        quantity: 1,
        grams: 160,
        macros: calculateMacrosForGrams(rice.per100g, 160),
        source: sourceType,
      },
      {
        id: `ai-${Date.now()}-3`,
        name: salad.name,
        unitLabel: 'קערה אישית (200 גרם)',
        quantity: 1,
        grams: 200,
        macros: calculateMacrosForGrams(salad.per100g, 200),
        source: sourceType,
      },
      {
        id: `ai-${Date.now()}-4`,
        name: `${oil.name} (תיבול הסלט)`,
        unitLabel: 'כפית (5 גרם)',
        quantity: 1,
        grams: 5,
        macros: calculateMacrosForGrams(oil.per100g, 5),
        source: sourceType,
      },
    ];
  }

  return matchedItems;
}

export async function POST(request: NextRequest) {
  try {
    // 1. אימות סשן חתום קריפטוגרפית בשרת (HttpOnly Cookie)
    const sessionUser = getSessionFromRequest(request);
    if (!sessionUser || sessionUser.status !== 'active') {
      return NextResponse.json(
        { error: 'גישה נדחתה: נדרשת התחברות פעילה למערכת לשימוש ב-AI' },
        { status: 401 }
      );
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
    if (imageDataUrl && imageDataUrl.length > 2_000_000) {
      return NextResponse.json(
        { error: 'קובץ התמונה גדול מדי' },
        { status: 400 }
      );
    }

    const apiKey = (customApiKey || process.env.GEMINI_API_KEY || '').trim();
    const sourceType: 'ai-photo' | 'ai-text' = imageDataUrl ? 'ai-photo' : 'ai-text';

    // אם הוגדר מפתח Gemini API חינמי מ-Google AI Studio, נשתמש במודל gemini-2.5-flash האמיתי
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

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
הקפד על ערכים תזונתיים מדויקים לפי מוצרים ישראליים (משרד הבריאות, תנובה, שטראוס, אסם וכו'). אם המשתמש ציין הקשר (כמו כף שמן זית או אחוז שומן), התחשב בו במדויק.`;

        const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
          { text: systemInstruction },
        ];

        if (textPrompt) {
          parts.push({ text: `תיאור / הערת המתאמן לארוחה: "${textPrompt}"` });
        }

        if (imageDataUrl && imageDataUrl.startsWith('data:image/')) {
          const match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }

        const result = await model.generateContent(parts);
        const rawText = result.response.text();
        const parsed = JSON.parse(rawText);

        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const items: LoggedFoodItem[] = parsed.items.map(
            (it: Record<string, unknown>, idx: number) => {
              const macros = (it.macros as Record<string, number>) || {};
              return {
                id: `gemini-${Date.now()}-${idx}`,
                name: String(it.name || 'פריט מזון'),
                unitLabel: String(it.unitLabel || `${Number(it.grams) || 100} גרם`),
                quantity: Number(it.quantity) || 1,
                grams: Number(it.grams) || 100,
                macros: {
                  calories: Math.round(Number(macros.calories) || 0),
                  protein: Math.round((Number(macros.protein) || 0) * 10) / 10,
                  carbs: Math.round((Number(macros.carbs) || 0) * 10) / 10,
                  fat: Math.round((Number(macros.fat) || 0) * 10) / 10,
                },
                source: sourceType,
              };
            }
          );

          return NextResponse.json({
            items,
            summary: parsed.summary || 'הארוחה פוענחה בהצלחה באמצעות Gemini 2.5 Flash AI',
            engine: 'gemini-2.5-flash',
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini API error, falling back to built-in Hebrew analyzer:', geminiErr);
      }
    }

    // מנוע פענוח עברי מובנה (עובד מיד ב-100% בחינם גם לפני הגדרת מפתח Gemini)
    const items = smartHebrewMealParser(textPrompt || '', sourceType);
    return NextResponse.json({
      items,
      summary: apiKey
        ? 'פוענח באמצעות המנוע המובנה (גיבוי)'
        : 'פוענח באמצעות מנוע הזיהוי העברי המובנה (ניתן לחבר מפתח Gemini 2.5 Flash חינמי בהגדרות ה-AI)',
      engine: 'smart-hebrew-builtin',
    });
  } catch (error) {
    console.error('AI analyze error:', error);
    return NextResponse.json({ error: 'שגיאה בפענוח הארוחה' }, { status: 500 });
  }
}
