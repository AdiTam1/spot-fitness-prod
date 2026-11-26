import { AuthSessionUser, UserRole } from '@/types/nutrition';
import { checkRateLimit } from '@/lib/serverAuth';
import { consumePersistentRateLimitsSql } from '@/lib/supabase';

export type RateLimitScope =
  | 'ai_analyze'
  | 'ai_recommend'
  | 'food_search_db'
  | 'food_search_live'
  | 'food_search_embed'
  | 'admin_backfill_embeddings';

export type RateLimitWindow = 'minute' | 'hour' | 'day' | 'role';

export interface RoleRateQuota {
  perMinute: number;
  perHour: number;
  perDay: number;
}

export interface RoleRateLimitResult {
  allowed: boolean;
  role: UserRole;
  scope: RateLimitScope;
  quota: RoleRateQuota;
  blockedWindow?: RateLimitWindow;
  retryAfterSec?: number;
  remainingMinute?: number;
  remainingHour?: number;
  remainingDay?: number;
  persistent?: boolean;
  messageHe?: string;
}

interface ScopeConfig {
  labelHe: string;
  persistHourlyDaily: boolean;
  byRole: Record<UserRole, RoleRateQuota>;
}

export const ROLE_RATE_LIMIT_POLICIES: Record<RateLimitScope, ScopeConfig> = {
  ai_analyze: {
    labelHe: 'פענוחי ארוחות ב-AI',
    persistHourlyDaily: true,
    byRole: {
      trainee: { perMinute: 3, perHour: 15, perDay: 35 },
      coach: { perMinute: 6, perHour: 35, perDay: 100 },
      admin: { perMinute: 12, perHour: 100, perDay: 350 },
    },
  },
  ai_recommend: {
    labelHe: 'המלצות ארוחה חכמות',
    persistHourlyDaily: true,
    byRole: {
      trainee: { perMinute: 3, perHour: 12, perDay: 30 },
      coach: { perMinute: 6, perHour: 30, perDay: 80 },
      admin: { perMinute: 10, perHour: 80, perDay: 250 },
    },
  },
  food_search_db: {
    labelHe: 'חיפושי מזון במאגר',
    persistHourlyDaily: false,
    byRole: {
      trainee: { perMinute: 45, perHour: 250, perDay: 800 },
      coach: { perMinute: 60, perHour: 400, perDay: 1200 },
      admin: { perMinute: 90, perHour: 600, perDay: 2500 },
    },
  },
  food_search_embed: {
    labelHe: 'חיפוש סמנטי חדש (Embeddings)',
    persistHourlyDaily: true,
    byRole: {
      trainee: { perMinute: 10, perHour: 40, perDay: 80 },
      coach: { perMinute: 15, perHour: 80, perDay: 180 },
      admin: { perMinute: 25, perHour: 200, perDay: 500 },
    },
  },
  food_search_live: {
    labelHe: 'חיפוש חי בסופרים אונליין',
    persistHourlyDaily: true,
    byRole: {
      trainee: { perMinute: 6, perHour: 25, perDay: 60 },
      coach: { perMinute: 10, perHour: 45, perDay: 120 },
      admin: { perMinute: 15, perHour: 80, perDay: 250 },
    },
  },
  admin_backfill_embeddings: {
    labelHe: 'אינדוקס Embeddings אצווה',
    persistHourlyDaily: true,
    byRole: {
      trainee: { perMinute: 0, perHour: 0, perDay: 0 },
      coach: { perMinute: 0, perHour: 0, perDay: 0 },
      admin: { perMinute: 12, perHour: 180, perDay: 2000 },
    },
  },
};

function normalizeRole(role?: string): UserRole {
  if (role === 'admin' || role === 'coach' || role === 'trainee') {
    return role;
  }
  return 'trainee';
}

