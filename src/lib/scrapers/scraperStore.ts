import fs from 'fs';
import path from 'path';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import {
  findFoodByBarcodeSql,
  getSqlFoodCatalogStats,
  loadScraperSuiteFromSupabase,
  saveScraperSuiteCatalogToSupabase,
  saveScraperSuiteMetaToSupabase,
  searchFoodCatalogSql,
  upsertFoodCatalogItemsToSupabase,
} from '@/lib/supabase';
import {
  FoodCatalogItem,
  ScraperCheckHistoryEntry,
  ScraperHealthResult,
  ScraperSourceId,
  ScraperSuiteReport,
} from '@/types/nutrition';
import { normalizeFoodKey, normalizeFoodSearchQuery } from './helpers';
import { extractRealBrandFromProduct } from '@/lib/foodBrands';
import {
  filterLiveScraperItemsSemantically,
  rewriteQueryForIsraeliRetailScrapers,
} from '@/lib/foodSemanticEngine';
import {
  fetchOpenFoodFactsIsraelItems,
  getScraperById,
  ISRAELI_SCRAPERS,
} from './israeliScrapers';

export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // בדיקה אוטומטית כל 6 שעות
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
const LIVE_QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const LIVE_QUERY_CACHE_MAX = 120;
const BARCODE_MISS_TTL_MS = 30 * 60 * 1000;
const BARCODE_MISS_MAX = 500;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_CATALOG_ITEMS = 2200;
const MAX_PER_SOURCE_CAP = 220;

const LOCAL_CACHE_DIR = path.join(process.cwd(), '.data');
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, 'spot-scrapers-db.json');

interface PersistedScraperData {
  report: ScraperSuiteReport;
  catalog: FoodCatalogItem[];
  loadedAt: number;
}

interface LiveQueryCacheEntry {
  items: FoodCatalogItem[];
  expiresAt: number;
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __spotScraperCache: PersistedScraperData | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperCheckPromise: Promise<ScraperSuiteReport> | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperSyncPromise: Promise<{ report: ScraperSuiteReport; addedCount: number; totalCount: number }> | undefined;
  // eslint-disable-next-line no-var
  var __spotLiveQueryCache: Map<string, LiveQueryCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperCircuit: Map<string, CircuitState> | undefined;
  // eslint-disable-next-line no-var
  var __spotBarcodeMissCache: Map<string, number> | undefined;
}

function buildInitialReport(catalog: FoodCatalogItem[]): ScraperSuiteReport {
  const counts = countBySource(catalog);
  const results: ScraperHealthResult[] = ISRAELI_SCRAPERS.map((s) => ({
    ...s.meta,
    status: 'warning',
    httpStatus: 0,
    latencyMs: 0,
    checkedAt: '',
    schemaValid: false,
    itemsExtracted: 0,
    syncedCatalogCount: counts[s.meta.id] || 0,
    needsUpdate: false,
    errorDiagnosis: 'טרם בוצעה בדיקת תקינות — הסריקה תתחיל אוטומטית',
  }));

  return {
    lastCheckedAt: null,
    lastSyncedAt: null,
    nextAutoCheckAt: null,
    trigger: 'auto',
    totalHealthy: 0,
    totalWarning: results.length,
    totalBroken: 0,
    totalScrapedCatalogItems: catalog.length,
    results,
    history: [],
  };
}

