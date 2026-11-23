import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { FoodCatalogItem, FoodCatalogSourceId, ScraperSourceId } from '@/types/nutrition';
import { getSessionFromRequest, sanitizeText } from '@/lib/serverAuth';
import { normalizeFoodKey } from '@/lib/scrapers/helpers';
import {
  getMergedCatalogItems,
  getScraperState,
  persistCatalogItemsToDb,
  searchLiveScrapers,
  searchSqlAndCachedCatalog,
  syncScrapersCatalog,
} from '@/lib/scrapers/scraperStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function scoreMatch(item: FoodCatalogItem, qLower: string): number {
  const qNorm = normalizeFoodKey(qLower);
  const nameNorm = normalizeFoodKey(item.name);
  const brandNorm = normalizeFoodKey(item.brand || '');
  const catNorm = normalizeFoodKey(item.category || '');
  const lenPenalty = Math.min(10, Math.floor(Math.max(0, nameNorm.length - qNorm.length) / 7));

  if (!qNorm) return 0;
  const digitsQ = qLower.replace(/[^0-9]/g, '');
  if (digitsQ.length >= 6 && item.barcode && item.barcode === digitsQ) return 100;
  if (nameNorm === qNorm) return 100;
  if (nameNorm.startsWith(`${qNorm} `)) return 93 - Math.min(4, Math.floor(lenPenalty / 2));
  if (nameNorm.startsWith(qNorm)) return 88 - Math.min(4, Math.floor(lenPenalty / 2));

  // התאמת מילה שלמה בתוך שם המוצר (למשל "דבש טהור" / "יוגורט דבש" מקבלים עדיפות גבוהה ממחרוזות ארוכות)
  const paddedName = ` ${nameNorm} `;
  if (paddedName.includes(` ${qNorm} `)) {
    return 82 - lenPenalty;
  }

  const words = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length > 1 && words.every((w) => nameNorm.includes(w) || brandNorm.includes(w))) {
    return 74 - Math.min(8, lenPenalty);
  }

  if (nameNorm.includes(qNorm)) return 64 - lenPenalty;
  if (brandNorm.includes(qNorm)) return 48;
  if (catNorm.includes(qNorm)) return 32;
  return 0;
}

/**
 * מדרג תוצאות מכל המקורות לפי ציון התאמה, ותחת "הכל" מאזן מקורות קרובים כך שמקור בודד לא ידחוק אחרים.
 */
