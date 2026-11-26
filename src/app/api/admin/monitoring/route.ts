import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionFromRequest,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { isSupabaseConfigured, loadSingleTraineeFromSupabase, supabase } from '@/lib/supabase';
import {
  buildUserDiagnosticsSummary,
  measureTraineeHealthSnapshot,
  type DiagApiLogRow,
  type DiagAuditRow,
  type DiagClientEventRow,
} from '@/lib/telemetry/diagnosticsSummary';
import {
  buildRateLimitAnalytics,
  RateLimitRawApiRow,
  RateLimitRawAuditRow,
  RateLimitRawCounterRow,
} from '@/lib/rateLimitAnalytics';
import {
  getAdminAiTraceDetail,
  listAdminAiTraces,
  updateAdminAiTraceFlags,
} from '@/lib/aiTracing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PAGE_SIZE = 50;

function isMissingSchemaError(message?: string): boolean {
  if (!message) return false;
  return /does not exist|could not find|schema cache|42P01|PGRST205|PGRST202/i.test(
    message
  );
}

function sanitizeIdentifier(raw: string | null, maxLen = 80): string {
  return sanitizeText(raw, maxLen).replace(/[^a-zA-Z0-9._-]/g, '');
}

interface RawAiLogRow {
  id: number;
  created_at: string;
  request_id: string;
  method: string;
  route_pattern: string;
  action_name?: string | null;
  status_code: number;
  duration_ms: number;
  actor_id?: string | null;
  actor_role?: string | null;
  platform?: string | null;
  app_version_code?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  ai_usage?: Record<string, unknown> | null;
}

function deriveOutcome(row: RawAiLogRow): 'succeeded' | 'fallback' | 'failed' | 'cancelled' {
  const explicit = row.ai_usage?.outcome;
  if (
    explicit === 'succeeded' ||
    explicit === 'fallback' ||
    explicit === 'failed' ||
    explicit === 'cancelled'
  ) {
    return explicit;
  }
  if (row.status_code >= 400) return 'failed';
  if (Boolean(row.ai_usage?.fallbackUsed)) return 'fallback';
  return 'succeeded';
}

