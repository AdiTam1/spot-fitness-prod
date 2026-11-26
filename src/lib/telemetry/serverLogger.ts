import { waitUntil } from '@vercel/functions';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  sanitizeErrorSummary,
  sanitizeTelemetryMetadata,
} from './redact';
import type { ApiLogInput, AuditEventInput } from './types';
import { shouldPersistApiLogToDb } from './filterRules';

export { shouldPersistApiLogToDb };

const WRITE_TIMEOUT_MS = 1600;

function hasServiceRoleAccess(): boolean {
  return Boolean(
    isSupabaseConfigured &&
      supabase &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function logStructuredStdout(
  apiLog?: ApiLogInput,
  auditEvents?: AuditEventInput[]
) {
  if (apiLog && (apiLog.statusCode >= 500 || apiLog.durationMs >= 3000)) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: 'api_log',
        reqId: apiLog.requestId,
        method: apiLog.method,
        route: apiLog.routePattern,
        action: apiLog.actionName,
        status: apiLog.statusCode,
        ms: apiLog.durationMs,
        role: apiLog.actorRole,
        err: apiLog.errorCode || apiLog.errorMessage,
      })
    );
  }
  if (auditEvents && auditEvents.some((ev) => ev.status === 'failed')) {
    for (const ev of auditEvents) {
      if (ev.status !== 'failed') continue;
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          kind: 'audit_failed',
          reqId: ev.requestId,
          category: ev.category,
          action: ev.action,
          role: ev.actorRole,
        })
      );
    }
  }
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function flushTelemetryBatch(payload: {
  apiLog?: ApiLogInput;
  auditEvents?: AuditEventInput[];
}): Promise<void> {
  const { apiLog, auditEvents = [] } = payload;

  try {
    logStructuredStdout(apiLog, auditEvents);
  } catch {
    // ignore stdout failures
  }

  if (!hasServiceRoleAccess() || !supabase) {
    return;
  }

  const tasks: PromiseLike<unknown>[] = [];

  if (apiLog && shouldPersistApiLogToDb(apiLog)) {
    tasks.push(
      supabase.from('api_request_logs').insert({
        request_id: apiLog.requestId,
        method: apiLog.method.toUpperCase().slice(0, 10),
        route_pattern: apiLog.routePattern.slice(0, 120),
        action_name: apiLog.actionName ? apiLog.actionName.slice(0, 80) : null,
        status_code: apiLog.statusCode,
        duration_ms: Math.max(0, Math.round(apiLog.durationMs)),
        actor_id: apiLog.actorId ? apiLog.actorId.slice(0, 80) : null,
        actor_role: apiLog.actorRole ? apiLog.actorRole.slice(0, 20) : null,
        platform: apiLog.platform || 'unknown',
        app_version_code: apiLog.appVersionCode ?? null,
        error_code: apiLog.errorCode ? apiLog.errorCode.slice(0, 60) : null,
        error_message: apiLog.errorMessage
          ? sanitizeErrorSummary(apiLog.errorMessage, 300)
          : null,
        ai_usage: apiLog.aiUsage
          ? sanitizeTelemetryMetadata(
              apiLog.aiUsage as unknown as Record<string, unknown>,
              800
            )
          : null,
      })
    );
  }

  if (auditEvents.length > 0) {
    const rows = auditEvents.slice(0, 10).map((ev) => ({
      request_id: ev.requestId || null,
      actor_id: (ev.actorId || 'anonymous').slice(0, 80),
      actor_role: (ev.actorRole || 'anonymous').slice(0, 20),
      target_trainee_id: ev.targetTraineeId
        ? ev.targetTraineeId.slice(0, 80)
        : null,
      category: ev.category,
      action: ev.action.slice(0, 80),
      status: ev.status || 'success',
      platform: ev.platform || 'unknown',
      app_version_code: ev.appVersionCode ?? null,
      ip_hash: ev.ipHash || null,
      metadata: sanitizeTelemetryMetadata(ev.metadata, 1500),
    }));
    tasks.push(supabase.from('audit_activity_events').insert(rows));
  }

  if (tasks.length === 0) return;

  try {
    await withTimeout(Promise.allSettled(tasks), WRITE_TIMEOUT_MS);
  } catch {
    // Telemetry errors must never break or fail business requests
  }
}

/**
 * מתזמן שמירת ניטור ב-waitUntil כך שהתגובה למשתמש חוזרת ללא כל השהיה.
 */
export function scheduleTelemetryFlush(payload: {
  apiLog?: ApiLogInput;
  auditEvents?: AuditEventInput[];
}): void {
  const work = flushTelemetryBatch(payload);
  try {
    waitUntil(work);
  } catch {
    // Fallback when running outside Vercel Runtime (e.g. local Next dev)
    void work.catch(() => {});
  }
}
