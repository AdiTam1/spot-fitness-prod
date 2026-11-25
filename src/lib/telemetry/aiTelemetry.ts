import type { NextResponse } from 'next/server';
import type { ApiTelemetryContext } from './withApiTelemetry';
import { sanitizeErrorSummary } from './redact';

export function classifyAiFailureReason(
  rawReason?: string,
  statusCode?: number
): { reasonCode: string; labelHe: string } {
  const msg = (rawReason || '').toLowerCase();
  if (statusCode === 429 || /rate|מכסת|quota|429|resource_exhausted/.test(msg)) {
    return {
      reasonCode: 'RATE_LIMIT_OR_QUOTA',
      labelHe: 'חריגת מכסה / Rate Limit',
    };
  }
  if (/gemini_api_key|לא הוגדר מפתח|missing.*key|api key/.test(msg)) {
    return {
      reasonCode: 'MISSING_API_KEY',
      labelHe: 'מפתח Gemini חסר בשרת',
    };
  }
  if (/timeout|timed out|abort|הופסק|deadline|504/.test(msg)) {
    return {
      reasonCode: 'TIMEOUT_OR_ABORTED',
      labelHe: 'Timeout / חריגת זמן תגובה',
    };
  }
  if (statusCode === 401 || statusCode === 403 || /הרשאה|אימות|csrf/.test(msg)) {
    return {
      reasonCode: 'AUTH_OR_PERMISSION',
      labelHe: 'שגיאת אימות / הרשאה',
    };
  }
  if (statusCode === 400 || /קצר|ארוך מדי|לא תקין|לא נמצאו/.test(msg)) {
    return {
      reasonCode: 'INVALID_INPUT',
      labelHe: 'קלט לא תקין / חסר',
    };
  }
  if (/json|לא החזיר|נכשל|לא זוהה|unpars|422/.test(msg) || statusCode === 422) {
    return {
      reasonCode: 'AI_MODEL_OR_PARSE_FAIL',
      labelHe: 'המודל לא זיהה / תגובה לא תקינה',
    };
  }
  if ((statusCode ?? 0) >= 500 || /network|fetch|500|502|503/.test(msg)) {
    return {
      reasonCode: 'SERVER_OR_UPSTREAM_ERROR',
      labelHe: 'שגיאת שרת / תקשורת מול Gemini',
    };
  }
  return {
    reasonCode: 'UNKNOWN_FAILURE',
    labelHe: 'שגיאה כללית בפענוח',
  };
}

export async function finalizeAiRouteResponse(
  ctx: ApiTelemetryContext,
  response: NextResponse,
  opts: {
    endpoint: 'analyze-meal' | 'recommend-meal';
    defaultMode?: string;
    targetTraineeId?: string;
    imageCount?: number;
    totalImageKB?: number;
    durationMs?: number;
  }
): Promise<NextResponse> {
  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await response.clone().json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  const isCancelled = Boolean(payload?.cancelled);
  const isFallback = Boolean(payload?.isAiFallback);
  const engine =
    typeof payload?.engine === 'string' && payload.engine.trim()
      ? payload.engine.trim()
      : response.status >= 400
      ? 'error'
      : 'unknown';

  const mode =
    typeof payload?.mode === 'string' && payload.mode.trim()
      ? payload.mode.trim()
      : opts.defaultMode || opts.endpoint;

  const rawReason =
    typeof payload?.fallbackReason === 'string' && payload.fallbackReason.trim()
      ? payload.fallbackReason.trim()
      : typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : undefined;

  const outcome: 'succeeded' | 'fallback' | 'failed' | 'cancelled' = isCancelled
    ? 'cancelled'
    : response.status >= 400
    ? 'failed'
    : isFallback
    ? 'fallback'
    : 'succeeded';

  const itemCount = Array.isArray(payload?.items)
    ? payload.items.length
    : Array.isArray(payload?.options)
    ? payload.options.length
    : undefined;

  const failureMeta =
    outcome === 'failed' || outcome === 'fallback'
      ? classifyAiFailureReason(rawReason, response.status)
      : undefined;

  const safeReasonText = rawReason
    ? sanitizeErrorSummary(rawReason, 260)
    : undefined;

  ctx.setActionName(mode);
  ctx.setAiUsage({
    mode,
    model: engine,
    outcome,
    fallbackUsed: isFallback,
    reasonCode: failureMeta?.reasonCode,
    failureReason: safeReasonText,
    itemCount,
    imageCount: opts.imageCount,
    totalImageKB: opts.totalImageKB,
    latencyMs: opts.durationMs,
  });

  if (outcome === 'failed' && failureMeta) {
    ctx.setErrorCode(failureMeta.reasonCode, safeReasonText);
  }

  const auditAction =
    opts.endpoint === 'recommend-meal'
      ? mode === 'learn-preference'
        ? 'preference_learned'
        : 'meal_recommended'
      : mode === 'transcribe-audio'
      ? 'voice_transcribed'
      : mode === 'measure-tool'
      ? 'tool_measured'
      : mode === 'adjust-meal'
      ? 'meal_adjusted'
      : 'meal_analyzed';

  ctx.setPendingAudit({
    category: 'ai',
    action: `${auditAction}_${outcome}`,
    targetTraineeId: opts.targetTraineeId,
    metadata: {
      mode,
      model: engine,
      outcome,
      fallbackUsed: isFallback,
      reasonCode: failureMeta?.reasonCode,
      failureReason: safeReasonText,
      itemCount,
      imageCount: opts.imageCount,
      totalImageKB: opts.totalImageKB,
    },
  });

  return response;
}
