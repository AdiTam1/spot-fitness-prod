import {
  FoodCatalogItem,
  FoodCatalogSourceId,
  FoodUnit,
  MacroTargets,
  ScraperHealthResult,
  ScraperSourceId,
} from '@/types/nutrition';
import {
  assertAllowedScraperUrl,
  decodeHtmlEntities,
  encodeWin1255,
  extractBarcodeFromText,
  extractPackageGramsFromText,
  fetchWithTimeout,
  inferSmartUnits,
  isAntiBotBlocked,
  isValidMacroSet,
  mapConcurrent,
  matchAllList,
  mergeUniqueUnits,
  normalizeFoodKey,
  parseMacroNumber,
  roundMacros,
  SPOT_OFF_USER_AGENT,
  stripHtmlTags,
} from './helpers';

export interface IsraeliScraperMeta {
  id: ScraperSourceId;
  name: string;
  domain: string;
  category: string;
  mode: 'hybrid' | 'live' | 'sync';
  estimatedCatalogSize: string;
  description: string;
  targetUrl: string;
}

export interface IsraeliFoodScraper {
  meta: IsraeliScraperMeta;
  /** בודק חיבור אמיתי + חילוץ מאקרו מלא לפריט/דף דוגמה ומוודא שמבנה האתר לא נשבר */
  checkHealth(prevSyncedCount?: number): Promise<ScraperHealthResult>;
  /** חיפוש חי באתר (עבור אתרים התומכים בחיפוש דינמי או סינון) */
  searchLive?(query: string, limit?: number): Promise<FoodCatalogItem[]>;
  /** סנכרון מנה מרכזית של מוצרים למאגר האפליקציה */
  syncCatalog(): Promise<FoodCatalogItem[]>;
}

const MOH_RESOURCE_ID = 'c3cb0630-0650-46c1-a068-82d575c094b2';

function makeCatalogItem(params: {
  idSuffix: string;
  name: string;
  brand?: string;
  category: string;
  barcode?: string;
  per100g: MacroTargets;
  units?: FoodUnit[];
  sourceSiteId: FoodCatalogSourceId;
  sourceSiteName: string;
  sourceUrl?: string;
  legacySource?: FoodCatalogItem['source'];
}): FoodCatalogItem | null {
  const cleanName = decodeHtmlEntities(params.name).replace(/\s+/g, ' ').trim();
  if (!cleanName || cleanName.length < 2) return null;
  const rounded = roundMacros(params.per100g);
  if (!isValidMacroSet(rounded)) return null;

  const baseUnits =
    params.units && params.units.length > 0
      ? params.units
      : inferSmartUnits(cleanName, params.category);

  const pkgFromName = extractPackageGramsFromText(cleanName);
  const pkgUnit =
    pkgFromName && pkgFromName !== 100
      ? [{ label: `חבילה / יחידה (${pkgFromName} גרם)`, grams: pkgFromName }]
      : [];

  return {
    id: `${params.sourceSiteId}-${params.idSuffix}`,
    name: cleanName,
    brand: params.brand ? decodeHtmlEntities(params.brand).trim() : params.sourceSiteName,
    category: params.category || 'מאגר ישראלי',
    ...(params.barcode ? { barcode: params.barcode } : {}),
    per100g: rounded,
    units: mergeUniqueUnits(params.units ? [] : pkgUnit, baseUnits),
    source: params.legacySource || 'scraper',
    sourceSiteId: params.sourceSiteId,
    sourceSiteName: params.sourceSiteName,
    sourceUrl: params.sourceUrl,
    updatedAt: new Date().toISOString(),
  };
}

function buildHealthResult(
  meta: IsraeliScraperMeta,
  opts: {
    httpStatus: number;
    latencyMs: number;
    itemsExtracted: number;
    syncedCatalogCount?: number;
    sample?: FoodCatalogItem | null;
    errorDiagnosis?: string;
    blocked?: boolean;
  }
): ScraperHealthResult {
  const schemaValid = Boolean(opts.sample && isValidMacroSet(opts.sample.per100g));
  const broken =
    opts.blocked ||
    opts.httpStatus < 200 ||
    opts.httpStatus >= 400 ||
    opts.itemsExtracted === 0 ||
    !schemaValid;

  const warning = !broken && (opts.latencyMs > 5500 || opts.itemsExtracted < 1);

  return {
    ...meta,
    status: broken ? 'broken' : warning ? 'warning' : 'healthy',
    httpStatus: opts.httpStatus,
    latencyMs: opts.latencyMs,
    checkedAt: new Date().toISOString(),
    schemaValid,
    itemsExtracted: opts.itemsExtracted,
    syncedCatalogCount: opts.syncedCatalogCount ?? 0,
    needsUpdate: broken,
    sampleItem: opts.sample
      ? {
          name: opts.sample.name,
          calories: opts.sample.per100g.calories,
          protein: opts.sample.per100g.protein,
          carbs: opts.sample.per100g.carbs,
          fat: opts.sample.per100g.fat,
          unitLabel: opts.sample.units?.[0]?.label,
        }
      : undefined,
    errorDiagnosis: broken
      ? opts.errorDiagnosis || 'לא ניתן לחלץ 4 ערכי מאקרו תקינים — ייתכן שמבנה האתר השתנה'
      : warning
        ? `זמן תגובה איטי (${opts.latencyMs}ms)`
        : undefined,
  };
}

function buildBrokenHealth(
  meta: IsraeliScraperMeta,
  httpStatus: number,
  latencyMs: number,
  diagnosis: string,
  prevSyncedCount = 0,
  blocked = false
): ScraperHealthResult {
  return buildHealthResult(meta, {
    httpStatus,
    latencyMs,
    itemsExtracted: 0,
    syncedCatalogCount: prevSyncedCount,
    sample: null,
    errorDiagnosis: diagnosis,
    blocked,
  });
}

// =============================================================================
// 1. FoodsDictionary (foodsdictionary.co.il) — ~10,000+ מותגים ומוצרי סופר
// =============================================================================

