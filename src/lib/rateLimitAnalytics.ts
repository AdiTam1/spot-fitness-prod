import { UserRole } from '@/types/nutrition';
import {
  ROLE_RATE_LIMIT_POLICIES,
  RateLimitScope,
  RateLimitWindow,
} from './roleRateLimit';

export type RateLimitWindowKey = RateLimitWindow | 'unknown';

export interface RateLimitRawApiRow {
  id: number;
  created_at: string;
  request_id: string;
  method: string;
  route_pattern: string;
  action_name?: string | null;
  status_code: number;
  actor_id?: string | null;
  actor_role?: string | null;
  platform?: string | null;
  app_version_code?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  ai_usage?: Record<string, unknown> | null;
}

export interface RateLimitRawAuditRow {
  id: string;
  created_at: string;
  request_id?: string | null;
  actor_id: string;
  actor_role: string;
  platform?: string | null;
  app_version_code?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface RateLimitRawCounterRow {
  bucket_key: string;
  window_start: string;
  window_seconds: number;
  hit_count: number;
  expires_at: string;
}

export interface RateLimitNormalizedEvent {
  id: string;
  source: 'api_429' | 'degraded';
  createdAt: string;
  requestId: string;
  actorId: string;
  actorRole: string;
  scope: string;
  scopeLabelHe: string;
  window: RateLimitWindowKey;
  windowLabelHe: string;
  routePattern: string;
  statusCode: number;
  platform?: string | null;
  appVersionCode?: number | null;
  message: string;
}

export interface RateLimitUserSummary {
  actorId: string;
  actorRole: string;
  blockedCount: number;
  degradedCount: number;
  byWindow: Record<RateLimitWindowKey, number>;
  byScope: Array<{ scope: string; labelHe: string; count: number }>;
  firstHitAt: string;
  lastHitAt: string;
  lastScope: string;
  lastWindow: RateLimitWindowKey;
  lastMessage: string;
}

export interface RateLimitLiveUsageRow {
  actorId: string;
  role: UserRole;
  scope: RateLimitScope;
  scopeLabelHe: string;
  hourUsed: number;
  hourLimit: number;
  hourPct: number;
  dayUsed: number;
  dayLimit: number;
  dayPct: number;
  maxPct: number;
}

export interface RateLimitAnalyticsPayload {
  totalBlocked429: number;
  totalDegraded: number;
  uniqueBlockedActors: number;
  byWindow: Record<RateLimitWindowKey, number>;
  byScope: Array<{
    scope: string;
    labelHe: string;
    blockedCount: number;
    degradedCount: number;
  }>;
  byUser: RateLimitUserSummary[];
  liveUsage: RateLimitLiveUsageRow[];
  recentEvents: RateLimitNormalizedEvent[];
}

export const RATE_LIMIT_SCOPE_LABELS_HE: Record<string, string> = {
  ai_analyze: 'פענוח ארוחה ב-AI',
  ai_recommend: 'המלצת ארוחה (AI)',
  food_search_db: 'חיפוש מזון במאגר',
  food_search_embed: 'חיפוש סמנטי (Embeddings)',
  food_search_live: 'חיפוש חי בסופרים',
  admin_backfill_embeddings: 'אינדוקס Embeddings',
  auth_session: 'ניסיונות התחברות',
  food_barcode: 'סריקת ברקוד',
  food_enrich: 'העשרת רכיבים',
  food_custom: 'מאכל מותאם אישית',
  food_history: 'היסטוריית מזון',
};

export const RATE_LIMIT_WINDOW_LABELS_HE: Record<RateLimitWindowKey, string> = {
  minute: 'דקה',
  hour: 'שעה',
  day: 'יום',
  role: 'הרשאת תפקיד',
  unknown: 'לא מסווג',
};

function emptyWindowCounts(): Record<RateLimitWindowKey, number> {
  return { minute: 0, hour: 0, day: 0, role: 0, unknown: 0 };
}

function getScopeLabelHe(scope: string): string {
  return RATE_LIMIT_SCOPE_LABELS_HE[scope] || scope;
}

function inferScopeFromApiRow(row: RateLimitRawApiRow): string {
  const explicit = row.ai_usage?.rateLimitScope;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }
  const route = row.route_pattern || '';
  const msg = row.error_message || '';
  if (route.includes('/api/ai/analyze-meal')) return 'ai_analyze';
  if (route.includes('/api/ai/recommend-meal')) return 'ai_recommend';
  if (route.includes('/api/food/search')) {
    return /חיים ברשת|בסופרים|live/i.test(msg)
      ? 'food_search_live'
      : 'food_search_db';
  }
  if (route.includes('/api/admin/scrapers')) return 'admin_backfill_embeddings';
  if (route.includes('/api/auth/session')) return 'auth_session';
  if (route.includes('/api/food/barcode')) return 'food_barcode';
  if (route.includes('/api/food/enrich')) return 'food_enrich';
  if (route.includes('/api/food/custom')) return 'food_custom';
  if (route.includes('/api/food/history')) return 'food_history';
  return route || 'unknown';
}

