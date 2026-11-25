import { ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { FoodCatalogItem, UserFoodHistoryItem } from '@/types/nutrition';

export type SemanticSourceGroup = 'all' | 'favorites_recent' | 'custom_only' | 'retail' | 'moh_gov';

export interface SearchCachePayload {
  items: FoodCatalogItem[];
  needsLiveFallback: boolean;
  liveDone: boolean;
  mohCount: number;
  scraperCount: number;
  totalAvailable?: number;
  storedAt: number;
}

export const SEMANTIC_SOURCE_TABS: ReadonlyArray<{
  id: SemanticSourceGroup;
  label: string;
}> = [
  { id: 'all', label: 'הכל' },
  { id: 'favorites_recent', label: 'מועדפים והיסטוריה' },
  { id: 'custom_only', label: 'מוצרים אישיים' },
  { id: 'retail', label: 'סופרים ומותגים' },
  { id: 'moh_gov', label: 'מזון בסיסי (משה״ב)' },
];

export const RETAIL_SITE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'all', label: 'כל הרשתות והמותגים' },
  { id: 'shufersal', label: 'שופרסל (DB)' },
  { id: 'victory', label: 'ויקטורי' },
  { id: 'nizat', label: 'ניצת הדובדבן' },
  { id: 'tevabari', label: 'טבע בריא' },
  { id: 'fuder', label: 'Fuder סופרים' },
  { id: 'foodgroups', label: 'FoodGroups' },
  { id: 'sugat', label: 'סוגת' },
  { id: 'tara', label: 'טרה' },
  { id: 'berman', label: 'ברמן' },
  { id: 'foodsdictionary', label: 'FoodsDictionary' },
  { id: 'foodik', label: 'Foodik' },
  { id: 'netogreen', label: 'NetoGreen' },
  { id: 'openfoodfacts', label: 'Open Food Facts / ברקוד' },
];

const SEARCH_CACHE_MAX = 40;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_STORAGE_MAX = 80;
const HISTORY_KEY_PREFIX = 'spot_food_history_v1_';

const searchLruCache = new Map<string, SearchCachePayload>();

export function normalizeClientFoodText(raw: string): string {
  return String(raw || '')
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&apos;|&#0?39;|&#0?96;/g, "'")
    .replace(/&amp;/g, '&')
    .toLowerCase()
    .replace(/['"`׳״\-–—,.()/\\_%:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripHebrewCommonPrefix(token: string): string {
  if (/^[הובלמכ][א-ת]{3,}$/.test(token)) {
    return token.slice(1);
  }
  return token;
}

export function makeFoodDedupeKey(item: Pick<FoodCatalogItem, 'name' | 'per100g'>): string {
  return `${normalizeClientFoodText(item.name)}:${Math.round(item.per100g?.calories || 0)}`;
}

export function buildSearchCacheKey(
  query: string,
  sourceGroup: SemanticSourceGroup,
  retailSubSite: string
): string {
  const effectiveSource =
    sourceGroup === 'retail' && retailSubSite && retailSubSite !== 'all'
      ? retailSubSite
      : sourceGroup;
  return `${normalizeClientFoodText(query)}|${effectiveSource}`;
}

export function getCachedFoodSearch(key: string): SearchCachePayload | null {
  const entry = searchLruCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > SEARCH_CACHE_TTL_MS) {
    searchLruCache.delete(key);
    return null;
  }
  // LRU bump
  searchLruCache.delete(key);
  searchLruCache.set(key, entry);
  return entry;
}

export function setCachedFoodSearch(key: string, payload: Omit<SearchCachePayload, 'storedAt'>): void {
  if (searchLruCache.has(key)) {
    searchLruCache.delete(key);
  } else if (searchLruCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchLruCache.keys().next().value;
    if (oldest) searchLruCache.delete(oldest);
  }
  searchLruCache.set(key, { ...payload, storedAt: Date.now() });
}

export function loadLocalFoodHistory(userId?: string): UserFoodHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${HISTORY_KEY_PREFIX}${userId || 'me'}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, HISTORY_STORAGE_MAX) as UserFoodHistoryItem[];
  } catch {
    return [];
  }
}

export function saveLocalFoodHistory(userId: string | undefined, items: UserFoodHistoryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      `${HISTORY_KEY_PREFIX}${userId || 'me'}`,
      JSON.stringify(items.slice(0, HISTORY_STORAGE_MAX))
    );
  } catch {
    // ignore private mode / quota issues
  }
}

