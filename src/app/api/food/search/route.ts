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
  const name = item.name.toLowerCase();
  const brand = (item.brand || '').toLowerCase();
  const cat = (item.category || '').toLowerCase();

  if (name === qLower) return 100;
  if (name.startsWith(qLower)) return 85;
  if (name.includes(qLower)) return 70;
  if (brand.includes(qLower)) return 50;
  if (cat.includes(qLower)) return 35;

  const words = qLower.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length > 1 && words.every((w) => name.includes(w) || brand.includes(w))) {
    return 65;
  }
  return 0;
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
    const sqlBrowse =
      sourceFilter === 'shufersal' || sourceFilter === 'openfoodfacts' || sourceFilter === ''
        ? await searchSqlAndCachedCatalog({
            sourceFilter: sourceFilter || undefined,
            limit: sourceFilter ? limit : 20,
          })
        : { items: [] as FoodCatalogItem[], sqlCount: 0 };

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

  // שלב 1 (מיידי, ~15-35ms): חיפוש בקטלוג המקומי + שאילתת SQL מאונדקסת על עשרות אלפי פריטים
  const sqlRes = await searchSqlAndCachedCatalog({
    query: query.trim(),
    sourceFilter: sourceFilter || undefined,
    limit: 100,
  });

  // דירוג משולב לפי התאמה מדויקת כדי שפריטים מרכזיים ("קוטג' 5%", "חלב 3%") יקפצו לפני זנב רשימה
  const rankedDbAndLocal = [...filteredPool, ...sqlRes.items]
    .map((item) => ({ item, score: scoreMatch(item, qLower) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const preSeen = new Set<string>();
  const fastMatches: FoodCatalogItem[] = [];
  let strongFastHits = 0;
  for (const entry of rankedDbAndLocal) {
    const key = `${normalizeFoodKey(entry.item.name)}:${Math.round(entry.item.per100g.calories)}`;
    if (preSeen.has(key)) continue;
    preSeen.add(key);
    fastMatches.push(entry.item);
    if (entry.score >= 60) strongFastHits += 1;
    if (fastMatches.length >= limit) break;
  }

  const supportsLiveSite =
    query.trim().length >= 2 &&
    sourceFilter !== 'local' &&
    sourceFilter !== 'shufersal' &&
    sourceFilter !== 'openfoodfacts' &&
    sourceFilter !== 'tara' &&
    sourceFilter !== 'berman';

  // Fast-Path חכם: אם כבר יש לנו מספיק התאמות מדויקות מה-DB (לפחות 8 חזקות או 12 כלליות), מחזירים מיד (~30ms) בלי להמתין ל-10 אתרים!
  // רק אם מדובר במילה נדירה/חדשה שאין לה די תוצאות אצלנו — יוצאים לחיפוש חי ושומרים אותו להבא.
  const hasEnoughFromDb = !forceLive && (strongFastHits >= 8 || fastMatches.length >= 12);
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

  // איחוד סופי (שמירה על דירוג המדויקים תחילה + השלמה מהחיפוש החי)
  const deduped: FoodCatalogItem[] = [...fastMatches];
  for (const item of liveMatches) {
    if (deduped.length >= limit) break;
    const key = `${normalizeFoodKey(item.name)}:${Math.round(item.per100g.calories)}`;
    if (preSeen.has(key)) continue;
    preSeen.add(key);
    deduped.push(item);
  }

  const mohCount = deduped.filter(
    (i) => i.source === 'moh' || i.sourceSiteId === 'moh_gov'
  ).length;
  const scraperCount = deduped.filter((i) => Boolean(i.sourceSiteId)).length;

  return NextResponse.json({
    items: deduped,
    totalAvailable: totalCatalogEstimate,
    localCount: fastMatches.length,
    syncedCount: syncedCatalog.length,
    liveCount: liveMatches.length,
    sqlCount: sqlRes.sqlCount,
    fastPath: hasEnoughFromDb && liveMatches.length === 0,
    scraperCount,
    mohCount,
  });
}
