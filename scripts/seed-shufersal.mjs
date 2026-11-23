#!/usr/bin/env node
/**
 * סקריפט סנכרון חכם עבור שופרסל אונליין + Open Food Facts ישראל ישירות לטבלת food_catalog_items ב-Supabase.
 * מיועד להרצה ממחשב/רשת בישראל (כי חומת האש של שופרסל חוסמת שרתים בחו"ל) — מעלה ישירות למסד הנתונים!
 *
 * הרצה:
 *   1. ישירות מול Supabase (אם יש .env.local או משתני סביבה SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *      node --use-system-ca scripts/seed-shufersal.mjs
 *
 *   2. דרך ה-API המאובטח של האפליקציה ב-Vercel (אם מריצים בלי מפתחות Supabase מקומיים):
 *      node --use-system-ca scripts/seed-shufersal.mjs --api-url=https://YOUR-SITE.vercel.app --secret=YOUR_CRON_SECRET
 *
 * דגלים אופציונליים:
 *   --off-only      מייבא רק מ-Open Food Facts ישראל (בלי לפנות לשופרסל)
 *   --with-off      מוסיף בנוסף גם מוצרי Open Food Facts ישראל (ברירת מחדל: פועל)
 *   --no-off        מדלג על Open Food Facts ומסנכרן רק משופרסל אונליין
 */

import fs from 'fs';
import path from 'path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SHUFERSAL_SEARCH_TERMS = [
  'קוטג',
  'גבינה לבנה',
  'גבינה צהובה',
  'יוגורט חלבון',
  'יוגורט',
  'חלב',
  'מעדן חלבון',
  'שמנת',
  'חטיף חלבון',
  'טונה',
  'סלמון',
  'חזה עוף',
  'הודו',
  'בשר טחון',
  'ביצים',
  'לחם',
  'לחם קל',
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
  'חומוס',
  'טחינה',
  'שיבולת שועל',
  'דגני בוקר',
  'גרנולה',
  'חמאת בוטנים',
  'אגוזים',
  'שקדים',
  'שוקולד',
  'שופרסל',
  'שופרסל green',
  'רוטב',
  'גלידה',
  'משקה סויה',
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

async function fetchText(url, headers = {}, timeoutMs = 9500) {
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
  } finally {
    clearTimeout(t);
  }
}

