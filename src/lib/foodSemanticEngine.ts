import {
  callGeminiJson,
  cleanGeminiKey,
  GEMINI_TEXT_MODELS,
} from '@/lib/geminiClient';
import {
  areDietaryAttributesCompatible,
  expandQueryWithFoodSynonyms,
  normalizeSemanticQueryText,
  scoreSynonymTextMatch,
} from '@/lib/foodSynonyms';
import { FoodCatalogItem } from '@/types/nutrition';

export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
export const FOOD_EMBEDDING_DIMS = 768;

const EMBED_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const QUERY_EMBED_TIMEOUT_MS = 5500;
const BATCH_EMBED_TIMEOUT_MS = 15000;
const QUERY_RAM_CACHE_MAX = 300;
const QUERY_RAM_CACHE_TTL_MS = 30 * 60 * 1000;
const REWRITE_CACHE_MAX = 200;
const REWRITE_CACHE_TTL_MS = 30 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __spotEmbedCooldownUntil: number | undefined;
  // eslint-disable-next-line no-var
  var __spotQueryEmbedRamCache:
    | Map<string, { vec: number[]; expiresAt: number }>
    | undefined;
  // eslint-disable-next-line no-var
  var __spotScraperRewriteCache:
    | Map<string, { terms: string[]; expiresAt: number }>
    | undefined;
}

export function getGeminiEmbeddingApiKey(): string {
  return cleanGeminiKey(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      ''
  );
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(getGeminiEmbeddingApiKey());
}

function getQueryRamCache(): Map<string, { vec: number[]; expiresAt: number }> {
  if (!globalThis.__spotQueryEmbedRamCache) {
    globalThis.__spotQueryEmbedRamCache = new Map();
  }
  return globalThis.__spotQueryEmbedRamCache;
}

function getRewriteCache(): Map<string, { terms: string[]; expiresAt: number }> {
  if (!globalThis.__spotScraperRewriteCache) {
    globalThis.__spotScraperRewriteCache = new Map();
  }
  return globalThis.__spotScraperRewriteCache;
}

function isEmbedInCooldown(): boolean {
  return Boolean(
    globalThis.__spotEmbedCooldownUntil &&
      Date.now() < globalThis.__spotEmbedCooldownUntil
  );
}

function markEmbedCooldownFromStatus(status: number, bodyText: string): void {
  const low = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    globalThis.__spotEmbedCooldownUntil = Date.now() + 5 * 60_000;
  } else if (status === 429) {
    const isDaily =
      low.includes('perday') || low.includes('daily') || low.includes('requestsperday');
    globalThis.__spotEmbedCooldownUntil = Date.now() + (isDaily ? 4 * 60_000 : 45_000);
  } else if (status >= 500) {
    globalThis.__spotEmbedCooldownUntil = Date.now() + 20_000;
  }
}

export function normalizeL2Vector(raw: number[]): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  let sumSq = 0;
  for (let i = 0; i < raw.length; i++) {
    const v = Number(raw[i]) || 0;
    sumSq += v * v;
  }
  if (sumSq <= 1e-12) return raw.map(() => 0);
  const inv = 1 / Math.sqrt(sumSq);
  return raw.map((v) => Math.round((Number(v) || 0) * inv * 1e6) / 1e6);
}