function buildAiStatsFromRows(rows: RawAiLogRow[], windowHours: number) {
  let succeededCount = 0;
  let fallbackCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  let totalImages = 0;
  let totalImageKB = 0;
  const durations: number[] = [];

  const userMap = new Map<
    string,
    {
      actorId: string;
      actorRole: string;
      totalCalls: number;
      succeededCalls: number;
      fallbackCalls: number;
      failedCalls: number;
      durationSum: number;
      lastCallAt: string;
      reasons: Map<string, number>;
    }
  >();

  const reasonMap = new Map<
    string,
    { outcome: string; reasonCode: string; reasonText: string; count: number }
  >();
  const modelMap = new Map<
    string,
    {
      model: string;
      calls: number;
      succeeded: number;
      fallback: number;
      failed: number;
      durationSum: number;
    }
  >();
  const modeMap = new Map<
    string,
    {
      mode: string;
      calls: number;
      succeeded: number;
      fallback: number;
      failed: number;
      durationSum: number;
    }
  >();

  for (const row of rows) {
    const outcome = deriveOutcome(row);
    if (outcome === 'succeeded') succeededCount += 1;
    else if (outcome === 'fallback') fallbackCount += 1;
    else if (outcome === 'failed') failedCount += 1;
    else cancelledCount += 1;

    const dur = Math.max(0, Number(row.duration_ms) || 0);
    durations.push(dur);

    const imgCnt = Number(row.ai_usage?.imageCount || 0) || 0;
    const imgKB = Number(row.ai_usage?.totalImageKB || 0) || 0;
    totalImages += imgCnt;
    totalImageKB += imgKB;

    const actorId = row.actor_id || 'anonymous';
    const actorRole = row.actor_role || 'unknown';
    const model =
      (typeof row.ai_usage?.model === 'string' && row.ai_usage.model) ||
      (row.status_code >= 400 ? 'error' : 'unknown');
    const mode =
      (typeof row.ai_usage?.mode === 'string' && row.ai_usage.mode) ||
      row.action_name ||
      (row.route_pattern.includes('recommend') ? 'recommend' : 'analyze');
    const reasonCode =
      (typeof row.ai_usage?.reasonCode === 'string' && row.ai_usage.reasonCode) ||
      row.error_code ||
      'OTHER';
    const reasonText =
      (typeof row.ai_usage?.failureReason === 'string' &&
        row.ai_usage.failureReason) ||
      row.error_message ||
      row.error_code ||
      'ללא פירוט שגיאה';

    const u = userMap.get(actorId) || {
      actorId,
      actorRole,
      totalCalls: 0,
      succeededCalls: 0,
      fallbackCalls: 0,
      failedCalls: 0,
      durationSum: 0,
      lastCallAt: row.created_at,
      reasons: new Map<string, number>(),
    };
    u.totalCalls += 1;
    if (outcome === 'succeeded') u.succeededCalls += 1;
    else if (outcome === 'fallback') u.fallbackCalls += 1;
    else if (outcome === 'failed') u.failedCalls += 1;
    u.durationSum += dur;
    if (row.created_at > u.lastCallAt) u.lastCallAt = row.created_at;
    if (outcome === 'failed' || outcome === 'fallback') {
      u.reasons.set(reasonText, (u.reasons.get(reasonText) || 0) + 1);
    }
    userMap.set(actorId, u);

    if (outcome === 'failed' || outcome === 'fallback') {
      const rKey = `${outcome}::${reasonCode}::${reasonText}`;
      const existingReason = reasonMap.get(rKey) || {
        outcome,
        reasonCode,
        reasonText,
        count: 0,
      };
      existingReason.count += 1;
      reasonMap.set(rKey, existingReason);
    }

    const m = modelMap.get(model) || {
      model,
      calls: 0,
      succeeded: 0,
      fallback: 0,
      failed: 0,
      durationSum: 0,
    };
    m.calls += 1;
    if (outcome === 'succeeded') m.succeeded += 1;
    else if (outcome === 'fallback') m.fallback += 1;
    else if (outcome === 'failed') m.failed += 1;
    m.durationSum += dur;
    modelMap.set(model, m);

    const md = modeMap.get(mode) || {
      mode,
      calls: 0,
      succeeded: 0,
      fallback: 0,
      failed: 0,
      durationSum: 0,
    };
    md.calls += 1;
    if (outcome === 'succeeded') md.succeeded += 1;
    else if (outcome === 'fallback') md.fallback += 1;
    else if (outcome === 'failed') md.failed += 1;
    md.durationSum += dur;
    modeMap.set(mode, md);
  }

  durations.sort((a, b) => a - b);
  const avgMs =
    durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0;
  const p95Ms =
    durations.length > 0
      ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
      : 0;

  return {
    windowHours,
    totals: {
      totalCalls: rows.length,
      succeededCount,
      fallbackCount,
      failedCount,
      cancelledCount,
      avgMs,
      p95Ms,
      totalImages,
      totalImageKB,
    },
    byUser: Array.from(userMap.values())
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, 100)
      .map((u) => {
        let topFailureReason: string | null = null;
        let topCount = 0;
        for (const [txt, cnt] of Array.from(u.reasons.entries())) {
          if (cnt > topCount) {
            topCount = cnt;
            topFailureReason = txt;
          }
        }
        return {
          actorId: u.actorId,
          actorRole: u.actorRole,
          totalCalls: u.totalCalls,
          succeededCalls: u.succeededCalls,
          fallbackCalls: u.fallbackCalls,
          failedCalls: u.failedCalls,
          avgMs: u.totalCalls > 0 ? Math.round(u.durationSum / u.totalCalls) : 0,
          lastCallAt: u.lastCallAt,
          topFailureReason,
        };
      }),
    byFailureReason: Array.from(reasonMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    byModel: Array.from(modelMap.values())
      .sort((a, b) => b.calls - a.calls)
      .map((m) => ({
        model: m.model,
        calls: m.calls,
        succeeded: m.succeeded,
        fallback: m.fallback,
        failed: m.failed,
        avgMs: m.calls > 0 ? Math.round(m.durationSum / m.calls) : 0,
      })),
    byMode: Array.from(modeMap.values())
      .sort((a, b) => b.calls - a.calls)
      .map((md) => ({
        mode: md.mode,
        calls: md.calls,
        succeeded: md.succeeded,
        fallback: md.fallback,
        failed: md.failed,
        avgMs: md.calls > 0 ? Math.round(md.durationSum / md.calls) : 0,
      })),
  };
}

