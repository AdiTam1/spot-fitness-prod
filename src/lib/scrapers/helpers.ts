import https from 'node:https';
import zlib from 'node:zlib';
import { FoodUnit, MacroTargets } from '@/types/nutrition';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const SPOT_OFF_USER_AGENT =
  'SpotFitnessIsrael - Web - v1.0 - https://spot-fitness.app (support@spot-fitness.app)';

export const ALLOWED_SCRAPER_HOSTS: Record<string, readonly string[]> = {
  foodsdictionary: ['foodsdictionary.co.il'],
  sugat: ['sugat.com'],
  victory: ['victoryonline.co.il'],
  moh_gov: ['data.gov.il'],
  foodik: ['foodik.co.il'],
  netogreen: ['netogreen.co.il'],
  nizat: ['nizat.com'],
  tevabari: ['tevabari.co.il'],
  fuder: ['fuder.co.il'],
  foodgroups: ['foodgroups.co.il'],
  tara: ['tara.co.il'],
  berman: ['berman.co.il'],
  shufersal: ['shufersal.co.il'],
  openfoodfacts: ['world.openfoodfacts.org', 'il.openfoodfacts.org'],
};

function isPrivateOrReservedHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.includes(':')
  ) {
    return true;
  }
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return true; // חסימת כל IP מספרי גולמי בנתיבי העשרה
  }
  return false;
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/**
 * מוודא שכתובת מקור להעשרה היא HTTPS תקינה ומשויכת אך ורק לדומיין מאושר ברשימה הסגורה (מונע SSRF).
 */
export function assertAllowedScraperUrl(
  rawUrl: string,
  expectedSiteId?: string
): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('כתובת מקור אינה תקינה');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('מותרות כתובות HTTPS בלבד');
  }
  if (parsed.username || parsed.password) {
    throw new Error('אסורים פרטי הזדהות בכתובת');
  }
  if (isPrivateOrReservedHostname(parsed.hostname)) {
    throw new Error('כתובת יעד חסומה מטעמי אבטחה');
  }

  const candidateDomains =
    expectedSiteId && ALLOWED_SCRAPER_HOSTS[expectedSiteId]
      ? ALLOWED_SCRAPER_HOSTS[expectedSiteId]
      : Object.values(ALLOWED_SCRAPER_HOSTS).flat();

  if (!candidateDomains.some((dom) => hostMatchesDomain(parsed.hostname, dom))) {
    throw new Error('דומיין המקור אינו מאושר להעשרה');
  }

  return parsed;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  latencyMs: number;
  error?: string;
}

function decodeHttpBodyBuffer(
  buf: Buffer,
  contentEncoding: string | undefined,
  textEncoding: 'utf-8' | 'windows-1255'
): string {
  const ce = (contentEncoding || '').toLowerCase();
  let plain = buf;
  try {
    if (ce.includes('br')) plain = zlib.brotliDecompressSync(buf);
    else if (ce.includes('gzip')) plain = zlib.gunzipSync(buf);
    else if (ce.includes('deflate')) plain = zlib.inflateSync(buf);
  } catch {
    plain = buf;
  }
  return new TextDecoder(textEncoding).decode(plain);
}

/**
 * חלופת Node HTTPS מוקשחת (IPv4 + HTTP/1.1) עבור אתרים/פרוקסי שזורקים ECONNRESET או נתקעים ב-IPv6 תחת undici.
 */