export function cosineSimilarityNormalized(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function formatVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0)).join(',')}]`;
}

/**
 * מפיק טקסט סמנטי עשיר עבור מוצר מזון (שם, מותג, קטגוריה ותגיות פרופיל תזונתי),
 * כדי שחיפושים כמו "משקה עתיר חלבון דל שומן" יתפסו גם מוצרים שלא כותבים זאת במפורש בכותרת.
 */
export function buildFoodEmbeddingDocumentText(
  item: Pick<FoodCatalogItem, 'name' | 'brand' | 'category' | 'per100g' | 'source'>
): string {
  const parts: string[] = [];
  const name = String(item.name || '').trim();
  const brand = String(item.brand || '').trim();
  const category = String(item.category || '').trim();

  if (name) parts.push(name);
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) {
    parts.push(`מותג: ${brand}`);
  }
  if (category && category !== 'מאגר סופרים') {
    parts.push(`קטגוריה: ${category}`);
  }

  const cal = Number(item.per100g?.calories) || 0;
  const pro = Number(item.per100g?.protein) || 0;
  const carbs = Number(item.per100g?.carbs) || 0;
  const fat = Number(item.per100g?.fat) || 0;

  const macroTags: string[] = [];
  if (pro >= 15 || (cal > 0 && pro * 4 >= cal * 0.35)) {
    macroTags.push('עתיר חלבון פרוטאין');
  }
  if (cal > 0 && cal <= 55) {
    macroTags.push('דל קלוריות לייט');
  }
  if (fat <= 3.5 && cal > 0) {
    macroTags.push('דל שומן');
  }
  if (carbs <= 5 && cal > 20) {
    macroTags.push('דל פחמימה קטו');
  }

  const synonyms = expandQueryWithFoodSynonyms(`${name} ${category}`, 4).slice(1);
  if (synonyms.length > 0) {
    macroTags.push(synonyms.join(' '));
  }

  if (macroTags.length > 0) {
    parts.push(`מאפיינים: ${macroTags.join(', ')}`);
  }

  return parts.join(' | ').slice(0, 600);
}

/**
 * מחזיר Embedding יחיד לשאילתת חיפוש (taskType: RETRIEVAL_QUERY) עם קאש ב-RAM.
 */
export async function embedSingleSearchQuery(query: string): Promise<number[] | null> {
  const norm = normalizeSemanticQueryText(query);
  if (!norm || norm.length < 2) return null;

  const ramCache = getQueryRamCache();
  const cached = ramCache.get(norm);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.vec;
  }

  const apiKey = getGeminiEmbeddingApiKey();
  if (!apiKey || isEmbedInCooldown()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(`${EMBED_API_BASE}/${GEMINI_EMBEDDING_MODEL}:embedContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: FOOD_EMBEDDING_DIMS,
        content: { parts: [{ text: query.trim().slice(0, 220) }] },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      markEmbedCooldownFromStatus(res.status, errTxt);
      return null;
    }

    const json = (await res.json()) as { embedding?: { values?: number[] } };
    const values = json?.embedding?.values;
    if (!Array.isArray(values) || values.length !== FOOD_EMBEDDING_DIMS) {
      return null;
    }

    const normalized = normalizeL2Vector(values);
    if (ramCache.size >= QUERY_RAM_CACHE_MAX) {
      const oldest = ramCache.keys().next().value;
      if (oldest) ramCache.delete(oldest);
    }
    ramCache.set(norm, {
      vec: normalized,
      expiresAt: Date.now() + QUERY_RAM_CACHE_TTL_MS,
    });
    return normalized;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * מייצר Embeddings בקבוצות (batchEmbedContents) לאינדוקס אסינכרוני של פריטי הקטלוג.
 */