async function scrapeFoodsDictionaryProduct(
  pathOrUrl: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const rawUrl = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : `https://www.foodsdictionary.co.il/${pathOrUrl.replace(/^\/+/, '')}`;
  const url = rawUrl.replace(/ /g, '%20');
  const res = await fetchWithTimeout(url, { encoding: 'windows-1255', timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (!res.ok || blocked) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const h1Match = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = res.text.match(/<title>([\s\S]*?)<\/title>/i);
  const rawName = stripHtmlTags(h1Match?.[1] || titleMatch?.[1] || '')
    .replace(/\s*[-|]\s*FoodsDictionary.*$/i, '')
    .trim();

  const val = (idx: number) => {
    const m = res.text.match(
      new RegExp(`id=["']currentValue${idx}["'][^>]*data-start=["']([\\d.]+)["']`, 'i')
    );
    if (m) return parseMacroNumber(m[1]);
    const inner = res.text.match(
      new RegExp(`id=["']currentValue${idx}["'][^>]*>([^<]+)<`, 'i')
    );
    return inner ? parseMacroNumber(inner[1]) : NaN;
  };

  const calories = val(0);
  const protein = val(1);
  const carbs = val(2);
  const fat = val(4);

  if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const brandMatch = res.text.match(/יצרן\/מותג[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/i);
  const idMatch = url.match(/Products\/(\d+)\//i);
  const slugSlug = `${idMatch?.[1] || ''}-${normalizeFoodKey(rawName).slice(0, 32)}`.replace(/\s+/g, '-');
  const barcode = extractBarcodeFromText(res.text);

  const item = makeCatalogItem({
    idSuffix: slugSlug || String(Date.now()),
    name: rawName,
    brand: brandMatch ? stripHtmlTags(brandMatch[1]) : 'FoodsDictionary',
    category: 'מותגי סופר ישראליים',
    barcode,
    per100g: { calories, protein, carbs, fat },
    sourceSiteId: 'foodsdictionary',
    sourceSiteName: 'FoodsDictionary',
    sourceUrl: url,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchFoodsDictionary(query: string, limit = 5): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
  urlsFound: number;
}> {
  const qUrl = `https://www.foodsdictionary.co.il/FoodsSearch.php?q=${encodeWin1255(query)}`;
  const res = await fetchWithTimeout(qUrl, { encoding: 'windows-1255', timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (!res.ok || blocked) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked, urlsFound: 0 };
  }

  const rawLinks = matchAllList(
    res.text,
    /href=["']\/?(Products\/\d+\/[^"'<>]+)["']/gi
  ).map((m) => m[1]);
  const uniqueLinks = Array.from(new Set(rawLinks)).slice(0, limit);
  const parsed = await mapConcurrent(uniqueLinks, 3, async (href) => {
    const p = await scrapeFoodsDictionaryProduct(href);
    return p.item;
  });

  return {
    items: parsed.filter((x): x is FoodCatalogItem => Boolean(x)),
    status: res.status,
    latencyMs: res.latencyMs,
    blocked: false,
    urlsFound: uniqueLinks.length,
  };
}

const foodsDictionaryScraper: IsraeliFoodScraper = {
  meta: {
    id: 'foodsdictionary',
    name: 'FoodsDictionary (מילון האוכל)',
    domain: 'foodsdictionary.co.il',
    category: 'מותגי סופר ומוצרים',
    mode: 'hybrid',
    estimatedCatalogSize: '10,000+ מוצרים',
    description: 'אנציקלופדיית המזון הגדולה בישראל: תנובה, שטראוס, טרה, אסם ומותגי סופר מלאים.',
    targetUrl: 'https://www.foodsdictionary.co.il/FoodsSearch.php',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchFoodsDictionary("קוטג'", 2);
    if (res.blocked) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'זוהה דף חסימת בוטים ב-FoodsDictionary', prevSyncedCount, true);
    }
    if (res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאת HTTP ${res.status} בחיפוש FoodsDictionary`, prevSyncedCount);
    }
    if (res.urlsFound === 0) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'לא נמצאו קישורי /Products/ בתוצאות החיפוש — ייתכן שמבנה Search השתנה', prevSyncedCount);
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'שדות #currentValue0-4 לא נמצאו בדף המוצר — נדרש עדכון סלקטור', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query: string, limit = 6) {
    const res = await searchFoodsDictionary(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const seeds = [
      "קוטג'",
      'חזה עוף',
      'יוגורט פרו',
      'גבינה צהובה',
      'גבינה לבנה',
      'לחם מלא',
      'פיתה',
      'טונה',
      'חומוס',
      'טחינה',
      'שיבולת שועל',
      'חטיף חלבון',
      'ביצה',
      'אורז',
      'פסטה',
      'סלמון',
    ];
    const batches = await mapConcurrent(seeds, 4, async (term) => {
      const r = await searchFoodsDictionary(term, 4);
      return r.items;
    });
    return batches.flat();
  },
};

// =============================================================================
// 2. סוגת (sugat.com) — 139+ מוצרי יסוד ומדף ישראליים בכל הסופרים (אורז, קטניות, קמחים, דגנים)
// =============================================================================

async function scrapeSugatProduct(
  url: string,
  titleHint?: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  let calories = NaN;
  let protein = NaN;
  let carbs = NaN;
  let fat = NaN;

  for (const m of matchAllList(
    res.text,
    /<div class="b-calories__td"[^>]*>([\s\S]*?)<\/div>\s*<div class="b-calories__td"[^>]*>([\s\S]*?)<\/div>/gi
  )) {
    const label = stripHtmlTags(m[1]).trim();
    const rawMain = stripHtmlTags(m[2]).split(/מתוכ/i)[0].trim();
    const val = parseMacroNumber(rawMain);
    if (!Number.isFinite(val)) continue;
    if (label.startsWith('אנרגיה') || label.includes('קלוריות')) calories = val;
    else if (label.startsWith('חלבון') || label.startsWith('חלבונים')) protein = val;
    else if (label.startsWith('פחמימ')) carbs = val;
    else if (label.startsWith('שומנ') || label === 'שומן') fat = val;
  }

  if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitle = res.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const rawName = (stripHtmlTags(h1?.[1] || '') || decodeHtmlEntities(ogTitle?.[1] || '') || stripHtmlTags(titleHint || ''))
    .replace(/\s*[-|]\s*סוגת.*$/i, '')
    .trim();
  const fullName = rawName.includes('סוגת') ? rawName : `${rawName} — סוגת`;
  const slug = decodeURIComponent(url.split('/products/')[1] || '').replace(/\//g, '');
  const barcode = extractBarcodeFromText(res.text);
  const weightSnippet = res.text.match(/(?:משקל|תכולה|גודל אריזה)[^<\n]{0,40}(\d+(?:[.,]\d+)?\s*(?:גרם|ג'|ק"ג|ק״ג|מ"ל|ליטר))/i)?.[1];
  const pkgG = extractPackageGramsFromText(`${rawName} ${weightSnippet || ''}`);
  const units = mergeUniqueUnits(
    pkgG && pkgG !== 100 ? [{ label: `אריזה שלמה (${pkgG} גרם)`, grams: pkgG }] : [],
    inferSmartUnits(fullName, 'מוצרי יסוד וסופרים — סוגת')
  );

  const item = makeCatalogItem({
    idSuffix: normalizeFoodKey(slug || rawName).slice(0, 48),
    name: fullName,
    brand: 'סוגת',
    category: 'מוצרי יסוד וסופרים — סוגת',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units,
    sourceSiteId: 'sugat',
    sourceSiteName: 'סוגת',
    sourceUrl: url,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchSugat(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const apiUrl = `https://www.sugat.com/wp-json/wp/v2/products?search=${encodeURIComponent(
    query
  )}&per_page=${Math.min(limit + 2, 10)}`;
  const res = await fetchWithTimeout(apiUrl, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  try {
    const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
    const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, limit);
    const parsed = await mapConcurrent(valid, 4, (p) => scrapeSugatProduct(p.link!, p.title?.rendered));
    return {
      items: parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x)),
      status: res.status,
      latencyMs: res.latencyMs,
      blocked: false,
    };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked: false };
  }
}

const sugatScraper: IsraeliFoodScraper = {
  meta: {
    id: 'sugat',
    name: 'סוגת (מוצרי מדף בסופרים)',
    domain: 'sugat.com',
    category: 'מותגי סופרים ומוצרי יסוד',
    mode: 'hybrid',
    estimatedCatalogSize: '139+ מוצרי סופרמרקט רשמיים',
    description: 'קטלוג מוצרי סוגת הנמכרים בכל רשתות השיווק — אורז, קינואה, עדשים, שיבולת שועל, קמחים, קטניות ופסטה.',
    targetUrl: 'https://www.sugat.com',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchSugat('אורז', 4);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאת גישה (${res.status}) ב-sugat.com`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'לא חולצו 4 ערכי מאקרו מהסלקטור .b-calories__row בסוגת',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchSugat(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const res = await fetchWithTimeout('https://www.sugat.com/wp-json/wp/v2/products?per_page=100&page=1', {
      timeoutMs: 9000,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    try {
      const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
      const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, 100);
      const parsed = await mapConcurrent(valid, 10, (p) => scrapeSugatProduct(p.link!, p.title?.rendered));
      return parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x));
    } catch {
      return [];
    }
  },
};

// =============================================================================
// 3. ויקטורי אונליין (victoryonline.co.il) — רשת שיווק ארצית (Next.js RSC)
// =============================================================================

function extractJsonObjectAt(str: string, braceStartIdx: number): string | null {
  if (braceStartIdx < 0 || str[braceStartIdx] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = braceStartIdx; i < Math.min(str.length, braceStartIdx + 6000); i++) {
    const ch = str[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return str.slice(braceStartIdx, i + 1);
    }
  }
  return null;
}

async function scrapeVictoryProduct(productPath: string): Promise<{
  item: FoodCatalogItem | null;
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const safePath = productPath.startsWith('http')
    ? productPath
    : `https://www.victoryonline.co.il${encodeURI(decodeURIComponent(productPath))}`;
  const res = await fetchWithTimeout(safePath, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const unescaped = res.text.replace(/\\"/g, '"');
  let searchFrom = 0;
  let parsedItem: FoodCatalogItem | null = null;

  while (searchFrom < unescaped.length) {
    const nfKeyIdx = unescaped.indexOf('"nutritionFacts":{', searchFrom);
    if (nfKeyIdx < 0) break;
    const objStr = extractJsonObjectAt(unescaped, nfKeyIdx + '"nutritionFacts":'.length);
    searchFrom = nfKeyIdx + 20;
    if (!objStr || objStr === '{}') continue;

    try {
      const nf = JSON.parse(objStr) as Record<
        string,
        { per100g?: string; per100ml?: string; perServing?: string; label?: string; text?: string } | undefined
      >;
      const readMetric = (k: string) => {
        const entry = nf[k];
        if (!entry) return NaN;
        return parseMacroNumber(entry.per100g || entry.per100ml || '');
      };
      const calories = readMetric('energy');
      const protein = readMetric('protein');
      const carbs = readMetric('carbs');
      const fat = readMetric('fat');

      if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
        continue;
      }

      const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = res.text.match(/<title>([\s\S]*?)<\/title>/i);
      const slugFallback = decodeURIComponent(safePath.split('/product/')[1] || '').replace(/-/g, ' ');
      const rawName = stripHtmlTags(h1?.[1] || title?.[1] || slugFallback)
        .replace(/\s*[-|]\s*ויקטורי.*$/i, '')
        .trim();

      const ctxStart = Math.max(0, nfKeyIdx - 3200);
      const ctxEnd = Math.min(unescaped.length, nfKeyIdx + objStr.length + 500);
      const localCtx = unescaped.slice(ctxStart, ctxEnd);

      const barcode =
        localCtx.match(/"sku"\s*:\s*"(\d{6,16})"/i)?.[1] ||
        extractBarcodeFromText(localCtx) ||
        extractBarcodeFromText(res.text);

      const weightTextRaw = localCtx.match(/"weightText"\s*:\s*"([^"]+)"/i)?.[1] || '';
      const servingNameRaw = localCtx.match(/"nutritionServingSize"\s*:\s*"([^"]+)"/i)?.[1]?.trim() || '';
      const isLiquid =
        Boolean(nf.energy?.per100ml && !nf.energy?.per100g) ||
        /מ"ל|מל|מ״ל|ליטר/.test(weightTextRaw);

      let pkgGrams =
        extractPackageGramsFromText(weightTextRaw) ||
        extractPackageGramsFromText(rawName);
      if (!pkgGrams && nf.energy?.perServing && calories > 0) {
        const srvCal = parseMacroNumber(nf.energy.perServing);
        if (srvCal > 0) {
          const est = Math.round((srvCal / calories) * 100);
          if (est >= 5 && est <= 3000 && est !== 100) pkgGrams = est;
        }
      }

      const pkgUnits: FoodUnit[] = [];
      if (pkgGrams && pkgGrams > 0 && pkgGrams !== 100) {
        const unitName = servingNameRaw && servingNameRaw !== '100 גרם' ? `${servingNameRaw} / חבילה` : 'חבילה / יחידה';
        pkgUnits.push({
          label: `${unitName} (${pkgGrams} ${isLiquid ? 'מ״ל' : 'גרם'})`,
          grams: pkgGrams,
        });
      }

      const smartUnits = inferSmartUnits(rawName, 'סופרמרקט ויקטורי');
      if (isLiquid) smartUnits.push({ label: '100 מ״ל', grams: 100 });
      const units = mergeUniqueUnits(pkgUnits, smartUnits);

      parsedItem = makeCatalogItem({
        idSuffix: normalizeFoodKey(rawName).slice(0, 44),
        name: rawName,
        brand: 'ויקטורי אונליין',
        category: 'סופרמרקט ויקטורי',
        barcode,
        per100g: { calories, protein, carbs, fat },
        units,
        sourceSiteId: 'victory',
        sourceSiteName: 'ויקטורי אונליין',
        sourceUrl: safePath,
      });
      if (parsedItem) break;
    } catch {
      continue;
    }
  }

  return { item: parsedItem, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchVictory(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const url = `https://www.victoryonline.co.il/search?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const paths = Array.from(
    new Set(matchAllList(res.text, /href="(\/product\/[^"]+)"/g).map((m) => m[1]))
  ).slice(0, limit + 5);

  const parsed = await mapConcurrent(paths, 4, (p) => scrapeVictoryProduct(p));
  return {
    items: parsed
      .map((p) => p.item)
      .filter((x): x is FoodCatalogItem => Boolean(x))
      .slice(0, limit),
    status: res.status,
    latencyMs: res.latencyMs,
    blocked: false,
  };
}

const victoryScraper: IsraeliFoodScraper = {
  meta: {
    id: 'victory',
    name: 'ויקטורי אונליין (סופרמרקט)',
    domain: 'victoryonline.co.il',
    category: 'רשת שיווק וסופרמרקט',
    mode: 'hybrid',
    estimatedCatalogSize: '12,000+ מוצרי סופרמרקט',
    description: 'רשת המזון ויקטורי אונליין — שליפה חיה מתוך נתוני המוצר (אנרגיה, חלבונים, פחמימות ושומנים ל-100 גרם/מ״ל).',
    targetUrl: 'https://www.victoryonline.co.il',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchVictory('יוגורט פרו', 6);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאה (${res.status}) ב-victoryonline.co.il`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'שדה "nutritionFacts" ב-Next.js RSC של ויקטורי לא נמצא או שינה מבנה',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchVictory(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const terms = [
      'יוגורט פרו',
      'מולר פרוטאין',
      'גבינה צהובה',
      'קוטג',
      'חלב',
      'טונה',
      'לחם',
      'פסטה',
      'חטיף חלבון',
      'שיבולת שועל',
    ];
    const batches = await mapConcurrent(terms, 3, (q) => searchVictory(q, 5));
    return batches.flatMap((b) => b.items);
  },
};

// =============================================================================
// 3. משרד הבריאות הצמרת (data.gov.il) — 4,624 פריטי מזון רשמיים
// =============================================================================

async function queryMohGov(params: { q?: string; limit?: number; offset?: number }) {
  const sp = new URLSearchParams({
    resource_id: MOH_RESOURCE_ID,
    limit: String(params.limit ?? 30),
  });
  if (params.q) {
    const cleanQ = params.q.replace(/['"`׳״]/g, '').trim();
    if (cleanQ) sp.set('q', cleanQ);
  }
  if (params.offset) sp.set('offset', String(params.offset));
  const url = `https://data.gov.il/api/3/action/datastore_search?${sp.toString()}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { items: [], total: 0, status: res.status, latencyMs: res.latencyMs };

  try {
    const json = JSON.parse(res.text) as {
      success?: boolean;
      result?: { total?: number; records?: Array<Record<string, unknown>> };
    };
    const records = json?.result?.records || [];
    const items = records
      .map((rec) => {
        const name = String(rec.shmmitzrach || '').trim();
        const code = String(rec.smlmitzrach || rec._id || Math.random());
        return makeCatalogItem({
          idSuffix: code,
          name,
          brand: 'משרד הבריאות',
          category: 'מאגר הצמרת הלאומי',
          per100g: {
            calories: Number(rec.food_energy) || 0,
            protein: Number(rec.protein) || 0,
            carbs: Number(rec.carbohydrates) || 0,
            fat: Number(rec.total_fat) || 0,
          },
          sourceSiteId: 'moh_gov',
          sourceSiteName: 'משרד הבריאות',
          sourceUrl: 'https://data.gov.il/dataset/tzameret',
          legacySource: 'moh',
        });
      })
      .filter((x): x is FoodCatalogItem => Boolean(x));

    return {
      items,
      total: Number(json?.result?.total) || 0,
      status: res.status,
      latencyMs: res.latencyMs,
    };
  } catch {
    return { items: [], total: 0, status: res.status, latencyMs: res.latencyMs };
  }
}

const mohGovScraper: IsraeliFoodScraper = {
  meta: {
    id: 'moh_gov',
    name: 'משרד הבריאות — מאגר הצמרת',
    domain: 'data.gov.il',
    category: 'מאגר ממשלתי רשמי',
    mode: 'hybrid',
    estimatedCatalogSize: '4,624 פריטים רשמיים',
    description: 'מאגר הנתונים הרשמי של משרד הבריאות הישראלי בפורמט CKAN JSON פתוח.',
    targetUrl: `https://data.gov.il/api/3/action/datastore_search?resource_id=${MOH_RESOURCE_ID}`,
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await queryMohGov({ q: 'חלב', limit: 5 });
    if (res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאת HTTP ${res.status} מ-data.gov.il`, prevSyncedCount);
    }
    if (res.items.length === 0 || res.total < 10) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'מבנה התשובה מ-data.gov.il חסר רשומות או ש-resource_id השתנה', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query: string, limit = 15) {
    const res = await queryMohGov({ q: query, limit });
    return res.items;
  },
  async syncCatalog() {
    const offsets = [0, 1000, 2000, 3000, 4000];
    const batches = await mapConcurrent(offsets, 5, (offset) =>
      queryMohGov({ limit: 1000, offset })
    );
    return batches.flatMap((b) => b.items);
  },
};

// =============================================================================
// 4. Foodik (foodik.co.il) — 4,507 מוצרים ומידות ישראליות (JSON API)
// =============================================================================

async function queryFoodik(query: string): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  if (query.trim().length < 2) {
    return { items: [], status: 200, latencyMs: 0, blocked: false };
  }
  const url = `https://www.foodik.co.il/api/foods/search?q=${encodeURIComponent(query.trim())}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (!res.ok || blocked) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  try {
    const json = JSON.parse(res.text) as {
      results?: Array<{
        id?: number;
        slug?: string;
        name?: string;
        categorySlug?: string;
        nutrients?: { energy?: number; protein?: number; carbs?: number; fat?: number };
        units?: Array<{ name?: string; grams?: number }>;
      }>;
    };
    const list = Array.isArray(json.results) ? json.results : [];
    const items = list
      .map((entry) => {
        const units: FoodUnit[] = (entry.units || [])
          .filter((u) => u.name && Number(u.grams) > 0)
          .map((u) => ({
            label: `${u.name} (${Math.round(Number(u.grams))} גרם)`,
            grams: Math.round(Number(u.grams)),
          }));
        units.push({ label: '100 גרם', grams: 100 });

        return makeCatalogItem({
          idSuffix: String(entry.id || entry.slug || Math.random()),
          name: String(entry.name || ''),
          brand: 'Foodik',
          category: entry.categorySlug || 'מאגר Foodik',
          per100g: {
            calories: Number(entry.nutrients?.energy) || 0,
            protein: Number(entry.nutrients?.protein) || 0,
            carbs: Number(entry.nutrients?.carbs) || 0,
            fat: Number(entry.nutrients?.fat) || 0,
          },
          units,
          sourceSiteId: 'foodik',
          sourceSiteName: 'Foodik',
          sourceUrl: entry.slug
            ? `https://www.foodik.co.il/foods/${entry.slug}/`
            : 'https://www.foodik.co.il/foods',
        });
      })
      .filter((x): x is FoodCatalogItem => Boolean(x));

    return { items, status: res.status, latencyMs: res.latencyMs, blocked: false };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked: false };
  }
}

const foodikScraper: IsraeliFoodScraper = {
  meta: {
    id: 'foodik',
    name: 'Foodik (פודיק)',
    domain: 'foodik.co.il',
    category: 'אינדקס ומידות ישראלי',
    mode: 'hybrid',
    estimatedCatalogSize: '4,507 מוצרים',
    description: 'מאגר ישראלי מודרני עם חיפוש JSON מהיר ופירוט יחידות מידה מקומיות (גביע, כף, פרוסה).',
    targetUrl: 'https://www.foodik.co.il/api/foods/search',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await queryFoodik('קוטג');
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאת חיבור (${res.status}) אל /api/foods/search`, prevSyncedCount, res.blocked);
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'ה-API של Foodik החזיר 0 תוצאות או שינה פורמט JSON', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query: string, limit = 8) {
    const res = await queryFoodik(query);
    return res.items.slice(0, limit);
  },
  async syncCatalog() {
    const terms = [
      'קוטג',
      'חלב',
      'גבינה',
      'יוגורט',
      'חזה עוף',
      'עוף',
      'סלמון',
      'טונה',
      'ביצה',
      'אורז',
      'פסטה',
      'לחם',
      'פיתה',
      'שיבולת',
      'חומוס',
      'טחינה',
      'עדשים',
      'תפוח',
      'בננה',
      'אבוקדו',
      'שקד',
      'שוקו',
      'פלאפל',
      'שווארמה',
    ];
    const batches = await mapConcurrent(terms, 4, (q) => queryFoodik(q));
    return batches.flatMap((b) => b.items);
  },
};

// =============================================================================
// 5. NetoGreen (netogreen.co.il) — אלפי מוצרים via Nutrition.asmx JSON
// =============================================================================

async function queryNetoGreenFoodMacros(
  foodId: number,
  name: string
): Promise<FoodCatalogItem | null> {
  const res = await fetchWithTimeout(
    'https://www.netogreen.co.il/NutritionUC/Nutrition.asmx/GetFoodsSummeryHTML',
    {
      method: 'POST',
      timeoutMs: 8500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        pFoodRows: [
          {
            FoodCategory: 0,
            Place: 0,
            DRI: 0,
            DRI_Protein: 0,
            FoodID: foodId,
            UnitId: 1023, // 1023 = גרמים בנטוגרין
            Quantity: '100',
            MealID: 0,
            Calories: 0,
            Protein: 0,
            Carbohydrates: 0,
            FoodCode: 0,
          },
        ],
      }),
    }
  );
  if (!res.ok) return null;

  try {
    const json = JSON.parse(res.text) as { d?: { SummeryHTML?: string } };
    const html = json.d?.SummeryHTML || '';
    // תבנית: אנרגייה | פחמימות | חלבונים | שומן כולל בשורת summary + ערכים בשורת odd
    const numsMatch = html.match(
      /אנרגייה[\s\S]*?<tr[^>]*class=["']odd["'][^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/i
    );
    if (!numsMatch) return null;

    const calories = parseMacroNumber(numsMatch[1]);
    const carbs = parseMacroNumber(numsMatch[2]);
    const protein = parseMacroNumber(numsMatch[3]);
    const fat = parseMacroNumber(numsMatch[4]);

    return makeCatalogItem({
      idSuffix: String(foodId),
      name,
      brand: 'נטוגרין',
      category: 'מחשבון תזונה ישראלי',
      per100g: { calories, protein, carbs, fat },
      sourceSiteId: 'netogreen',
      sourceSiteName: 'NetoGreen',
      sourceUrl: 'https://www.netogreen.co.il/Calculators/Nutrition-Calories.aspx',
    });
  } catch {
    return null;
  }
}

async function searchNetoGreen(query: string, limit = 5): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  foundCount: number;
}> {
  const res = await fetchWithTimeout(
    'https://www.netogreen.co.il/NutritionUC/Nutrition.asmx/SearchFoodsFromKeywords',
    {
      method: 'POST',
      timeoutMs: 8500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ pKeyword: query }),
    }
  );
  if (!res.ok) return { items: [], status: res.status, latencyMs: res.latencyMs, foundCount: 0 };

  try {
    const json = JSON.parse(res.text) as { d?: Array<{ Value: number; Name: string }> };
    const list = (Array.isArray(json.d) ? json.d : []).slice(0, limit);
    const parsed = await mapConcurrent(list, 3, (entry) =>
      queryNetoGreenFoodMacros(entry.Value, entry.Name)
    );
    return {
      items: parsed.filter((x): x is FoodCatalogItem => Boolean(x)),
      status: res.status,
      latencyMs: res.latencyMs,
      foundCount: list.length,
    };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, foundCount: 0 };
  }
}

const netogreenScraper: IsraeliFoodScraper = {
  meta: {
    id: 'netogreen',
    name: 'NetoGreen (נטוגרין)',
    domain: 'netogreen.co.il',
    category: 'מחשבון קלוריות ותיק',
    mode: 'hybrid',
    estimatedCatalogSize: '3,000+ מזונות ומותגים',
    description: 'מחשבון התזונה הישראלי הפועל ישירות מול שירות ה-ASMX JSON של נטוגרין.',
    targetUrl: 'https://www.netogreen.co.il/Calculators/Nutrition-Calories.aspx',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchNetoGreen("קוטג'", 2);
    if (res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאת HTTP ${res.status} בשירות Nutrition.asmx`, prevSyncedCount);
    }
    if (res.foundCount === 0 || res.items.length === 0) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'שירות SearchFoodsFromKeywords / GetFoodsSummeryHTML שינה פורמט', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query: string, limit = 5) {
    const res = await searchNetoGreen(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const terms = [
      "קוטג'",
      'גבינה לבנה',
      'חזה עוף',
      'ביצה',
      'אורז',
      'פסטה',
      'לחם',
      'טונה',
      'חומוס',
      'טחינה',
      'יוגורט',
      'פיתה',
      'שניצל',
      'פלאפל',
      'סלמון',
      'חלב',
      'אבוקדו',
    ];
    const batches = await mapConcurrent(terms, 3, (q) => searchNetoGreen(q, 3));
    return batches.flatMap((b) => b.items);
  },
};

// =============================================================================
// 6. ניצת הדובדבן (nizat.com) — רשת סופרים אורגניים וחנויות טבע הגדולה בישראל
// =============================================================================

async function scrapeNizatProduct(
  prodId: number | string,
  titleHint?: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const url = `https://www.nizat.com/productinfo.aspx?prodid=${prodId}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const specsMatch = res.text.match(/id="ContentPlaceHolder1_specs"[^>]*>([\s\S]*?)<\/span>/i);
  const rawBlock = specsMatch
    ? specsMatch[1]
    : (() => {
        const idx = res.text.indexOf('סימון תזונתי');
        return idx >= 0 ? res.text.slice(idx, idx + 1500) : '';
      })();

  if (!rawBlock) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const clean = stripHtmlTags(rawBlock);
  const calMatch = clean.match(/(?:אנרגיה\s*(?:\([^)]*\))?|קלוריות)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
  const fatMatch = clean.match(/(?:סך\s*ה?שומנים|שומנים)\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
  const carbMatch = clean.match(/(?:סך\s*ה?פחמימות|פחמימות)\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
  const proMatch = clean.match(/חלבונים?\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);

  if (!calMatch || !fatMatch || !carbMatch || !proMatch) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const titleMatch = res.text.match(/<title>([\s\S]*?)<\/title>/i);
  const name = (titleHint || stripHtmlTags(titleMatch?.[1] || '')).trim();
  const weightEl = res.text.match(/id="ContentPlaceHolder1_lblweight"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
  const pkgGrams =
    extractPackageGramsFromText(weightEl) ||
    extractPackageGramsFromText(name) ||
    extractPackageGramsFromText(res.text.match(/תכולה\s*[:\-]?\s*<[^>]*>([^<]+)/i)?.[1] || '');
  const barcode = extractBarcodeFromText(res.text);
  const units = mergeUniqueUnits(
    pkgGrams && pkgGrams !== 100
      ? [{ label: `אריזה שלמה (${pkgGrams} גרם)`, grams: pkgGrams }]
      : [],
    inferSmartUnits(name, 'ניצת הדובדבן')
  );

  const item = makeCatalogItem({
    idSuffix: String(prodId),
    name,
    brand: 'ניצת הדובדבן',
    category: 'טבע ואורגני — ניצת הדובדבן',
    barcode,
    per100g: {
      calories: parseMacroNumber(calMatch[1]),
      protein: parseMacroNumber(proMatch[1]),
      carbs: parseMacroNumber(carbMatch[1]),
      fat: parseMacroNumber(fatMatch[1]),
    },
    units,
    sourceSiteId: 'nizat',
    sourceSiteName: 'ניצת הדובדבן',
    sourceUrl: url,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchNizat(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const url = `https://www.nizat.com/autosuggestproducts.ashx?term=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  try {
    const arr = JSON.parse(res.text) as Array<{ id?: number; value?: string }>;
    const candidates = (Array.isArray(arr) ? arr : [])
      .filter((x) => x.id && x.value)
      .slice(0, limit + 6);
    const parsed = await mapConcurrent(candidates, 4, (c) => scrapeNizatProduct(c.id!, c.value!));
    return {
      items: parsed
        .map((p) => p.item)
        .filter((x): x is FoodCatalogItem => Boolean(x))
        .slice(0, limit),
      status: res.status,
      latencyMs: res.latencyMs,
      blocked: false,
    };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked: false };
  }
}

const nizatScraper: IsraeliFoodScraper = {
  meta: {
    id: 'nizat',
    name: 'ניצת הדובדבן (סופר אורגני וטבע)',
    domain: 'nizat.com',
    category: 'רשת טבע וסופרים אורגניים',
    mode: 'hybrid',
    estimatedCatalogSize: '5,000+ מוצרי טבע ואורגני',
    description: 'רשת הסופרים האורגניים וחנויות הטבע הגדולה בישראל — קמחים, טחינה, חטיפים, קטניות ומזון בריאות.',
    targetUrl: 'https://www.nizat.com',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchNizat('קמח', 5);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאת גישה (${res.status}) ב-nizat.com`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'autosuggestproducts.ashx או #ContentPlaceHolder1_specs בניצת הדובדבן שינו מבנה',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchNizat(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const terms = [
      'קמח',
      'שיבולת שועל',
      'טחינה',
      'עדשים',
      'חמאת בוטנים',
      'שקדים',
      'גרנולה',
      'שוקולד',
      'פריכיות',
      'חטיף',
      'חלב',
      'פסטה',
    ];
    const batches = await mapConcurrent(terms, 3, (q) => searchNizat(q, 5));
    return batches.flatMap((b) => b.items);
  },
};

// =============================================================================
// 7. טבע בריא (tevabari.co.il) — רשת חנויות טבע ותזונת ספורט (לבקשת המשתמש)
// =============================================================================

async function scrapeTevaBariProduct(
  slugOrUrl: string,
  titleHint?: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const fullUrl = slugOrUrl.startsWith('http')
    ? slugOrUrl
    : `https://www.tevabari.co.il${slugOrUrl.startsWith('/') ? '' : '/'}${slugOrUrl}`;
  const res = await fetchWithTimeout(fullUrl, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const descIdx = res.text.indexOf('class="product-description"');
  if (descIdx < 0) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const rawSlice = res.text.slice(descIdx, descIdx + 8500);
  const stopA = rawSlice.indexOf('vm-product-details-container');
  const stopB = rawSlice.indexOf('product-neighbours');
  const endPos = stopA > 50 ? stopA : stopB > 50 ? stopB : rawSlice.length;

  const cleanFull = decodeHtmlEntities(
    rawSlice
      .slice(0, endPos)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|li|tr|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[״”]/g, '"')
    .replace(/[’׳]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // מתחיל חילוץ מאזור טבלת/רשימת הערכים ("מנת הגשה X ג' מכילה" / "ערכים תזונתיים") כדי להימנע ממשפטי שיווק
  const specificNutStart = cleanFull.search(
    /(?:כל מנת הגשה\s*\(?\s*\d+|למנת הגשה\s*(?:של\s*)?\(?\s*\d+|ערכים תזונתיים\s*(?:למנת|ל[\-\s]?100)|סימון תזונתי)/i
  );
  const generalNutStart = cleanFull.search(/(?:כל מנת הגשה|ערכים תזונתיים|סימון תזונתי|למנת הגשה)/i);
  const nutStart = specificNutStart >= 0 ? specificNutStart : generalNutStart;
  const focus = nutStart >= 0 ? cleanFull.slice(nutStart, nutStart + 800) : cleanFull;

  const calMatch =
    focus.match(/(\d+(?:[.,]\d+)?)\s*(?:-\s*\d+(?:[.,]\d+)?)?\s*קלוריות/i) ||
    focus.match(/(?:אנרגיה|קלוריות)\s*[:\-–]?\s*(\d+(?:[.,]\d+)?)/i);
  const proMatch =
    focus.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג\b)?\s*(?:חלבונים|חלבון)/i) ||
    focus.match(/(?:חלבונים|חלבון)\s*[:\-–]?\s*(\d+(?:[.,]\d+)?)/i);
  const carbMatch =
    focus.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג\b)?\s*(?:פחמימות|פחמימה|פחמימ\S*)/i) ||
    focus.match(/(?:פחמימות|פחמימה)\s*[:\-–]?\s*(\d+(?:[.,]\d+)?)/i);
  const fatMatch =
    focus.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג\b)?\s*(?:שומנים|שומן)/i) ||
    focus.match(/(?:שומנים|שומן)\s*[:\-–]?\s*(\d+(?:[.,]\d+)?)/i);

  if (!calMatch || !proMatch || !carbMatch || !fatMatch) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  let calories = parseMacroNumber(calMatch[1]);
  let protein = parseMacroNumber(proMatch[1]);
  let carbs = parseMacroNumber(carbMatch[1]);
  let fat = parseMacroNumber(fatMatch[1]);

  const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = (stripHtmlTags(h1?.[1] || '') || titleHint || '').trim();

  const hasPer100 = /ל[\-\s]?100\s*(?:גרם|ג'|ג"|מ"ל|מל)/i.test(focus);
  const srvMatch = focus.match(
    /(?:מנת הגשה|למנה|במנה|מנה אחת)\s*(?:של)?\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג\b|מ"ל|מל|מ'ל)/i
  );
  const units = inferSmartUnits(name, 'טבע בריא');

  if (!hasPer100 && srvMatch) {
    const srvGrams = parseMacroNumber(srvMatch[1]);
    if (srvGrams > 0 && srvGrams !== 100) {
      const factor = 100 / srvGrams;
      calories *= factor;
      protein *= factor;
      carbs *= factor;
      fat *= factor;
      units.unshift({ label: `מנת הגשה (${srvGrams} גרם)`, grams: srvGrams });
    }
  }

  const slug = fullUrl.split('/').filter(Boolean).pop() || normalizeFoodKey(name).slice(0, 40);
  const brandMatch = name.split('|')[1]?.trim();
  const barcode = extractBarcodeFromText(res.text);
  const pkgFromTitle = extractPackageGramsFromText(name);
  const enrichedUnits = mergeUniqueUnits(
    pkgFromTitle && pkgFromTitle !== 100
      ? [{ label: `חבילה / יחידה (${pkgFromTitle} גרם)`, grams: pkgFromTitle }]
      : [],
    units
  );

  const item = makeCatalogItem({
    idSuffix: slug.slice(0, 48),
    name,
    brand: brandMatch || 'טבע בריא',
    category: 'חנות טבע ותזונה — טבע בריא',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units: enrichedUnits,
    sourceSiteId: 'tevabari',
    sourceSiteName: 'טבע בריא',
    sourceUrl: fullUrl,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchTevaBari(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const url = `https://www.tevabari.co.il/index.php?option=com_virtuemart&view=category&search=true&keyword=${encodeURIComponent(
    query
  )}`;
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const mainStart = res.text.indexOf('browse-view');
  const body = mainStart >= 0 ? res.text.slice(mainStart) : res.text;
  const candidates = new Map<string, string>();
  for (const m of matchAllList(
    body,
    /<div class="vm-details-button">\s*<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"/gi
  )) {
    if (!candidates.has(m[1])) candidates.set(m[1], decodeHtmlEntities(m[2]));
  }

  const picked = Array.from(candidates.entries()).slice(0, limit + 8);
  const parsed = await mapConcurrent(picked, 4, ([href, title]) => scrapeTevaBariProduct(href, title));
  return {
    items: parsed
      .map((p) => p.item)
      .filter((x): x is FoodCatalogItem => Boolean(x))
      .slice(0, limit),
    status: res.status,
    latencyMs: res.latencyMs,
    blocked: false,
  };
}

const tevabariScraper: IsraeliFoodScraper = {
  meta: {
    id: 'tevabari',
    name: 'טבע בריא (חנות טבע ותזונת ספורט)',
    domain: 'tevabari.co.il',
    category: 'חנות טבע, דיאטה וחלבון',
    mode: 'hybrid',
    estimatedCatalogSize: 'מאות מוצרי דיאטה, רטבים וחלבון',
    description: 'רשת הבריאות ותזונת הספורט טבע בריא — פנקייק חלבון, רטבי זירו, חטיפי חלבון, ממרחים ותחליפי סוכר.',
    targetUrl: 'https://www.tevabari.co.il',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchTevaBari('פנקייק', 4);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאת גישה (${res.status}) ב-tevabari.co.il`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'לא חולצו 4 ערכי מאקרו מהסלקטור .product-description בטבע בריא',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchTevaBari(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const queries = [
      'פנקייק',
      'רוטב',
      'קטשופ',
      'מיונז',
      'ברביקיו',
      'אלף האיים',
      'עוגיות',
      'סירופ',
      'דייסה',
    ];
    const searchPages = await mapConcurrent(queries, 4, async (q) => {
      const r = await fetchWithTimeout(
        `https://www.tevabari.co.il/index.php?option=com_virtuemart&view=category&search=true&keyword=${encodeURIComponent(
          q
        )}`,
        { timeoutMs: 8500 }
      );
      if (!r.ok) return [] as Array<[string, string]>;
      const mainStart = r.text.indexOf('browse-view');
      const body = mainStart >= 0 ? r.text.slice(mainStart) : r.text;
      return matchAllList(
        body,
        /<div class="vm-details-button">\s*<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"/gi
      ).map((m) => [m[1], decodeHtmlEntities(m[2])] as [string, string]);
    });

    const uniqueLinks = new Map<string, string>();
    for (const batch of searchPages) {
      for (const [href, title] of batch) {
        if (!uniqueLinks.has(href)) uniqueLinks.set(href, title);
      }
    }

    const parsed = await mapConcurrent(
      Array.from(uniqueLinks.entries()).slice(0, 36),
      7,
      ([href, title]) => scrapeTevaBariProduct(href, title)
    );
    return parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x));
  },
};

// =============================================================================
// 8. Fuder (fuder.co.il) — ~6,000 מוצרי מותגי סופרים בישראל (WP REST API)
// =============================================================================

async function scrapeFuderProduct(
  url: string,
  titleHint?: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  const ogTitle = decodeHtmlEntities(
    res.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
  );
  const ogDesc = decodeHtmlEntities(
    res.text.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
  );
  const metaDesc = decodeHtmlEntities(
    res.text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
  );

  const calMatch = ogTitle.match(/([\d.,]+)\s*קלוריות ל[-\s]?100/i) ||
    metaDesc.match(/ל[-\s]?100\s*גרם:\s*([\d.,]+)\s*קלוריות/i);
  const proMatch = ogDesc.match(/([\d.,]+)\s*גרם חלבון/i) ||
    metaDesc.match(/([\d.,]+)\s*גרם חלבון/i);
  const carbMatch = ogDesc.match(/([\d.,]+)\s*גרם פחמימות/i) ||
    metaDesc.match(/([\d.,]+)\s*גרם פחמימות/i);
  const fatMatch = ogDesc.match(/([\d.,]+)\s*גרם שומן/i) ||
    metaDesc.match(/([\d.,]+)\s*גרם שומן/i);

  if (!calMatch || !proMatch || !carbMatch || !fatMatch) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const titleName = ogTitle.split('—')[0]?.trim() || stripHtmlTags(titleHint || '');
  const extractedUnits: FoodUnit[] = [];

  const portionAttrMatch = res.text.match(/data-fuder-portion=['"]([^'"]+)['"]/i);
  if (portionAttrMatch?.[1]) {
    try {
      const pJson = JSON.parse(decodeHtmlEntities(portionAttrMatch[1])) as {
        portions?: Array<{ label?: string; name?: string; grams?: number; weight?: number }>;
      };
      for (const p of pJson.portions || []) {
        const g = Math.round(Number(p.grams ?? p.weight) || 0);
        const lbl = String(p.label || p.name || '').trim();
        if (lbl && g > 0 && g !== 100) {
          extractedUnits.push({ label: `${lbl} (${g} גרם)`, grams: g });
        }
      }
    } catch {
      // ignore invalid portion json
    }
  }

  const pkgMatch = metaDesc.match(/\?\s*([^\(]+?)\s*\((\d+(?:[.,]\d+)?)\s*(?:גרם|מ"ל|מל)\)/);
  if (pkgMatch) {
    const pkgGrams = parseMacroNumber(pkgMatch[2]);
    if (pkgGrams > 0 && pkgGrams !== 100) {
      extractedUnits.push({ label: `${pkgMatch[1].trim()} (${pkgGrams} גרם)`, grams: pkgGrams });
    }
  }

  const barcode = extractBarcodeFromText(res.text);
  const units = mergeUniqueUnits(extractedUnits, inferSmartUnits(titleName, 'מוצרי סופרים'));

  const slug = decodeURIComponent(url.split('/foods/')[1] || '').replace(/\//g, '');
  const item = makeCatalogItem({
    idSuffix: normalizeFoodKey(slug || titleName).slice(0, 48),
    name: titleName,
    brand: 'Fuder סופרים',
    category: 'מותגי סופרים — Fuder',
    barcode,
    per100g: {
      calories: parseMacroNumber(calMatch[1]),
      protein: parseMacroNumber(proMatch[1]),
      carbs: parseMacroNumber(carbMatch[1]),
      fat: parseMacroNumber(fatMatch[1]),
    },
    units,
    sourceSiteId: 'fuder',
    sourceSiteName: 'Fuder מוצרי סופרים',
    sourceUrl: url,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchFuder(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const apiUrl = `https://www.fuder.co.il/wp-json/wp/v2/foods?search=${encodeURIComponent(
    query
  )}&per_page=${Math.min(limit + 2, 12)}`;
  const res = await fetchWithTimeout(apiUrl, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  try {
    const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
    const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, limit);
    const parsed = await mapConcurrent(valid, 4, (p) => scrapeFuderProduct(p.link!, p.title?.rendered));
    return {
      items: parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x)),
      status: res.status,
      latencyMs: res.latencyMs,
      blocked: false,
    };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked: false };
  }
}

const fuderScraper: IsraeliFoodScraper = {
  meta: {
    id: 'fuder',
    name: 'Fuder (6,000+ מוצרי סופרים)',
    domain: 'fuder.co.il',
    category: 'מאגר מותגי סופרים ישראלים',
    mode: 'hybrid',
    estimatedCatalogSize: '6,000+ מותגי סופרים (שופרסל, תנובה, שטראוס)',
    description: 'מאגר ענק של מוצרי מדף ומותגי פרטי-סופר בישראל כולל משקלי חבילה מלאים וערכי מאקרו מדויקים.',
    targetUrl: 'https://www.fuder.co.il',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchFuder('חלבון', 4);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאת גישה (${res.status}) ב-fuder.co.il/wp-json/wp/v2/foods`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'לא חולצו 4 ערכי מאקרו מתגיות ה-meta ב-Fuder',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchFuder(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const res = await fetchWithTimeout('https://www.fuder.co.il/wp-json/wp/v2/foods?per_page=35&page=1', {
      timeoutMs: 9000,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    try {
      const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
      const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, 35);
      const parsed = await mapConcurrent(valid, 10, (p) => scrapeFuderProduct(p.link!, p.title?.rendered));
      return parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x));
    } catch {
      return [];
    }
  },
};

// =============================================================================
// 9. FoodGroups (foodgroups.co.il) — 402+ מוצרי מדף מרשתות השיווק והמחלבות
// =============================================================================

async function scrapeFoodGroupsProduct(
  url: string,
  titleHint?: string
): Promise<{ item: FoodCatalogItem | null; status: number; latencyMs: number; blocked: boolean }> {
  const res = await fetchWithTimeout(url, { timeoutMs: 8500 });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked };
  }

  let calories = NaN;
  let protein = NaN;
  let carbs = NaN;
  let fat = NaN;

  for (const m of matchAllList(
    res.text,
    /nutritional-value">\s*<div>\s*([^<]+?)(?:<span[\s\S]*?<\/span>)?\s*<\/div>\s*<div>\s*(\d+(?:[.,]\d+)?)\s*<\/div>/gi
  )) {
    const label = decodeHtmlEntities(m[1]).trim();
    const val = parseMacroNumber(m[2]);
    if (!Number.isFinite(val)) continue;
    if (label.includes('אנרגיה') || label.includes('קלוריות')) calories = val;
    else if (label.includes('חלבונים')) protein = val;
    else if (label.includes('פחמימות')) carbs = val;
    else if (label.includes('שומנים')) fat = val;
  }

  if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
    return { item: null, status: res.status, latencyMs: res.latencyMs, blocked: false };
  }

  const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitle = res.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const name = (stripHtmlTags(h1?.[1] || '') || decodeHtmlEntities(ogTitle?.[1] || '') || stripHtmlTags(titleHint || '')).trim();
  const slug = decodeURIComponent(url.split('/product/')[1] || '').replace(/\//g, '');
  const barcode = extractBarcodeFromText(res.text);
  const doseMatches = matchAllList(
    res.text,
    /מדידה לפי מינון של\s*(\d+(?:[.,]\d+)?)\s*(?:גרם|מ"ל|מל|ג)/gi
  )
    .map((m) => Math.round(parseMacroNumber(m[1])))
    .filter((g) => g > 0 && g !== 100);
  const doseUnits: FoodUnit[] = doseMatches.map((g) => ({
    label: `אריזה / מנה (${g} גרם)`,
    grams: g,
  }));
  const pkgFromTitle = extractPackageGramsFromText(name);
  if (pkgFromTitle && pkgFromTitle !== 100) {
    doseUnits.unshift({ label: `חבילה (${pkgFromTitle} גרם)`, grams: pkgFromTitle });
  }
  const units = mergeUniqueUnits(doseUnits, inferSmartUnits(name, 'FoodGroups'));

  const item = makeCatalogItem({
    idSuffix: normalizeFoodKey(slug || name).slice(0, 46),
    name,
    brand: 'FoodGroups מוצרי מדף',
    category: 'מוצרי מדף — FoodGroups',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units,
    sourceSiteId: 'foodgroups',
    sourceSiteName: 'FoodGroups',
    sourceUrl: url,
  });

  return { item, status: res.status, latencyMs: res.latencyMs, blocked: false };
}

async function searchFoodGroups(query: string, limit = 6): Promise<{
  items: FoodCatalogItem[];
  status: number;
  latencyMs: number;
  blocked: boolean;
}> {
  const apiUrl = `https://foodgroups.co.il/wp-json/wp/v2/product?search=${encodeURIComponent(
    query
  )}&per_page=${Math.min(limit + 2, 10)}`;
  const res = await fetchWithTimeout(apiUrl, {
    timeoutMs: 8500,
    headers: { Accept: 'application/json' },
  });
  const blocked = isAntiBotBlocked(res.status, res.text);
  if (blocked || !res.ok) {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked };
  }

  try {
    const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
    const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, limit);
    const parsed = await mapConcurrent(valid, 4, (p) => scrapeFoodGroupsProduct(p.link!, p.title?.rendered));
    return {
      items: parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x)),
      status: res.status,
      latencyMs: res.latencyMs,
      blocked: false,
    };
  } catch {
    return { items: [], status: res.status, latencyMs: res.latencyMs, blocked: false };
  }
}