function fetchViaNodeHttpsIpv4(
  targetUrl: string,
  opts: {
    method: string;
    headers: Record<string, string>;
    timeoutMs: number;
    encoding: 'utf-8' | 'windows-1255';
    followRedirects: boolean;
    redirectsLeft?: number;
  }
): Promise<FetchResponse> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      resolve({
        ok: false,
        status: 0,
        finalUrl: targetUrl,
        text: '',
        latencyMs: 0,
        error: 'Invalid URL',
      });
      return;
    }

    if (parsed.protocol !== 'https:') {
      resolve({
        ok: false,
        status: 0,
        finalUrl: targetUrl,
        text: '',
        latencyMs: 0,
        error: 'HTTPS required',
      });
      return;
    }

    let settled = false;
    const finish = (res: FetchResponse) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const req = https.request(
      parsed,
      {
        method: opts.method,
        family: 4,
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          ...opts.headers,
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        const loc = res.headers.location;
        const left = opts.redirectsLeft ?? 3;
        if (
          opts.followRedirects &&
          loc &&
          status >= 300 &&
          status < 400 &&
          left > 0
        ) {
          res.resume();
          try {
            const nextUrl = new URL(loc, parsed).toString();
            const nextParsed = new URL(nextUrl);
            if (
              nextParsed.protocol !== 'https:' ||
              isPrivateOrReservedHostname(nextParsed.hostname)
            ) {
              finish({
                ok: false,
                status,
                finalUrl: targetUrl,
                text: '',
                latencyMs: Date.now() - startedAt,
                error: 'Blocked redirect target',
              });
              return;
            }
            const remainingMs = Math.max(
              1500,
              opts.timeoutMs - (Date.now() - startedAt)
            );
            void fetchViaNodeHttpsIpv4(nextUrl, {
              ...opts,
              timeoutMs: remainingMs,
              redirectsLeft: left - 1,
            }).then(finish);
          } catch {
            finish({
              ok: false,
              status,
              finalUrl: targetUrl,
              text: '',
              latencyMs: Date.now() - startedAt,
              error: 'Invalid redirect',
            });
          }
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = decodeHttpBodyBuffer(
            buf,
            typeof res.headers['content-encoding'] === 'string'
              ? res.headers['content-encoding']
              : undefined,
            opts.encoding
          );
          finish({
            ok: status >= 200 && status < 300,
            status,
            finalUrl: parsed.toString(),
            text,
            latencyMs: Date.now() - startedAt,
          });
        });
        res.on('error', (err) => {
          finish({
            ok: false,
            status: 0,
            finalUrl: targetUrl,
            text: '',
            latencyMs: Date.now() - startedAt,
            error: err.message,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', (err) => {
      finish({
        ok: false,
        status: 0,
        finalUrl: targetUrl,
        text: '',
        latencyMs: Date.now() - startedAt,
        error: err.message,
      });
    });
    req.end();
  });
}

/**
 * מבצע בקשת HTTP בטוחה עם מדידת זמן תגובה, תמיכה ב-Windows-1255, נתיב גיבוי IPv4/HTTP1.1 וניסיונות חוזרים אופציונליים.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & {
    timeoutMs?: number;
    encoding?: 'utf-8' | 'windows-1255';
    retries?: number;
    ipv4Fallback?: boolean;
  } = {}
): Promise<FetchResponse> {
  const {
    timeoutMs = 10000,
    encoding = 'utf-8',
    retries = 0,
    ipv4Fallback = false,
    headers,
    ...rest
  } = options;

  const normalizedHeaders: Record<string, string> = {
    'User-Agent': BROWSER_USER_AGENT,
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  };
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        normalizedHeaders[k] = String(v);
      }
    }
  }

  let lastRes: FetchResponse = {
    ok: false,
    status: 0,
    finalUrl: url,
    text: '',
    latencyMs: 0,
  };

  const maxAttempts = 1 + Math.max(0, retries);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * attempt));
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...rest,
        signal: controller.signal,
        cache: 'no-store',
        headers: normalizedHeaders,
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const text = new TextDecoder(encoding).decode(buf);
      lastRes = {
        ok: res.ok,
        status: res.status,
        finalUrl: res.url || url,
        text,
        latencyMs: Date.now() - startedAt,
      };
      if (lastRes.ok || (lastRes.status >= 400 && lastRes.status < 500 && lastRes.status !== 429)) {
        return lastRes;
      }
    } catch (err) {
      lastRes = {
        ok: false,
        status: 0,
        finalUrl: url,
        text: '',
        latencyMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }

    if (
      ipv4Fallback &&
      lastRes.status === 0 &&
      (!rest.method || rest.method.toUpperCase() === 'GET') &&
      !rest.body
    ) {
      const fallbackRes = await fetchViaNodeHttpsIpv4(url, {
        method: 'GET',
        headers: normalizedHeaders,
        timeoutMs,
        encoding,
        followRedirects: rest.redirect !== 'manual',
      });
      if (fallbackRes.ok || fallbackRes.status > 0) {
        return fallbackRes;
      }
      lastRes = fallbackRes;
    }
  }

  return lastRes;
}

/**
 * קידוד מחרוזת עברית ל-Windows-1255 Percent-Encoding (נדרש עבור FoodsDictionary).
 */
export function encodeWin1255(input: string): string {
  const out: string[] = [];
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x05d0 && cp <= 0x05ea) {
      out.push('%' + (cp - 0x05d0 + 0xe0).toString(16).toUpperCase());
    } else if (
      (cp >= 0x30 && cp <= 0x39) ||
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a)
    ) {
      out.push(ch);
    } else if (ch === ' ') {
      out.push('+');
    } else if (cp < 0x80) {
      out.push('%' + cp.toString(16).toUpperCase().padStart(2, '0'));
    }
  }
  return out.join('');
}

