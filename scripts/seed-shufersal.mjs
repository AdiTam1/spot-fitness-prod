#!/usr/bin/env node
/**
 * סקריפט Bulk Seeder למילוי טבלת food_catalog_items ב-Supabase באלפי עד עשרות אלפי מוצרים ישראליים:
 *   1. משרד הבריאות — הצמרת המלא (~4,624 מזונות רשמיים)
 *   2. שופרסל אונליין — סריקה מרובת קטגוריות + עמודים (מהרשת הישראלית, כולל ברקודים)
 *   3. Fuder — מותגי סופרים ישראליים (מתוך ~5,398 מוצרים)
 *   4. Open Food Facts ישראל — מוצרי סופרים עם ברקוד (מתוך ~9,320 מוצרים)
 *   5. סוגת (139), FoodGroups (~401), ניצת הדובדבן, ויקטורי אונליין
 *
 * הזרמה הדרגתית בבאצ'ים ישירות ל-DB — גם אם הסקריפט נעצר באמצע, כל מה שנסרק כבר שמור.
 *
 * הרצה:
 *   node --use-system-ca scripts/seed-shufersal.mjs              # מצב ברירת מחדל מאוזן (~7,000–9,000 מוצרים, 2–3 דקות)
 *   node --use-system-ca scripts/seed-shufersal.mjs --full       # מצב עומק מלא (~12,000–16,000+ מוצרים, כ-6–10 דקות)
 *   node --use-system-ca scripts/seed-shufersal.mjs --api-url=https://YOUR-SITE.vercel.app --secret=YOUR_CRON_SECRET
 */

import fs from 'fs';
import path from 'path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOH_RESOURCE_ID = 'c3cb0630-0650-46c1-a068-82d575c094b2';

const SHUFERSAL_SEARCH_TERMS = [
  'קוטג',
  'גבינה לבנה',
  'גבינה צהובה',
  'גבינה מלוחה',
  'יוגורט חלבון',
  'יוגורט',
  'חלב',
  'משקה חלבון',
  'מעדן',
  'שמנת',
  'חמאה',
  'ביצים',
  'חטיף חלבון',
  'טונה',
  'סלמון',
  'דגים',
  'חזה עוף',
  'שניצל',
  'הודו',
  'בשר טחון',
  'נקניק',
  'לחם',
  'לחם קל',
  'לחמניות',
  'פיתה',
  'טורטיה',
  'פריכיות',
  'קרקרים',
  'פסטה',
  'פתיתים',
  'קוסקוס',
  'אורז',
  'קינואה',
  'עדשים',
  'שעועית',
  'חומוס',
  'טחינה',
  'טופו',
  'שיבולת שועל',
  'דגני בוקר',
  'גרנולה',
  'חמאת בוטנים',
  'ממרח',
  'ריבה',
  'דבש',
  'אגוזים',
  'שקדים',
  'שוקולד',
  'עוגיות',
  'במבה',
  'שופרסל',
  'שופרסל green',
  'רוטב',
  'שמן זית',
  'גלידה',
  'משקה סויה',
  'משקה שקדים',
];

function loadLocalEnv() {
  for (const fname of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), fname);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeFoodKey(name) {
  return decodeHtml(name)
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMacro(raw) {
  const s = decodeHtml(raw).replace(/,/g, '');
  if (/פחות מ[-\s]*0\.?5|<\s*0\.?5/i.test(s)) return 0.3;
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? Math.round(Number(m[0]) * 10) / 10 : NaN;
}

function roundMacros(m) {
  return {
    calories: Math.max(0, Math.round(m.calories)),
    protein: Math.max(0, Math.round(m.protein * 10) / 10),
    carbs: Math.max(0, Math.round(m.carbs * 10) / 10),
    fat: Math.max(0, Math.round(m.fat * 10) / 10),
  };
}

function isValidMacros(m) {
  if (!m) return false;
  const vals = [m.calories, m.protein, m.carbs, m.fat];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return false;
  if (m.calories > 950 || m.protein > 100 || m.carbs > 100 || m.fat > 100) return false;
  if (m.calories === 0 && m.protein === 0 && m.carbs === 0 && m.fat === 0) return false;
  return true;
}

function extractPkgGrams(text) {
  const clean = decodeHtml(String(text || ''))
    .replace(/ל[-\s]?100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)/gi, ' ')
    .replace(/\b100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)\b/gi, ' ');
  const kg = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|ק״ג|קג|ליטר|ל'|kg)(?=$|\s|[,.)\]\-/])/i);
  if (kg) {
    const v = Number(kg[1].replace(',', '.'));
    if (Number.isFinite(v) && v > 0 && v <= 5) return Math.round(v * 1000);
  }
  const g = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג|מ"ל|מ״ל|מל|g|gr|ml)(?=$|\s|[,.)\]\-/])/i);
  if (g) {
    const v = Number(g[1].replace(',', '.'));
    if (Number.isFinite(v) && v >= 5 && v <= 5000) return Math.round(v);
  }
  return null;
}