const foodgroupsScraper: IsraeliFoodScraper = {
  meta: {
    id: 'foodgroups',
    name: 'FoodGroups (מוצרי מדף בסופרים)',
    domain: 'foodgroups.co.il',
    category: 'מוצרי סופרים ומחלבות',
    mode: 'hybrid',
    estimatedCatalogSize: '402+ מוצרי מדף ומותגים',
    description: 'קטלוג ישראלי של מוצרי חלב, יוגורט חלבון PRO, לחמים וגבינות מרשתות השיווק.',
    targetUrl: 'https://foodgroups.co.il',
  },
  async checkHealth(prevSyncedCount = 0) {
    const res = await searchFoodGroups('קוטג', 4);
    if (res.blocked || res.status < 200 || res.status >= 400) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        `שגיאת גישה (${res.status}) ב-foodgroups.co.il`,
        prevSyncedCount,
        res.blocked
      );
    }
    if (res.items.length === 0) {
      return buildBrokenHealth(
        this.meta,
        res.status,
        res.latencyMs,
        'לא חולצו ערכי .nutritional-value מ-FoodGroups',
        prevSyncedCount
      );
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: res.items.length,
      syncedCatalogCount: prevSyncedCount,
      sample: res.items[0],
    });
  },
  async searchLive(query, limit = 6) {
    const res = await searchFoodGroups(query, limit);
    return res.items;
  },
  async syncCatalog() {
    const res = await fetchWithTimeout('https://foodgroups.co.il/wp-json/wp/v2/product?per_page=40&page=1', {
      timeoutMs: 9000,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    try {
      const posts = JSON.parse(res.text) as Array<{ link?: string; title?: { rendered?: string } }>;
      const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.link).slice(0, 40);
      const parsed = await mapConcurrent(valid, 8, (p) => scrapeFoodGroupsProduct(p.link!, p.title?.rendered));
      return parsed.map((p) => p.item).filter((x): x is FoodCatalogItem => Boolean(x));
    } catch {
      return [];
    }
  },
};

