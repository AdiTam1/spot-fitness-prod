import { NextRequest, NextResponse } from 'next/server';
import { extractRequestClientMeta, sanitizeErrorSummary } from './redact';
import { scheduleTelemetryFlush } from './serverLogger';
import type {
  ApiAiUsageMeta,
  AuditCategory,
  AuditEventInput,
  AuditStatus,
  TelemetryPlatform,
} from './types';

export interface ApiTelemetryContext {
  readonly requestId: string;
  readonly platform: TelemetryPlatform;
  readonly appVersionCode?: number;
  readonly ipHash?: string;
  setActor: (actor: { id?: string; role?: string } | null | undefined) => void;
  setActionName: (actionName?: string) => void;
  setErrorCode: (errorCode?: string, errorMessage?: string) => void;
  setAiUsage: (usage: ApiAiUsageMeta) => void;
  recordAudit: (event: {
    category: AuditCategory;
    action: string;
    status?: AuditStatus;
    targetTraineeId?: string;
    actorId?: string;
    actorRole?: string;
    metadata?: Record<string, unknown>;
  }) => void;
  setPendingAudit: (
    event: {
      category: AuditCategory;
      action: string;
      targetTraineeId?: string;
      metadata?: Record<string, unknown>;
    } | null
  ) => void;
  finalize: (response: NextResponse) => NextResponse;
  finalizeError: (err: unknown, fallbackMessage?: string) => NextResponse;
}

export function beginApiTelemetry(
  request: NextRequest,
  routePattern: string
): ApiTelemetryContext {
  const startedAt = Date.now();
  const meta = extractRequestClientMeta(request);

  let actorId: string | undefined;
  let actorRole: string | undefined;
  let actionName: string | undefined;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let aiUsage: ApiAiUsageMeta | undefined;
  let finalized = false;
  const auditQueue: AuditEventInput[] = [];
  let pendingAudit: {
    category: AuditCategory;
    action: string;
    targetTraineeId?: string;
    metadata?: Record<string, unknown>;
  } | null = null;

  const ctx: ApiTelemetryContext = {
    requestId: meta.requestId,
    platform: meta.platform,
    appVersionCode: meta.appVersionCode,
    ipHash: meta.ipHash,
    setActor(actor) {
      if (actor?.id) actorId = actor.id;
      if (actor?.role) actorRole = actor.role;
    },
    setActionName(name) {
      if (name) actionName = name;
    },
    setErrorCode(code, message) {
      if (code) errorCode = code;
      if (message) errorMessage = message;
    },
    setAiUsage(usage) {
      aiUsage = { ...(aiUsage || {}), ...usage };
    },
    recordAudit(event) {
      auditQueue.push({
        requestId: meta.requestId,
        actorId: event.actorId || actorId || 'anonymous',
        actorRole: event.actorRole || actorRole || 'anonymous',
        targetTraineeId: event.targetTraineeId,
        category: event.category,
        action: event.action,
        status: event.status || 'success',
        platform: meta.platform,
        appVersionCode: meta.appVersionCode,
        ipHash: meta.ipHash,
        metadata: event.metadata,
      });
    },
    setPendingAudit(event) {
      pendingAudit = event;
    },
    finalize(response) {
      if (!finalized) {
        finalized = true;
        if (pendingAudit) {
          const outcome: AuditStatus =
            response.status < 400
              ? 'success'
              : response.status === 401 || response.status === 403
              ? 'denied'
              : 'failed';
          ctx.recordAudit({
            category: pendingAudit.category,
            action: pendingAudit.action,
            status: outcome,
            targetTraineeId: pendingAudit.targetTraineeId,
            metadata: pendingAudit.metadata,
          });
        }
        try {
          response.headers.set('x-spot-request-id', meta.requestId);
        } catch {
          // ignore immutable headers if any
        }
        const durationMs = Math.max(0, Date.now() - startedAt);
        scheduleTelemetryFlush({
          apiLog: {
            requestId: meta.requestId,
            method: request.method,
            routePattern,
            actionName,
            statusCode: response.status,
            durationMs,
            actorId,
            actorRole,
            platform: meta.platform,
            appVersionCode: meta.appVersionCode,
            errorCode,
            errorMessage,
            aiUsage,
          },
          auditEvents: auditQueue,
        });
      }
      return response;
    },
    finalizeError(err, fallbackMessage = 'שגיאת שרת פנימית') {
      const msg = sanitizeErrorSummary(err);
      errorCode = errorCode || 'UNHANDLED_EXCEPTION';
      errorMessage = msg || fallbackMessage;
      const res = NextResponse.json(
        { error: fallbackMessage, requestId: meta.requestId },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
      return ctx.finalize(res);
    },
  };

  return ctx;
}

/**
 * HOF עוטף נקי לכל Route Handler: מבטיח Request ID, מדידת Latency וטיפול בחריגות
 * מכל נקודת יציאה בלי לחסום את שליחת התשובה למשתמש.
 */
export function withTelemetryHandler(
  routePattern: string,
  fn: (request: NextRequest, ctx: ApiTelemetryContext) => Promise<NextResponse>
) {
  return async function telemetryWrappedHandler(
    request: NextRequest
  ): Promise<NextResponse> {
    const ctx = beginApiTelemetry(request, routePattern);
    try {
      const response = await fn(request, ctx);
      return ctx.finalize(response);
    } catch (err) {
      return ctx.finalizeError(err);
    }
  };
}
