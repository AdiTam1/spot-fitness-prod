-- Additive AI Analytics RPC for Super Admin Dashboard (0-Egress PostgreSQL Aggregation)
-- Safe to run on top of 20261125_telemetry.sql

CREATE INDEX IF NOT EXISTS idx_api_logs_ai_created
  ON public.api_request_logs (created_at DESC)
  WHERE route_pattern LIKE '/api/ai/%';

CREATE OR REPLACE FUNCTION public.get_admin_ai_stats(p_hours integer DEFAULT 168)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer := GREATEST(1, LEAST(720, COALESCE(p_hours, 168)));
  v_since timestamptz := now() - make_interval(hours => v_hours);
  v_totals jsonb;
  v_by_user jsonb;
  v_by_reason jsonb;
  v_by_model jsonb;
  v_by_mode jsonb;
BEGIN
  WITH ai_rows AS MATERIALIZED (
    SELECT
      COALESCE(NULLIF(actor_id, ''), 'anonymous') AS actor_id,
      COALESCE(NULLIF(actor_role, ''), 'unknown') AS actor_role,
      duration_ms,
      created_at,
      status_code,
      COALESCE(
        NULLIF(ai_usage->>'outcome', ''),
        CASE
          WHEN status_code >= 400 THEN 'failed'
          WHEN COALESCE((ai_usage->>'fallbackUsed')::boolean, false) THEN 'fallback'
          ELSE 'succeeded'
        END
      ) AS outcome,
      COALESCE(
        NULLIF(ai_usage->>'model', ''),
        CASE WHEN status_code >= 400 THEN 'error' ELSE 'unknown' END
      ) AS model,
      COALESCE(
        NULLIF(ai_usage->>'mode', ''),
        NULLIF(action_name, ''),
        CASE WHEN route_pattern LIKE '%recommend%' THEN 'recommend' ELSE 'analyze' END
      ) AS mode,
      COALESCE(NULLIF(ai_usage->>'reasonCode', ''), NULLIF(error_code, ''), 'OTHER') AS reason_code,
      COALESCE(
        NULLIF(ai_usage->>'failureReason', ''),
        NULLIF(error_message, ''),
        NULLIF(error_code, ''),
        'ללא פירוט שגיאה'
      ) AS reason_text,
      CASE
        WHEN (ai_usage->>'imageCount') ~ '^\d+$' THEN (ai_usage->>'imageCount')::integer
        ELSE 0
      END AS image_count,
      CASE
        WHEN (ai_usage->>'totalImageKB') ~ '^\d+$' THEN (ai_usage->>'totalImageKB')::integer
        ELSE 0
      END AS image_kb
    FROM public.api_request_logs
    WHERE created_at >= v_since
      AND route_pattern LIKE '/api/ai/%'
  ),
  user_top_reason AS (
    SELECT DISTINCT ON (actor_id)
      actor_id,
      reason_text AS top_reason
    FROM ai_rows
    WHERE outcome IN ('failed', 'fallback')
    GROUP BY actor_id, reason_text
    ORDER BY actor_id, COUNT(*) DESC
  ),
  user_agg AS (
    SELECT
      r.actor_id AS "actorId",
      MAX(r.actor_role) AS "actorRole",
      COUNT(*) AS "totalCalls",
      COUNT(*) FILTER (WHERE r.outcome = 'succeeded') AS "succeededCalls",
      COUNT(*) FILTER (WHERE r.outcome = 'fallback') AS "fallbackCalls",
      COUNT(*) FILTER (WHERE r.outcome = 'failed') AS "failedCalls",
      COALESCE(ROUND(AVG(r.duration_ms))::integer, 0) AS "avgMs",
      MAX(r.created_at) AS "lastCallAt",
      MAX(utr.top_reason) AS "topFailureReason"
    FROM ai_rows r
    LEFT JOIN user_top_reason utr ON utr.actor_id = r.actor_id
    GROUP BY r.actor_id
    ORDER BY COUNT(*) DESC
    LIMIT 100
  ),
  reason_agg AS (
    SELECT
      outcome,
      reason_code AS "reasonCode",
      reason_text AS "reasonText",
      COUNT(*) AS "count"
    FROM ai_rows
    WHERE outcome IN ('failed', 'fallback')
    GROUP BY outcome, reason_code, reason_text
    ORDER BY COUNT(*) DESC
    LIMIT 25
  ),
  model_agg AS (
    SELECT
      model,
      COUNT(*) AS "calls",
      COUNT(*) FILTER (WHERE outcome = 'succeeded') AS "succeeded",
      COUNT(*) FILTER (WHERE outcome = 'fallback') AS "fallback",
      COUNT(*) FILTER (WHERE outcome = 'failed') AS "failed",
      COALESCE(ROUND(AVG(duration_ms))::integer, 0) AS "avgMs"
    FROM ai_rows
    GROUP BY model
    ORDER BY COUNT(*) DESC
  ),
  mode_agg AS (
    SELECT
      mode,
      COUNT(*) AS "calls",
      COUNT(*) FILTER (WHERE outcome = 'succeeded') AS "succeeded",
      COUNT(*) FILTER (WHERE outcome = 'fallback') AS "fallback",
      COUNT(*) FILTER (WHERE outcome = 'failed') AS "failed",
      COALESCE(ROUND(AVG(duration_ms))::integer, 0) AS "avgMs"
    FROM ai_rows
    GROUP BY mode
    ORDER BY COUNT(*) DESC
  )
  SELECT
    (
      SELECT jsonb_build_object(
        'totalCalls', COUNT(*),
        'succeededCount', COUNT(*) FILTER (WHERE outcome = 'succeeded'),
        'fallbackCount', COUNT(*) FILTER (WHERE outcome = 'fallback'),
        'failedCount', COUNT(*) FILTER (WHERE outcome = 'failed'),
        'cancelledCount', COUNT(*) FILTER (WHERE outcome = 'cancelled'),
        'avgMs', COALESCE(ROUND(AVG(duration_ms))::integer, 0),
        'p95Ms', COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms))::integer, 0),
        'totalImages', COALESCE(SUM(image_count), 0),
        'totalImageKB', COALESCE(SUM(image_kb), 0)
      )
      FROM ai_rows
    ),
    (SELECT COALESCE(jsonb_agg(u), '[]'::jsonb) FROM user_agg u),
    (SELECT COALESCE(jsonb_agg(fr), '[]'::jsonb) FROM reason_agg fr),
    (SELECT COALESCE(jsonb_agg(m), '[]'::jsonb) FROM model_agg m),
    (SELECT COALESCE(jsonb_agg(md), '[]'::jsonb) FROM mode_agg md)
  INTO v_totals, v_by_user, v_by_reason, v_by_model, v_by_mode;

  RETURN jsonb_build_object(
    'windowHours', v_hours,
    'totals', COALESCE(v_totals, '{}'::jsonb),
    'byUser', COALESCE(v_by_user, '[]'::jsonb),
    'byFailureReason', COALESCE(v_by_reason, '[]'::jsonb),
    'byModel', COALESCE(v_by_model, '[]'::jsonb),
    'byMode', COALESCE(v_by_mode, '[]'::jsonb)
  );
END;
$$;