export function upsertLocalHistoryList(
  prev: UserFoodHistoryItem[],
  item: FoodCatalogItem,
  actionKind: 'picked' | 'barcode' | 'logged',
  lastUnitLabel?: string,
  lastGrams?: number
): UserFoodHistoryItem[] {
  const key =
    item.id ||
    (item.barcode
      ? `bc-${item.barcode}`
      : `nm-${normalizeClientFoodText(item.name)}-${Math.round(item.per100g.calories)}`);
  const existingIdx = prev.findIndex((x) => x.foodKey === key || x.id === item.id);
  const nowIso = new Date().toISOString();
  const prevRow = existingIdx >= 0 ? prev[existingIdx] : null;
  const nextEntry: UserFoodHistoryItem = {
    ...item,
    foodKey: prevRow?.foodKey || key,
    catalogId: item.id,
    actionKind:
      prevRow?.actionKind === 'barcode' || actionKind === 'barcode' ? 'barcode' : actionKind,
    useCount: (prevRow?.useCount || 0) + 1,
    lastUsedAt: nowIso,
    lastUnitLabel: lastUnitLabel || prevRow?.lastUnitLabel,
    lastGrams: lastGrams || prevRow?.lastGrams,
  };

  const withoutPrev = existingIdx >= 0 ? prev.filter((_, idx) => idx !== existingIdx) : prev;
  return [nextEntry, ...withoutPrev].slice(0, HISTORY_STORAGE_MAX);
}

