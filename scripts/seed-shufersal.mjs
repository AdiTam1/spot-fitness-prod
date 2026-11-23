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

function inferUnits(name, isLiquid = false) {
  const lower = name.toLowerCase();
  const units = [{ label: isLiquid ? '100 מ״ל' : '100 גרם', grams: 100 }];
  if (/קוטג|גבינה לבנה|לבן|שמנת/.test(lower)) units.unshift({ label: 'גביע (250 גרם)', grams: 250 });
  else if (/יוגורט|מילקי|דנונה/.test(lower)) units.unshift({ label: 'גביע (150-200 גרם)', grams: 175 });
  else if (/לחם|חלה/.test(lower)) units.unshift({ label: 'פרוסה (32 גרם)', grams: 32 });
  else if (/פיתה/.test(lower)) units.unshift({ label: 'פיתה (90 גרם)', grams: 90 });
  else if (/טורטיה/.test(lower)) units.unshift({ label: 'טורטיה (50 גרם)', grams: 50 });
  else if (/חטיף/.test(lower)) units.unshift({ label: 'יחידה (45 גרם)', grams: 45 });
  else if (/משקה|חלב|סויה|שייק/.test(lower) || isLiquid) units.unshift({ label: 'כוס (240 מ״ל)', grams: 240 });
  return units;
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
          if (!candidates.has(r.code)) {
            candidates.set(r.code, {
              code: String(r.code),
              name: decodeHtml(r.name),
              brandName: r.brandName ? decodeHtml(r.brandName) : '',
              ean: r.ean ? String(r.ean).replace(/[^0-9]/g, '') : '',
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
      return {
        id: `shufersal-${c.code.replace(/[^a-zA-Z0-9_-]/g, '')}`,
        name: fullName,
        brand: c.brandName || 'שופרסל אונליין',
        category: 'סופרמרקט שופרסל',
        ...(c.ean.length >= 6 ? { barcode: c.ean } : {}),
        per100g,
        units: inferUnits(fullName, /מ"ל|מל|מ״ל/.test(subInfo)),
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

// 3. Fuder — מותגי סופרים ישראלים (~5,398 מוצרים)
async function seedFuder(uploader, maxPages = 12) {
  console.log(`\n🏪 [3/6] סורק Fuder מוצרי סופרים (${maxPages} עמודים x 100)...`);
  const pages = Array.from({ length: maxPages }, (_, i) => i + 1);
  const indexBatches = await mapConcurrent(pages, 4, async (page) => {
    const res = await fetchText(
      `https://www.fuder.co.il/wp-json/wp/v2/foods?per_page=100&page=${page}&_fields=link,title`,
      { Accept: 'application/json' }
    );
    if (!res.ok) return [];
    return JSON.parse(res.text);
  });

  const allPosts = indexBatches.flat().filter((p) => p?.link);
  console.log(`   נמצאו ${allPosts.length} דפי מוצר ב-Fuder — מחלץ ערכים...`);
  let count = 0;

  for (let i = 0; i < allPosts.length; i += 80) {
    const slice = allPosts.slice(i, i + 80);
    const items = await mapConcurrent(slice, 10, async (p) => {
      const res = await fetchText(p.link);
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
      const units = inferUnits(titleName, false);
      const pkg = metaDesc.match(/\?\s*([^\(]+?)\s*\((\d+(?:[.,]\d+)?)\s*(?:גרם|מ"ל|מל)\)/);
      if (pkg) {
        const g = parseMacro(pkg[2]);
        if (g > 0 && g !== 100) units.unshift({ label: `${pkg[1].trim()} (${g} גרם)`, grams: g });
      }

      return {
        id: `fuder-${normalizeFoodKey(slug || titleName).slice(0, 48)}`,
        name: titleName,
        brand: 'Fuder סופרים',
        category: 'מותגי סופרים — Fuder',
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
    if ((i + 80) % 320 === 0 || i + 80 >= allPosts.length) {
      console.log(`   Fuder: ${Math.min(i + 80, allPosts.length)}/${allPosts.length} (${count} תקינים)`);
    }
  }
}

// 4. Open Food Facts ישראל (מוצרי ברקוד)
async function seedOpenFoodFacts(uploader, maxPages = 15) {
  console.log(`\n🌍 [4/6] מושך מוצרי סופרים וברקוד מ-Open Food Facts ישראל (${maxPages} עמודים x 100)...`);
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchText(
      `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&sort_by=unique_scans_n&page_size=100&page=${page}&fields=code,product_name_he,product_name,brands,stores,serving_quantity,nutriments`,
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

        const units = inferUnits(fullName, false);
        const srv = Number(p.serving_quantity);
        if (Number.isFinite(srv) && srv > 5 && srv < 1000 && srv !== 100) {
          units.unshift({ label: `מנה (${Math.round(srv)} גרם)`, grams: Math.round(srv) });
        }

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

// 6. Foodik קטלוג ישראלי רחב (עשרות מילות חיפוש -> אלפי מותגי מדף!)
async function seedFoodikWide(uploader) {
  const queries = [
    'קוטג', 'גבינה', 'יוגורט', 'חלב', 'טונה', 'עוף', 'הודו', 'בקר', 'דג',
    'לחם', 'פיתה', 'לחמניה', 'פסטה', 'אורז', 'קוסקוס', 'שיבולת שועל', 'קמח',
    'טחינה', 'חומוס', 'עדשים', 'חמאת בוטנים', 'שקדים', 'שוקולד', 'גלידה',
    'מעדן', 'ביצה', 'חטיף', 'שניצל', 'תירס', 'עגבניה', 'תפוח', 'בננה', 'אבוקדו',
  ];
  console.log(`\n📚 [6/6] שואב מוצרי מדף ישראליים מ-Foodik (${queries.length} קטגוריות)...`);
  let count = 0;
  const batches = await mapConcurrent(queries, 4, async (q) => {
    const res = await fetchText(`https://www.foodik.co.il/api/foods/search?q=${encodeURIComponent(q)}`, {
      Accept: 'application/json',
    });
    if (!res.ok) return [];
    const arr = JSON.parse(res.text);
    const items = [];
    for (const row of Array.isArray(arr) ? arr : []) {
      const name = String(row.Name || row.name || '').trim();
      const id = String(row.Id || row.id || '').trim();
      if (!name || !id) continue;
      const per100g = roundMacros({
        calories: Number(row.Calories ?? row.calories) || 0,
        protein: Number(row.Protein ?? row.protein) || 0,
        carbs: Number(row.Carbs ?? row.carbohydrates ?? row.carbs) || 0,
        fat: Number(row.Fat ?? row.fat) || 0,
      });
      if (!isValidMacros(per100g)) continue;
      items.push({
        id: `foodik-${id}`,
        name,
        brand: 'Foodik ישראל',
        category: 'מאגר מותגים ישראלי',
        per100g,
        units: inferUnits(name, false),
        source: 'scraper',
        sourceSiteId: 'foodik',
        sourceSiteName: 'Foodik',
        sourceUrl: 'https://www.foodik.co.il',
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
  console.log(`   ✅ Foodik: הוזרמו ${count} פריטים.`);
}

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const fullMode = args.includes('--full');
  const offOnly = args.includes('--off-only');
  const shufersalOnly = args.includes('--shufersal-only');
  const apiUrlArg = args.find((a) => a.startsWith('--api-url='))?.split('=')[1] || process.env.SPOT_API_URL || '';
  const secretArg = args.find((a) => a.startsWith('--secret='))?.split('=')[1] || process.env.CRON_SECRET || '';

  console.log(`🚀 מתחיל הזנת קטלוג מזון ל-Supabase (מצב: ${fullMode ? 'FULL 12K–16K+' : 'BALANCED 7K–9K+'})...`);
  const uploader = createUploader(apiUrlArg, secretArg);

  if (offOnly) {
    await seedOpenFoodFacts(uploader, fullMode ? 35 : 15);
  } else if (shufersalOnly) {
    await seedShufersalDeep(uploader, fullMode ? 3 : 2);
  } else {
    await seedMohFull(uploader);
    await seedShufersalDeep(uploader, fullMode ? 3 : 2);
    await seedFoodikWide(uploader);
    await seedOpenFoodFacts(uploader, fullMode ? 35 : 12);
    await seedSugatAndFoodGroups(uploader);
    await seedFuder(uploader, fullMode ? 54 : 12);
  }

  const totalUploaded = await uploader.flush();
  console.log(`\n🎉 הסתיים בהצלחה! הועלו/עודכנו סה"כ ${totalUploaded.toLocaleString('he-IL')} מוצרים ייחודיים לטבלת food_catalog_items!`);
}

main().catch((err) => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