function rankAndDedupeMatches(
  candidates: FoodCatalogItem[],
  qLower: string,
  limit: number,
  interleaveBySource: boolean
): Array<{ item: FoodCatalogItem; score: number }> {
  const scoredByKey = new Map<string, { item: FoodCatalogItem; score: number }>();

  for (const item of candidates) {
    const score = scoreMatch(item, qLower);
    if (score <= 0) continue;
    const key = `${normalizeFoodKey(item.name)}:${Math.round(item.per100g.calories)}`;
    const prev = scoredByKey.get(key);
    if (!prev || score > prev.score) {
      scoredByKey.set(key, { item, score });
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

    // בוחן חלון של המועמדים המובילים שטרם נבחרו ומפחית קלות רצף מאותו מקור
    for (let i = 0; i < pool.length && i < 180; i++) {
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

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = sanitizeText(searchParams.get('q') || '', 80);
  const sourceFilter = sanitizeText(searchParams.get('source') || '', 30) as
    | FoodCatalogSourceId
    | '';
  const limit = Math.min(120, Math.max(10, Number(searchParams.get('limit')) || 60));

  const { report, catalog: syncedCatalog } = await getScraperState();
  // אם טרם סונכרנו מוצרים מהאתרים או שנוספו מקורות חדשים שטרם נבדקו, הפעל סנכרון ברקע בלי לעכב את התגובה
  if (syncedCatalog.length === 0 || report.results.some((r) => !r.checkedAt)) {
    try {
      waitUntil(syncScrapersCatalog().catch(() => undefined));
    } catch {
      // ignore if outside Vercel request lifecycle
    }
  }

  const mergedCatalog = await getMergedCatalogItems();
  const filteredPool = sourceFilter
    ? mergedCatalog.filter((item) =>
        sourceFilter === 'local'
          ? (item.source || 'local') === 'local' && !item.sourceSiteId
          : item.sourceSiteId === sourceFilter
      )
    : mergedCatalog;

  const totalCatalogEstimate = Math.max(
    mergedCatalog.length,
    ISRAELI_FOOD_CATALOG.length + (report.sqlCatalogStats?.totalCount || 0)
  );

  // במצב דפדוף (חיפוש ריק): מציג את המאגר המקומי + נציגות מאוזנת מכל הסופרים והאתרים המסונכרנים + תוצאות SQL
  if (!query.trim()) {
    let sqlBrowse =
      sourceFilter === 'shufersal' || sourceFilter === 'openfoodfacts' || sourceFilter === ''
        ? await searchSqlAndCachedCatalog({
            sourceFilter: sourceFilter || undefined,
            limit: sourceFilter ? limit : 20,
          })
        : { items: [] as FoodCatalogItem[], sqlCount: 0 };

    // גיבוי עבור טאב שופרסל טרם הרצת הסקריפט: הצג מותגי שופרסל מ-Fuder/Foodik ב-SQL
    if (sourceFilter === 'shufersal' && sqlBrowse.items.length === 0) {
      sqlBrowse = await searchSqlAndCachedCatalog({
        query: 'שופרסל',
        limit,
      });
    }

    const localItems = filteredPool.filter((i) => !i.sourceSiteId);
    const scrapedItems = filteredPool.filter((i) => Boolean(i.sourceSiteId));

    // בחירה מגוונת של פריטים מכל אתר מסונכרן
    const bySite = new Map<string, FoodCatalogItem[]>();
    for (const item of scrapedItems) {
      const k = item.sourceSiteId || 'other';
      if (!bySite.has(k)) bySite.set(k, []);
      bySite.get(k)!.push(item);
    }

    const diversifiedScraped: FoodCatalogItem[] = [];
    const maxPerSite = sourceFilter ? limit : 6;
    Array.from(bySite.values()).forEach((group) => {
      diversifiedScraped.push(...group.slice(0, maxPerSite));
    });

    const combinedSeen = new Set<string>();
    const combined: FoodCatalogItem[] = [];
    for (const item of [...localItems, ...sqlBrowse.items, ...diversifiedScraped]) {
      const key = `${normalizeFoodKey(item.name)}:${Math.round(item.per100g.calories)}`;
      if (combinedSeen.has(key)) continue;
      combinedSeen.add(key);
      combined.push(item);
      if (combined.length >= limit) break;
    }

    return NextResponse.json({
      items: combined,
      totalAvailable: totalCatalogEstimate,
      localCount: ISRAELI_FOOD_CATALOG.length,
      syncedCount: syncedCatalog.length,
      mohCount: 0,
      liveCount: 0,
    });
  }

  const qLower = query.trim().toLowerCase();
  const forceLive = searchParams.get('forceLive') === '1';

  // שלב 1 (מיידי, ~15-35ms): חיפוש בקטלוג המקומי + שאילתת SQL מאונדקסת (מפרידה בין רשתות שיווק למשרד הבריאות)
  let sqlRes = await searchSqlAndCachedCatalog({
    query: query.trim(),
    sourceFilter: sourceFilter || undefined,
    limit: 120,
  });

  // גיבוי חכם למסנן "שופרסל" לפני הרצת הסקריפט המלא: מציאת מוצרי מותג שופרסל שנמשכו מ-Fuder/Foodik/OpenFoodFacts
  if (sourceFilter === 'shufersal' && sqlRes.items.length === 0) {
    sqlRes = await searchSqlAndCachedCatalog({
      query: `${query.trim()} שופרסל`,
      limit: 60,
    });
  }

  const fastRanked = rankAndDedupeMatches(
    [...filteredPool, ...sqlRes.items],
    qLower,
    limit,
    !sourceFilter
  );

  const retailSitesSeen = new Set<string>();
  let retailStrongHits = 0;
  for (const { item, score } of fastRanked) {
    const sid = item.sourceSiteId;
    if (sid && sid !== 'moh_gov' && item.source !== 'moh') {
      retailSitesSeen.add(sid);
      if (score >= 60) retailStrongHits += 1;
    }
  }

  const supportsLiveSite =
    query.trim().length >= 2 &&
    sourceFilter !== 'local' &&
    sourceFilter !== 'shufersal' &&
    sourceFilter !== 'openfoodfacts' &&
    sourceFilter !== 'tara' &&
    sourceFilter !== 'berman';

  // Fast-Path רק כשכבר קיים ב-DB גיוון אמיתי מרשתות השיווק (ולא רק משרד הבריאות שממלא מכסה לבדו!)
  const hasEnoughFromDb =
    !forceLive &&
    (sourceFilter
      ? fastRanked.length >= 10
      : retailSitesSeen.size >= 3 && retailStrongHits >= 6);

  let liveMatches: FoodCatalogItem[] = [];
  if (supportsLiveSite && !hasEnoughFromDb) {
    liveMatches = await searchLiveScrapers(
      query.trim(),
      sourceFilter ? (sourceFilter as ScraperSourceId) : undefined
    );
  }

  // שמירה אוטומטית ברקע של תוצאות החיפוש החי בטבלת SQL כדי שחיפושים עתידיים יהיו מיידיים
  if (liveMatches.length > 0) {
    try {
      waitUntil(persistCatalogItemsToDb(liveMatches).catch(() => undefined));
    } catch {
      // ignore outside Vercel lifecycle
    }
  }

  // איחוד ודירוג סופי של כל המקורות יחד (מקומי + SQL + חיפוש חי) לפי התאמה + גיוון בין מקורות
  const combinedCandidates = [...filteredPool, ...sqlRes.items, ...liveMatches];
  const finalRanked = rankAndDedupeMatches(
    combinedCandidates,
    qLower,
    limit,
    !sourceFilter
  );
  const deduped = finalRanked.map((entry) => entry.item);

  const mohCount = deduped.filter(
    (i) => i.source === 'moh' || i.sourceSiteId === 'moh_gov'
  ).length;
  const scraperCount = deduped.filter((i) => Boolean(i.sourceSiteId)).length;

  return NextResponse.json({
    items: deduped,
    totalAvailable: totalCatalogEstimate,
    localCount: fastRanked.length,
    syncedCount: syncedCatalog.length,
    liveCount: liveMatches.length,
    sqlCount: sqlRes.sqlCount,
    fastPath: hasEnoughFromDb && liveMatches.length === 0,
    scraperCount,
    mohCount,
  });
}
