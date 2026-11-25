-- SPOT Fitness Observability & Audit Schema (Supabase Free-Tier Optimized)
-- Retention: 14 days for raw API/client logs, 30 days for Audit events, permanent daily rollups.
-- Run once in Supabase Dashboard -> SQL Editor.

-- 1. Business Activity & Audit Trail (30-day retention)
CREATE TABLE IF NOT EXISTS public.audit_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  target_trainee_id text,
  category text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  platform text,
  app_version_code integer,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2. API Errors, Slow Calls, AI Telemetry & Mutations (14-day retention)
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  method text NOT NULL,
  route_pattern text NOT NULL,
  action_name text,
  status_code smallint NOT NULL,
  duration_ms integer NOT NULL,
  actor_id text,
  actor_role text,
  platform text,
  app_version_code integer,
  error_code text,
  error_message text,
  ai_usage jsonb
);

-- 3. Client Screens, Key Actions & WebView/JS Crashes (14-day retention)
CREATE TABLE IF NOT EXISTS public.client_telemetry_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  user_id text,
  role text,
  platform text,
  app_version_code integer,
  web_build_id text,
  event_type text NOT NULL,
  event_name text NOT NULL,
  screen text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 4. Aggregated Daily Statistics (retained permanently, < 1 MB/year)
CREATE TABLE IF NOT EXISTS public.telemetry_daily_rollups (
  day date NOT NULL,
  metric_key text NOT NULL,
  dimension text NOT NULL DEFAULT 'all',
  total_count bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  avg_duration_ms integer,
  p95_duration_ms integer,
  PRIMARY KEY (day, metric_key, dimension)
);

-- Focused descending indexes to keep working sets inside Supabase Nano RAM
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_activity_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trainee ON public.audit_activity_events (target_trainee_id, created_at DESC)
  WHERE target_trainee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_category_action ON public.audit_activity_events (category, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_logs_created ON public.api_request_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_errors ON public.api_request_logs (created_at DESC)
  WHERE status_code >= 400;
CREATE INDEX IF NOT EXISTS idx_api_logs_req_id ON public.api_request_logs (request_id);

CREATE INDEX IF NOT EXISTS idx_client_tel_created ON public.client_telemetry_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_tel_user ON public.client_telemetry_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_tel_err ON public.client_telemetry_events (created_at DESC)
  WHERE event_type = 'client_error';

-- Lock down all telemetry tables so only server-side Service Role Key can read/write
ALTER TABLE public.audit_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_daily_rollups ENABLE ROW LEVEL SECURITY;

-- Zero-Egress Daily Rollup + TTL Cleanup RPC
CREATE OR REPLACE FUNCTION public.rollup_and_prune_telemetry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_day date := (now() AT TIME ZONE 'Asia/Jerusalem')::date - 1;
  v_deleted_api integer := 0;
  v_deleted_client integer := 0;
  v_deleted_audit integer := 0;
BEGIN
  -- Roll up API routes
  INSERT INTO public.telemetry_daily_rollups (day, metric_key, dimension, total_count, error_count, avg_duration_ms, p95_duration_ms)
  SELECT
    v_target_day,
    'api_route',
    route_pattern,
    COUNT(*),
    COUNT(*) FILTER (WHERE status_code >= 400),
    ROUND(AVG(duration_ms))::integer,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer
  FROM public.api_request_logs
  WHERE (created_at AT TIME ZONE 'Asia/Jerusalem')::date = v_target_day
  GROUP BY route_pattern
  ON CONFLICT (day, metric_key, dimension) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    error_count = EXCLUDED.error_count,
    avg_duration_ms = EXCLUDED.avg_duration_ms,
    p95_duration_ms = EXCLUDED.p95_duration_ms;

  -- Roll up business audit actions
  INSERT INTO public.telemetry_daily_rollups (day, metric_key, dimension, total_count, error_count)
  SELECT
    v_target_day,
    'audit_action',
    category || ':' || action,
    COUNT(*),
    COUNT(*) FILTER (WHERE status <> 'success')
  FROM public.audit_activity_events
  WHERE (created_at AT TIME ZONE 'Asia/Jerusalem')::date = v_target_day
  GROUP BY category, action
  ON CONFLICT (day, metric_key, dimension) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    error_count = EXCLUDED.error_count;

  -- Roll up active unique actors by platform
  INSERT INTO public.telemetry_daily_rollups (day, metric_key, dimension, total_count)
  SELECT
    v_target_day,
    'dau_platform',
    COALESCE(NULLIF(platform, ''), 'unknown'),
    COUNT(DISTINCT actor_id)
  FROM public.audit_activity_events
  WHERE (created_at AT TIME ZONE 'Asia/Jerusalem')::date = v_target_day
    AND actor_id <> 'anonymous'
  GROUP BY COALESCE(NULLIF(platform, ''), 'unknown')
  ON CONFLICT (day, metric_key, dimension) DO UPDATE SET
    total_count = EXCLUDED.total_count;

  -- Roll up client errors
  INSERT INTO public.telemetry_daily_rollups (day, metric_key, dimension, total_count, error_count)
  SELECT
    v_target_day,
    'client_events',
    event_type,
    COUNT(*),
    COUNT(*) FILTER (WHERE event_type = 'client_error')
  FROM public.client_telemetry_events
  WHERE (created_at AT TIME ZONE 'Asia/Jerusalem')::date = v_target_day
  GROUP BY event_type
  ON CONFLICT (day, metric_key, dimension) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    error_count = EXCLUDED.error_count;

  -- Prune expired raw rows
  DELETE FROM public.api_request_logs
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_deleted_api = ROW_COUNT;

  DELETE FROM public.client_telemetry_events
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_deleted_client = ROW_COUNT;

  DELETE FROM public.audit_activity_events
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'rolledUpDay', v_target_day,
    'deletedApi', v_deleted_api,
    'deletedClient', v_deleted_client,
    'deletedAudit', v_deleted_audit
  );