// =============================================================================
// 8. מחלבות טרה (tara.co.il) — 89 מוצרי חלב, קוטג', יוגורט ו-GO חלבון
// =============================================================================

function parseTaraProductHtml(html: string, url: string): FoodCatalogItem | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const name = stripHtmlTags(h1?.[1] || titleMatch?.[1] || '')
    .replace(/\s*[-|]\s*(?:טרה|מחלבת טרה).*$/i, '')
    .trim();

  const pair = (labelPattern: string) => {
    const m = html.match(
      new RegExp(`<span[^>]*>[^<]*${labelPattern}[^<]*<\\/span>\\s*<span[^>]*>([^<]+)<\\/span>`, 'i')
    );
    return m ? parseMacroNumber(m[1]) : NaN;
  };

  const calories = pair('אנרגיה');
  const fat = pair('סך השומנים');
  const carbs = pair('סך הפחמימות');
  const protein = pair('חלבונים');

  if (!Number.isFinite(calories) || !Number.isFinite(fat) || !Number.isFinite(carbs) || !Number.isFinite(protein)) {
    return null;
  }

  const barcode = extractBarcodeFromText(html);
  const pkgFromNameOrHtml = extractPackageGramsFromText(name) || extractPackageGramsFromText(html.slice(0, 4000));
  const units = mergeUniqueUnits(
    pkgFromNameOrHtml && pkgFromNameOrHtml !== 100
      ? [{ label: `אריזה שלמה (${pkgFromNameOrHtml} גרם)`, grams: pkgFromNameOrHtml }]
      : [],
    inferSmartUnits(name, 'מוצרי חלב וחלבון')
  );

  return makeCatalogItem({
    idSuffix: normalizeFoodKey(name).slice(0, 42),
    name,
    brand: 'טרה',
    category: 'מוצרי חלב וחלבון',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units,
    sourceSiteId: 'tara',
    sourceSiteName: 'מחלבות טרה',
    sourceUrl: url,
  });
}