/**
 * GET /api/admin/monitoring
 * נקודת קצה ייעודית למנהל מערכת ראשי בלבד (Super Admin).
 * מחזירה מדדי KPI אגרגטיביים, סטטיסטיקות AI מורחבות פר-משתמש וגלובליות + עד 50 שורות לדף.
 */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
      { status: 403 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const isTraceDetailReq = sp.get('traceDetail') === '1';
  const traceIdParam = sanitizeIdentifier(sp.get('traceId'), 80);

  if (isTraceDetailReq && traceIdParam) {
    try {
      const detail = await getAdminAiTraceDetail(traceIdParam);
      return NextResponse.json(
        { ok: true, ...detail },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    } catch {
      return NextResponse.json({ error: 'שגיאה בטעינת פרטי השיחה' }, { status: 500 });
    }
  }

  const hours = Math.round(sanitizeNumber(sp.get('hours'), 1, 720, 168));
  const page = Math.round(sanitizeNumber(sp.get('page'), 0, 40, 0));
  const actorId = sanitizeIdentifier(sp.get('actorId'), 80);
  const category = sanitizeIdentifier(sp.get('category'), 30);
  const requestId = sanitizeIdentifier(sp.get('requestId'), 64);
  const aiOutcome = sanitizeIdentifier(sp.get('aiOutcome'), 20);
  const aiReasonCode = sanitizeIdentifier(sp.get('aiReasonCode'), 50);
  const errorsOnly = sp.get('errorsOnly') === '1';
  const traceSearch = sanitizeText(sp.get('traceSearch'), 80);

  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!isSupabaseConfigured || !supabase || !hasServiceRole) {
    const [localHistory, localCrashed] = await Promise.all([
      listAdminAiTraces({
        queueType: 'history',
        userId: actorId || undefined,
        search: traceSearch || undefined,
        limit: 80,
      }).catch(() => ({ traces: [], totalCount: 0, savedCount: 0, cap: 250 })),
      listAdminAiTraces({
        queueType: 'crashed',
        userId: actorId || undefined,
        search: traceSearch || undefined,
        limit: 80,
      }).catch(() => ({ traces: [], totalCount: 0, savedCount: 0, cap: 100 })),
    ]);
    return NextResponse.json({
      ok: true,
      setupRequired: true,
      missingReason: !isSupabaseConfigured
        ? 'חיבור Supabase אינו מוגדר בשרת (מציג שיחות AI ממאגר הפיתוח המקומי).'
        : 'חסר SUPABASE_SERVICE_ROLE_KEY בהגדרות הסביבה (Vercel) לקריאת טבלאות הניטור המוגנות ב-RLS.',
      aiTraceHistory: localHistory,
      aiTraceCrashed: localCrashed,
    });
  }

  const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
  const fromIdx = page * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;

  try {
    const [summaryRes, aiStatsRes] = await Promise.all([
      supabase.rpc('get_admin_monitoring_summary', { p_hours: hours }),
      supabase.rpc('get_admin_ai_stats', { p_hours: hours }),
    ]);

    if (summaryRes.error && isMissingSchemaError(summaryRes.error.message)) {
      return NextResponse.json({
        ok: true,
        setupRequired: true,
        missingReason:
          'טבלאות הניטור טרם נוצרו ב-Supabase. יש להריץ פעם אחת את הקובץ supabase/migrations/20261125_telemetry.sql ב-SQL Editor של Supabase.',
      });
    }

    let auditQuery = supabase
      .from('audit_activity_events')
      .select(
        'id, created_at, request_id, actor_id, actor_role, target_trainee_id, category, action, status, platform, app_version_code, metadata'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(fromIdx, toIdx);

    if (actorId) {
      auditQuery = auditQuery.or(
        `actor_id.eq.${actorId},target_trainee_id.eq.${actorId}`
      );
    }
    if (category) {
      auditQuery = auditQuery.eq('category', category);
    }
    if (requestId) {
      auditQuery = auditQuery.eq('request_id', requestId);
    }

    let apiQuery = supabase
      .from('api_request_logs')
      .select(
        'id, created_at, request_id, method, route_pattern, action_name, status_code, duration_ms, actor_id, actor_role, platform, app_version_code, error_code, error_message, ai_usage'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(fromIdx, toIdx);

    if (actorId) {
      apiQuery = apiQuery.eq('actor_id', actorId);
    }
    if (requestId) {
      apiQuery = apiQuery.eq('request_id', requestId);
    }
    if (errorsOnly) {
      apiQuery = apiQuery.gte('status_code', 400);
    }

    let aiLogsQuery = supabase
      .from('api_request_logs')
      .select(
        'id, created_at, request_id, method, route_pattern, action_name, status_code, duration_ms, actor_id, actor_role, platform, app_version_code, error_code, error_message, ai_usage'
      )
      .gte('created_at', sinceIso)
      .like('route_pattern', '/api/ai/%')
      .order('created_at', { ascending: false })
      .range(fromIdx, toIdx);

    if (actorId) {
      aiLogsQuery = aiLogsQuery.eq('actor_id', actorId);
    }
    if (requestId) {
      aiLogsQuery = aiLogsQuery.eq('request_id', requestId);
    }
    if (
      aiOutcome === 'succeeded' ||
      aiOutcome === 'fallback' ||
      aiOutcome === 'failed' ||
      aiOutcome === 'cancelled'
    ) {
      aiLogsQuery = aiLogsQuery.eq('ai_usage->>outcome', aiOutcome);
    } else if (errorsOnly) {
      aiLogsQuery = aiLogsQuery.or(
        'status_code.gte.400,ai_usage->>outcome.eq.fallback'
      );
    }
    if (aiReasonCode) {
      aiLogsQuery = aiLogsQuery.or(
        `ai_usage->>reasonCode.eq.${aiReasonCode},error_code.eq.${aiReasonCode}`
      );
    }

    let rlApiQuery = supabase
      .from('api_request_logs')
      .select(
        'id, created_at, request_id, method, route_pattern, action_name, status_code, actor_id, actor_role, platform, app_version_code, error_code, error_message, ai_usage'
      )
      .gte('created_at', sinceIso)
      .or('status_code.eq.429,error_code.eq.RATE_LIMITED')
      .order('created_at', { ascending: false })
      .limit(500);

    if (actorId) {
      rlApiQuery = rlApiQuery.eq('actor_id', actorId);
    }
    if (requestId) {
      rlApiQuery = rlApiQuery.eq('request_id', requestId);
    }

    let rlDegradedQuery = supabase
      .from('audit_activity_events')
      .select(
        'id, created_at, request_id, actor_id, actor_role, platform, app_version_code, metadata'
      )
      .gte('created_at', sinceIso)
      .eq('category', 'ai')
      .eq('action', 'rate_limit_degraded')
      .order('created_at', { ascending: false })
      .limit(200);

    if (actorId) {
      rlDegradedQuery = rlDegradedQuery.eq('actor_id', actorId);
    }
    if (requestId) {
      rlDegradedQuery = rlDegradedQuery.eq('request_id', requestId);
    }

    const rlCountersQuery = supabase
      .from('api_rate_limit_counters')
      .select('bucket_key, window_start, window_seconds, hit_count, expires_at')
      .gt('hit_count', 0)
      .gte('expires_at', new Date().toISOString())
      .limit(400);

    let clientQuery = supabase
      .from('client_telemetry_events')
      .select(
        'id, created_at, session_id, user_id, role, platform, app_version_code, web_build_id, event_type, event_name, screen, details'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (actorId) {
      clientQuery = clientQuery.or(
        `user_id.eq.${actorId},details->>lastKnownUserId.eq.${actorId},details->>priorUserId.eq.${actorId}`
      );
    }
    if (errorsOnly) {
      clientQuery = clientQuery.eq('event_type', 'client_error');
    }

    let diagApiQuery = supabase
      .from('api_request_logs')
      .select(
        'id, created_at, request_id, method, route_pattern, action_name, status_code, duration_ms, actor_id, actor_role, platform, app_version_code, error_code, error_message, ai_usage'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(100);

    if (actorId) {
      diagApiQuery = diagApiQuery.eq('actor_id', actorId);
    } else {
      diagApiQuery = diagApiQuery.or(
        'status_code.gte.400,duration_ms.gte.900,route_pattern.eq./api/auth/session,route_pattern.eq./api/auth/heartbeat,route_pattern.eq./api/food/search'
      );
    }

    let diagClientQuery = supabase
      .from('client_telemetry_events')
      .select(
        'id, created_at, session_id, user_id, role, platform, app_version_code, web_build_id, event_type, event_name, screen, details'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(120);

    if (actorId) {
      diagClientQuery = diagClientQuery.or(
        `user_id.eq.${actorId},details->>lastKnownUserId.eq.${actorId},details->>priorUserId.eq.${actorId}`
      );
    } else {
      diagClientQuery = diagClientQuery.or(
        'event_type.eq.client_error,event_name.in.(session_lost_on_startup,session_kicked_mid_use,app_startup_profile,api_data_profile,food_search_trace)'
      );
    }

    let diagAuditQuery = supabase
      .from('audit_activity_events')
      .select(
        'id, created_at, request_id, actor_id, actor_role, target_trainee_id, category, action, status, platform, app_version_code, metadata'
      )
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(80);

    if (actorId) {
      diagAuditQuery = diagAuditQuery.or(
        `actor_id.eq.${actorId},target_trainee_id.eq.${actorId}`
      );
    } else {
      diagAuditQuery = diagAuditQuery.eq('category', 'auth');
    }

    const diagTraineePromise =
      actorId && actorId !== 'coach-admin' && !actorId.startsWith('coach-')
        ? Promise.all([
            loadSingleTraineeFromSupabase(actorId).catch(() => null),
            supabase
              .from('nutrition_templates')
              .select('meals')
              .eq('id', '__spot_system_meta__')
              .maybeSingle(),
          ]).then(([profile, metaRow]) => {
            if (!profile) return null;
            const versions = (
              metaRow?.data?.meals as {
                userClientVersions?: Record<string, import('@/types/nutrition').UserClientVersionInfo>;
              } | undefined
            )?.userClientVersions;
            return measureTraineeHealthSnapshot(
              profile,
              versions?.[`trainee:${actorId}`] || null
            );
          })
        : Promise.resolve(null);

    const aiStatsNeedsFallback = Boolean(
      aiStatsRes.error && isMissingSchemaError(aiStatsRes.error.message)
    );

    const [
      auditRes,
      apiRes,
      aiLogsRes,
      clientRes,
      aiFallbackRowsRes,
      rlApiRes,
      rlDegradedRes,
      rlCountersRes,
      aiTraceHistory,
      aiTraceCrashed,
      diagApiRes,
      diagClientRes,
      diagAuditRes,
      diagTraineeHealth,
    ] = await Promise.all([
      auditQuery,
      apiQuery,
      aiLogsQuery,
      clientQuery,
      aiStatsNeedsFallback
        ? supabase
            .from('api_request_logs')
            .select(
              'id, created_at, request_id, method, route_pattern, action_name, status_code, duration_ms, actor_id, actor_role, platform, app_version_code, error_code, error_message, ai_usage'
            )
            .gte('created_at', sinceIso)
            .like('route_pattern', '/api/ai/%')
            .order('created_at', { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: null, error: null }),
      rlApiQuery,
      rlDegradedQuery,
      rlCountersQuery,
      listAdminAiTraces({
        queueType: 'history',
        userId: actorId || undefined,
        search: traceSearch || undefined,
        limit: 80,
      }).catch(() => ({ setupRequired: true, traces: [], totalCount: 0, savedCount: 0, cap: 250 })),
      listAdminAiTraces({
        queueType: 'crashed',
        userId: actorId || undefined,
        search: traceSearch || undefined,
        limit: 80,
      }).catch(() => ({ setupRequired: true, traces: [], totalCount: 0, savedCount: 0, cap: 100 })),
      diagApiQuery,
      diagClientQuery,
      diagAuditQuery,
      diagTraineePromise,
    ]);

    const firstSchemaErr = [auditRes.error, apiRes.error, clientRes.error].find(
      (e) => e && isMissingSchemaError(e.message)
    );
    if (firstSchemaErr) {
      return NextResponse.json({
        ok: true,
        setupRequired: true,
        missingReason:
          'חלק מטבלאות הניטור חסרות ב-Supabase. יש להריץ את supabase/migrations/20261125_telemetry.sql ב-SQL Editor.',
      });
    }

    const aiStats = !aiStatsNeedsFallback
      ? aiStatsRes.data
      : buildAiStatsFromRows(
          (aiFallbackRowsRes.data || []) as RawAiLogRow[],
          hours
        );

    const rateLimitCountersPending = Boolean(
      rlCountersRes.error && isMissingSchemaError(rlCountersRes.error.message)
    );

    const rateLimitStats = buildRateLimitAnalytics({
      apiRows: (rlApiRes.data || []) as RateLimitRawApiRow[],
      degradedAuditRows: (rlDegradedRes.data || []) as RateLimitRawAuditRow[],
      counterRows: rateLimitCountersPending
        ? []
        : ((rlCountersRes.data || []) as RateLimitRawCounterRow[]),
      actorFilter: actorId || undefined,
    });

    const userDiagnostics = buildUserDiagnosticsSummary({
      actorFilter: actorId,
      traineeHealth: diagTraineeHealth,
      apiRows: (diagApiRes.data || []) as DiagApiLogRow[],
      clientRows: (diagClientRes.data || []) as DiagClientEventRow[],
      auditRows: (diagAuditRes.data || []) as DiagAuditRow[],
    });

    return NextResponse.json(
      {
        ok: true,
        setupRequired: false,
        aiStatsRpcPending: aiStatsNeedsFallback,
        rateLimitCountersPending,
        page,
        pageSize: PAGE_SIZE,
        summary: summaryRes.data || null,
        aiStats,
        rateLimitStats,
        userDiagnostics,
        aiLogs: aiLogsRes.data || [],
        aiTraceHistory,
        aiTraceCrashed,
        auditEvents: auditRes.data || [],
        apiLogs: apiRes.data || [],
        clientEvents: clientRes.data || [],
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'שגיאה בטעינת נתוני הניטור',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/monitoring
 * פעולת תחזוקה יזומה למנהל ראשי: הרצת rollup_and_prune_telemetry מיידית.
 */
export async function POST(request: NextRequest) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
  }
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    traceId?: string;
    isSaved?: boolean;
    reviewStatus?: 'new' | 'resolved';
  };

  if (body?.action === 'toggle-trace-saved' && body.traceId) {
    const res = await updateAdminAiTraceFlags({
      traceId: sanitizeIdentifier(body.traceId, 80),
      isSaved: Boolean(body.isSaved),
    });
    return NextResponse.json({ ok: res.ok });
  }

  if (body?.action === 'update-trace-review' && body.traceId) {
    const res = await updateAdminAiTraceFlags({
      traceId: sanitizeIdentifier(body.traceId, 80),
      reviewStatus: body.reviewStatus === 'resolved' ? 'resolved' : 'new',
    });
    return NextResponse.json({ ok: res.ok });
  }

  if (
    !isSupabaseConfigured ||
    !supabase ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return NextResponse.json(
      { error: 'חסר SUPABASE_SERVICE_ROLE_KEY בהגדרות השרת' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc('rollup_and_prune_telemetry');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
