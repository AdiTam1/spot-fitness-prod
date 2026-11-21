import { NextRequest, NextResponse } from 'next/server';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { FoodCatalogItem, FoodUnit } from '@/types/nutrition';

const MOH_RESOURCE_ID = 'c3cb0630-0650-46c1-a068-82d575c094b2';

function inferSmartUnits(name: string): FoodUnit[] {
  const units: FoodUnit[] = [];
  if (name.includes('לחם') || name.includes('פרוס') || name.includes('גבינה צהובה')) {
    units.push({ label: 'פרוסה (30 גרם)', grams: 30 }, { label: '2 פרוסות (60 גרם)', grams: 60 });
  } else if (name.includes('קוטג') || name.includes('יוגורט') || name.includes('גבינה לבנה') || name.includes('מעדן')) {
    units.push({ label: 'גביע (200 גרם)', grams: 200 }, { label: 'חצי גביע (100 גרם)', grams: 100 }, { label: 'כף (25 גרם)', grams: 25 });
  } else if (name.includes('טחינה') || name.includes('שמן') || name.includes('חמאה') || name.includes('מיונז') || name.includes('דבש')) {
    units.push({ label: 'כף (15 גרם)', grams: 15 }, { label: 'כפית (5 גרם)', grams: 5 });
  } else if (name.includes('חזה עוף') || name.includes('בקר') || name.includes('דג') || name.includes('סלמון') || name.includes('אורז') || name.includes('פסטה')) {
    units.push({ label: 'מנה בינונית (150 גרם)', grams: 150 }, { label: 'מנה גדולה (200 גרם)', grams: 200 });
  } else {
    units.push({ label: 'יחידה / מנה (50 גרם)', grams: 50 });
  }
  units.push({ label: '100 גרם', grams: 100 });
  return units;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();

  if (!query) {
    return NextResponse.json({
      items: ISRAELI_FOOD_CATALOG,
      source: 'local',
    });
  }

  const normalizedQuery = query.toLowerCase();
  const localMatches = ISRAELI_FOOD_CATALOG.filter(
    (item) =>
      item.name.toLowerCase().includes(normalizedQuery) ||
      (item.brand && item.brand.toLowerCase().includes(normalizedQuery)) ||
      item.category.toLowerCase().includes(normalizedQuery) ||
      (item.barcode && item.barcode.includes(normalizedQuery))
  );

  const externalMatches: FoodCatalogItem[] = [];

  // חיפוש חי במאגר מצרכי המזון של משרד הבריאות (data.gov.il) - חינמי לחלוטין
  try {
    const mohUrl = `https://data.gov.il/api/3/action/datastore_search?resource_id=${MOH_RESOURCE_ID}&q=${encodeURIComponent(
      query
    )}&limit=10`;
    const mohRes = await fetch(mohUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
    });

    if (mohRes.ok) {
      const mohData = await mohRes.json();
      const records = mohData?.result?.records || [];
      for (const rec of records) {
        const name = (rec.shmmitzrach || '').trim();
        if (!name) continue;
        const calories = Number(rec.food_energy) || 0;
        const protein = Number(rec.protein) || 0;
        const carbs = Number(rec.carbohydrates) || 0;
        const fat = Number(rec.total_fat) || 0;

        if (calories <= 0 && protein <= 0 && carbs <= 0) continue;

        const alreadyExists =
          localMatches.some((l) => l.name === name) ||
          externalMatches.some((e) => e.name === name);

        if (!alreadyExists) {
          externalMatches.push({
            id: `moh-${rec._id || Math.random().toString(36).slice(2, 8)}`,
            name,
            brand: 'מאגר משרד הבריאות',
            category: 'מאגר משרד הבריאות (data.gov.il)',
            per100g: {
              calories: Math.round(calories),
              protein: Math.round(protein * 10) / 10,
              carbs: Math.round(carbs * 10) / 10,
              fat: Math.round(fat * 10) / 10,
            },
            units: inferSmartUnits(name),
            source: 'moh',
          });
        }
      }
    }
  } catch {
    // במידה ואין חיבור רשת רגעי, ממשיכים עם המאגר המקומי ללא שגיאה
  }

  return NextResponse.json({
    items: [...localMatches, ...externalMatches],
    localCount: localMatches.length,
    mohCount: externalMatches.length,
  });
}
