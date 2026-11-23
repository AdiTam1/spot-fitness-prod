import { NextRequest, NextResponse } from 'next/server';
import {
  runScrapersHealthCheck,
  syncScrapersCatalog,
} from '@/lib/scrapers/scraperStore';

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

  return NextResponse.json({
    ok: true,
    checkedAt: healthReport.lastCheckedAt,
    healthy: healthReport.totalHealthy,
    warning: healthReport.totalWarning,
    broken: healthReport.totalBroken,
    syncedTotal: synced.totalCount,
    addedCount: synced.addedCount,
  });
}
