import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import {
  extractPackageGramsFromText,
  isValidMacroSet,
  mergeUniqueUnits,
  normalizeFoodKey,
  SPOT_OFF_USER_AGENT,
} from '@/lib/scrapers/helpers';
import {
  isBarcodeMissCached,
  lookupBarcodeUnified,
  markBarcodeMissCached,
  persistCatalogItemsToDb,
} from '@/lib/scrapers/scraperStore';
import { recordUserFoodHistorySql } from '@/lib/supabase';
import { lookupRetailerByBarcodeLive } from '@/lib/scrapers/israeliScrapers';
import { FoodCatalogItem } from '@/types/nutrition';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { checkRateLimit, sanitizeText } from '@/lib/serverAuth';
import { resolveVisibleCustomCatalogForActor } from '@/lib/customFoodsServer';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';

function scheduleBarcodeHistorySave(userId: string, item: FoodCatalogItem, code: string) {
  const defaultUnit = item.units?.[0] || { label: '100 גרם', grams: 100 };
  const task = recordUserFoodHistorySql(userId, [
    {
      foodKey: item.id || `barcode-${code}-${normalizeFoodKey(item.name)}`,
      catalogId: item.id,
      name: item.name,
      brand: item.brand,
      category: item.category,
      barcode: item.barcode || code,
      per100g: item.per100g,
      units: item.units,
      lastUnitLabel: defaultUnit.label,
      lastGrams: defaultUnit.grams,
      source: item.source || 'openfoodfacts',
      sourceSiteId: item.sourceSiteId,
      sourceSiteName: item.sourceSiteName,
      sourceUrl: item.sourceUrl,
      actionKind: 'barcode',
    },
  ]).catch(() => undefined);

  try {
    waitUntil(task);
  } catch {
    // ignore outside Vercel lifecycle
  }
}

export const GET = withTelemetryHandler('/api/food/barcode', async (request: NextRequest, ctx) => {
  const auth = await authenticateActiveSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const session = auth.session;
  ctx.setActor(session);
  ctx.setActionName('barcode_lookup');

  const rl = checkRateLimit(`food-barcode:${session.id}`, 20, 60);
  if (!rl.allowed) {
    ctx.setErrorCode('RATE_LIMITED', 'חריגה ממגבלת סריקות ברקוד');
    return NextResponse.json(
      { error: 'בוצעו יותר מדי סריקות ברקוד בזמן קצר. המתן כדקה ונסה שוב.' },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = sanitizeText(searchParams.get('code') || '', 20);

  // ולידציית SSRF: ברקוד חייב להכיל ספרות בלבד (EAN-8 / UPC / EAN-13)
  if (!code || !/^[0-9]{6,16}$/.test(code)) {
    ctx.setErrorCode('INVALID_BARCODE', 'פורמט ברקוד שגוי');
    return NextResponse.json(
      { error: 'קוד ברקוד לא תקין (מספרים בלבד)' },
      { status: 400 }
    );
  }

  // 0. בדיקה בעדיפות ראשונה במוצרים האישיים/משותפים של המתאמן והמאמן
  const customCatalog = await resolveVisibleCustomCatalogForActor(session);
  const customMatch = customCatalog.find((cf) => cf.barcode && cf.barcode === code);
  if (customMatch) {
    scheduleBarcodeHistorySave(session.id, customMatch, code);
    return NextResponse.json({ item: customMatch, source: 'custom' });
  }

  // 1. בדיקה במאגר המוצרים המשולב (מקומי + טבלת SQL + קאש חם)
  const localItem = await lookupBarcodeUnified(code);
  if (localItem) {
    scheduleBarcodeHistorySave(session.id, localItem, code);
    return NextResponse.json({ item: localItem, source: localItem.source || 'local' });
  }

  // Negative cache למניעת חסימת Rate Limit מול OpenFoodFacts בסריקות חוזרות
  if (isBarcodeMissCached(code)) {
    ctx.setErrorCode('BARCODE_NOT_FOUND_CACHED', 'לא נמצא (Negative Cache)');
    return NextResponse.json(
      { error: 'הברקוד לא נמצא במאגר. ניתן להזין בטקסט חופשי או לבחור מהקטלוג.' },
      { status: 404 }
    );
  }

  // 2. שליפה מ-Open Food Facts API לפי User-Agent תקני
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;
    const res = await fetch(offUrl, {
      headers: { 'User-Agent': SPOT_OFF_USER_AGENT },
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
        const rawPkg = Number(p.product_quantity);
        const pkgGrams =
          (Number.isFinite(rawPkg) && rawPkg > 5 && rawPkg <= 5000 ? Math.round(rawPkg) : null) ||
          extractPackageGramsFromText(String(p.quantity || ''));

        const offUnits = mergeUniqueUnits(
          pkgGrams && pkgGrams !== 100
            ? [{ label: `חבילה שלמה (${pkgGrams} גרם)`, grams: pkgGrams }]
            : [],
          servingGrams !== 100 && servingGrams > 0
            ? [{ label: `מנה (${Math.round(servingGrams)} גרם)`, grams: Math.round(servingGrams) }]
            : [],
          [{ label: '100 גרם', grams: 100 }]
        );

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
          units: offUnits,
          source: 'openfoodfacts',
          sourceSiteId: 'openfoodfacts',
          sourceSiteName: 'Open Food Facts ישראל',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          updatedAt: new Date().toISOString(),
        };

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

        if (isValidMacroSet(item.per100g)) {
          scheduleBarcodeHistorySave(session.id, item, code);
        }

        return NextResponse.json({ item, source: 'openfoodfacts' });
      }
    }
  } catch {
    // Fallback if offline or timeout
  }

  // 3. שליפה חיה מרשתות שיווק ישראליות (ויקטורי + שופרסל) לפי ברקוד
  try {
    const retailItem = await lookupRetailerByBarcodeLive(code);
    if (retailItem && isValidMacroSet(retailItem.per100g)) {
      try {
        waitUntil(persistCatalogItemsToDb([retailItem]).catch(() => undefined));
      } catch {
        // ignore outside Vercel lifecycle
      }
      scheduleBarcodeHistorySave(session.id, retailItem, code);
      return NextResponse.json({
        item: retailItem,
        source: retailItem.sourceSiteId || 'scraper',
      });
    }
  } catch {
    // ignore live retailer timeout
  }

  markBarcodeMissCached(code);
  ctx.setErrorCode('BARCODE_NOT_FOUND', 'ברקוד לא נמצא במאגרים');
  return NextResponse.json(
    { error: 'הברקוד לא נמצא במאגר. ניתן להזין בטקסט חופשי או לבחור מהקטלוג.' },
    { status: 404 }
  );
});
