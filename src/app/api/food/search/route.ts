import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { FoodCatalogItem, ScraperSourceId } from '@/types/nutrition';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { checkRateLimit, sanitizeText } from '@/lib/serverAuth';
import { mergeUniqueUnits, normalizeFoodKey, normalizeFoodSearchQuery } from '@/lib/scrapers/helpers';
import {
  persistCatalogItemsToDb,
  searchLiveScrapers,
  searchSqlAndCachedCatalog,
} from '@/lib/scrapers/scraperStore';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function scoreMatch(item: FoodCatalogItem, qNorm: string, digitsQ: string): number {
  const nameNorm = normalizeFoodKey(item.name);
  const brandNorm = normalizeFoodKey(item.brand || '');
  const catNorm = normalizeFoodKey(item.category || '');
  const lenPenalty = Math.min(10, Math.floor(Math.max(0, nameNorm.length - qNorm.length) / 7));
  const popularityBoost = Math.min(18, Math.round(Math.log1p(Math.max(0, item.pickCount || 0)) * 4));

  if (!qNorm && !digitsQ) return item.isPopular ? 30 + popularityBoost : 10 + popularityBoost;
  if (digitsQ.length >= 6 && item.barcode && item.barcode === digitsQ) return 130 + popularityBoost;
  if (nameNorm === qNorm) return 115 + popularityBoost;
  if (nameNorm.startsWith(`${qNorm} `)) return 96 - Math.min(4, Math.floor(lenPenalty / 2)) + popularityBoost;
  if (nameNorm.startsWith(qNorm)) return 90 - Math.min(4, Math.floor(lenPenalty / 2)) + popularityBoost;

  const paddedName = ` ${nameNorm} `;
  if (qNorm && paddedName.includes(` ${qNorm} `)) {
    return 84 - lenPenalty + popularityBoost;
  }

  const words = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length > 1 && words.every((w) => nameNorm.includes(w) || brandNorm.includes(w))) {
    return 76 - Math.min(8, lenPenalty) + popularityBoost;
  }

  if (qNorm && nameNorm.includes(qNorm)) return 64 - lenPenalty + popularityBoost;
  if (qNorm && brandNorm.includes(qNorm)) return 48 + popularityBoost;
  if (qNorm && catNorm.includes(qNorm)) return 32 + Math.floor(popularityBoost / 2);

  // תוצאות מה-Hybrid SQL RPC (שגיאות כתיב via pg_trgm או מוספיות עבריות via tsvector)
  if (item.sourceSiteId || item.source === 'moh' || item.source === 'openfoodfacts') {
    return 24 + popularityBoost;
  }
  return 0;
}

function mergeFoodMetadata(winner: FoodCatalogItem, fallback: FoodCatalogItem): FoodCatalogItem {
  const mergedUnits = mergeUniqueUnits(winner.units || [], fallback.units || []);
  const bestPickCount = Math.max(winner.pickCount || 0, fallback.pickCount || 0);
  return {
    ...winner,
    barcode: winner.barcode || fallback.barcode,
    brand: winner.brand || fallback.brand,
    sourceUrl: winner.sourceUrl || fallback.sourceUrl,
    units: mergedUnits,
    ...(bestPickCount > 0 ? { pickCount: bestPickCount } : {}),
  };
}

