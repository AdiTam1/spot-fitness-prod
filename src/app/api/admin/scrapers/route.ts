import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, sanitizeText, verifyCsrfOrigin } from '@/lib/serverAuth';
import { isValidMacroSet, roundMacros } from '@/lib/scrapers/helpers';
import {
  getScraperState,
  isScraperReportStale,
  persistCatalogItemsToDb,
  runScrapersHealthCheck,
  syncOpenFoodFactsToCatalog,
  syncScrapersCatalog,
  testSingleScraperSearch,
} from '@/lib/scrapers/scraperStore';
import { backfillFoodCatalogBarcodesAndUnits } from '@/lib/supabase';
import { FoodCatalogItem, ScraperSourceId } from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

function hasValidSyncSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim() || '';
  if (!secret) return false;
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/**
 * GET /api/admin/scrapers
 * מוגבל למנהל ראשי בלבד (Super Admin).
 * עם autoCheck=1, בודק אוטומטית את כל הסקרייפרים כשהדוח ישן/חסר או שהתווספו מקורות,
 * ובנוסף מסנכרן אוטומטית מקורות חדשים או ריקים.
 */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const autoCheck = searchParams.get('autoCheck') === '1';

  let { report, catalog } = await getScraperState();
  const stale = isScraperReportStale(report);
  let ranAutoCheck = false;
  let ranInitialSync = false;

  if (autoCheck && stale) {
    report = await runScrapersHealthCheck('auto');
    ranAutoCheck = true;
    const hasMissingSource = report.results.some((r) => r.syncedCatalogCount === 0);
    if (catalog.length === 0 || hasMissingSource) {
      const synced = await syncScrapersCatalog();
      report = synced.report;
      ranInitialSync = true;
      catalog = (await getScraperState()).catalog;
    }
  }

  return NextResponse.json({
    report,
    isStale: isScraperReportStale(report),
    ranAutoCheck,
    ranInitialSync,
    previewItems: catalog.slice(0, 12).map((i) => ({
      id: i.id,
      name: i.name,
      sourceSiteId: i.sourceSiteId,
      sourceSiteName: i.sourceSiteName,
      calories: i.per100g.calories,
      protein: i.per100g.protein,
      carbs: i.per100g.carbs,
      fat: i.per100g.fat,
    })),
  });
}

/**
 * POST /api/admin/scrapers
 * פעולות מנהל: check_all, check_one, sync_catalog, sync_one, test_search, sync_openfoodfacts, seed_items
 */
export const POST = withTelemetryHandler('/api/admin/scrapers', async (request, ctx) => {
  const secretAuthed = hasValidSyncSecret(request);
  if (!secretAuthed) {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
    }
    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
        { status: 403 }
      );
    }
    ctx.setActor(session);
  } else {
    ctx.setActor({ id: 'cron-secret', role: 'admin' });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      scraperId?: ScraperSourceId;
      query?: string;
      pages?: number;
      items?: FoodCatalogItem[];
    };
    ctx.setActionName(body.action);
    ctx.setPendingAudit({
      category: 'admin',
      action: `scraper_${body.action || 'unknown'}`,
      metadata: { scraperId: body.scraperId },
    });

    if (
      secretAuthed &&
      body.action !== 'seed_items' &&
      body.action !== 'sync_openfoodfacts' &&
      body.action !== 'backfill_catalog_meta'
    ) {
      return NextResponse.json({ error: 'פעולה מוגבלת לממשק המנהל' }, { status: 403 });
    }

    switch (body.action) {
      case 'check_all': {
        const report = await runScrapersHealthCheck('manual');
        return NextResponse.json({ ok: true, report });
      }
      case 'check_one': {
        if (!body.scraperId) {
          return NextResponse.json({ error: 'חסר מזהה סקרייפר' }, { status: 400 });
        }
        const report = await runScrapersHealthCheck('manual', body.scraperId);
        return NextResponse.json({ ok: true, report });
      }
      case 'sync_catalog': {
        const synced = await syncScrapersCatalog();
        return NextResponse.json({
          ok: true,
          report: synced.report,
          addedCount: synced.addedCount,
          totalCount: synced.totalCount,
        });
      }
      case 'sync_one': {
        if (!body.scraperId) {
          return NextResponse.json({ error: 'חסר מזהה סקרייפר' }, { status: 400 });
        }
        const synced = await syncScrapersCatalog(body.scraperId);
        return NextResponse.json({
          ok: true,
          report: synced.report,
          addedCount: synced.addedCount,
          totalCount: synced.totalCount,
        });
      }
      case 'test_search': {
        if (!body.scraperId) {
          return NextResponse.json({ error: 'חסר מזהה סקרייפר' }, { status: 400 });
        }
        const q = sanitizeText(body.query || "קוטג'", 60) || "קוטג'";
        const items = await testSingleScraperSearch(body.scraperId, q);
        return NextResponse.json({ ok: true, query: q, items });
      }
      case 'sync_openfoodfacts': {
        const pages = Math.min(12, Math.max(1, Number(body.pages) || 5));
        const res = await syncOpenFoodFactsToCatalog(pages);
        return NextResponse.json({ ok: true, ...res });
      }
      case 'backfill_catalog_meta': {
        const stats = await backfillFoodCatalogBarcodesAndUnits();
        const { report } = await getScraperState(true);
        return NextResponse.json({
          ...stats,
          report,
        });
      }
      case 'seed_items': {
        const incoming = Array.isArray(body.items) ? body.items.slice(0, 600) : [];
        const validItems = incoming.filter(
          (it) =>
            it &&
            typeof it.id === 'string' &&
            typeof it.name === 'string' &&
            isValidMacroSet(roundMacros(it.per100g))
        );
        const saved = await persistCatalogItemsToDb(validItems);
        const { report } = await getScraperState(true);
        return NextResponse.json({
          ok: saved.ok,
          tableReady: saved.tableReady,
          savedCount: saved.savedCount,
          error: saved.error,
          report,
        });
      }
      default:
        return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'שגיאה בהפעלת הסקרייפרים',
      },
      { status: 500 }
    );
  }
});