function buildLimitMessageHe(
  labelHe: string,
  window: RateLimitWindow,
  quota: RoleRateQuota,
  retryAfterSec?: number
): string {
  if (window === 'role') {
    return `פעולה זו (${labelHe}) אינה זמינה עבור תפקידך.`;
  }
  if (window === 'minute') {
    return `קצב ${labelHe} מהיר מדי (עד ${quota.perMinute} בדקה). המתן ${Math.max(5, retryAfterSec || 15)} שניות ונסה שוב.`;
  }
  if (window === 'hour') {
    return `הגעת למכסת השעה של ${labelHe} (${quota.perHour} בשעה). נסה שוב מאוחר יותר או הזן מוצרים מהמאגר.`;
  }
  return `הגעת למכסה היומית של ${labelHe} (${quota.perDay} ביום). המכסה תתאפס אוטומטית בחצות.`;
}

/**
 * אוכף מכסת Rate-Limit רב-חלונית (דקה / שעה / יום) לפי תפקיד המשתמש (trainee / coach / admin):
 * 1. חסימת דקה מיידית בזיכרון (0ms, מונעת ספאם לפני גישה ל-DB).
 * 2. חסימת שעה ויום עמידה ב-Supabase עבור קריאות AI יקרות (עם נסיגה לזיכרון אם טרם הורצה המיגרציה).
 */
export async function consumeRoleRateLimit(
  user: Pick<AuthSessionUser, 'id' | 'role'>,
  scope: RateLimitScope
): Promise<RoleRateLimitResult> {
  const role = normalizeRole(user.role);
  const cfg = ROLE_RATE_LIMIT_POLICIES[scope];
  const quota = cfg.byRole[role];

  if (quota.perMinute <= 0 || quota.perHour <= 0 || quota.perDay <= 0) {
    return {
      allowed: false,
      role,
      scope,
      quota,
      blockedWindow: 'role',
      retryAfterSec: 0,
      messageHe: buildLimitMessageHe(cfg.labelHe, 'role', quota),
    };
  }

  // חלון 1: דקה בזיכרון השרת (0ms)
  const minKey = `rl:m:${scope}:${role}:${user.id}`;
  const minRes = checkRateLimit(minKey, quota.perMinute, 60);
  if (!minRes.allowed) {
    return {
      allowed: false,
      role,
      scope,
      quota,
      blockedWindow: 'minute',
      retryAfterSec: minRes.resetInSec,
      remainingMinute: 0,
      messageHe: buildLimitMessageHe(cfg.labelHe, 'minute', quota, minRes.resetInSec),
    };
  }

  // חלונות 2–3: שעה ויום ב-Supabase (עמיד בין אתחולי Serverless) עבור נתיבים מתוקצבים
  if (cfg.persistHourlyDaily) {
    const dbRes = await consumePersistentRateLimitsSql({
      actorKey: `${scope}:${role}:${user.id}`,
      hourLimit: quota.perHour,
      dayLimit: quota.perDay,
    });

    if (dbRes.available) {
      if (!dbRes.allowed) {
        const win = dbRes.blockedWindow || 'hour';
        return {
          allowed: false,
          role,
          scope,
          quota,
          blockedWindow: win,
          retryAfterSec: dbRes.retryAfterSec || (win === 'day' ? 3600 : 300),
          remainingMinute: minRes.remaining,
          remainingHour: Math.max(0, quota.perHour - (dbRes.hourCount || 0)),
          remainingDay: Math.max(0, quota.perDay - (dbRes.dayCount || 0)),
          persistent: true,
          messageHe: buildLimitMessageHe(cfg.labelHe, win, quota, dbRes.retryAfterSec),
        };
      }

      return {
        allowed: true,
        role,
        scope,
        quota,
        remainingMinute: minRes.remaining,
        remainingHour: Math.max(0, quota.perHour - (dbRes.hourCount || 0)),
        remainingDay: Math.max(0, quota.perDay - (dbRes.dayCount || 0)),
        persistent: true,
      };
    }
  }

  // נסיגה לזיכרון לחלון שעה ויום (עבור חיפושי DB מהירים או לפני הרצת המיגרציה ב-Supabase)
  const hourRes = checkRateLimit(`rl:h:${scope}:${role}:${user.id}`, quota.perHour, 3600);
  if (!hourRes.allowed) {
    return {
      allowed: false,
      role,
      scope,
      quota,
      blockedWindow: 'hour',
      retryAfterSec: hourRes.resetInSec,
      remainingMinute: minRes.remaining,
      remainingHour: 0,
      persistent: false,
      messageHe: buildLimitMessageHe(cfg.labelHe, 'hour', quota, hourRes.resetInSec),
    };
  }

  const dayRes = checkRateLimit(`rl:d:${scope}:${role}:${user.id}`, quota.perDay, 86400);
  if (!dayRes.allowed) {
    return {
      allowed: false,
      role,
      scope,
      quota,
      blockedWindow: 'day',
      retryAfterSec: dayRes.resetInSec,
      remainingMinute: minRes.remaining,
      remainingHour: hourRes.remaining,
      remainingDay: 0,
      persistent: false,
      messageHe: buildLimitMessageHe(cfg.labelHe, 'day', quota, dayRes.resetInSec),
    };
  }

  return {
    allowed: true,
    role,
    scope,
    quota,
    remainingMinute: minRes.remaining,
    remainingHour: hourRes.remaining,
    remainingDay: dayRes.remaining,
    persistent: false,
  };
}