const taraScraper: IsraeliFoodScraper = {
  meta: {
    id: 'tara',
    name: 'מחלבות טרה',
    domain: 'tara.co.il',
    category: 'מחלבה ומוצרי חלבון',
    mode: 'sync',
    estimatedCatalogSize: '89 מוצרי חלב',
    description: 'קטלוג מחלבות טרה: חלב, שוקו, קוטג׳, גבינות, יוגורט יווני ו-GO חלבון.',
    targetUrl: 'https://www.tara.co.il/sitemap.xml',
  },
  async checkHealth(prevSyncedCount = 0) {
    const testUrl = 'https://www.tara.co.il/%D7%9E%D7%95%D7%A6%D7%A8%D7%99%D7%9D/%D7%92%D7%91%D7%99%D7%A0%D7%95%D7%AA-%D7%9C%D7%91%D7%A0%D7%95%D7%AA/%D7%A7%D7%95%D7%98%D7%92+5+%D7%90%D7%97%D7%95%D7%96+%D7%90%D7%91%D7%90.html';
    const res = await fetchWithTimeout(testUrl, { timeoutMs: 8500 });
    const blocked = isAntiBotBlocked(res.status, res.text);
    if (blocked || !res.ok) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאה (${res.status}) בטעינת מוצר טרה`, prevSyncedCount, blocked);
    }
    const sample = parseTaraProductHtml(res.text, testUrl);
    if (!sample) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'טבלת .ingredients_data ב-tara.co.il לא זוהתה', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: 1,
      syncedCatalogCount: prevSyncedCount,
      sample,
    });
  },
  async syncCatalog() {
    const sm = await fetchWithTimeout('https://www.tara.co.il/sitemap.xml', { timeoutMs: 9000 });
    if (!sm.ok) return [];
    const urls = matchAllList(sm.text, /<loc>([^<]+)<\/loc>/g)
      .map((m) => m[1])
      .filter((u) => {
        try {
          const dec = decodeURIComponent(u);
          return dec.includes('/מוצרים/') && dec.endsWith('.html');
        } catch {
          return false;
        }
      })
      .slice(0, 65);

    const parsed = await mapConcurrent(urls, 5, async (u) => {
      const r = await fetchWithTimeout(u, { timeoutMs: 7500 });
      return r.ok ? parseTaraProductHtml(r.text, u) : null;
    });
    return parsed.filter((x): x is FoodCatalogItem => Boolean(x));
  },
};

// =============================================================================
// 9. מאפיית ברמן (berman.co.il) — 56 לחמים, פיתות ולחמניות
// =============================================================================

function parseBermanProductHtml(html: string, url: string): FoodCatalogItem | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const name = stripHtmlTags(h1?.[1] || titleMatch?.[1] || '')
    .replace(/\s*[-|]\s*(?:מאפיית ברמן|ברמן).*$/i, '')
    .trim();

  const thVal = (label: string) => {
    const m = html.match(new RegExp(`<th[^>]*>[^<]*${label}[^<]*<\\/th>\\s*<td[^>]*>([^<]+)<\\/td>`, 'i'));
    return m ? parseMacroNumber(m[1]) : NaN;
  };

  const calories = thVal('אנרגיה');
  const fat = thVal('סך השומנים');
  const carbs = thVal('סך הפחמימות');
  const protein = thVal('חלבונים');

  if (!Number.isFinite(calories) || !Number.isFinite(fat) || !Number.isFinite(carbs) || !Number.isFinite(protein)) {
    return null;
  }

  const barcode = extractBarcodeFromText(html);
  const pkgFromHtml = extractPackageGramsFromText(name);
  const units = mergeUniqueUnits(
    pkgFromHtml && pkgFromHtml !== 100
      ? [{ label: `חבילה שלמה (${pkgFromHtml} גרם)`, grams: pkgFromHtml }]
      : [],
    inferSmartUnits(name, 'לחמים ומאפים')
  );

  return makeCatalogItem({
    idSuffix: normalizeFoodKey(name).slice(0, 42),
    name,
    brand: 'מאפיית ברמן',
    category: 'לחמים ומאפים',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units,
    sourceSiteId: 'berman',
    sourceSiteName: 'ברמן',
    sourceUrl: url,
  });
}

const bermanScraper: IsraeliFoodScraper = {
  meta: {
    id: 'berman',
    name: 'מאפיית ברמן',
    domain: 'berman.co.il',
    category: 'לחמים ומאפים',
    mode: 'sync',
    estimatedCatalogSize: '56 מוצרי מאפה',
    description: 'קטלוג לחמים, לחם כוסמין, לחם קל, פיתות ולחמניות של מאפיית ברמן.',
    targetUrl: 'https://berman.co.il/product-sitemap.xml',
  },
  async checkHealth(prevSyncedCount = 0) {
    const testUrl = 'https://berman.co.il/product/%d7%9c%d7%97%d7%9d-%d7%90%d7%97%d7%99%d7%93-%d7%a4%d7%a8%d7%95%d7%a1/';
    const res = await fetchWithTimeout(testUrl, { timeoutMs: 8500 });
    const blocked = isAntiBotBlocked(res.status, res.text);
    if (blocked || !res.ok) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, `שגיאה (${res.status}) בטעינת מוצר ברמן`, prevSyncedCount, blocked);
    }
    const sample = parseBermanProductHtml(res.text, testUrl);
    if (!sample) {
      return buildBrokenHealth(this.meta, res.status, res.latencyMs, 'טבלת .food-energy__table ב-berman.co.il השתנתה', prevSyncedCount);
    }
    return buildHealthResult(this.meta, {
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      itemsExtracted: 1,
      syncedCatalogCount: prevSyncedCount,
      sample,
    });
  },
  async syncCatalog() {
    const sm = await fetchWithTimeout('https://berman.co.il/product-sitemap.xml', { timeoutMs: 9000 });
    if (!sm.ok) return [];
    const urls = matchAllList(sm.text, /<loc>([^<]+)<\/loc>/g)
      .map((m) => m[1])
      .filter((u) => !u.includes('/en/product/'))
      .slice(0, 50);

    const parsed = await mapConcurrent(urls, 5, async (u) => {
      const r = await fetchWithTimeout(u, { timeoutMs: 7500 });
      return r.ok ? parseBermanProductHtml(r.text, u) : null;
    });
    return parsed.filter((x): x is FoodCatalogItem => Boolean(x));
  },
};

export const ISRAELI_SCRAPERS: IsraeliFoodScraper[] = [
  victoryScraper,
  nizatScraper,
  tevabariScraper,
  fuderScraper,
  foodgroupsScraper,
  sugatScraper,
  taraScraper,
  bermanScraper,
  foodsDictionaryScraper,
  foodikScraper,
  netogreenScraper,
  mohGovScraper,
];

export function getScraperById(id: string): IsraeliFoodScraper | undefined {
  return ISRAELI_SCRAPERS.find((s) => s.meta.id === id);
}

/**
 * שולף מוצרי מדף ישראליים מאומתים עם ברקוד ו-4 ערכי מאקרו מלאים מ-Open Food Facts Israel (9,300+ מוצרים).
 * משמש להזנת טבלת food_catalog_items ב-Supabase ישירות מהענן ללא חסימת WAF.
 */
export async function fetchOpenFoodFactsIsraelItems(
  pages = 5,
  pageSize = 60
): Promise<FoodCatalogItem[]> {
  const pageNumbers = Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1);
  const batches = await mapConcurrent(pageNumbers, 3, async (page) => {
    const url = `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&sort_by=unique_scans_n&page_size=${pageSize}&page=${page}&fields=code,product_name_he,product_name,brands,stores,serving_quantity,product_quantity,quantity,nutriments`;
    const res = await fetchWithTimeout(url, {
      timeoutMs: 9500,
      headers: {
        'User-Agent': 'SpotFitnessIsrael/1.0 (https://spot-fitness.vercel.app)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [] as FoodCatalogItem[];

    try {
      const data = JSON.parse(res.text) as {
        products?: Array<{
          code?: string;
          product_name_he?: string;
          product_name?: string;
          brands?: string;
          stores?: string;
          serving_quantity?: number | string;
          product_quantity?: number | string;
          quantity?: string;
          nutriments?: Record<string, unknown>;
        }>;
      };
      const results: FoodCatalogItem[] = [];
      for (const p of data.products || []) {
        const code = String(p.code || '').replace(/[^0-9]/g, '');
        const rawName = String(p.product_name_he || p.product_name || '').trim();
        const nut = p.nutriments || {};
        const calRaw = nut['energy-kcal_100g'];
        const proRaw = nut.proteins_100g;
        const carbRaw = nut.carbohydrates_100g;
        const fatRaw = nut.fat_100g;

        if (
          !code ||
          !rawName ||
          typeof calRaw !== 'number' ||
          typeof proRaw !== 'number' ||
          typeof carbRaw !== 'number' ||
          typeof fatRaw !== 'number'
        ) {
          continue;
        }

        const brand = String(p.brands || '').split(',')[0]?.trim() || 'סופרים בישראל';
        const displayName =
          brand && brand !== 'סופרים בישראל' && !rawName.includes(brand)
            ? `${rawName} — ${brand}`
            : rawName;
        const extraUnits: FoodUnit[] = [];
        const srvG = Number(p.serving_quantity);
        if (Number.isFinite(srvG) && srvG > 5 && srvG < 1000 && srvG !== 100) {
          extraUnits.push({ label: `מנה (${Math.round(srvG)} גרם)`, grams: Math.round(srvG) });
        }
        const rawPkg = Number(p.product_quantity);
        const pkgG =
          (Number.isFinite(rawPkg) && rawPkg > 5 && rawPkg <= 5000 ? Math.round(rawPkg) : null) ||
          extractPackageGramsFromText(String(p.quantity || ''));
        if (pkgG && pkgG !== 100) {
          extraUnits.push({ label: `חבילה שלמה (${pkgG} גרם)`, grams: pkgG });
        }
        const units = mergeUniqueUnits(
          extraUnits,
          inferSmartUnits(displayName, p.stores || 'Open Food Facts ישראל')
        );

        const item = makeCatalogItem({
          idSuffix: code,
          name: displayName,
          brand,
          category: p.stores ? `ברקוד וסופרים (${String(p.stores).slice(0, 36)})` : 'ברקוד וסופרים — ישראל',
          barcode: code,
          per100g: { calories: calRaw, protein: proRaw, carbs: carbRaw, fat: fatRaw },
          units,
          sourceSiteId: 'openfoodfacts',
          sourceSiteName: 'Open Food Facts ישראל',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          legacySource: 'openfoodfacts',
        });
        if (item) results.push(item);
      }
      return results;
    } catch {
      return [] as FoodCatalogItem[];
    }
  });

  return batches.flat();
}

/**
 * שליפת פרטי מוצר בשופרסל אונליין ישירות מדף מוצר / ברקוד P_{code}.
 */
async function scrapeShufersalProductPage(url: string, codeHint?: string): Promise<FoodCatalogItem | null> {
  const res = await fetchWithTimeout(url, { timeoutMs: 7500 });
  if (!res.ok || isAntiBotBlocked(res.status, res.text)) return null;

  const nlStart = res.text.indexOf('nutritionListTitle');
  if (nlStart < 0) return null;
  const block = res.text.slice(nlStart, nlStart + 6500);
  const subInfo = stripHtmlTags(block.match(/<div class="subInfo">([\s\S]*?)<\/div>/i)?.[1] || '');
  if (subInfo && !/100/.test(subInfo)) {
    return null;
  }

  let calories = NaN;
  let protein = NaN;
  let carbs = NaN;
  let fat = NaN;
  for (const m of matchAllList(
    block,
    /<div class="nutritionItem">[\s\S]*?<div class="number[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="text">([^<]+)<\/div>/gi
  )) {
    const val = parseMacroNumber(m[1] || m[2]);
    const label = stripHtmlTags(m[3]);
    if (!Number.isFinite(val)) continue;
    if (label === 'אנרגיה' || label === 'קלוריות') calories = val;
    else if (label === 'חלבונים' || label === 'חלבון') protein = val;
    else if (label === 'פחמימות' || label === 'סך הפחמימות') carbs = val;
    else if (label === 'שומנים' || label === 'שומן' || label === 'סך השומנים') fat = val;
  }
  if (!Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
    return null;
  }

  const h1 = res.text.match(/<h1[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || '';
  const ogTitle = res.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
  const name = stripHtmlTags(h1 || ogTitle).replace(/\s*[-|]\s*שופרסל.*$/i, '').trim();
  if (!name) return null;

  const barcode =
    extractBarcodeFromText(res.text) ||
    (codeHint ? codeHint.replace(/[^0-9]/g, '') : undefined);
  const smallSizeText = res.text.match(/<div class="smallText[^"]*">([\s\S]*?)<\/div>/i)?.[1] || '';
  const pkgGrams =
    extractPackageGramsFromText(smallSizeText) ||
    extractPackageGramsFromText(name);
  const isLiquid = /מ"ל|מל|מ״ל|ליטר/.test(`${subInfo} ${smallSizeText} ${name}`);
  const units = mergeUniqueUnits(
    pkgGrams && pkgGrams !== 100
      ? [{ label: `אריזה שלמה (${pkgGrams} ${isLiquid ? 'מ״ל' : 'גרם'})`, grams: pkgGrams }]
      : [],
    inferSmartUnits(name, 'שופרסל אונליין')
  );

  return makeCatalogItem({
    idSuffix: codeHint ? `P_${codeHint}` : normalizeFoodKey(name).slice(0, 40),
    name,
    brand: 'שופרסל אונליין',
    category: 'סופרמרקט שופרסל',
    barcode,
    per100g: { calories, protein, carbs, fat },
    units,
    sourceSiteId: 'shufersal',
    sourceSiteName: 'שופרסל אונליין',
    sourceUrl: url,
  });
}

/**
 * חיפוש חי ברשתות שיווק ישראליות לפי ברקוד (ויקטורי + שופרסל) כשהברקוד עדיין אינו שמור ב-DB.
 */
export async function lookupRetailerByBarcodeLive(barcode: string): Promise<FoodCatalogItem | null> {
  const clean = barcode.replace(/[^0-9]/g, '');
  if (clean.length < 6) return null;

  const [victoryRes, shufersalRes] = await Promise.all([
    searchVictory(clean, 3).then((r) => r.items).catch(() => [] as FoodCatalogItem[]),
    scrapeShufersalProductPage(
      `https://www.shufersal.co.il/online/he/p/P_${encodeURIComponent(clean)}`,
      clean
    ).catch(() => null),
  ]);

  const exactVictory = victoryRes.find((i) => i.barcode === clean) || victoryRes[0];
  if (exactVictory) {
    return exactVictory.barcode ? exactVictory : { ...exactVictory, barcode: clean };
  }
  if (shufersalRes) {
    return shufersalRes.barcode ? shufersalRes : { ...shufersalRes, barcode: clean };
  }
  return null;
}