function rankAndDedupeMatches(
  candidates: FoodCatalogItem[],
  qNorm: string,
  digitsQ: string,
  limit: number,
  interleaveBySource: boolean
): Array<{ item: FoodCatalogItem; score: number }> {
  const scoredByKey = new Map<string, { item: FoodCatalogItem; score: number }>();

  for (const item of candidates) {
    const score = scoreMatch(item, qNorm, digitsQ);
    if (score <= 0) continue;
    const key = `${normalizeFoodKey(item.name)}:${Math.round(item.per100g.calories)}`;
    const prev = scoredByKey.get(key);
    if (!prev) {
      scoredByKey.set(key, { item, score });
    } else if (score > prev.score) {
      scoredByKey.set(key, { item: mergeFoodMetadata(item, prev.item), score });
    } else {
      scoredByKey.set(key, { item: mergeFoodMetadata(prev.item, item), score: prev.score });
    }
  }

  const pool = Array.from(scoredByKey.values()).sort((a, b) => b.score - a.score);
  if (!interleaveBySource) {
    return pool.slice(0, limit);
  }

  const picked: Array<{ item: FoodCatalogItem; score: number }> = [];
  const usedIndices = new Set<number>();
  const countPerSource = new Map<string, number>();

  while (picked.length < limit && usedIndices.size < pool.length) {
    let bestIdx = -1;
    let bestEffective = -Infinity;

    for (let i = 0; i < pool.length && i < 160; i++) {
      if (usedIndices.has(i)) continue;
      const entry = pool[i];
      const srcKey = entry.item.sourceSiteId || entry.item.source || 'local';
      const seenCnt = countPerSource.get(srcKey) || 0;
      const effective = entry.score - seenCnt * 4;
      if (effective > bestEffective) {
        bestEffective = effective;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) break;
    usedIndices.add(bestIdx);
    const chosen = pool[bestIdx];
    const srcKey = chosen.item.sourceSiteId || chosen.item.source || 'local';
    countPerSource.set(srcKey, (countPerSource.get(srcKey) || 0) + 1);
    picked.push(chosen);
  }

  return picked;
}

const LOCAL_CATALOG_DECORATED: FoodCatalogItem[] = ISRAELI_FOOD_CATALOG.map((item) => ({
  ...item,
  source: item.source || 'local',
  sourceSiteName: item.source === 'moh' ? 'משרד הבריאות' : 'מאגר SPOT מקומי',
}));

function filterLocalCatalog(sourceFilter: string): FoodCatalogItem[] {
  if (!sourceFilter || sourceFilter === 'all') return LOCAL_CATALOG_DECORATED;
  if (sourceFilter === 'local') {
    return LOCAL_CATALOG_DECORATED.filter((i) => !i.sourceSiteId && i.source !== 'moh');
  }
  if (sourceFilter === 'retail') {
    return LOCAL_CATALOG_DECORATED.filter((i) => i.source !== 'moh');
  }
  if (sourceFilter === 'moh_gov') {
    return LOCAL_CATALOG_DECORATED.filter((i) => i.source === 'moh');
  }
  return [];
}

export const GET = withTelemetryHandler('/api/food/search', async (request: NextRequest, ctx) => {
  const startedAt = Date.now();
  const auth = await authenticateActiveSession(request);
  if (!auth.ok) {
    return auth.response;
  }
  const session = auth.session;
  ctx.setActor(session);

  const { searchParams } = new URL(request.url);
  const rawQuery = sanitizeText(searchParams.get('q') || '', 80);
  const sourceFilter = sanitizeText(searchParams.get('source') || 'all', 30);
  const requestedMode = searchParams.get('mode') === 'live' || searchParams.get('forceLive') === '1'
    ? 'live'
    : 'db';
  ctx.setActionName(`search_${requestedMode}`);

  const rl =
    requestedMode === 'live'
      ? checkRateLimit(`food-search-live:${session.id}`, 10, 60)
      : checkRateLimit(`food-search-db:${session.id}`, 60, 60);
  if (!rl.allowed) {
    ctx.setErrorCode('RATE_LIMITED', 'חריגה ממכסת בקשות חיפוש');
    return NextResponse.json(
      {
        error:
          requestedMode === 'live'
            ? 'בוצעו יותר מדי חיפושים חיים ברשת. המתן כדקה ונסה שוב.'
            : 'קצב החיפוש מהיר מדי. המתן רגע ונסה שוב.',
      },
      { status: 429 }
    );
  }

  const limit = Math.min(60, Math.max(8, Number(searchParams.get('limit')) || 36));
  const qNorm = normalizeFoodSearchQuery(rawQuery);
  const digitsQ = rawQuery.replace(/[^0-9]/g, '');
  const isBarcodeQuery = digitsQ.length >= 6 && digitsQ.length === rawQuery.trim().length;

  const sourceMode: 'all' | 'retail' | 'moh_gov' | 'openfoodfacts' =
    sourceFilter === 'retail'
      ? 'retail'
      : sourceFilter === 'moh_gov'
      ? 'moh_gov'
      : sourceFilter === 'openfoodfacts'
      ? 'openfoodfacts'
      : 'all';

  const specificSiteFilter =
    sourceFilter &&
    !['all', 'local', 'retail', 'moh_gov', 'openfoodfacts', 'favorites_recent'].includes(sourceFilter)
      ? sourceFilter
      : undefined;

  const localPool = filterLocalCatalog(sourceFilter);

  // מצב דפדוף ריק: מחזיר מקומי + שורה קלה מה-SQL בלי לטעון BLOB או סקרייפרים
  if (!qNorm && !isBarcodeQuery) {
    const sqlBrowse =
      sourceFilter === 'local'
        ? { items: [] as FoodCatalogItem[], sqlCount: 0, usedHybridRpc: false }
        : await searchSqlAndCachedCatalog({
            query: '',
            sourceMode,
            sourceFilter: specificSiteFilter,
            limit,
          });

    const combined = rankAndDedupeMatches(
      [...localPool, ...sqlBrowse.items],
      '',
      '',
      limit,
      !specificSiteFilter
    ).map((x) => x.item);

    return NextResponse.json({
      items: combined,
      mode: 'db',
      fastPath: true,
      needsLiveFallback: false,
      localCount: localPool.length,
      sqlCount: sqlBrowse.sqlCount,
      liveCount: 0,
      usedHybridRpc: Boolean(sqlBrowse.usedHybridRpc),
      dbLatencyMs: Date.now() - startedAt,
    });
  }

  // טוקן בודד שאינו ברקוד — השרת מדלג על סקרייפרים חיים ומחזיר מקומי + prefix קצר ב-SQL
  const sqlRes = await searchSqlAndCachedCatalog({
    query: rawQuery.trim(),
    sourceMode,
    sourceFilter: specificSiteFilter,
    limit,
  });

  const fastRanked = rankAndDedupeMatches(
    [...localPool, ...sqlRes.items],
    qNorm,
    digitsQ,
    limit,
    !specificSiteFilter
  );

  const retailSitesSeen = new Set<string>();
  let strongHits = 0;
  for (const { item, score } of fastRanked) {
    if (score >= 60) strongHits += 1;
    if (item.sourceSiteId && item.sourceSiteId !== 'moh_gov' && item.source !== 'moh') {
      retailSitesSeen.add(item.sourceSiteId);
    }
  }

  const supportsLiveSite =
    qNorm.replace(/\s+/g, '').length >= 3 &&
    !isBarcodeQuery &&
    sourceFilter !== 'local' &&
    sourceFilter !== 'shufersal' &&
    sourceFilter !== 'openfoodfacts' &&
    sourceFilter !== 'moh_gov' &&
    sourceFilter !== 'tara' &&
    sourceFilter !== 'berman' &&
    sourceFilter !== 'favorites_recent';

  const hasEnoughFromDb = specificSiteFilter
    ? fastRanked.length >= 6
    : retailSitesSeen.size >= 2 && strongHits >= 4;

  const needsLiveFallback = supportsLiveSite && !hasEnoughFromDb;

  // Phase 1 (DB Fast-Path תמידי): לעולם לא חוסם את ה-UI בהמתנה לאתרים חיצוניים
  if (requestedMode === 'db') {
    const items = fastRanked.map((e) => e.item);
    return NextResponse.json({
      items,
      mode: 'db',
      fastPath: true,
      needsLiveFallback,
      localCount: fastRanked.length,
      sqlCount: sqlRes.sqlCount,
      liveCount: 0,
      usedHybridRpc: Boolean(sqlRes.usedHybridRpc),
      dbLatencyMs: Date.now() - startedAt,
      mohCount: items.filter((i) => i.source === 'moh' || i.sourceSiteId === 'moh_gov').length,
      scraperCount: items.filter((i) => Boolean(i.sourceSiteId)).length,
    });
  }

  // Phase 2 (mode=live): חיפוש משלים באתרים חיים עם Query Cache + Circuit Breaker
  let liveMatches: FoodCatalogItem[] = [];
  if (supportsLiveSite || (requestedMode === 'live' && qNorm.length >= 2 && !isBarcodeQuery)) {
    liveMatches = await searchLiveScrapers(
      rawQuery.trim(),
      specificSiteFilter ? (specificSiteFilter as ScraperSourceId) : undefined
    );
  }

  if (liveMatches.length > 0) {
    try {
      waitUntil(persistCatalogItemsToDb(liveMatches).catch(() => undefined));
    } catch {
      // ignore outside Vercel lifecycle
    }
  }

  const finalRanked = rankAndDedupeMatches(
    [...localPool, ...sqlRes.items, ...liveMatches],
    qNorm,
    digitsQ,
    limit,
    !specificSiteFilter
  );
  const deduped = finalRanked.map((e) => e.item);

  return NextResponse.json({
    items: deduped,
    mode: 'live',
    fastPath: false,
    needsLiveFallback: false,
    localCount: fastRanked.length,
    sqlCount: sqlRes.sqlCount,
    liveCount: liveMatches.length,
    usedHybridRpc: Boolean(sqlRes.usedHybridRpc),
    dbLatencyMs: Date.now() - startedAt,
    mohCount: deduped.filter((i) => i.source === 'moh' || i.sourceSiteId === 'moh_gov').length,
    scraperCount: deduped.filter((i) => Boolean(i.sourceSiteId)).length,
  });
});