function countBySource(items: FoodCatalogItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.sourceSiteId || item.source || 'local';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function readLocalCache(): { report: ScraperSuiteReport | null; catalog: FoodCatalogItem[] } {
  try {
    if (!fs.existsSync(LOCAL_CACHE_FILE)) return { report: null, catalog: [] };
    const raw = fs.readFileSync(LOCAL_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as {
      report?: ScraperSuiteReport | null;
      catalog?: FoodCatalogItem[];
    };
    return {
      report: parsed.report || null,
      catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
    };
  } catch {
    return { report: null, catalog: [] };
  }
}

function writeLocalCache(data: { report: ScraperSuiteReport; catalog: FoodCatalogItem[] }) {
  try {
    if (!fs.existsSync(LOCAL_CACHE_DIR)) {
      fs.mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // בסביבת Vercel הייצור מערכת הקבצים לקריאה בלבד — מסתמכים על זיכרון + Supabase
  }
}

function recomputeReportSummary(
  report: ScraperSuiteReport,
  catalog: FoodCatalogItem[]
): ScraperSuiteReport {
  const counts = countBySource(catalog);
  const byId = new Map(report.results.map((r) => [r.id, r]));

  const normalizedResults: ScraperHealthResult[] = ISRAELI_SCRAPERS.map((s) => {
    const prev = byId.get(s.meta.id);
    if (prev) {
      return {
        ...prev,
        ...s.meta,
        syncedCatalogCount: counts[s.meta.id] || 0,
      };
    }
    return {
      ...s.meta,
      status: 'warning',
      httpStatus: 0,
      latencyMs: 0,
      checkedAt: '',
      schemaValid: false,
      itemsExtracted: 0,
      syncedCatalogCount: counts[s.meta.id] || 0,
      needsUpdate: false,
    };
  });

  const totalHealthy = normalizedResults.filter((r) => r.status === 'healthy').length;
  const totalWarning = normalizedResults.filter((r) => r.status === 'warning').length;
  const totalBroken = normalizedResults.filter((r) => r.status === 'broken').length;

  return {
    ...report,
    totalHealthy,
    totalWarning,
    totalBroken,
    totalScrapedCatalogItems: catalog.length,
    results: normalizedResults,
  };
}

export async function getScraperState(forceReload = false): Promise<{
  report: ScraperSuiteReport;
  catalog: FoodCatalogItem[];
}> {
  const cached = globalThis.__spotScraperCache;
  if (!forceReload && cached && Date.now() - cached.loadedAt < MEMORY_CACHE_TTL_MS) {
    return { report: cached.report, catalog: cached.catalog };
  }

  let { report, catalog } = await loadScraperSuiteFromSupabase();
  if (!report && catalog.length === 0) {
    const local = readLocalCache();
    report = local.report;
    catalog = local.catalog;
  }

  const activeIds = new Set<string>([
    ...ISRAELI_SCRAPERS.map((s) => s.meta.id),
    'shufersal',
    'openfoodfacts',
  ]);
  catalog = catalog.filter((item) => !item.sourceSiteId || activeIds.has(item.sourceSiteId));

  const sqlStats = await getSqlFoodCatalogStats(ISRAELI_SCRAPERS.map((s) => s.meta.id));
  const baseReport = recomputeReportSummary(report || buildInitialReport(catalog), catalog);
  const finalReport: ScraperSuiteReport = { ...baseReport, sqlCatalogStats: sqlStats };

  globalThis.__spotScraperCache = {
    report: finalReport,
    catalog,
    loadedAt: Date.now(),
  };

  return { report: finalReport, catalog };
}

async function persistScraperState(
  report: ScraperSuiteReport,
  catalog: FoodCatalogItem[],
  opts: { saveMeta?: boolean; saveCatalog?: boolean } = { saveMeta: true, saveCatalog: true }
) {
  const normalized = recomputeReportSummary(report, catalog);
  if (report.sqlCatalogStats) {
    normalized.sqlCatalogStats = report.sqlCatalogStats;
  }
  globalThis.__spotScraperCache = {
    report: normalized,
    catalog,
    loadedAt: Date.now(),
  };
  writeLocalCache({ report: normalized, catalog });

  if (opts.saveMeta) {
    await saveScraperSuiteMetaToSupabase(normalized).catch(() => undefined);
  }
  if (opts.saveCatalog) {
    await saveScraperSuiteCatalogToSupabase(catalog).catch(() => undefined);
  }
  return normalized;
}

export function isScraperReportStale(report: ScraperSuiteReport): boolean {
  if (!report.lastCheckedAt) return true;
  if (report.results.length !== ISRAELI_SCRAPERS.length) return true;
  if (report.results.some((r) => !r.checkedAt)) return true;
  const ts = Date.parse(report.lastCheckedAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= AUTO_CHECK_INTERVAL_MS;
}

/**
 * מריץ בדיקת תקינות אמיתית מול האתרים (בודק חילוץ ערכים ו-4 מאקרו, לא רק ping).
 */
export async function runScrapersHealthCheck(
  trigger: 'auto' | 'manual' | 'cron',
  targetScraperId?: ScraperSourceId
): Promise<ScraperSuiteReport> {
  if (!targetScraperId && globalThis.__spotScraperCheckPromise) {
    return globalThis.__spotScraperCheckPromise;
  }

  const exec = async (): Promise<ScraperSuiteReport> => {
    const { report: prevReport, catalog } = await getScraperState();
    const counts = countBySource(catalog);

    const targets = targetScraperId
      ? ISRAELI_SCRAPERS.filter((s) => s.meta.id === targetScraperId)
      : ISRAELI_SCRAPERS;

    const checkedResults = await Promise.all(
      targets.map(async (scraper) => {
        try {
          return await scraper.checkHealth(counts[scraper.meta.id] || 0);
        } catch (err) {
          return {
            ...scraper.meta,
            status: 'broken' as const,
            httpStatus: 0,
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
            schemaValid: false,
            itemsExtracted: 0,
            syncedCatalogCount: counts[scraper.meta.id] || 0,
            needsUpdate: true,
            errorDiagnosis: `שגיאה פנימית בהרצת הסקרייפר: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }
      })
    );

    const checkedMap = new Map(checkedResults.map((r) => [r.id, r]));
    const mergedResults = prevReport.results.map((old) => checkedMap.get(old.id) || old);
    for (const r of checkedResults) {
      if (!mergedResults.some((x) => x.id === r.id)) mergedResults.push(r);
    }

    const nowIso = new Date().toISOString();
    const nextAutoIso = new Date(Date.now() + AUTO_CHECK_INTERVAL_MS).toISOString();

    const provisional = recomputeReportSummary(
      {
        ...prevReport,
        lastCheckedAt: targetScraperId ? prevReport.lastCheckedAt || nowIso : nowIso,
        nextAutoCheckAt: targetScraperId ? prevReport.nextAutoCheckAt || nextAutoIso : nextAutoIso,
        trigger: targetScraperId ? prevReport.trigger : trigger,
        results: mergedResults,
      },
      catalog
    );

    const historyEntry: ScraperCheckHistoryEntry = {
      checkedAt: nowIso,
      trigger,
      healthy: provisional.totalHealthy,
      warning: provisional.totalWarning,
      broken: provisional.totalBroken,
    };

    const nextReport: ScraperSuiteReport = {
      ...provisional,
      history: targetScraperId
        ? provisional.history
        : [historyEntry, ...(provisional.history || [])].slice(0, 15),
    };

    return persistScraperState(nextReport, catalog, { saveMeta: true, saveCatalog: false });
  };

  if (targetScraperId) {
    return exec();
  }

  const p = exec().finally(() => {
    globalThis.__spotScraperCheckPromise = undefined;
  });
  globalThis.__spotScraperCheckPromise = p;
  return p;
}

/**
 * מסנכרן פריטי מזון מכל האתרים והסופרים הפעילים (או מאתר נבחר) ושומר במאגר האפליקציה עם דה-דופליקציה מלאה.
 * אם אתר אחד נכשל זמנית — הפריטים הקיימים שלו נשמרים ואינם נמחקים.
 */
export async function syncScrapersCatalog(targetScraperId?: ScraperSourceId): Promise<{
  report: ScraperSuiteReport;
  addedCount: number;
  totalCount: number;
}> {
  if (!targetScraperId && globalThis.__spotScraperSyncPromise) {
    return globalThis.__spotScraperSyncPromise;
  }

  const exec = async () => {
    const { report, catalog: existingCatalog } = await getScraperState();
    const targets = targetScraperId
      ? ISRAELI_SCRAPERS.filter((s) => s.meta.id === targetScraperId)
      : ISRAELI_SCRAPERS;

    const syncedPerSite = await Promise.all(
      targets.map(async (scraper) => {
        try {
          const items = await scraper.syncCatalog();
          return { id: scraper.meta.id, items };
        } catch {
          return { id: scraper.meta.id, items: [] as FoodCatalogItem[] };
        }
      })
    );

    // איחוד לפי אתר: אם הסנכרון הצליח (>0), מעדכן את אותו אתר; אם נכשל (0), שומר על המלאי הקודם
    const succeededSiteIds = new Set(
      syncedPerSite.filter((s) => s.items.length > 0).map((s) => s.id)
    );

    const bySource = new Map<string, Map<string, FoodCatalogItem>>();
    for (const item of existingCatalog) {
      const sid = item.sourceSiteId || 'other';
      if (succeededSiteIds.has(sid as ScraperSourceId)) continue;
      if (!bySource.has(sid)) bySource.set(sid, new Map());
      bySource.get(sid)!.set(normalizeFoodKey(item.name), item);
    }

    let freshAdded = 0;
    for (const batch of syncedPerSite) {
      if (batch.items.length === 0) continue;
      if (!bySource.has(batch.id)) bySource.set(batch.id, new Map());
      const siteMap = bySource.get(batch.id)!;
      for (const item of batch.items) {
        const key = normalizeFoodKey(item.name);
        if (!key) continue;
        if (!siteMap.has(key)) {
          siteMap.set(key, item);
          freshAdded += 1;
        }
      }
    }

    // איחוד מאוזן של כל האתרים הפעילים (דה-דופליקציה חוצת-אתרים) עם מכסת מקסימום בטוחה ל-DB
    const globalSeen = new Set<string>(
      ISRAELI_FOOD_CATALOG.map((c) => normalizeFoodKey(c.name))
    );
    const merged: FoodCatalogItem[] = [];

    for (const scraper of ISRAELI_SCRAPERS) {
      const siteItems = Array.from(bySource.get(scraper.meta.id)?.values() || []);
      let keptForSite = 0;
      for (const item of siteItems) {
        if (keptForSite >= MAX_PER_SOURCE_CAP || merged.length >= MAX_CATALOG_ITEMS) break;
        const key = `${scraper.meta.id}:${normalizeFoodKey(item.name)}`;
        if (globalSeen.has(key)) continue;
        globalSeen.add(key);
        merged.push(item);
        keptForSite += 1;
      }
    }

    const allFreshItems = syncedPerSite.flatMap((b) => b.items);
    await upsertFoodCatalogItemsToSupabase(allFreshItems).catch(() => undefined);
    const sqlStats = await getSqlFoodCatalogStats(ISRAELI_SCRAPERS.map((s) => s.meta.id));

    const updatedReport = await persistScraperState(
      {
        ...report,
        lastSyncedAt: new Date().toISOString(),
        sqlCatalogStats: sqlStats,
      },
      merged,
      { saveMeta: true, saveCatalog: true }
    );

    return {
      report: updatedReport,
      addedCount: freshAdded,
      totalCount: sqlStats.available ? Math.max(merged.length, sqlStats.totalCount) : merged.length,
    };
  };

  if (targetScraperId) {
    return exec();
  }

  const p = exec().finally(() => {
    globalThis.__spotScraperSyncPromise = undefined;
  });
  globalThis.__spotScraperSyncPromise = p;
  return p;
}

/**
 * שומר מוצרים חדשים שנתגלו דרך חיפוש חי, סריקת ברקוד או ייבוא חיצוני ישירות לטבלת ה-SQL (ללא העמסת RAM).
 */
export async function persistCatalogItemsToDb(
  items: FoodCatalogItem[]
): Promise<{ ok: boolean; tableReady: boolean; savedCount: number; error?: string }> {
  if (!items || items.length === 0) {
    return { ok: true, tableReady: true, savedCount: 0 };
  }
  const res = await upsertFoodCatalogItemsToSupabase(items);
  if (res.savedCount > 0 && globalThis.__spotScraperCache) {
    // מאפס את החותמת כדי שבבדיקת הדשבורד הבאה יוצג המונה המעודכן
    globalThis.__spotScraperCache.loadedAt = 0;
  }
  return res;
}

/**
 * מאחזר מוצרי מדף ישראליים עם ברקוד מ-Open Food Facts ישראל ושומר לטבלת food_catalog_items.
 */
export async function syncOpenFoodFactsToCatalog(pages = 5): Promise<{
  savedCount: number;
  extractedCount: number;
  tableReady: boolean;
  report: ScraperSuiteReport;
}> {
  const offItems = await fetchOpenFoodFactsIsraelItems(pages, 60);
  const res = await upsertFoodCatalogItemsToSupabase(offItems);
  const { report } = await getScraperState(true);
  return {
    savedCount: res.savedCount,
    extractedCount: offItems.length,
    tableReady: res.tableReady,
    report,
  };
}

function getLiveQueryCache(): Map<string, LiveQueryCacheEntry> {
  if (!globalThis.__spotLiveQueryCache) {
    globalThis.__spotLiveQueryCache = new Map();
  }
  return globalThis.__spotLiveQueryCache;
}

function getCircuitMap(): Map<string, CircuitState> {
  if (!globalThis.__spotScraperCircuit) {
    globalThis.__spotScraperCircuit = new Map();
  }
  return globalThis.__spotScraperCircuit;
}

function getBarcodeMissCache(): Map<string, number> {
  if (!globalThis.__spotBarcodeMissCache) {
    globalThis.__spotBarcodeMissCache = new Map();
  }
  return globalThis.__spotBarcodeMissCache;
}

export function isBarcodeMissCached(barcode: string): boolean {
  const clean = String(barcode || '').replace(/[^0-9]/g, '');
  if (!clean) return false;
  const cache = getBarcodeMissCache();
  const exp = cache.get(clean);
  if (!exp) return false;
  if (Date.now() > exp) {
    cache.delete(clean);
    return false;
  }
  return true;
}

export function markBarcodeMissCached(barcode: string): void {
  const clean = String(barcode || '').replace(/[^0-9]/g, '');
  if (!clean) return;
  const cache = getBarcodeMissCache();
  if (cache.size >= BARCODE_MISS_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(clean, Date.now() + BARCODE_MISS_TTL_MS);
}

/**
 * מעדכן שמות מותג אמיתיים גם בקטלוג המטמון השמור של הסקרייפרים (JSON/Meta) עבור פריטים ישנים.
 */
export async function backfillCachedScraperBrands(): Promise<number> {
  const { report, catalog } = await getScraperState(true);
  let updated = 0;
  const nextCatalog = catalog.map((item) => {
    const resolved = extractRealBrandFromProduct({
      explicitBrand: item.brand,
      productName: item.name,
      sourceSiteId: item.sourceSiteId,
    });
    const prev = (item.brand || '').trim();
    const next = (resolved || '').trim();
    if (prev !== next) {
      updated += 1;
      return {
        ...item,
        brand: next || undefined,
      };
    }
    return item;
  });

  if (updated > 0) {
    await persistScraperState(report, nextCatalog, {
      saveMeta: false,
      saveCatalog: true,
    });
  }
  return updated;
}

/**
 * חיפוש מהיר ישיר: שאילתת SQL היברידית אחת בלי לטעון את קאש ה-BLOB המלא של הסקרייפרים.
 */
export async function searchSqlAndCachedCatalog(opts: {
  query?: string;
  sourceMode?: 'all' | 'retail' | 'moh_gov' | 'openfoodfacts';
  sourceFilter?: string;
  brand?: string;
  queryEmbeddingText?: string | null;
  semanticWeight?: number;
  limit?: number;
}): Promise<{
  items: FoodCatalogItem[];
  sqlCount: number;
  usedHybridRpc?: boolean;
  usedSemanticRrf?: boolean;
}> {
  const limit = Math.min(60, Math.max(8, opts.limit || 36));
  const shouldHitSql =
    opts.sourceFilter !== 'local' && opts.sourceFilter !== 'favorites_recent';
  const sqlRes = shouldHitSql
    ? await searchFoodCatalogSql({
        query: opts.query,
        sourceMode: opts.sourceMode,
        sourceSiteId: opts.sourceFilter && opts.sourceFilter !== 'all' ? opts.sourceFilter : undefined,
        brand: opts.brand && opts.brand !== 'all' ? opts.brand : undefined,
        queryEmbeddingText: opts.queryEmbeddingText,
        semanticWeight: opts.semanticWeight,
        limit,
      })
    : { items: [], tableReady: false, usedHybridRpc: false, usedSemanticRrf: false };

  return {
    items: sqlRes.items,
    sqlCount: sqlRes.items.length,
    usedHybridRpc: sqlRes.usedHybridRpc,
    usedSemanticRrf: sqlRes.usedSemanticRrf,
  };
}

/**
 * בדיקת ברקוד משולבת: מקומי -> SQL (אינדקס B-tree על barcode) -> זיכרון חם קיים ללא משיכת BLOB קרה.
 */
export async function lookupBarcodeUnified(barcode: string): Promise<FoodCatalogItem | null> {
  const localMatch = ISRAELI_FOOD_CATALOG.find((i) => i.barcode === barcode);
  if (localMatch) return localMatch;

  const sqlMatch = await findFoodByBarcodeSql(barcode);
  if (sqlMatch.item) return sqlMatch.item;

  const warmCatalog = globalThis.__spotScraperCache?.catalog;
  if (Array.isArray(warmCatalog) && warmCatalog.length > 0) {
    return warmCatalog.find((i) => i.barcode === barcode) || null;
  }
  return null;
}

/**
 * מחזיר את מאגר המזון המלא של האפליקציה (לשימוש Admin בלבד).
 */
export async function getMergedCatalogItems(): Promise<FoodCatalogItem[]> {
  const { catalog } = await getScraperState();
  const seenIds = new Set(ISRAELI_FOOD_CATALOG.map((i) => i.id));
  const combined: FoodCatalogItem[] = ISRAELI_FOOD_CATALOG.map((item) => ({
    ...item,
    source: item.source || 'local',
    sourceSiteName: 'מאגר SPOT מקומי',
  }));

  for (const item of catalog) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    combined.push(item);
  }
  return combined;
}

/**
 * מריץ חיפוש חי במקביל מול אתרים תומכים, עם Query Cache (10 דק') ו-Circuit Breaker לכל ספק.
 * במצב semanticMode, משכתב שאילתות טבעיות/אנגלית למונחים קמעונאיים בעברית ומסנן רעש לא רלוונטי.
 */
export async function searchLiveScrapers(
  query: string,
  onlySourceId?: ScraperSourceId,
  maxWaitMs?: number,
  options?: { semanticMode?: boolean }
): Promise<FoodCatalogItem[]> {
  const cleanQ = query.trim();
  const normQ = normalizeFoodSearchQuery(cleanQ);
  if (normQ.length < 2) return [];

  const semanticMode = Boolean(options?.semanticMode);
  const cacheKey = `${normQ}|${onlySourceId || 'all'}|${semanticMode ? 'sem' : 'lex'}`;
  const cache = getLiveQueryCache();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  const now = Date.now();
  const circuits = getCircuitMap();
  const candidates = onlySourceId
    ? ISRAELI_SCRAPERS.filter((s) => s.meta.id === onlySourceId && typeof s.searchLive === 'function')
    : ISRAELI_SCRAPERS.filter((s) => typeof s.searchLive === 'function');

  const activeScrapers = candidates.filter((scraper) => {
    const c = circuits.get(scraper.meta.id);
    return !c || now >= c.openUntil;
  });

  if (activeScrapers.length === 0) return [];

  const searchTerms = semanticMode
    ? (await rewriteQueryForIsraeliRetailScrapers(cleanQ)).slice(0, 2)
    : [cleanQ];
  const effectiveTerms = searchTerms.length > 0 ? searchTerms : [cleanQ];
  const timeoutCap = maxWaitMs ?? (onlySourceId ? 6000 : 3400);

  const runScrapersForTerm = async (term: string): Promise<FoodCatalogItem[]> => {
    const batches = await Promise.all(
      activeScrapers.map(async (scraper) => {
        const sid = scraper.meta.id;
        try {
          const items = await Promise.race([
            scraper.searchLive!(term, 6),
            new Promise<FoodCatalogItem[]>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutCap)
            ),
          ]);
          // אפס כשלים בהצלחה (גם אם חזרו 0 תוצאות תקינות)
          circuits.delete(sid);
          return Array.isArray(items) ? items : [];
        } catch {
          const prev = circuits.get(sid) || { failures: 0, openUntil: 0 };
          const failures = prev.failures + 1;
          circuits.set(sid, {
            failures,
            openUntil: failures >= CIRCUIT_BREAKER_THRESHOLD ? Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS : 0,
          });
          return [] as FoodCatalogItem[];
        }
      })
    );
    return batches.flat();
  };

  const termBatches = await Promise.all(effectiveTerms.map((t) => runScrapersForTerm(t)));
  const rawFlat = termBatches.flat();

  // דה-דופליקציה בסיסית לפי id לפני סינון סמנטי
  const dedupedById = new Map<string, FoodCatalogItem>();
  for (const item of rawFlat) {
    if (item?.id && !dedupedById.has(item.id)) {
      dedupedById.set(item.id, item);
    }
  }
  const uniqueFlat = Array.from(dedupedById.values());
  const flat = semanticMode
    ? filterLiveScraperItemsSemantically(cleanQ, uniqueFlat)
    : uniqueFlat;

  if (cache.size >= LIVE_QUERY_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey, { items: flat, expiresAt: Date.now() + LIVE_QUERY_CACHE_TTL_MS });
  return flat;
}

export async function testSingleScraperSearch(scraperId: ScraperSourceId, query: string) {
  const scraper = getScraperById(scraperId);
  if (!scraper) return [];
  if (scraper.searchLive) {
    return scraper.searchLive(query, 6);
  }
  const { catalog } = await getScraperState();
  const qLower = normalizeFoodKey(query);
  return catalog
    .filter((i) => i.sourceSiteId === scraperId && normalizeFoodKey(i.name).includes(qLower))
    .slice(0, 8);
}