export function mergeServerAndLocalHistory(
  serverItems: UserFoodHistoryItem[],
  localItems: UserFoodHistoryItem[]
): UserFoodHistoryItem[] {
  const byKey = new Map<string, UserFoodHistoryItem>();
  for (const it of [...serverItems, ...localItems]) {
    const k = it.foodKey || it.id;
    const prev = byKey.get(k);
    if (!prev || (it.lastUsedAt || '') > (prev.lastUsedAt || '')) {
      byKey.set(k, {
        ...it,
        useCount: Math.max(it.useCount || 1, prev?.useCount || 1),
      });
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
    .slice(0, HISTORY_STORAGE_MAX);
}

function scoreLocalCandidate(
  item: FoodCatalogItem & Partial<UserFoodHistoryItem>,
  qNorm: string,
  digitsQ: string,
  favoriteSet: Set<string>,
  historyKeySet: Set<string>
): number {
  const nameNorm = normalizeClientFoodText(item.name);
  const brandNorm = normalizeClientFoodText(item.brand || '');
  const catNorm = normalizeClientFoodText(item.category || '');
  const isHist = historyKeySet.has(item.id) || (item.foodKey ? historyKeySet.has(item.foodKey) : false);
  const isFav = favoriteSet.has(item.id);
  const isCustom = item.source === 'custom';
  const personalBoost =
    (isCustom ? 75 : 0) +
    (isHist ? 36 + Math.min(18, (item.useCount || 1) * 3) : 0) +
    (isFav ? 20 : 0);

  if (!qNorm && !digitsQ) {
    if (!isCustom && !isHist && !isFav && !item.isPopular) return 5;
    return 20 + personalBoost + (item.isPopular ? 10 : 0);
  }

  if (digitsQ.length >= 4 && item.barcode?.includes(digitsQ)) {
    return (item.barcode === digitsQ ? 140 : 100) + personalBoost;
  }

  let textScore = 0;
  if (nameNorm === qNorm) {
    textScore = 115;
  } else if (nameNorm.startsWith(`${qNorm} `)) {
    textScore = 96;
  } else if (nameNorm.startsWith(qNorm)) {
    textScore = 90;
  } else if (` ${nameNorm} `.includes(` ${qNorm} `)) {
    textScore = 82;
  } else {
    const qTokens = qNorm.split(/\s+/).filter(Boolean);
    const nameWithStripped = `${nameNorm} ${nameNorm
      .split(/\s+/)
      .map(stripHebrewCommonPrefix)
      .join(' ')} ${brandNorm}`;
    if (
      qTokens.length > 0 &&
      qTokens.every((t) => nameWithStripped.includes(t) || nameWithStripped.includes(stripHebrewCommonPrefix(t)))
    ) {
      textScore = 72;
    } else if (catNorm.includes(qNorm)) {
      textScore = 30;
    }
  }

  if (textScore <= 0) return 0;
  return textScore + personalBoost;
}

export function getInstantLocalFoods(opts: {
  query: string;
  sourceGroup: SemanticSourceGroup;
  retailSubSite: string;
  personalHistory: UserFoodHistoryItem[];
  favoriteIds: string[];
  customFoods?: FoodCatalogItem[];
  limit?: number;
}): Array<FoodCatalogItem & Partial<UserFoodHistoryItem>> {
  const limit = opts.limit || 36;
  const qNorm = normalizeClientFoodText(opts.query);
  const digitsQ = opts.query.replace(/[^0-9]/g, '');
  const favSet = new Set(opts.favoriteIds);
  const histSet = new Set(opts.personalHistory.map((h) => h.id));

  const deduped = new Map<string, FoodCatalogItem & Partial<UserFoodHistoryItem>>();

  for (const cf of opts.customFoods || []) {
    deduped.set(makeFoodDedupeKey(cf), cf);
  }
  for (const h of opts.personalHistory) {
    const k = makeFoodDedupeKey(h);
    if (!deduped.has(k)) {
      deduped.set(k, h);
    }
  }
  for (const loc of ISRAELI_FOOD_CATALOG) {
    const k = makeFoodDedupeKey(loc);
    if (!deduped.has(k)) {
      deduped.set(k, {
        ...loc,
        source: loc.source || 'local',
        sourceSiteName: loc.source === 'moh' ? 'משרד הבריאות' : 'מאגר SPOT מקומי',
      });
    }
  }

  const scored: Array<{ item: FoodCatalogItem & Partial<UserFoodHistoryItem>; score: number }> = [];
  for (const item of Array.from(deduped.values())) {
    if (opts.sourceGroup === 'favorites_recent') {
      if (item.source !== 'custom' && !histSet.has(item.id) && !favSet.has(item.id)) continue;
    } else if (opts.sourceGroup === 'custom_only') {
      if (item.source !== 'custom') continue;
    } else if (opts.sourceGroup === 'moh_gov') {
      if (item.source !== 'moh' && item.sourceSiteId !== 'moh_gov') continue;
    } else if (opts.sourceGroup === 'retail') {
      if (item.source === 'moh' || item.sourceSiteId === 'moh_gov') continue;
      if (
        opts.retailSubSite &&
        opts.retailSubSite !== 'all' &&
        item.sourceSiteId !== opts.retailSubSite
      ) {
        continue;
      }
    }

    const score = scoreLocalCandidate(item, qNorm, digitsQ, favSet, histSet);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.item);
}

export function mergeLocalAndRemoteFoodResults(
  localItems: Array<FoodCatalogItem & Partial<UserFoodHistoryItem>>,
  remoteItems: FoodCatalogItem[],
  query: string,
  personalHistory: UserFoodHistoryItem[],
  favoriteIds: string[],
  limit = 36
): Array<FoodCatalogItem & Partial<UserFoodHistoryItem>> {
  const qNorm = normalizeClientFoodText(query);
  const digitsQ = query.replace(/[^0-9]/g, '');
  const favSet = new Set(favoriteIds);
  const histById = new Map<string, UserFoodHistoryItem>();
  for (const h of personalHistory) histById.set(h.id, h);
  const histSet = new Set(personalHistory.map((h) => h.id));

  const byKey = new Map<string, FoodCatalogItem & Partial<UserFoodHistoryItem>>();

  for (const r of remoteItems) {
    const k = makeFoodDedupeKey(r);
    const histMatch = histById.get(r.id);
    byKey.set(k, histMatch ? { ...r, actionKind: histMatch.actionKind, useCount: histMatch.useCount } : r);
  }

  for (const l of localItems) {
    const k = makeFoodDedupeKey(l);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, l);
    } else {
      byKey.set(k, {
        ...prev,
        barcode: prev.barcode || l.barcode,
        imageDataUrl: prev.imageDataUrl || l.imageDataUrl,
        actionKind: l.actionKind || prev.actionKind,
        useCount: l.useCount || prev.useCount,
        lastUnitLabel: l.lastUnitLabel || prev.lastUnitLabel,
        lastGrams: l.lastGrams || prev.lastGrams,
      });
    }
  }

  const all = Array.from(byKey.values());
  // שמור סדר היסטורי/מועדפים בראש כשיש התאמה טקסטואלית, ואת שאר סדר השרת כמות שהוא
  const scored = all.map((item, idx) => {
    const isCustom = item.source === 'custom';
    const isHist = histSet.has(item.id);
    const isFav = favSet.has(item.id);
    const localRelevance = qNorm || digitsQ
      ? scoreLocalCandidate(item, qNorm, digitsQ, favSet, histSet)
      : (isCustom ? 95 : 0) + (isHist ? 60 : 0) + (isFav ? 40 : 0);
    // שומר מיקום יחסי מתוצאות ה-Hybrid SQL RPC עבור פריטים שאינם בהיסטוריה אישית
    const baseOrderBoost = Math.max(0, 50 - idx);
    const finalScore =
      isCustom || isHist || isFav
        ? localRelevance + 60
        : Math.max(localRelevance, baseOrderBoost + 20);
    return { item, finalScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored.slice(0, limit).map((x) => x.item);
}
