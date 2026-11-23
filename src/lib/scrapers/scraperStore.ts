import fs from 'fs';
import path from 'path';
import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import {
  loadScraperSuiteFromSupabase,
  saveScraperSuiteCatalogToSupabase,
  saveScraperSuiteMetaToSupabase,
} from '@/lib/supabase';
import {
  FoodCatalogItem,
  ScraperCheckHistoryEntry,
  ScraperHealthResult,
  ScraperSourceId,
  ScraperSuiteReport,
} from '@/types/nutrition';
import { normalizeFoodKey } from './helpers';
import { getScraperById, ISRAELI_SCRAPERS } from './israeliScrapers';

export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // בדיקה אוטומטית כל 6 שעות
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_ITEMS = 2200;
const MAX_PER_SOURCE_CAP = 220;

const LOCAL_CACHE_DIR = path.join(process.cwd(), '.data');
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, 'spot-scrapers-db.json');

interface PersistedScraperData {
  report: ScraperSuiteReport;
  catalog: FoodCatalogItem[];
  loadedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __spotScraperCache: PersistedScraperData | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperCheckPromise: Promise<ScraperSuiteReport> | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperSyncPromise: Promise<{ report: ScraperSuiteReport; addedCount: number; totalCount: number }> | undefined;
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

  const activeIds = new Set<string>(ISRAELI_SCRAPERS.map((s) => s.meta.id));
  catalog = catalog.filter((item) => !item.sourceSiteId || activeIds.has(item.sourceSiteId));

  const finalReport = recomputeReportSummary(report || buildInitialReport(catalog), catalog);
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

    const updatedReport = await persistScraperState(
      {
        ...report,
        lastSyncedAt: new Date().toISOString(),
      },
      merged,
      { saveMeta: true, saveCatalog: true }
    );

    return {
      report: updatedReport,
      addedCount: freshAdded,
      totalCount: merged.length,
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
 * מחזיר את מאגר המזון המלא של האפליקציה (מקומי + כל המוצרים שנסרקו מהאתרים).
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
 * מריץ חיפוש חי במקביל מול כל הרשתות והאתרים הפעילים שתומכים בחיפוש דינמי.
 */
export async function searchLiveScrapers(
  query: string,
  onlySourceId?: ScraperSourceId
): Promise<FoodCatalogItem[]> {
  const cleanQ = query.trim();
  if (cleanQ.length < 2) return [];

  const liveScrapers = onlySourceId
    ? ISRAELI_SCRAPERS.filter((s) => s.meta.id === onlySourceId && typeof s.searchLive === 'function')
    : ISRAELI_SCRAPERS.filter((s) => typeof s.searchLive === 'function');

  const batches = await Promise.all(
    liveScrapers.map(async (scraper) => {
      try {
        return (await scraper.searchLive?.(cleanQ, 6)) || [];
      } catch {
        return [];
      }
    })
  );

  return batches.flat();
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
