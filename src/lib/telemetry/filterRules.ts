import type { ApiLogInput } from './types';

const HIGH_SIGNAL_PREFIXES = [
  '/api/auth/session',
  '/api/ai/',
  '/api/steps/',
  '/api/push/send',
  '/api/admin/',
  '/api/profile',
  '/api/cron/',
];

const NOISY_ROUTES = new Set([
  '/api/auth/heartbeat',
  '/api/app-version',
  '/api/telemetry/events',
]);

/**
 * כלל סינון חכם להישארות בתוך 500MB ב-Supabase Free:
 * שומרים 100% שגיאות/איטיות/AI/מוטציות, וזורקים heartbeat/GET שגרתי מהיר.
 */
export function shouldPersistApiLogToDb(entry: ApiLogInput): boolean {
  if (entry.statusCode >= 400) {
    // 401 on anonymous heartbeat/session with NO cookie is normal; keep every expired/bad_sig/revoked/blocked!
    if (
      entry.statusCode === 401 &&
      (entry.routePattern === '/api/auth/heartbeat' ||
        entry.routePattern === '/api/auth/session') &&
      entry.errorCode === 'UNAUTHENTICATED_NO_COOKIE'
    ) {
      return false;
    }
    return true;
  }

  if (entry.actionName === 'session_rejected') {
    return true;
  }

  const isAiRoute = entry.routePattern.startsWith('/api/ai/');
  const slowThreshold = isAiRoute ? 10_000 : 900;
  if (entry.durationMs >= slowThreshold) return true;

  const payloadKB = Number(
    (entry.aiUsage?.diag as { payloadKB?: unknown } | undefined)?.payloadKB || 0
  );
  if (entry.routePattern === '/api/data' && payloadKB >= 250) {
    return true;
  }

  if (NOISY_ROUTES.has(entry.routePattern)) {
    return false;
  }

  if (
    entry.routePattern === '/api/auth/session' &&
    entry.method.toUpperCase() === 'GET'
  ) {
    return false;
  }

  if (
    entry.routePattern === '/api/push/register' &&
    entry.actionName === 'heartbeat'
  ) {
    return false;
  }

  if (
    entry.routePattern === '/api/data' &&
    entry.method.toUpperCase() === 'GET'
  ) {
    return Math.random() < 0.04;
  }

  if (entry.method.toUpperCase() !== 'GET') {
    return true;
  }

  return HIGH_SIGNAL_PREFIXES.some((prefix) =>
    entry.routePattern.startsWith(prefix)
  );
}