function extractBarcodeFromHtml(raw) {
  const s = String(raw || '');
  for (const rx of [
    /"productSku"\s*:\s*"(\d{6,16})"/i,
    /"sku"\s*:\s*"(\d{6,16})"/i,
    /"gtin13"\s*:\s*"(\d{6,16})"/i,
    /"gtin"\s*:\s*"(\d{6,16})"/i,
    /"ean"\s*:\s*"(\d{6,16})"/i,
    /cloudfront\.net\/gs1\/(\d{6,16})\//i,
    /(?:^|\/|-)P_(\d{6,16})(?:["/?#&]|$)/i,
    /ברקוד\s*[:\-]?\s*(\d{7,14})/i,
  ]) {
    const m = s.match(rx);
    if (m?.[1] && m[1].length >= 6 && m[1].length <= 16) return m[1];
  }
  return '';
}

function inferUnits(name, isLiquid = false, explicitUnits = []) {
  const lower = name.toLowerCase();
  const base = [];
  for (const u of explicitUnits) {
    if (u?.label && Number(u.grams) > 0) base.push({ label: u.label, grams: Math.round(Number(u.grams)) });
  }
  const pkgG = extractPkgGrams(name);
  if (pkgG && pkgG !== 100 && !base.some((u) => u.grams === pkgG)) {
    base.push({ label: `חבילה / יחידה (${pkgG} ${isLiquid ? 'מ״ל' : 'גרם'})`, grams: pkgG });
  }
  if (/קוטג|גבינה לבנה|לבן|שמנת/.test(lower)) base.push({ label: 'גביע (250 גרם)', grams: 250 });
  else if (/יוגורט|מילקי|דנונה/.test(lower)) base.push({ label: 'גביע (150-200 גרם)', grams: 175 });
  else if (/לחם|חלה/.test(lower)) base.push({ label: 'פרוסה (32 גרם)', grams: 32 });
  else if (/פיתה/.test(lower)) base.push({ label: 'פיתה (90 גרם)', grams: 90 });
  else if (/טורטיה/.test(lower)) base.push({ label: 'טורטיה (50 גרם)', grams: 50 });
  else if (/חטיף/.test(lower)) base.push({ label: 'יחידה (45 גרם)', grams: 45 });
  else if (/משקה|חלב|סויה|שייק/.test(lower) || isLiquid) base.push({ label: 'כוס (240 מ״ל)', grams: 240 });

  const out = [];
  const seenG = new Set();
  for (const u of base) {
    if (u.grams === 100 || seenG.has(u.grams)) continue;
    seenG.add(u.grams);
    out.push(u);
  }
  out.push({ label: isLiquid ? '100 מ״ל' : '100 גרם', grams: 100 });
  return out;
}

async function mapConcurrent(arr, limit, fn) {
  const out = new Array(arr.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (idx < arr.length) {
        const i = idx++;
        out[i] = await fn(arr[i], i).catch(() => null);
      }
    })
  );
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, headers = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
        ...headers,
      },
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch {
    return { ok: false, status: 0, text: '' };
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetry(url, headers = {}, timeoutMs = 10000, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchText(url, headers, timeoutMs);
    if (res.status !== 429 && res.status !== 503 && res.status !== 0) {
      return res;
    }
    if (attempt < maxRetries) {
      await sleep(1600 * (attempt + 1));
    } else {
      return res;
    }
  }
  return { ok: false, status: 0, text: '' };
}

// =====================================================================
// מנגנון העלאה מדורג (Flushes every 250 items cleanly)
// =====================================================================
function createUploader(apiUrl, secret) {
  const supabaseBase = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const useApi = Boolean(apiUrl && secret);
  if (!useApi && (!supabaseBase || !supabaseKey)) {
    throw new Error(
      'חסרים פרטי חיבור: הגדר SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY בקובץ .env.local,\n' +
        'או הרץ עם --api-url=https://YOUR-SITE.vercel.app --secret=CRON_SECRET'
    );
  }

  let totalUploaded = 0;
  const seenIds = new Set();
  const buffer = [];

  async function sendChunk(chunk) {
    if (chunk.length === 0) return;
    if (useApi) {
      const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/admin/scrapers`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ action: 'seed_items', items: chunk }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(`API שגיאה (${res.status}): ${data.error || JSON.stringify(data)}`);
      }
      totalUploaded += Number(data.savedCount || chunk.length);
      return;
    }

    const mapped = chunk.map((it) => ({
      id: it.id.slice(0, 120),
      name: it.name.slice(0, 180),
      name_norm: `${normalizeFoodKey(it.name)} ${normalizeFoodKey(it.brand || '')}`.trim().slice(0, 280),
      brand: (it.brand || '').slice(0, 100),
      category: (it.category || '').slice(0, 100),
      barcode: it.barcode || null,
      calories: it.per100g.calories,
      protein: it.per100g.protein,
      carbs: it.per100g.carbs,
      fat: it.per100g.fat,
      units: it.units || [{ label: '100 גרם', grams: 100 }],
      source: it.source || 'scraper',
      source_site_id: it.sourceSiteId || null,
      source_site_name: it.sourceSiteName || null,
      source_url: it.sourceUrl || null,
      updated_at: it.updatedAt || new Date().toISOString(),
    }));

    const res = await fetch(`${supabaseBase}/rest/v1/food_catalog_items?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(mapped),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Supabase REST שגיאה (${res.status}): ${txt}`);
    }
    totalUploaded += mapped.length;
  }

  return {
    async push(items) {
      for (const it of items) {
        if (!it?.id || seenIds.has(it.id)) continue;
        seenIds.add(it.id);
        buffer.push(it);
        if (buffer.length >= 250) {
          const chunk = buffer.splice(0, 250);
          await sendChunk(chunk);
        }
      }
    },
    async flush() {
      while (buffer.length > 0) {
        const chunk = buffer.splice(0, 250);
        await sendChunk(chunk);
      }
      return totalUploaded;
    },
    getCount() {
      return seenIds.size;
    },
  };
}

// 1. משרד הבריאות מלא (~4,624 מזונות)
async function seedMohFull(uploader) {
  console.log('\n🏛️  [1/6] מושך את כל מאגר משרד הבריאות (data.gov.il)...');
  const offsets = [0, 1000, 2000, 3000, 4000];
  let count = 0;
  const batches = await mapConcurrent(offsets, 5, async (offset) => {
    const res = await fetchText(
      `https://data.gov.il/api/3/action/datastore_search?resource_id=${MOH_RESOURCE_ID}&limit=1000&offset=${offset}`,
      { Accept: 'application/json' }
    );
    if (!res.ok) return [];
    const json = JSON.parse(res.text);
    const items = [];
    for (const rec of json?.result?.records || []) {
      const name = String(rec.shmmitzrach || '').trim();
      const code = String(rec.smlmitzrach || rec._id || '').trim();
      if (!name || !code) continue;
      const per100g = roundMacros({
        calories: Number(rec.food_energy) || 0,
        protein: Number(rec.protein) || 0,
        carbs: Number(rec.carbohydrates) || 0,
        fat: Number(rec.total_fat) || 0,
      });
      if (!isValidMacros(per100g)) continue;
      items.push({
        id: `moh_gov-${code}`,
        name,
        brand: 'משרד הבריאות',
        category: 'מאגר הצמרת הלאומי',
        per100g,
        units: inferUnits(name, false),
        source: 'moh',
        sourceSiteId: 'moh_gov',
        sourceSiteName: 'משרד הבריאות',
        sourceUrl: 'https://data.gov.il/dataset/tzameret',
        updatedAt: new Date().toISOString(),
      });
    }
    return items;
  });

  for (const b of batches) {
    if (b && b.length) {
      count += b.length;
      await uploader.push(b);
    }
  }
  console.log(`   ✅ משרד הבריאות: ${count} מזונות הוזרמו.`);
}

