import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { checkRateLimit, verifyCsrfOrigin } from '@/lib/serverAuth';
import { enrichCatalogItemFromSourceUrl } from '@/lib/scrapers/israeliScrapers';
import { persistCatalogItemsToDb } from '@/lib/scrapers/scraperStore';
import { fetchFoodCatalogItemByIdSql } from '@/lib/supabase';
import { assertAllowedScraperUrl, isValidMacroSet } from '@/lib/scrapers/helpers';
import { FoodCatalogItem } from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';

/**
 * מעשיר מוצר מה-DB בהעשרה מהירה לפי כתובת המקור המאומתת שלו בלבד (DB-First + הגנת SSRF),
 * ומעדכן את הטבלה ברקע לשימוש עתידי מיידי.
 */
export const POST = withTelemetryHandler('/api/food/enrich', async (request: NextRequest, ctx) => {
  if (!verifyCsrfOrigin(request)) {
    ctx.setErrorCode('CSRF_REJECTED', 'מקור בקשה לא מורשה');
    return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
  }

  const auth = await authenticateActiveSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const session = auth.session;
  ctx.setActor(session);
  ctx.setActionName('enrich_product');

  const rl = checkRateLimit(`food-enrich:${session.id}`, 15, 60);
  if (!rl.allowed) {
    ctx.setErrorCode('RATE_LIMITED', 'חריגה ממכסת העשרת מוצרים');
    return NextResponse.json(
      { error: 'בוצעו יותר מדי בקשות העשרה. המתן כדקה.' },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as { item?: FoodCatalogItem };
    const clientItem = body?.item;
    if (!clientItem || !clientItem.id || !clientItem.name) {
      return NextResponse.json({ item: clientItem });
    }

    // עדיפות לשליפת המוצר וה-source_url האמין מה-DB במקום לסמוך על הלקוח
    const dbItem = await fetchFoodCatalogItemByIdSql(clientItem.id);
    const targetItem: FoodCatalogItem = dbItem?.sourceUrl ? dbItem : clientItem;

    if (!targetItem.sourceUrl) {
      return NextResponse.json({ item: targetItem, improved: false });
    }

    // אימות SSRF מוקדם גם אם המקור זמני וטרם נשמר ב-DB
    try {
      assertAllowedScraperUrl(targetItem.sourceUrl, targetItem.sourceSiteId);
    } catch (ssrfErr) {
      const reason = ssrfErr instanceof Error ? ssrfErr.message : 'כתובת מקור נחסמה';
      ctx.setErrorCode('SSRF_BLOCKED', reason);
      ctx.recordAudit({
        category: 'auth',
        action: 'food_enrich_ssrf_blocked',
        status: 'denied',
        metadata: {
          itemId: String(clientItem.id).slice(0, 100),
          reason,
        },
      });
      return NextResponse.json(
        { error: 'כתובת המקור להעשרה אינה מאושרת מטעמי אבטחה' },
        { status: 403 }
      );
    }

    const enriched = await enrichCatalogItemFromSourceUrl(targetItem);
    const improved =
      Boolean(enriched.barcode && !targetItem.barcode) ||
      (enriched.units?.length || 0) > (targetItem.units?.length || 0);

    if (improved && isValidMacroSet(enriched.per100g)) {
      try {
        waitUntil(persistCatalogItemsToDb([enriched]).catch(() => undefined));
      } catch {
        // ignore outside Vercel lifecycle
      }
    }

    return NextResponse.json({ item: enriched, improved });
  } catch {
    ctx.setErrorCode('ENRICH_ERROR', 'שגיאה בהעשרת פרטי מוצר');
    return NextResponse.json({ error: 'שגיאה בהעשרת פרטי מוצר' }, { status: 500 });
  }
});
