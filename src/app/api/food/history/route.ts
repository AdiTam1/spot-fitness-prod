import { NextRequest, NextResponse } from 'next/server';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { checkRateLimit, sanitizeText, verifyCsrfOrigin } from '@/lib/serverAuth';
import {
  assertAllowedScraperUrl,
  isValidMacroSet,
  normalizeFoodKey,
  roundMacros,
} from '@/lib/scrapers/helpers';
import { getUserFoodHistorySql, recordUserFoodHistorySql } from '@/lib/supabase';
import { FoodCatalogItem, FoodUnit } from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const GET = withTelemetryHandler('/api/food/history', async (request: NextRequest, ctx) => {
  const auth = await authenticateActiveSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const session = auth.session;
  ctx.setActor(session);
  ctx.setActionName('history_list');

  const rl = checkRateLimit(`food-history-read:${session.id}`, 60, 60);
  if (!rl.allowed) {
    ctx.setErrorCode('RATE_LIMITED', 'מגבלת קריאות היסטוריה');
    return NextResponse.json({ error: 'נסה שוב בעוד מספר שניות' }, { status: 429 });
  }

  const { items, tableReady } = await getUserFoodHistorySql(session.id, 80);
  return NextResponse.json({ items, tableReady });
});

interface IncomingHistoryEntry {
  item: FoodCatalogItem;
  actionKind?: 'picked' | 'barcode' | 'logged';
  lastUnitLabel?: string;
  lastGrams?: number;
}

export const POST = withTelemetryHandler('/api/food/history', async (request: NextRequest, ctx) => {
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
  ctx.setActionName('history_record');

  const rl = checkRateLimit(`food-history-write:${session.id}`, 45, 60);
  if (!rl.allowed) {
    ctx.setErrorCode('RATE_LIMITED', 'מגבלת עדכון היסטוריה');
    return NextResponse.json({ error: 'בקשות רבות מדי. המתן רגע.' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      entries?: IncomingHistoryEntry[];
      item?: FoodCatalogItem;
      actionKind?: 'picked' | 'barcode' | 'logged';
      lastUnitLabel?: string;
      lastGrams?: number;
    };

    const rawEntries: IncomingHistoryEntry[] = Array.isArray(body?.entries)
      ? body.entries
      : body?.item
      ? [
          {
            item: body.item,
            actionKind: body.actionKind,
            lastUnitLabel: body.lastUnitLabel,
            lastGrams: body.lastGrams,
          },
        ]
      : [];

    const mapped = rawEntries
      .slice(0, 20)
      .map((entry) => {
        const it = entry?.item;
        if (!it?.name || !it?.per100g) return null;
        const per100g = roundMacros(it.per100g);
        if (!isValidMacroSet(per100g)) return null;

        const cleanName = sanitizeText(it.name, 180);
        if (!cleanName) return null;

        const barcode = it.barcode
          ? it.barcode.replace(/[^0-9]/g, '').slice(0, 20) || undefined
          : undefined;
        const catalogId = it.id ? sanitizeText(it.id, 120) : undefined;
        const foodKey =
          catalogId ||
          (barcode ? `bc-${barcode}` : `nm-${normalizeFoodKey(cleanName)}-${per100g.calories}`);

        const safeUnits: FoodUnit[] = Array.isArray(it.units)
          ? it.units
              .slice(0, 8)
              .filter(
                (u) =>
                  u &&
                  typeof u.label === 'string' &&
                  Number.isFinite(Number(u.grams)) &&
                  Number(u.grams) > 0 &&
                  Number(u.grams) <= 5000
              )
              .map((u) => ({
                label: sanitizeText(u.label, 60),
                grams: Math.round(Number(u.grams)),
              }))
          : [{ label: '100 גרם', grams: 100 }];

        let safeSourceUrl: string | undefined;
        if (it.sourceUrl) {
          try {
            safeSourceUrl = assertAllowedScraperUrl(it.sourceUrl, it.sourceSiteId).toString();
          } catch {
            safeSourceUrl = undefined;
          }
        }

        return {
          foodKey,
          catalogId,
          name: cleanName,
          brand: it.brand ? sanitizeText(it.brand, 100) : undefined,
          category: sanitizeText(it.category || 'מאגר מוצרים', 100),
          barcode,
          per100g,
          units: safeUnits.length > 0 ? safeUnits : [{ label: '100 גרם', grams: 100 }],
          lastUnitLabel: entry.lastUnitLabel ? sanitizeText(entry.lastUnitLabel, 80) : undefined,
          lastGrams:
            entry.lastGrams && Number.isFinite(entry.lastGrams)
              ? Math.max(1, Math.min(5000, Math.round(entry.lastGrams)))
              : undefined,
          source: it.source || 'local',
          sourceSiteId: it.sourceSiteId,
          sourceSiteName: it.sourceSiteName ? sanitizeText(it.sourceSiteName, 80) : undefined,
          sourceUrl: safeSourceUrl,
          actionKind:
            entry.actionKind === 'barcode' || entry.actionKind === 'logged'
              ? entry.actionKind
              : ('picked' as const),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (mapped.length === 0) {
      return NextResponse.json({ ok: true, savedCount: 0 });
    }

    const res = await recordUserFoodHistorySql(session.id, mapped);
    return NextResponse.json(res);
  } catch {
    ctx.setErrorCode('HISTORY_SAVE_ERR', 'שגיאה בשמירת היסטוריית מזון');
    return NextResponse.json({ error: 'שגיאה בשמירת היסטוריית מזון' }, { status: 500 });
  }
});