export async function embedFoodDocumentsBatch(
  docs: Array<{ text: string; taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' }>
): Promise<Array<number[] | null>> {
  if (docs.length === 0) return [];
  const apiKey = getGeminiEmbeddingApiKey();
  if (!apiKey || isEmbedInCooldown()) {
    return docs.map(() => null);
  }

  const output: Array<number[] | null> = new Array(docs.length).fill(null);
  const chunkSize = 50;

  for (let start = 0; start < docs.length; start += chunkSize) {
    if (isEmbedInCooldown()) break;
    const chunk = docs.slice(start, start + chunkSize);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BATCH_EMBED_TIMEOUT_MS);

    try {
      const res = await fetch(
        `${EMBED_API_BASE}/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            requests: chunk.map((doc) => ({
              model: `models/${GEMINI_EMBEDDING_MODEL}`,
              taskType: doc.taskType || 'RETRIEVAL_DOCUMENT',
              outputDimensionality: FOOD_EMBEDDING_DIMS,
              content: {
                parts: [{ text: doc.text.slice(0, 600) }],
              },
            })),
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        markEmbedCooldownFromStatus(res.status, errTxt);
        break;
      }

      const json = (await res.json()) as {
        embeddings?: Array<{ values?: number[] }>;
      };
      const embeddings = Array.isArray(json?.embeddings) ? json.embeddings : [];
      for (let i = 0; i < chunk.length; i++) {
        const vals = embeddings[i]?.values;
        if (Array.isArray(vals) && vals.length === FOOD_EMBEDDING_DIMS) {
          output[start + i] = normalizeL2Vector(vals);
        }
      }
    } catch {
      break;
    } finally {
      clearTimeout(timer);
    }
  }

  return output;
}

/**
 * משכתב שאילתות טבעיות/אנגלית ל-2–3 מונחי חיפוש קמעונאיים קצרים בעברית עבור סקרייפרים חיים
 * (מכיוון שאתרי סופרים ישראליים עובדים רק לפי מילות מפתח ולא סמנטיקה).
 */
export async function rewriteQueryForIsraeliRetailScrapers(
  query: string
): Promise<string[]> {
  const clean = String(query || '').trim();
  const norm = normalizeSemanticQueryText(clean);
  if (!norm || norm.length < 3) return clean ? [clean] : [];

  const cache = getRewriteCache();
  const cached = cache.get(norm);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.terms;
  }

  const synonymVariants = expandQueryWithFoodSynonyms(clean, 3);
  const words = norm.split(/\s+/).filter(Boolean);
  const hasLatin = /[a-z]{3,}/i.test(clean);
  const looksConceptual =
    hasLatin ||
    words.length >= 3 ||
    /(?:משהו|ארוחת|תחליף|אחרי אימון|לפני אימון|עשיר ב|דל |בלי |ללא |מופחת)/.test(norm);

  const terms = new Set<string>([clean]);
  for (const v of synonymVariants) {
    if (/[א-ת]{2,}/.test(v)) terms.add(v);
  }

  const apiKey = getGeminiEmbeddingApiKey();
  if (looksConceptual && apiKey && terms.size < 3) {
    try {
      const prompt = [
        'המר את שאילתת המשתמש ל-2 מונחי חיפוש קצרים בעברית שמתאימים לחיפוש מוצר מדף בסופר ישראלי (שופרסל/ויקטורי).',
        'החזר JSON בלבד בפורמט: {"terms":["מונח 1","מונח 2"]}',
        `שאילתה: "${clean.slice(0, 80)}"`,
      ].join('\n');

      const { parsed } = await callGeminiJson(apiKey, prompt, GEMINI_TEXT_MODELS, {
        perAttemptTimeoutMs: 2800,
        fallbackAttemptTimeoutMs: 2400,
        totalBudgetMs: 4200,
      });

      const rawTerms = Array.isArray(parsed?.terms) ? parsed.terms : [];
      for (const t of rawTerms.slice(0, 3)) {
        const s = String(t || '').trim().slice(0, 40);
        if (s.length >= 2) terms.add(s);
      }
    } catch {
      // חזרה בטוחה להרחבת מילים נרדפות מקומית
    }
  }

  const finalTerms = Array.from(terms).slice(0, 3);
  if (cache.size >= REWRITE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(norm, {
    terms: finalTerms,
    expiresAt: Date.now() + REWRITE_CACHE_TTL_MS,
  });

  return finalTerms;
}

/**
 * מסנן ומדרג תוצאות שחזרו מסקרייפרים חיים: מונע כניסת פריטי קידום לא קשורים
 * ושומר על תאימות אחוזי שומן / טבעוני / דיאט.
 */
export function filterLiveScraperItemsSemantically(
  query: string,
  items: FoodCatalogItem[]
): FoodCatalogItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const expandedTerms = expandQueryWithFoodSynonyms(query, 5);
  const tokens = Array.from(
    new Set(
      expandedTerms
        .flatMap((t) => normalizeSemanticQueryText(t).split(/\s+/))
        .filter((w) => w.length >= 2)
    )
  );

  const passedAttribute = items.filter((item) =>
    areDietaryAttributesCompatible(query, item.name, item.category || '')
  );
  const pool = passedAttribute.length > 0 ? passedAttribute : items;

  const scored = pool.map((item) => {
    const targetText = `${item.name} ${item.brand || ''} ${item.category || ''}`;
    const targetNorm = normalizeSemanticQueryText(targetText);
    const synScore = scoreSynonymTextMatch(query, targetText);
    const hitCount = tokens.filter((t) => targetNorm.includes(t)).length;
    return {
      item,
      relevance: synScore + hitCount * 22,
    };
  });

  const relevantOnly = scored.filter((s) => s.relevance >= 20);
  if (relevantOnly.length >= 3) {
    return relevantOnly
      .sort((a, b) => b.relevance - a.relevance)
      .map((s) => s.item);
  }
  return scored
    .sort((a, b) => b.relevance - a.relevance)
    .map((s) => s.item);
}