END;
$$;

-- Zero-Egress KPI Aggregation RPC for Super Admin Dashboard
CREATE OR REPLACE FUNCTION public.get_admin_monitoring_summary(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(720, COALESCE(p_hours, 24))));
  v_active_users jsonb;
  v_api_summary jsonb;
  v_ai_summary jsonb;
  v_apk_versions jsonb;
  v_client_errors bigint := 0;
BEGIN
  SELECT jsonb_build_object(
    'totalUniqueActors', COUNT(DISTINCT actor_id) FILTER (WHERE actor_id <> 'anonymous'),
    'totalAuditEvents', COUNT(*),
    'byPlatform', COALESCE((
      SELECT jsonb_object_agg(plat, cnt)
      FROM (
        SELECT COALESCE(NULLIF(platform, ''), 'unknown') AS plat, COUNT(DISTINCT actor_id) AS cnt
        FROM public.audit_activity_events
        WHERE created_at >= v_since AND actor_id <> 'anonymous'
        GROUP BY 1
      ) sub
    ), '{}'::jsonb)
  ) INTO v_active_users
  FROM public.audit_activity_events
  WHERE created_at >= v_since;

  SELECT jsonb_build_object(
    'totalLoggedRequests', COUNT(*),
    'errorRequests', COUNT(*) FILTER (WHERE status_code >= 500 OR (status_code >= 400 AND status_code <> 401)),
    'serverErrors', COUNT(*) FILTER (WHERE status_code >= 500),
    'rateLimited', COUNT(*) FILTER (WHERE status_code = 429),
    'slowRequests', COUNT(*) FILTER (WHERE duration_ms >= 1500),
    'p50LatencyMs', COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms))::integer, 0),
    'p95LatencyMs', COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer, 0),
    'topFailingRoutes', COALESCE((
      SELECT jsonb_agg(r)
      FROM (
        SELECT route_pattern AS route, COUNT(*) AS errors
        FROM public.api_request_logs
        WHERE created_at >= v_since AND status_code >= 400 AND status_code <> 401
        GROUP BY route_pattern
        ORDER BY errors DESC
        LIMIT 8
      ) r
    ), '[]'::jsonb)
  ) INTO v_api_summary
  FROM public.api_request_logs
  WHERE created_at >= v_since;

  SELECT jsonb_build_object(
    'totalAiCalls', COUNT(*),
    'failedAiCalls', COUNT(*) FILTER (WHERE status_code >= 400),
    'avgAiMs', COALESCE(ROUND(AVG(duration_ms))::integer, 0),
    'p95AiMs', COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer, 0)
  ) INTO v_ai_summary
  FROM public.api_request_logs
  WHERE created_at >= v_since AND route_pattern LIKE '/api/ai/%';

  SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) INTO v_apk_versions
  FROM (
    SELECT app_version_code AS "versionCode", COUNT(DISTINCT actor_id) AS "users"
    FROM public.audit_activity_events
    WHERE created_at >= now() - interval '7 days'
      AND app_version_code IS NOT NULL
      AND actor_id <> 'anonymous'
    GROUP BY app_version_code
    ORDER BY app_version_code DESC
    LIMIT 10
  ) v;

  SELECT COUNT(*) INTO v_client_errors
  FROM public.client_telemetry_events
  WHERE created_at >= v_since AND event_type = 'client_error';

  RETURN jsonb_build_object(
    'windowHours', GREATEST(1, LEAST(720, COALESCE(p_hours, 24))),
    'activeUsers', COALESCE(v_active_users, '{}'::jsonb),
    'api', COALESCE(v_api_summary, '{}'::jsonb),
    'ai', COALESCE(v_ai_summary, '{}'::jsonb),
    'apkVersions7d', COALESCE(v_apk_versions, '[]'::jsonb),
    'clientErrors', v_client_errors
  );
END;
$$;
