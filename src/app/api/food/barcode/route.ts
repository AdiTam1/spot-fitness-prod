import { NextRequest, NextResponse } from 'next/server';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { FoodCatalogItem } from '@/types/nutrition';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = (searchParams.get('code') || '').trim();

  if (!code) {
    return NextResponse.json({ error: 'חסר קוד ברקוד' }, { status: 400 });
  }

  // 1. בדיקה במאגר המוצרים הישראלי המובנה
  const localItem = ISRAELI_FOOD_CATALOG.find((item) => item.barcode === code);
  if (localItem) {
    return NextResponse.json({ item: localItem, source: 'local' });
  }

  // 2. שליפה מ-Open Food Facts API החינמי
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
    const res = await fetch(offUrl, {
      headers: { 'User-Agent': 'SpotFitnessIsrael/1.0' },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        const nutriments = p.nutriments || {};
        const name =
          p.product_name_he ||
          p.product_name ||
          p.generic_name_he ||
          `מוצר בסריקת ברקוד (${code})`;
        const brand = p.brands || 'Open Food Facts';

        const calories =
          Number(nutriments['energy-kcal_100g']) ||
          Number(nutriments['energy-kcal']) ||
          0;
        const protein = Number(nutriments.proteins_100g) || 0;
        const carbs = Number(nutriments.carbohydrates_100g) || 0;
        const fat = Number(nutriments.fat_100g) || 0;
        const servingGrams = Number(p.serving_quantity) || 100;

        const item: FoodCatalogItem = {
          id: `off-${code}`,
          name,
          brand,
          category: 'סריקת ברקוד (OpenFoodFacts)',
          barcode: code,
          per100g: {
            calories: Math.round(calories),
            protein: Math.round(protein * 10) / 10,
            carbs: Math.round(carbs * 10) / 10,
            fat: Math.round(fat * 10) / 10,
          },
          units: [
            ...(servingGrams !== 100
              ? [{ label: `מנה (${servingGrams} גרם)`, grams: servingGrams }]
              : []),
            { label: '100 גרם', grams: 100 },
          ],
          source: 'openfoodfacts',
        };

        return NextResponse.json({ item, source: 'openfoodfacts' });
      }
    }
  } catch {
    // Fallback if offline
  }

  return NextResponse.json(
    { error: 'הברקוד לא נמצא במאגר. ניתן להזין בטקסט חופשי או לבחור מהקטלוג.' },
    { status: 404 }
  );
}