/**
 * העשרה עצלה למוצר קיים מתוך כתובת המקור שלו (משיכת ברקוד ומידות אריזה עדכניות מהסקרייפר).
 */
export async function enrichCatalogItemFromSourceUrl(item: FoodCatalogItem): Promise<FoodCatalogItem> {
  if (!item?.sourceUrl) return item;

  // הגנת SSRF קפדנית: אימות דומיין מאושר ו-HTTPS בלבד לפני כל פנייה לרשת
  const verifiedUrl = assertAllowedScraperUrl(item.sourceUrl, item.sourceSiteId);
  const host = verifiedUrl.hostname.toLowerCase();
  const isHost = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  try {
    let fresh: FoodCatalogItem | null = null;
    if (item.sourceSiteId === 'victory' || isHost('victoryonline.co.il')) {
      if (!isHost('victoryonline.co.il')) throw new Error('דומיין אינו תואם ויקטורי');
      fresh = (await scrapeVictoryProduct(verifiedUrl.toString())).item;
    } else if (item.sourceSiteId === 'nizat' || isHost('nizat.com')) {
      if (!isHost('nizat.com')) throw new Error('דומיין אינו תואם ניצת');
      const m = verifiedUrl.search.match(/prodid=(\d+)/i);
      if (m?.[1]) fresh = (await scrapeNizatProduct(m[1], item.name)).item;
    } else if (item.sourceSiteId === 'fuder' || isHost('fuder.co.il')) {
      if (!isHost('fuder.co.il')) throw new Error('דומיין אינו תואם Fuder');
      fresh = (await scrapeFuderProduct(verifiedUrl.toString(), item.name)).item;
    } else if (item.sourceSiteId === 'foodgroups' || isHost('foodgroups.co.il')) {
      if (!isHost('foodgroups.co.il')) throw new Error('דומיין אינו תואם FoodGroups');
      fresh = (await scrapeFoodGroupsProduct(verifiedUrl.toString(), item.name)).item;
    } else if (item.sourceSiteId === 'sugat' || isHost('sugat.com')) {
      if (!isHost('sugat.com')) throw new Error('דומיין אינו תואם סוגת');
      fresh = (await scrapeSugatProduct(verifiedUrl.toString(), item.name)).item;
    } else if (item.sourceSiteId === 'tevabari' || isHost('tevabari.co.il')) {
      if (!isHost('tevabari.co.il')) throw new Error('דומיין אינו תואם טבע בריא');
      fresh = (await scrapeTevaBariProduct(verifiedUrl.toString(), item.name)).item;
    } else if (item.sourceSiteId === 'shufersal' || isHost('shufersal.co.il')) {
      if (!isHost('shufersal.co.il')) throw new Error('דומיין אינו תואם שופרסל');
      const codeM = item.id.match(/^shufersal-P_(\d+)/i);
      fresh = await scrapeShufersalProductPage(verifiedUrl.toString(), codeM?.[1]);
    } else if (
      (item.sourceSiteId === 'openfoodfacts' || isHost('openfoodfacts.org')) &&
      item.barcode &&
      /^[0-9]{6,16}$/.test(item.barcode)
    ) {
      const offRes = await fetchWithTimeout(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(item.barcode)}.json`,
        {
          timeoutMs: 4500,
          redirect: 'manual',
          headers: { 'User-Agent': SPOT_OFF_USER_AGENT },
        }
      );
      if (offRes.ok) {
        const j = JSON.parse(offRes.text);
        const p = j?.product;
        const rawPkg = Number(p?.product_quantity);
        const pkgG =
          (Number.isFinite(rawPkg) && rawPkg > 5 && rawPkg <= 5000 ? Math.round(rawPkg) : null) ||
          extractPackageGramsFromText(String(p?.quantity || ''));
        const srvG = Number(p?.serving_quantity);
        const offUnits: FoodUnit[] = [];
        if (pkgG && pkgG !== 100) offUnits.push({ label: `חבילה שלמה (${pkgG} גרם)`, grams: pkgG });
        if (Number.isFinite(srvG) && srvG > 5 && srvG < 1000 && srvG !== 100) {
          offUnits.push({ label: `מנה (${Math.round(srvG)} גרם)`, grams: Math.round(srvG) });
        }
        if (offUnits.length > 0) {
          return {
            ...item,
            units: mergeUniqueUnits(offUnits, item.units),
            updatedAt: new Date().toISOString(),
          };
        }
      }
    }

    if (!fresh) return item;
    const mergedUnits = mergeUniqueUnits(fresh.units, item.units);
    const barcode = fresh.barcode || item.barcode;
    return {
      ...item,
      ...(barcode ? { barcode } : {}),
      units: mergedUnits,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return item;
  }
}