/**
 * מזהה חסימות בוטים / Cloudflare / Incapsula / 403 / 516 בדפי HTML או תגובות שרת.
 */
export function isAntiBotBlocked(status: number, html: string): boolean {
  if (status === 403 || status === 429 || status === 515 || status === 516) {
    return true;
  }
  if (!html) return false;
  return (
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html) ||
    /Attention Required!\s*\|\s*Cloudflare/i.test(html) ||
    /cf-browser-verification|cf-challenge-running/i.test(html) ||
    /_Incapsula_Resource|Incapsula incident ID/i.test(html) ||
    /Request unsuccessful\. Incapsula/i.test(html)
  );
}

export function decodeHtmlEntities(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?96;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
    });
}

export function stripHtmlTags(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMacroNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 10) / 10 : 0;
  }
  const text = decodeHtmlEntities(String(raw ?? '')).trim();
  if (!text) return 0;
  if (/פחות מ[-\s]*0\.?5|<\s*0\.?5/i.test(text)) return 0.3;
  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return 0;
  const val = Number(match[0]);
  return Number.isFinite(val) && val >= 0 ? Math.round(val * 10) / 10 : 0;
}

export function roundMacros(m: MacroTargets): MacroTargets {
  return {
    calories: Math.max(0, Math.round(m.calories)),
    protein: Math.max(0, Math.round(m.protein * 10) / 10),
    carbs: Math.max(0, Math.round(m.carbs * 10) / 10),
    fat: Math.max(0, Math.round(m.fat * 10) / 10),
  };
}

/**
 * מאמת שכל 4 הערכים (קלוריות, חלבון, פחמימות, שומן) תקינים ורלוונטיים ל-100 גרם.
 */
export function isValidMacroSet(m: MacroTargets | null | undefined): m is MacroTargets {
  if (!m) return false;
  const nums = [m.calories, m.protein, m.carbs, m.fat];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
    return false;
  }
  if (m.calories > 950 || m.protein > 100 || m.carbs > 100 || m.fat > 100) {
    return false;
  }
  if (m.calories === 0 && m.protein === 0 && m.carbs === 0 && m.fat === 0) {
    return false;
  }
  return true;
}

export function escapeSqlLikePattern(raw: string): string {
  return String(raw || '').replace(/[\\%_]/g, '\\$&');
}

export function normalizeFoodSearchQuery(raw: string): string {
  return decodeHtmlEntities(String(raw || ''))
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/\\_%:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeFoodKey(name: string): string {
  return decodeHtmlEntities(name)
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/\\_%:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * מסיק יחידות מידה ביתיות שימושיות לפי שם המוצר והקטגוריה.
 */
export function inferSmartUnits(name: string, category?: string): FoodUnit[] {
  const n = name.toLowerCase();
  const c = (category || '').toLowerCase();
  const units: FoodUnit[] = [{ label: '100 גרם', grams: 100 }];

  if (n.includes('קוטג') || n.includes('גבינה לבנה') || n.includes('גביע')) {
    units.unshift({ label: 'גביע (250 גרם)', grams: 250 });
  } else if (n.includes('יוגורט') || n.includes('מעדן') || n.includes('דנונה')) {
    units.unshift({ label: 'גביע (150-200 גרם)', grams: 170 });
  } else if (n.includes('חלב') || n.includes('משקה') || n.includes('שוקו') || n.includes('מיץ') || n.includes('שייק') || c.includes('שתייה')) {
    units.unshift({ label: 'כוס (240 מ"ל)', grams: 240 });
  } else if (n.includes('לחם') || n.includes('חלה')) {
    units.unshift({ label: 'פרוסה (32 גרם)', grams: 32 });
  } else if (n.includes('פיתה')) {
    units.unshift({ label: 'פיתה אחת (85 גרם)', grams: 85 });
  } else if (n.includes('לחמני')) {
    units.unshift({ label: 'לחמנייה (70 גרם)', grams: 70 });
  } else if (n.includes('ביצה')) {
    units.unshift({ label: 'ביצה אחת (55 גרם)', grams: 55 });
  } else if (n.includes('חטיף חלבון') || n.includes('חטיף')) {
    units.unshift({ label: 'חטיף (55 גרם)', grams: 55 });
  } else if (n.includes('אבקת חלבון')) {
    units.unshift({ label: 'סקופ (30 גרם)', grams: 30 });
  } else if (n.includes('חומוס') || n.includes('שקשוקה') || n.includes('פלאפל') || n.includes('שווארמה') || n.includes('המבורגר') || n.includes('כריך') || n.includes('פיצה')) {
    units.unshift({ label: 'מנה סטנדרטית (220 גרם)', grams: 220 });
  } else if (n.includes('חזה עוף') || n.includes('עוף') || n.includes('סטייק') || n.includes('דג') || n.includes('סלמון')) {
    units.unshift({ label: 'מנה (150 גרם)', grams: 150 });
  } else if (n.includes('טונה') || n.includes('שימורים')) {
    units.unshift({ label: 'קופסה מסוננת (112 גרם)', grams: 112 });
  } else if (n.includes('אורז') || n.includes('פסטה') || n.includes('קוסקוס') || n.includes('פתיתים') || n.includes('קינואה')) {
    units.unshift({ label: 'כוס מבושלת (160 גרם)', grams: 160 });
  } else if (n.includes('טחינה') || n.includes('חמאת בוטנים') || n.includes('שמן') || n.includes('דבש')) {
    units.unshift({ label: 'כף (15 גרם)', grams: 15 });
  }

  return units;
}

/**
 * מחלץ משקל אריזה / מנת מוצר בגרם או מ"ל מטקסט (שם מוצר, כותרת משנה או weightText).
 */
export function extractPackageGramsFromText(raw: string): number | null {
  const clean = decodeHtmlEntities(String(raw || ''))
    .replace(/ל[-\s]?100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)/gi, ' ')
    .replace(/\b100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)\b/gi, ' ');

  const kgMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|ק״ג|קג|ליטר|ל'|kg)(?=$|\s|[,.)\]\-/])/i);
  if (kgMatch) {
    const val = Number(kgMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0 && val <= 5) {
      return Math.round(val * 1000);
    }
  }

  const gMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג|מ"ל|מ״ל|מל|g|gr|ml)(?=$|\s|[,.)\]\-/])/i);
  if (gMatch) {
    const val = Number(gMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val >= 5 && val <= 5000) {
      return Math.round(val);
    }
  }

  return null;
}