// 2. שופרסל אונליין (מהרשת הישראלית, מרובה עמודים + ברקודים)
async function seedShufersalDeep(uploader, maxPagesPerTerm = 2) {
  console.log(`\n🛒 [2/6] סורק שופרסל אונליין (${SHUFERSAL_SEARCH_TERMS.length} קטגוריות x ${maxPagesPerTerm} עמודים)...`);
  const candidates = new Map();

  for (const term of SHUFERSAL_SEARCH_TERMS) {
    for (let page = 0; page < maxPagesPerTerm; page++) {
      const res = await fetchText(
        `https://www.shufersal.co.il/online/he/search/results?q=${encodeURIComponent(term)}&page=${page}&format=json`,
        { Accept: 'application/json' }
      );
      if (!res.ok) break;
      try {
        const json = JSON.parse(res.text);
        const list = json.results || [];
        if (list.length === 0) break;
        for (const r of list) {
          if (!r?.code || !r?.name) continue;
          const rawCodeDigits = String(r.code || '').replace(/^P_/i, '').replace(/[^0-9]/g, '');
          const rawBaseDigits = String(r.baseProduct || '').replace(/^P_/i, '').replace(/[^0-9]/g, '');
          const eanClean =
            (r.ean ? String(r.ean).replace(/[^0-9]/g, '') : '') ||
            (rawCodeDigits.length >= 6 ? rawCodeDigits : '') ||
            (rawBaseDigits.length >= 6 ? rawBaseDigits : '');
          if (!candidates.has(r.code)) {
            candidates.set(r.code, {
              code: String(r.code),
              name: decodeHtml(r.name),
              summary: r.summary ? decodeHtml(r.summary) : '',
              brandName: r.brandName ? decodeHtml(r.brandName) : r.manufacturer ? decodeHtml(r.manufacturer) : '',
              ean: eanClean,
            });
          }
        }
      } catch {
        break;
      }
    }
    process.stdout.write('.');
  }

  console.log(`\n   נמצאו ${candidates.size} מוצרי שופרסל ייחודיים — מחלץ ערכי מאקרו וברקוד...`);
  if (candidates.size === 0) {
    console.log('   ⚠️ שופרסל לא נגישה מהרשת הנוכחית (הרץ מכתובת IP ישראלית כדי לשאוב שופרסל).');
    return;
  }

  const arr = Array.from(candidates.values());
  let done = 0;
  let validCount = 0;

  for (let i = 0; i < arr.length; i += 60) {
    const slice = arr.slice(i, i + 60);
    const items = await mapConcurrent(slice, 6, async (c) => {
      const url = `https://www.shufersal.co.il/online/he/p/${encodeURIComponent(c.code)}`;
      const res = await fetchText(url);
      done++;
      if (!res.ok) return null;
      const nlStart = res.text.indexOf('nutritionListTitle');
      if (nlStart < 0) return null;

      const block = res.text.slice(nlStart, nlStart + 6500);
      const subInfo = decodeHtml(block.match(/<div class="subInfo">([\s\S]*?)<\/div>/i)?.[1] || '');
      if (subInfo && !/100/.test(subInfo)) return null;
      let calories = NaN;
      let protein = NaN;
      let carbs = NaN;
      let fat = NaN;

      for (const m of block.matchAll(
        /<div class="nutritionItem">[\s\S]*?<div class="number[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="text">([^<]+)<\/div>/gi
      )) {
        const val = parseMacro(m[1] || m[2]);
        const label = decodeHtml(m[3]);
        if (!Number.isFinite(val)) continue;
        if (label === 'אנרגיה' || label === 'קלוריות') calories = val;
        else if (label === 'חלבונים' || label === 'חלבון') protein = val;
        else if (label === 'פחמימות' || label === 'סך הפחמימות') carbs = val;
        else if (label === 'שומנים' || label === 'שומן' || label === 'סך השומנים') fat = val;
      }

      const per100g = roundMacros({ calories, protein, carbs, fat });
      if (!isValidMacros(per100g)) return null;

      const fullName =
        c.brandName && !c.name.includes(c.brandName) ? `${c.name} — ${c.brandName}` : c.name;
      const barcode = c.ean || extractBarcodeFromHtml(res.text);
      const smallText = decodeHtml(res.text.match(/<div class="smallText[^"]*">([\s\S]*?)<\/div>/i)?.[1] || '');
      const isLiquid = /מ"ל|מל|מ״ל|ליטר/.test(`${subInfo} ${smallText} ${c.summary || ''}`);
      const pkgGrams = extractPkgGrams(`${smallText} ${c.summary || ''} ${c.name}`);
      const explicitUnits =
        pkgGrams && pkgGrams !== 100
          ? [{ label: `אריזה שלמה (${pkgGrams} ${isLiquid ? 'מ״ל' : 'גרם'})`, grams: pkgGrams }]
          : [];

      return {
        id: `shufersal-${c.code.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        name: fullName,
        brand: c.brandName || 'שופרסל אונליין',
        category: 'סופרמרקט שופרסל',
        ...(barcode.length >= 6 ? { barcode } : {}),
        per100g,
        units: inferUnits(fullName, isLiquid, explicitUnits),
        source: 'scraper',
        sourceSiteId: 'shufersal',
        sourceSiteName: 'שופרסל אונליין',
        sourceUrl: url,
        updatedAt: new Date().toISOString(),
      };
    });

    const clean = items.filter(Boolean);
    validCount += clean.length;
    await uploader.push(clean);
    if (done % 180 === 0 || i + 60 >= arr.length) {
      console.log(`   עובדו ${done}/${arr.length} (${validCount} תקינים עם 4 מאקרו)`);
    }
  }
}

// 3. Fuder — מותגי סופרים ישראלים (~5,398 מוצרים) עם ריטריי וקצב עדין נגד 429
async function seedFuder(uploader, maxPages = 12) {
  console.log(`\n🏪 [3/6] סורק Fuder מוצרי סופרים (${maxPages} עמודים x 100)...`);
  const pages = Array.from({ length: maxPages }, (_, i) => i + 1);
  const indexBatches = await mapConcurrent(pages, 3, async (page) => {
    const res = await fetchWithRetry(
      `https://www.fuder.co.il/wp-json/wp/v2/foods?per_page=100&page=${page}&_fields=link,title`,
      { Accept: 'application/json' }
    );
    if (!res.ok) return [];
    return JSON.parse(res.text);
  });

  const allPosts = indexBatches.flat().filter((p) => p?.link);
  console.log(`   נמצאו ${allPosts.length} דפי מוצר ב-Fuder — מחלץ ערכים (עם הגנת קצב נגד 429)...`);
  let count = 0;

  for (let i = 0; i < allPosts.length; i += 60) {
    const slice = allPosts.slice(i, i + 60);
    const items = await mapConcurrent(slice, 3, async (p) => {
      await sleep(120);
      const res = await fetchWithRetry(p.link);
      if (!res.ok) return null;
      const ogTitle = decodeHtml(res.text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
      const ogDesc = decodeHtml(res.text.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
      const metaDesc = decodeHtml(res.text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');

      const cal = parseMacro(ogTitle.match(/([\d.,]+)\s*קלוריות ל[-\s]?100/i)?.[1] || metaDesc.match(/ל[-\s]?100\s*גרם:\s*([\d.,]+)\s*קלוריות/i)?.[1] || '');
      const pro = parseMacro(ogDesc.match(/([\d.,]+)\s*גרם חלבון/i)?.[1] || metaDesc.match(/([\d.,]+)\s*גרם חלבון/i)?.[1] || '');
      const carb = parseMacro(ogDesc.match(/([\d.,]+)\s*גרם פחמימות/i)?.[1] || metaDesc.match(/([\d.,]+)\s*גרם פחמימות/i)?.[1] || '');
      const fat = parseMacro(ogDesc.match(/([\d.,]+)\s*גרם שומן/i)?.[1] || metaDesc.match(/([\d.,]+)\s*גרם שומן/i)?.[1] || '');

      const per100g = roundMacros({ calories: cal, protein: pro, carbs: carb, fat });
      if (!isValidMacros(per100g)) return null;

      const titleName = ogTitle.split('—')[0]?.trim() || decodeHtml(p.title?.rendered || '');
      const slug = decodeURIComponent(p.link.split('/foods/')[1] || '').replace(/\//g, '');
      const extraUnits = [];
      const portionAttr = res.text.match(/data-fuder-portion=['"]([^'"]+)['"]/i)?.[1];
      if (portionAttr) {
        try {
          const pj = JSON.parse(decodeHtml(portionAttr));
          for (const po of pj?.portions || []) {
            const g = Math.round(Number(po?.grams ?? po?.weight) || 0);
            const lbl = String(po?.label || po?.name || '').trim();
            if (lbl && g > 0 && g !== 100) extraUnits.push({ label: `${lbl} (${g} גרם)`, grams: g });
          }
        } catch {}
      }
      const pkg = metaDesc.match(/\?\s*([^\(]+?)\s*\((\d+(?:[.,]\d+)?)\s*(?:גרם|מ"ל|מל)\)/);
      if (pkg) {
        const g = parseMacro(pkg[2]);
        if (g > 0 && g !== 100) extraUnits.push({ label: `${pkg[1].trim()} (${g} גרם)`, grams: g });
      }
      const barcode = extractBarcodeFromHtml(res.text);
      const units = inferUnits(titleName, false, extraUnits);

      return {
        id: `fuder-${normalizeFoodKey(slug || titleName).slice(0, 48)}`,
        name: titleName,
        brand: 'Fuder סופרים',
        category: 'מותגי סופרים — Fuder',
        ...(barcode ? { barcode } : {}),
        per100g,
        units,
        source: 'scraper',
        sourceSiteId: 'fuder',
        sourceSiteName: 'Fuder מוצרי סופרים',
        sourceUrl: p.link,
        updatedAt: new Date().toISOString(),
      };
    });

    const valid = items.filter(Boolean);
    count += valid.length;
    await uploader.push(valid);
    if ((i + 60) % 300 === 0 || i + 60 >= allPosts.length) {
      console.log(`   Fuder: ${Math.min(i + 60, allPosts.length)}/${allPosts.length} (${count} תקינים)`);
    }
  }
}

// 4. Open Food Facts ישראל (מוצרי ברקוד) עם ריטריי על 503/429
async function seedOpenFoodFacts(uploader, maxPages = 15) {
  console.log(`\n🌍 [4/6] מושך מוצרי סופרים וברקוד מ-Open Food Facts ישראל (${maxPages} עמודים x 100)...`);
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(1500);
    const res = await fetchWithRetry(
      `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&sort_by=unique_scans_n&page_size=100&page=${page}&fields=code,product_name_he,product_name,brands,stores,serving_quantity,product_quantity,quantity,nutriments`,
      {
        'User-Agent': 'SpotFitnessIsrael/1.0 (https://spot-fitness.vercel.app)',
        Accept: 'application/json',
      }
    );
    if (!res.ok) continue;
    try {
      const json = JSON.parse(res.text);
      const batch = [];
      for (const p of json.products || []) {
        const code = String(p.code || '').replace(/[^0-9]/g, '');
        const rawName = String(p.product_name_he || p.product_name || '').trim();
        const nut = p.nutriments || {};
        if (
          !code ||
          !rawName ||
          typeof nut['energy-kcal_100g'] !== 'number' ||
          typeof nut.proteins_100g !== 'number' ||
          typeof nut.carbohydrates_100g !== 'number' ||
          typeof nut.fat_100g !== 'number'
        ) {
          continue;
        }
        const per100g = roundMacros({
          calories: nut['energy-kcal_100g'],
          protein: nut.proteins_100g,
          carbs: nut.carbohydrates_100g,
          fat: nut.fat_100g,
        });
        if (!isValidMacros(per100g)) continue;

        const brand = String(p.brands || '').split(',')[0]?.trim() || 'סופרים בישראל';
        const fullName =
          brand && brand !== 'סופרים בישראל' && !rawName.includes(brand)
            ? `${rawName} — ${brand}`
            : rawName;

        const extraUnits = [];
        const srv = Number(p.serving_quantity);
        if (Number.isFinite(srv) && srv > 5 && srv < 1000 && srv !== 100) {
          extraUnits.push({ label: `מנה (${Math.round(srv)} גרם)`, grams: Math.round(srv) });
        }
        const rawPkg = Number(p.product_quantity);
        const pkgG =
          (Number.isFinite(rawPkg) && rawPkg > 5 && rawPkg <= 5000 ? Math.round(rawPkg) : null) ||
          extractPkgGrams(String(p.quantity || ''));
        if (pkgG && pkgG !== 100) {
          extraUnits.push({ label: `חבילה שלמה (${pkgG} גרם)`, grams: pkgG });
        }
        const units = inferUnits(fullName, false, extraUnits);

        batch.push({
          id: `openfoodfacts-${code}`,
          name: fullName,
          brand,
          category: p.stores ? `ברקוד וסופרים (${String(p.stores).slice(0, 35)})` : 'ברקוד וסופרים — ישראל',
          barcode: code,
          per100g,
          units,
          source: 'openfoodfacts',
          sourceSiteId: 'openfoodfacts',
          sourceSiteName: 'Open Food Facts ישראל',
          sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
          updatedAt: new Date().toISOString(),
        });
      }
      total += batch.length;
      await uploader.push(batch);
    } catch {
      continue;
    }
  }
  console.log(`   ✅ Open Food Facts ישראל: ${total} מוצרי ברקוד תקינים הוזרמו.`);
}

// 5. סוגת (139) + FoodGroups (401)
async function seedSugatAndFoodGroups(uploader) {
  console.log('\n🌾 [5/6] מושך את כל סוגת (139) ו-FoodGroups (401)...');
  const sugatBatches = await mapConcurrent([1, 2], 2, async (p) => {
    const res = await fetchText(`https://www.sugat.com/wp-json/wp/v2/products?per_page=100&page=${p}&_fields=link,title`, {
      Accept: 'application/json',
    });
    return res.ok ? JSON.parse(res.text) : [];
  });
  const sugatPosts = sugatBatches.flat().filter((p) => p?.link);
  const sugatItems = await mapConcurrent(sugatPosts, 10, async (p) => {
    const res = await fetchText(p.link);
    if (!res.ok) return null;
    let calories = NaN, protein = NaN, carbs = NaN, fat = NaN;
    for (const m of res.text.matchAll(
      /<div class="b-calories__td"[^>]*>([\s\S]*?)<\/div>\s*<div class="b-calories__td"[^>]*>([\s\S]*?)<\/div>/gi
    )) {
      const lbl = decodeHtml(m[1]);
      const val = parseMacro(decodeHtml(m[2]).split(/מתוכ/i)[0]);
      if (!Number.isFinite(val)) continue;
      if (lbl.startsWith('אנרגיה') || lbl.includes('קלוריות')) calories = val;
      else if (lbl.startsWith('חלבון') || lbl.startsWith('חלבונים')) protein = val;
      else if (lbl.startsWith('פחמימ')) carbs = val;
      else if (lbl.startsWith('שומנ') || lbl === 'שומן') fat = val;
    }
    const per100g = roundMacros({ calories, protein, carbs, fat });
    if (!isValidMacros(per100g)) return null;
    const rawName = decodeHtml(p.title?.rendered || '');
    const fullName = rawName.includes('סוגת') ? rawName : `${rawName} — סוגת`;
    const slug = decodeURIComponent(p.link.split('/products/')[1] || '').replace(/\//g, '');
    return {
      id: `sugat-${normalizeFoodKey(slug || rawName).slice(0, 48)}`,
      name: fullName,
      brand: 'סוגת',
      category: 'מוצרי יסוד וסופרים — סוגת',
      per100g,
      units: inferUnits(fullName, false),
      source: 'scraper',
      sourceSiteId: 'sugat',
      sourceSiteName: 'סוגת',
      sourceUrl: p.link,
      updatedAt: new Date().toISOString(),
    };
  });
  const cleanSugat = sugatItems.filter(Boolean);
  await uploader.push(cleanSugat);

  const fgBatches = await mapConcurrent([1, 2, 3, 4, 5], 3, async (p) => {
    const res = await fetchText(`https://foodgroups.co.il/wp-json/wp/v2/product?per_page=100&page=${p}&_fields=link,title`, {
      Accept: 'application/json',
    });
    return res.ok ? JSON.parse(res.text) : [];
  });
  const fgPosts = fgBatches.flat().filter((p) => p?.link);
  const fgItems = await mapConcurrent(fgPosts, 10, async (p) => {
    const res = await fetchText(p.link);
    if (!res.ok) return null;
    let calories = NaN, protein = NaN, carbs = NaN, fat = NaN;
    for (const m of res.text.matchAll(
      /nutritional-value">\s*<div>\s*([^<]+?)(?:<span[\s\S]*?<\/span>)?\s*<\/div>\s*<div>\s*(\d+(?:[.,]\d+)?)\s*<\/div>/gi
    )) {
      const lbl = decodeHtml(m[1]);
      const val = parseMacro(m[2]);
      if (!Number.isFinite(val)) continue;
      if (lbl.includes('אנרגיה') || lbl.includes('קלוריות')) calories = val;
      else if (lbl.includes('חלבונים')) protein = val;
      else if (lbl.includes('פחמימות')) carbs = val;
      else if (lbl.includes('שומנים')) fat = val;
    }
    const per100g = roundMacros({ calories, protein, carbs, fat });
    if (!isValidMacros(per100g)) return null;
    const name = decodeHtml(p.title?.rendered || '');
    const slug = decodeURIComponent(p.link.split('/product/')[1] || '').replace(/\//g, '');
    return {
      id: `foodgroups-${normalizeFoodKey(slug || name).slice(0, 46)}`,
      name,
      brand: 'FoodGroups מוצרי מדף',
      category: 'מוצרי מדף — FoodGroups',
      per100g,
      units: inferUnits(name, false),
      source: 'scraper',
      sourceSiteId: 'foodgroups',
      sourceSiteName: 'FoodGroups',
      sourceUrl: p.link,
      updatedAt: new Date().toISOString(),
    };
  });
  const cleanFg = fgItems.filter(Boolean);
  await uploader.push(cleanFg);
  console.log(`   ✅ סוגת: ${cleanSugat.length} | FoodGroups: ${cleanFg.length}`);
}

// 6. Foodik קטלוג ישראלי רחב (עמודים x 50 מוצרים לכל מילת חיפוש -> אלפי מוצרים!)
async function seedFoodikWide(uploader, maxPagesPerTerm = 3) {
  const queries = [
    'קוטג', 'גבינה', 'יוגורט', 'חלב', 'טונה', 'עוף', 'הודו', 'בקר', 'דג',
    'לחם', 'פיתה', 'לחמניה', 'פסטה', 'אורז', 'קוסקוס', 'שיבולת שועל', 'קמח',
    'טחינה', 'חומוס', 'עדשים', 'חמאת בוטנים', 'שקדים', 'שוקולד', 'גלידה',
    'מעדן', 'ביצה', 'חטיף', 'שניצל', 'תירס', 'עגבניה', 'תפוח', 'בננה', 'אבוקדו',
    'תנובה', 'שטראוס', 'טרה', 'אוסם', 'עלית', 'שוקו', 'עוגה', 'סלט', 'שמן',
  ];
  console.log(`\n📚 [6/6] שואב מוצרי מדף ישראליים מ-Foodik (${queries.length} קטגוריות x עד ${maxPagesPerTerm} עמודים)...`);
  let count = 0;

  const batches = await mapConcurrent(queries, 4, async (q) => {
    const queryItems = [];
    for (let page = 1; page <= maxPagesPerTerm; page++) {
      const res = await fetchWithRetry(
        `https://www.foodik.co.il/api/foods/search?q=${encodeURIComponent(q)}&limit=50&page=${page}`,
        { Accept: 'application/json' }
      );
      if (!res.ok) break;
      try {
        const json = JSON.parse(res.text);
        const list = Array.isArray(json?.results) ? json.results : [];
        if (list.length === 0) break;
        for (const entry of list) {
          const name = String(entry.name || '').trim();
          const id = String(entry.id || entry.slug || '').trim();
          const nut = entry.nutrients || {};
          if (!name || !id) continue;
          const per100g = roundMacros({
            calories: Number(nut.energy) || 0,
            protein: Number(nut.protein) || 0,
            carbs: Number(nut.carbs) || 0,
            fat: Number(nut.fat) || 0,
          });
          if (!isValidMacros(per100g)) continue;

          const units = Array.isArray(entry.units)
            ? entry.units
                .filter((u) => u?.name && Number(u.grams) > 0)
                .map((u) => ({
                  label: `${u.name} (${Math.round(Number(u.grams))} גרם)`,
                  grams: Math.round(Number(u.grams)),
                }))
            : [];
          if (units.length === 0) units.push(...inferUnits(name, false));
          else units.push({ label: '100 גרם', grams: 100 });

          queryItems.push({
            id: `foodik-${id}`,
            name,
            brand: 'Foodik',
            category: entry.categorySlug || 'מאגר מותגים ישראלי',
            per100g,
            units,
            source: 'scraper',
            sourceSiteId: 'foodik',
            sourceSiteName: 'Foodik',
            sourceUrl: entry.slug
              ? `https://www.foodik.co.il/foods/${entry.slug}/`
              : 'https://www.foodik.co.il',
            updatedAt: new Date().toISOString(),
          });
        }
        const totalPages = Number(json?.pages) || 1;
        if (page >= totalPages) break;
      } catch {
        break;
      }
    }
    return queryItems;
  });

  for (const b of batches) {
    if (b && b.length) {
      count += b.length;
      await uploader.push(b);
    }
  }
  console.log(`   ✅ Foodik: הוזרמו ${count} פריטים.`);
}

// 7. ויקטורי אונליין (ברקודים + weightText) + ניצת הדובדבן (משקל תכולה)
async function seedVictoryAndNizat(uploader, fullMode = false) {
  console.log('\n🛍️  [7/7] סורק ויקטורי אונליין וניצת הדובדבן (כולל ברקודים ומידות אריזה)...');
  const terms = fullMode
    ? SHUFERSAL_SEARCH_TERMS.slice(0, 35)
    : SHUFERSAL_SEARCH_TERMS.slice(0, 18);

  const victoryPaths = new Set();
  for (const q of terms) {
    const res = await fetchText(`https://www.victoryonline.co.il/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) continue;
    for (const m of res.text.matchAll(/href="(\/product\/[^"]+)"/g)) {
      victoryPaths.add(m[1]);
    }
  }

  let vCount = 0;
  const vArr = Array.from(victoryPaths);
  for (let i = 0; i < vArr.length; i += 60) {
    const slice = vArr.slice(i, i + 60);
    const items = await mapConcurrent(slice, 5, async (p) => {
      const fullUrl = `https://www.victoryonline.co.il${encodeURI(decodeURIComponent(p))}`;
      const res = await fetchText(fullUrl);
      if (!res.ok) return null;
      const unesc = res.text.replace(/\\"/g, '"');
      const nfIdx = unesc.indexOf('"nutritionFacts":{');
      if (nfIdx < 0) return null;
      const chunk = unesc.slice(Math.max(0, nfIdx - 3000), nfIdx + 1800);
      const nfMatch = chunk.match(/"nutritionFacts"\s*:\s*(\{[\s\S]*?\})\s*,\s*"nutritionServingSize"/);
      let nf = null;
      try {
        nf = nfMatch ? JSON.parse(nfMatch[1]) : null;
      } catch {
        nf = null;
      }
      if (!nf) {
        const altStart = nfIdx + '"nutritionFacts":'.length;
        let depth = 0, inStr = false, esc = false, endPos = -1;
        for (let k = altStart; k < Math.min(unesc.length, altStart + 4000); k++) {
          const ch = unesc[k];
          if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
          if (ch === '"') inStr = true;
          else if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { endPos = k + 1; break; } }
        }
        if (endPos > altStart) {
          try { nf = JSON.parse(unesc.slice(altStart, endPos)); } catch {}
        }
      }
      if (!nf) return null;
      const readM = (k) => parseMacro(nf[k]?.per100g || nf[k]?.per100ml || '');
      const per100g = roundMacros({ calories: readM('energy'), protein: readM('protein'), carbs: readM('carbs'), fat: readM('fat') });
      if (!isValidMacros(per100g)) return null;

      const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
      const rawName = decodeHtml(h1 || decodeURIComponent(p.split('/product/')[1] || '').replace(/-/g, ' '))
        .replace(/\s*[-|]\s*ויקטורי.*$/i, '').trim();
      const barcode = chunk.match(/"sku"\s*:\s*"(\d{6,16})"/i)?.[1] || extractBarcodeFromHtml(chunk);
      const wt = chunk.match(/"weightText"\s*:\s*"([^"]+)"/i)?.[1] || '';
      const srvName = chunk.match(/"nutritionServingSize"\s*:\s*"([^"]+)"/i)?.[1]?.trim() || '';
      const isLiquid = Boolean(nf.energy?.per100ml && !nf.energy?.per100g) || /מ"ל|מל|מ״ל|ליטר/.test(wt);
      let pkgG = extractPkgGrams(wt) || extractPkgGrams(rawName);
      if (!pkgG && nf.energy?.perServing && per100g.calories > 0) {
        const est = Math.round((parseMacro(nf.energy.perServing) / per100g.calories) * 100);
        if (est >= 5 && est <= 3000 && est !== 100) pkgG = est;
      }
      const explicitUnits = pkgG && pkgG !== 100
        ? [{ label: `${srvName && srvName !== '100 גרם' ? srvName + ' / ' : ''}חבילה (${pkgG} ${isLiquid ? 'מ״ל' : 'גרם'})`, grams: pkgG }]
        : [];

      return {
        id: `victory-${normalizeFoodKey(rawName).slice(0, 44)}`,
        name: rawName,
        brand: 'ויקטורי אונליין',
        category: 'סופרמרקט ויקטורי',
        ...(barcode ? { barcode } : {}),
        per100g,
        units: inferUnits(rawName, isLiquid, explicitUnits),
        source: 'scraper',
        sourceSiteId: 'victory',
        sourceSiteName: 'ויקטורי אונליין',
        sourceUrl: fullUrl,
        updatedAt: new Date().toISOString(),
      };
    });
    const clean = items.filter(Boolean);
    vCount += clean.length;
    await uploader.push(clean);
  }

  const nizatIds = new Map();
  for (const q of ['קמח', 'שיבולת שועל', 'טחינה', 'עדשים', 'חמאת בוטנים', 'שקדים', 'גרנולה', 'פריכיות', 'חלב', 'פסטה', 'נודלס', 'שוקולד']) {
    const res = await fetchText(`https://www.nizat.com/autosuggestproducts.ashx?term=${encodeURIComponent(q)}`, { Accept: 'application/json' });
    if (!res.ok) continue;
    try {
      const arr = JSON.parse(res.text);
      for (const x of arr || []) {
        if (x?.id && x?.value && !nizatIds.has(x.id)) nizatIds.set(x.id, decodeHtml(x.value));
      }
    } catch {}
  }

  let nCount = 0;
  const nArr = Array.from(nizatIds.entries());
  for (let i = 0; i < nArr.length; i += 60) {
    const slice = nArr.slice(i, i + 60);
    const items = await mapConcurrent(slice, 5, async ([id, titleHint]) => {
      const url = `https://www.nizat.com/productinfo.aspx?prodid=${id}`;
      const res = await fetchText(url);
      if (!res.ok) return null;
      const specs = res.text.match(/id="ContentPlaceHolder1_specs"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
      const clean = decodeHtml(specs || '');
      const calM = clean.match(/(?:אנרגיה\s*(?:\([^)]*\))?|קלוריות)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      const fatM = clean.match(/(?:סך\s*ה?שומנים|שומנים)\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      const carbM = clean.match(/(?:סך\s*ה?פחמימות|פחמימות)\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      const proM = clean.match(/חלבונים?\s*(?:\([^)]*\))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i);
      if (!calM || !fatM || !carbM || !proM) return null;
      const per100g = roundMacros({ calories: parseMacro(calM[1]), protein: parseMacro(proM[1]), carbs: parseMacro(carbM[1]), fat: parseMacro(fatM[1]) });
      if (!isValidMacros(per100g)) return null;
      const wtEl = res.text.match(/id="ContentPlaceHolder1_lblweight"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
      const pkgG = extractPkgGrams(wtEl) || extractPkgGrams(titleHint);
      const barcode = extractBarcodeFromHtml(res.text);
      const explicitUnits = pkgG && pkgG !== 100 ? [{ label: `אריזה שלמה (${pkgG} גרם)`, grams: pkgG }] : [];
      return {
        id: `nizat-${id}`,
        name: titleHint,
        brand: 'ניצת הדובדבן',
        category: 'טבע ואורגני — ניצת הדובדבן',
        ...(barcode ? { barcode } : {}),
        per100g,
        units: inferUnits(titleHint, false, explicitUnits),
        source: 'scraper',
        sourceSiteId: 'nizat',
        sourceSiteName: 'ניצת הדובדבן',
        sourceUrl: url,
        updatedAt: new Date().toISOString(),
      };
    });
    const clean = items.filter(Boolean);
    nCount += clean.length;
    await uploader.push(clean);
  }
  console.log(`   ✅ ויקטורי: ${vCount} מוצרים (עם ברקוד + משקל) | ניצת הדובדבן: ${nCount} מוצרים.`);
}

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const fullMode = args.includes('--full');
  const offOnly = args.includes('--off-only');
  const shufersalOnly = args.includes('--shufersal-only');
  const extrasOnly = args.includes('--extras-only');
  const backfillOnly = args.includes('--backfill-only');
  const apiUrlArg = args.find((a) => a.startsWith('--api-url='))?.split('=')[1] || process.env.SPOT_API_URL || '';
  const secretArg = args.find((a) => a.startsWith('--secret='))?.split('=')[1] || process.env.CRON_SECRET || '';

  const modeLabel = backfillOnly
    ? 'BACKFILL (השלמת ברקודים ומידות קיימות)'
    : extrasOnly
      ? 'EXTRAS (Foodik + Fuder + OFF + Victory/Nizat)'
      : fullMode
        ? 'FULL 14K–18K+'
        : 'BALANCED 8K–11K+';
  console.log(`🚀 מתחיל הזנת קטלוג מזון ל-Supabase (מצב: ${modeLabel})...`);
  const uploader = createUploader(apiUrlArg, secretArg);

  if (backfillOnly) {
    // Runs backfill endpoint directly if API mode is configured
  } else if (offOnly) {
    await seedOpenFoodFacts(uploader, fullMode ? 35 : 15);
  } else if (shufersalOnly) {
    await seedShufersalDeep(uploader, fullMode ? 4 : 2);
  } else if (extrasOnly) {
    await seedFoodikWide(uploader, fullMode ? 4 : 3);
    await seedOpenFoodFacts(uploader, fullMode ? 35 : 20);
    await seedVictoryAndNizat(uploader, fullMode);
    await seedFuder(uploader, fullMode ? 54 : 30);
  } else {
    await seedMohFull(uploader);
    await seedShufersalDeep(uploader, fullMode ? 3 : 2);
    await seedFoodikWide(uploader, fullMode ? 4 : 3);
    await seedOpenFoodFacts(uploader, fullMode ? 35 : 12);
    await seedSugatAndFoodGroups(uploader);
    await seedVictoryAndNizat(uploader, fullMode);
    await seedFuder(uploader, fullMode ? 54 : 15);
  }

  const totalUploaded = await uploader.flush();

  if (apiUrlArg && secretArg) {
    try {
      const bfRes = await fetch(`${apiUrlArg.replace(/\/+$/, '')}/api/admin/scrapers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretArg}`,
        },
        body: JSON.stringify({ action: 'backfill_catalog_meta' }),
      });
      const bfJson = await bfRes.json();
      if (bfRes.ok && bfJson.ok) {
        console.log(
          `   🏷️  השלמת ברקודים ומידות ב-DB: נסרקו ${bfJson.scanned}, הושלמו ${bfJson.updatedBarcodes} ברקודים ו-${bfJson.updatedUnits} מידות אריזה.`
        );
      }
    } catch {}
  }

  console.log(`\n🎉 הסתיים בהצלחה! הועלו/עודכנו סה"כ ${totalUploaded.toLocaleString('he-IL')} מוצרים ייחודיים לטבלת food_catalog_items!`);
}

main().catch((err) => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