function normalizeWindowValue(raw: unknown): RateLimitWindowKey | null {
  if (
    raw === 'minute' ||
    raw === 'hour' ||
    raw === 'day' ||
    raw === 'role'
  ) {
    return raw;
  }
  return null;
}

function inferWindowFromMessage(msg: string): RateLimitWindowKey {
  if (/אינה זמינה עבור תפקידך/.test(msg)) return 'role';
  if (/בדקה|שניות|המתן רגע|המתן כדקה/.test(msg)) return 'minute';
  if (/לשעה|בשעה/.test(msg)) return 'hour';
  if (/יומית|ביום|בחצות/.test(msg)) return 'day';
  return 'unknown';
}

function normalizeRoleStrict(role?: string | null): UserRole {
  if (role === 'admin' || role === 'coach' || role === 'trainee') return role;
  return 'trainee';
}

function toIsraelDateStr(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function parseCounterBucketKey(key: string): {
  scope: RateLimitScope;
  role: UserRole;
  actorId: string;
} | null {
  const idx1 = key.indexOf(':');
  if (idx1 <= 0) return null;
  const idx2 = key.indexOf(':', idx1 + 1);
  if (idx2 <= idx1 + 1 || idx2 >= key.length - 1) return null;

  const scope = key.slice(0, idx1) as RateLimitScope;
  if (!(scope in ROLE_RATE_LIMIT_POLICIES)) return null;

  const role = normalizeRoleStrict(key.slice(idx1 + 1, idx2));
  const actorId = key.slice(idx2 + 1);
  return { scope, role, actorId };
}

export function buildRateLimitAnalytics(params: {
  apiRows: RateLimitRawApiRow[];
  degradedAuditRows: RateLimitRawAuditRow[];
  counterRows: RateLimitRawCounterRow[];
  actorFilter?: string;
  nowMs?: number;
}): RateLimitAnalyticsPayload {
  const nowMs = params.nowMs ?? Date.now();
  const events: RateLimitNormalizedEvent[] = [];

  for (const row of params.apiRows) {
    const scope = inferScopeFromApiRow(row);
    const explicitWin = normalizeWindowValue(row.ai_usage?.rateLimitWindow);
    const msg = row.error_message || row.error_code || 'HTTP 429';
    const win = explicitWin || inferWindowFromMessage(msg);
    events.push({
      id: `api-${row.id}`,
      source: 'api_429',
      createdAt: row.created_at,
      requestId: row.request_id,
      actorId: row.actor_id || 'anonymous',
      actorRole: row.actor_role || 'unknown',
      scope,
      scopeLabelHe: getScopeLabelHe(scope),
      window: win,
      windowLabelHe: RATE_LIMIT_WINDOW_LABELS_HE[win],
      routePattern: row.route_pattern,
      statusCode: row.status_code,
      platform: row.platform,
      appVersionCode: row.app_version_code,
      message: msg,
    });
  }

  for (const row of params.degradedAuditRows) {
    const meta = row.metadata || {};
    const scope =
      typeof meta.scope === 'string' && meta.scope
        ? meta.scope
        : 'food_search_embed';
    const msg =
      typeof meta.messageHe === 'string' && meta.messageHe
        ? meta.messageHe
        : 'מכסת Embeddings מוצתה (נסיגה לחיפוש DB)';
    const win =
      normalizeWindowValue(meta.window) || inferWindowFromMessage(msg);
    events.push({
      id: `audit-${row.id}`,
      source: 'degraded',
      createdAt: row.created_at,
      requestId: row.request_id || '',
      actorId: row.actor_id || 'anonymous',
      actorRole: row.actor_role || 'unknown',
      scope,
      scopeLabelHe: getScopeLabelHe(scope),
      window: win,
      windowLabelHe: RATE_LIMIT_WINDOW_LABELS_HE[win],
      routePattern: '/api/food/search',
      statusCode: 200,
      platform: row.platform,
      appVersionCode: row.app_version_code,
      message: msg,
    });
  }

  events.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));

  const globalByWindow = emptyWindowCounts();
  const scopeMap = new Map<
    string,
    { scope: string; labelHe: string; blockedCount: number; degradedCount: number }
  >();
  const userMap = new Map<
    string,
    {
      actorId: string;
      actorRole: string;
      blockedCount: number;
      degradedCount: number;
      byWindow: Record<RateLimitWindowKey, number>;
      scopeCounts: Map<string, number>;
      firstHitAt: string;
      lastHitAt: string;
      lastScope: string;
      lastWindow: RateLimitWindowKey;
      lastMessage: string;
    }
  >();

  let totalBlocked429 = 0;
  let totalDegraded = 0;

  for (const ev of events) {
    if (ev.source === 'api_429') totalBlocked429 += 1;
    else totalDegraded += 1;
    globalByWindow[ev.window] += 1;

    const sc = scopeMap.get(ev.scope) || {
      scope: ev.scope,
      labelHe: ev.scopeLabelHe,
      blockedCount: 0,
      degradedCount: 0,
    };
    if (ev.source === 'api_429') sc.blockedCount += 1;
    else sc.degradedCount += 1;
    scopeMap.set(ev.scope, sc);

    const existing = userMap.get(ev.actorId);
    if (!existing) {
      const scopeCounts = new Map<string, number>([[ev.scope, 1]]);
      const byWindow = emptyWindowCounts();
      byWindow[ev.window] = 1;
      userMap.set(ev.actorId, {
        actorId: ev.actorId,
        actorRole: ev.actorRole,
        blockedCount: ev.source === 'api_429' ? 1 : 0,
        degradedCount: ev.source === 'degraded' ? 1 : 0,
        byWindow,
        scopeCounts,
        firstHitAt: ev.createdAt,
        lastHitAt: ev.createdAt,
        lastScope: ev.scope,
        lastWindow: ev.window,
        lastMessage: ev.message,
      });
    } else {
      if (ev.source === 'api_429') existing.blockedCount += 1;
      else existing.degradedCount += 1;
      existing.byWindow[ev.window] += 1;
      existing.scopeCounts.set(
        ev.scope,
        (existing.scopeCounts.get(ev.scope) || 0) + 1
      );
      if (ev.createdAt < existing.firstHitAt) existing.firstHitAt = ev.createdAt;
      if (ev.createdAt > existing.lastHitAt) {
        existing.lastHitAt = ev.createdAt;
        existing.lastScope = ev.scope;
        existing.lastWindow = ev.window;
        existing.lastMessage = ev.message;
      }
      if (existing.actorRole === 'unknown' && ev.actorRole !== 'unknown') {
        existing.actorRole = ev.actorRole;
      }
    }
  }

  const byUser: RateLimitUserSummary[] = Array.from(userMap.values())
    .sort(
      (a, b) =>
        b.blockedCount + b.degradedCount - (a.blockedCount + a.degradedCount) ||
        (b.lastHitAt > a.lastHitAt ? 1 : -1)
    )
    .slice(0, 100)
    .map((u) => ({
      actorId: u.actorId,
      actorRole: u.actorRole,
      blockedCount: u.blockedCount,
      degradedCount: u.degradedCount,
      byWindow: u.byWindow,
      byScope: Array.from(u.scopeCounts.entries())
        .map(([scope, count]) => ({
          scope,
          labelHe: getScopeLabelHe(scope),
          count,
        }))
        .sort((a, b) => b.count - a.count),
      firstHitAt: u.firstHitAt,
      lastHitAt: u.lastHitAt,
      lastScope: u.lastScope,
      lastWindow: u.lastWindow,
      lastMessage: u.lastMessage,
    }));

  const currentHourBucket = Math.floor(nowMs / 3_600_000);
  const todayIsrael = toIsraelDateStr(nowMs);
  const liveMap = new Map<string, RateLimitLiveUsageRow>();

  for (const row of params.counterRows) {
    if (!row.hit_count || row.hit_count <= 0) continue;
    const parsed = parseCounterBucketKey(row.bucket_key);
    if (!parsed) continue;
    if (params.actorFilter && parsed.actorId !== params.actorFilter) continue;

    const wsMs = Date.parse(row.window_start);
    if (!Number.isFinite(wsMs)) continue;

    const isCurrentHour =
      row.window_seconds === 3600 &&
      Math.floor(wsMs / 3_600_000) === currentHourBucket;
    const isCurrentDay =
      row.window_seconds === 86400 && toIsraelDateStr(wsMs) === todayIsrael;
    if (!isCurrentHour && !isCurrentDay) continue;

    const quota = ROLE_RATE_LIMIT_POLICIES[parsed.scope].byRole[parsed.role];
    const mapKey = `${parsed.actorId}::${parsed.scope}`;
    const entry = liveMap.get(mapKey) || {
      actorId: parsed.actorId,
      role: parsed.role,
      scope: parsed.scope,
      scopeLabelHe: getScopeLabelHe(parsed.scope),
      hourUsed: 0,
      hourLimit: quota.perHour,
      hourPct: 0,
      dayUsed: 0,
      dayLimit: quota.perDay,
      dayPct: 0,
      maxPct: 0,
    };

    if (isCurrentHour) {
      entry.hourUsed += row.hit_count;
      entry.hourPct =
        entry.hourLimit > 0
          ? Math.min(999, Math.round((entry.hourUsed / entry.hourLimit) * 100))
          : 0;
    }
    if (isCurrentDay) {
      entry.dayUsed += row.hit_count;
      entry.dayPct =
        entry.dayLimit > 0
          ? Math.min(999, Math.round((entry.dayUsed / entry.dayLimit) * 100))
          : 0;
    }
    entry.maxPct = Math.max(entry.hourPct, entry.dayPct);
    liveMap.set(mapKey, entry);
  }

  const liveUsage = Array.from(liveMap.values())
    .sort((a, b) => b.maxPct - a.maxPct || b.dayUsed - a.dayUsed || b.hourUsed - a.hourUsed)
    .slice(0, 100);

  return {
    totalBlocked429,
    totalDegraded,
    uniqueBlockedActors: byUser.length,
    byWindow: globalByWindow,
    byScope: Array.from(scopeMap.values()).sort(
      (a, b) =>
        b.blockedCount + b.degradedCount - (a.blockedCount + a.degradedCount)
    ),
    byUser,
    liveUsage,
    recentEvents: events.slice(0, 100),
  };
}
