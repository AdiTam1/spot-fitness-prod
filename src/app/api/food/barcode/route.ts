import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { isValidMacroSet } from '@/lib/scrapers/helpers';
import {
  lookupBarcodeUnified,
  persistCatalogItemsToDb,
} from '@/lib/scrapers/scraperStore';
import { FoodCatalogItem } from '@/types/nutrition';
import { getSessionFromRequest, sanitizeText } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = sanitizeText(searchParams.get('code') || '', 20);

  // ולידציית SSRF: ברקוד חייב להכיל ספרות בלבד (EAN-8 / UPC / EAN-13)
  if (!code || !/^[0-9]{6,16}$/.test(code)) {
    return NextResponse.json(
      { error: 'קוד ברקוד לא תקין (מספרים בלבד)' },
      { status: 400 }
    );
  }

  // 1. בדיקה במאגר המוצרים המשולב (מקומי + טבלת SQL + קאש)
  const localItem = await lookupBarcodeUnified(code);
  if (localItem) {
    return NextResponse.json({ item: localItem, source: localItem.source || 'local' });
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
          id: `openfoodfacts-${code}`,
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
          sourceSiteId: 'openfoodfacts',
          sourceSiteName: 'Open Food Facts ישראל',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          updatedAt: new Date().toISOString(),
        };

        // שמירה אוטומטית ברקע לטבלת food_catalog_items אם למוצר יש ערכים מלאים ותקינים
        if (
          nutriments['energy-kcal_100g'] != null &&
          nutriments.proteins_100g != null &&
          nutriments.carbohydrates_100g != null &&
          nutriments.fat_100g != null &&
          isValidMacroSet(item.per100g)
        ) {
          try {
            waitUntil(persistCatalogItemsToDb([item]).catch(() => undefined));
          } catch {
            // ignore outside Vercel lifecycle
          }
        }

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
