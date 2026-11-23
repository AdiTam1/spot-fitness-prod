import { FoodUnit, MacroTargets } from '@/types/nutrition';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface FetchResponse {
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  latencyMs: number;
  error?: string;
}

/**
 * מבצע בקשת HTTP בטוחה עם מדידת זמן תגובה, תמיכה ב-Windows-1255 ומניעת תקיעות מעל timeoutMs.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & {
    timeoutMs?: number;
    encoding?: 'utf-8' | 'windows-1255';
  } = {}
): Promise<FetchResponse> {
  const { timeoutMs = 10000, encoding = 'utf-8', headers, ...rest } = options;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
        ...(headers || {}),
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = new TextDecoder(encoding).decode(buf);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      text,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
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

export function normalizeFoodKey(name: string): string {
  return decodeHtmlEntities(name)
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/]/g, ' ')
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