async function scrapeShufersal() {
  console.log(`\n🔍 סורק ${SHUFERSAL_SEARCH_TERMS.length} קטגוריות משופרסל אונליין...`);
  const candidates = new Map();

  for (const term of SHUFERSAL_SEARCH_TERMS) {
    try {
      const res = await fetchText(
        `https://www.shufersal.co.il/online/he/search/results?q=${encodeURIComponent(term)}&format=json`,
        { Accept: 'application/json' }
      );
      if (!res.ok) continue;
      const json = JSON.parse(res.text);
      for (const r of json.results || []) {
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
      process.stdout.write('.');
    } catch {
      process.stdout.write('x');
    }
  }

  console.log(`\n📦 נמצאו ${candidates.size} מוצרים ייחודיים. מחלץ סימון תזונתי מלא...`);
  const list = Array.from(candidates.values());
  let done = 0;

  const parsed = await mapConcurrent(list, 5, async (c) => {
    const url = `https://www.shufersal.co.il/online/he/p/${encodeURIComponent(c.code)}`;
    const res = await fetchText(url);
    done++;
    if (done % 50 === 0) console.log(`   עובדו ${done}/${list.length} מוצרים...`);
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

    const per100g = {
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
    };
    if (!isValidMacros(per100g)) return null;

    const fullName =
      c.brandName && !c.name.includes(c.brandName) ? `${c.name} — ${c.brandName}` : c.name;
    const isLiquid = /מ"ל|מל|מ״ל/.test(subInfo);

    return {
      id: `shufersal-${c.code.replace(/[^a-zA-Z0-9_-]/g, '')}`,
      name: fullName,
      brand: c.brandName || 'שופרסל אונליין',
      category: 'סופרמרקט שופרסל',
      ...(c.ean.length >= 6 ? { barcode: c.ean } : {}),
      per100g,
      units: inferUnits(fullName, isLiquid),
      source: 'scraper',
      sourceSiteId: 'shufersal',
      sourceSiteName: 'שופרסל אונליין',
      sourceUrl: url,
      updatedAt: new Date().toISOString(),
    };
  });

  const valid = parsed.filter(Boolean);
  console.log(`✅ שופרסל: חולצו בהצלחה ${valid.length} מוצרים עם 4 ערכי מאקרו מלאים!`);
  return valid;
}

async function scrapeOpenFoodFactsIsrael(pages = 6) {
  console.log(`\n🌍 שולף מוצרי מדף ישראליים מ-Open Food Facts (${pages} עמודים)...`);
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const url = `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=israel&sort_by=unique_scans_n&page_size=80&page=${page}&fields=code,product_name_he,product_name,brands,stores,serving_quantity,nutriments`;
    try {
      const res = await fetchText(url, {
        'User-Agent': 'SpotFitnessIsrael/1.0 (https://spot-fitness.vercel.app)',
        Accept: 'application/json',
      });
      if (!res.ok) continue;
      const json = JSON.parse(res.text);
      for (const p of json.products || []) {
        const code = String(p.code || '').replace(/[^0-9]/g, '');
        const rawName = String(p.product_name_he || p.product_name || '').trim();
        const nut = p.nutriments || {};
        const cal = nut['energy-kcal_100g'];
        const pro = nut.proteins_100g;
        const carb = nut.carbohydrates_100g;
        const fat = nut.fat_100g;
        if (
          !code ||
          !rawName ||
          typeof cal !== 'number' ||
          typeof pro !== 'number' ||
          typeof carb !== 'number' ||
          typeof fat !== 'number'
        ) {
          continue;
        }
        const per100g = {
          calories: Math.round(cal),
          protein: Math.round(pro * 10) / 10,
          carbs: Math.round(carb * 10) / 10,
          fat: Math.round(fat * 10) / 10,
        };
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

        items.push({
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
    } catch {
      continue;
    }
  }
  console.log(`✅ Open Food Facts ישראל: חולצו ${items.length} מוצרים מאומתים.`);
  return items;
}

async function uploadToSupabaseDirect(items) {
  const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !key) return null;

  console.log(`\n⬆️ מעלה ${items.length} מוצרים ישירות ל-Supabase (${baseUrl})...`);
  let totalSaved = 0;
  for (let i = 0; i < items.length; i += 250) {
    const chunk = items.slice(i, i + 250).map((it) => ({
      id: it.id,
      name: it.name,
      name_norm: `${normalizeFoodKey(it.name)} ${normalizeFoodKey(it.brand || '')}`.trim(),
      brand: it.brand || '',
      category: it.category || '',
      barcode: it.barcode || null,
      calories: it.per100g.calories,
      protein: it.per100g.protein,
      carbs: it.per100g.carbs,
      fat: it.per100g.fat,
      units: it.units || [],
      source: it.source || 'scraper',
      source_site_id: it.sourceSiteId || null,
      source_site_name: it.sourceSiteName || null,
      source_url: it.sourceUrl || null,
      updated_at: it.updatedAt || new Date().toISOString(),
    }));

    const res = await fetch(`${baseUrl}/rest/v1/food_catalog_items?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`Supabase REST שגיאה (${res.status}): ${errTxt}`);
    }
    totalSaved += chunk.length;
  }
  return totalSaved;
}

async function uploadViaApi(items, apiUrl, secret) {
  const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/admin/scrapers`;
  console.log(`\n⬆️ מעלה ${items.length} מוצרים דרך API (${endpoint})...`);
  let totalSaved = 0;
  for (let i = 0; i < items.length; i += 250) {
    const chunk = items.slice(i, i + 250);
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
    totalSaved += Number(data.savedCount || chunk.length);
  }
  return totalSaved;
}

async function main() {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const offOnly = args.includes('--off-only');
  const noOff = args.includes('--no-off');
  const apiUrlArg = args.find((a) => a.startsWith('--api-url='))?.split('=')[1] || process.env.SPOT_API_URL || '';
  const secretArg = args.find((a) => a.startsWith('--secret='))?.split('=')[1] || process.env.CRON_SECRET || '';

  let allItems = [];
  if (!offOnly) {
    const shuf = await scrapeShufersal();
    allItems = allItems.concat(shuf);
  }
  if (!noOff) {
    const off = await scrapeOpenFoodFactsIsrael(6);
    allItems = allItems.concat(off);
  }

  console.log(`\n📊 סה"כ מוצרים מאומתים שנאספו: ${allItems.length}`);
  if (allItems.length === 0) {
    console.log('לא נאספו פריטים להעלאה.');
    return;
  }

  if (apiUrlArg && secretArg) {
    const saved = await uploadViaApi(allItems, apiUrlArg, secretArg);
    console.log(`🎉 הושלם! נשמרו ${saved} מוצרים ב-Supabase דרך האתר.`);
    return;
  }

  const directSaved = await uploadToSupabaseDirect(allItems);
  if (directSaved !== null) {
    console.log(`🎉 הושלם! נשמרו ${directSaved} מוצרים ישירות בטבלת food_catalog_items ב-Supabase.`);
    return;
  }

  console.error(
    '\n⚠️ חסרים פרטי חיבור להעלאה:\n' +
      'הגדר SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY בקובץ .env.local,\n' +
      'או הרץ עם: node --use-system-ca scripts/seed-shufersal.mjs --api-url=https://YOUR-SITE.vercel.app --secret=CRON_SECRET'
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error('❌ שגיאה:', err.message);
  process.exit(1);
});