/**
 * מחלץ ברקוד תקני (EAN-8 / EAN-13 / UPC, 6–16 ספרות) מדפי מוצר או JSON.
 */
export function extractBarcodeFromText(raw: string): string | undefined {
  const s = String(raw || '');
  if (!s) return undefined;

  const patterns = [
    /"productSku"\s*:\s*"(\d{6,16})"/i,
    /"sku"\s*:\s*"(\d{6,16})"/i,
    /"gtin13"\s*:\s*"(\d{6,16})"/i,
    /"gtin12"\s*:\s*"(\d{6,16})"/i,
    /"gtin"\s*:\s*"(\d{6,16})"/i,
    /"ean"\s*:\s*"(\d{6,16})"/i,
    /"barcode"\s*:\s*"(\d{6,16})"/i,
    /cloudfront\.net\/gs1\/(\d{6,16})\//i,
    /(?:^|\/|-)P_(\d{6,16})(?:["/?#&]|$)/i,
    /ברקוד\s*[:\-]?\s*(\d{7,14})/i,
  ];

  for (const rx of patterns) {
    const m = s.match(rx);
    if (m?.[1]) {
      const clean = m[1].replace(/[^0-9]/g, '');
      if (clean.length >= 6 && clean.length <= 16) return clean;
    }
  }
  return undefined;
}

/**
 * מאחד רשימות יחידות מידה ללא כפילויות לפי משקל זהה או תווית זהה, עם חבילה בראש במידת הצורך.
 */
export function mergeUniqueUnits(...lists: Array<FoodUnit[] | undefined>): FoodUnit[] {
  const out: FoodUnit[] = [];
  const seenLabels = new Set<string>();
  const seenNon100Grams = new Set<number>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const u of list) {
      const grams = Math.round(Number(u?.grams) || 0);
      const label = String(u?.label || '').trim();
      if (!label || grams <= 0) continue;
      const lblKey = label.toLowerCase();
      if (seenLabels.has(lblKey)) continue;
      if (grams !== 100 && seenNon100Grams.has(grams)) continue;
      seenLabels.add(lblKey);
      if (grams !== 100) seenNon100Grams.add(grams);
      out.push({ label, grams });
    }
  }

  if (!out.some((u) => u.grams === 100)) {
    out.push({ label: '100 גרם', grams: 100 });
  }
  return out;
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  };
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

/**
 * תחליף תואם-ES5 ל-String.prototype.matchAll עבור הגדרת TypeScript בפרויקט.
 */
export function matchAllList(text: string, regex: RegExp): RegExpExecArray[] {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const rx = new RegExp(regex.source, flags);
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    matches.push(m);
  }
  return matches;
}
