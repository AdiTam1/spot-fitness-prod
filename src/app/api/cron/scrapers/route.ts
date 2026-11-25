import { NextRequest, NextResponse } from 'next/server';
import {
  runScrapersHealthCheck,
  syncScrapersCatalog,
} from '@/lib/scrapers/scraperStore';
import { getSemanticSearchEnabledFast } from '@/lib/serverStore';
import { backfillFoodCatalogEmbeddingsBatch } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/**
 * GET /api/cron/scrapers
 * משימת Cron מתוזמנת יומית: מריצה בדיקת תקינות לכל הרשתות והאתרים ומרעננת את המאגר.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const healthReport = await runScrapersHealthCheck('cron');
  const synced = await syncScrapersCatalog();

  let embeddingsAdded = 0;
  let embeddingsRemaining = 0;
  const semanticOn = await getSemanticSearchEnabledFast().catch(() => false);
  if (semanticOn) {
    const embedRes = await backfillFoodCatalogEmbeddingsBatch(150).catch(() => null);
    if (embedRes?.ok) {
      embeddingsAdded = embedRes.embedded;
      embeddingsRemaining = embedRes.remainingEstimate;
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: healthReport.lastCheckedAt,
    healthy: healthReport.totalHealthy,
    warning: healthReport.totalWarning,
    broken: healthReport.totalBroken,
    syncedTotal: synced.totalCount,
    addedCount: synced.addedCount,
    semanticSearchEnabled: semanticOn,
    embeddingsAdded,
    embeddingsRemaining,
  });
}