export interface RateLimitTelemetrySink {
  setErrorCode: (errorCode?: string, errorMessage?: string) => void;
  setAiUsage: (usage: {
    outcome?: 'succeeded' | 'fallback' | 'failed' | 'cancelled';
    reasonCode?: string;
    failureReason?: string;
    rateLimitScope?: string;
    rateLimitWindow?: RateLimitWindow;
    rateLimitRole?: string;
  }) => void;
  recordAudit: (event: {
    category: 'ai';
    action: string;
    status?: 'denied' | 'failed' | 'success';
    metadata?: Record<string, unknown>;
  }) => void;
}

export function buildRateLimitBlockedPayload(
  res: RoleRateLimitResult,
  fallbackMessageHe: string
) {
  return {
    body: {
      error: res.messageHe || fallbackMessageHe,
      rateLimit: {
        scope: res.scope,
        window: res.blockedWindow,
        retryAfterSec: res.retryAfterSec,
        role: res.role,
      },
    },
    headers: buildRateLimitHeaders(res),
  };
}

export function recordRateLimitTelemetry(
  ctx: RateLimitTelemetrySink,
  res: RoleRateLimitResult,
  options?: { degraded?: boolean; fallbackMessageHe?: string }
): void {
  if (options?.degraded) {
    ctx.recordAudit({
      category: 'ai',
      action: 'rate_limit_degraded',
      status: 'denied',
      metadata: {
        scope: res.scope,
        window: res.blockedWindow || 'unknown',
        role: res.role,
        quota: res.quota,
        messageHe: res.messageHe || options?.fallbackMessageHe || '',
      },
    });
    return;
  }

  const msg = res.messageHe || options?.fallbackMessageHe || 'חריגה ממכסת השימוש';
  ctx.setErrorCode('RATE_LIMITED', msg);
  ctx.setAiUsage({
    outcome: 'failed',
    reasonCode: 'RATE_LIMITED',
    failureReason: msg,
    rateLimitScope: res.scope,
    rateLimitWindow: res.blockedWindow,
    rateLimitRole: res.role,
  });
}

export function buildRateLimitHeaders(res: RoleRateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof res.retryAfterSec === 'number' && !res.allowed && res.retryAfterSec > 0) {
    headers['Retry-After'] = String(res.retryAfterSec);
  }
  if (typeof res.remainingMinute === 'number') {
    headers['X-RateLimit-Remaining-Minute'] = String(res.remainingMinute);
  }
  if (typeof res.remainingHour === 'number') {
    headers['X-RateLimit-Remaining-Hour'] = String(res.remainingHour);
  }
  if (typeof res.remainingDay === 'number') {
    headers['X-RateLimit-Remaining-Day'] = String(res.remainingDay);
  }
  return headers;
}
