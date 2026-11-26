-- AI Conversation Inspector & Separated Crash Queue (Free-Tier FIFO + Pin Safeguard)
-- Keeps max 250 history traces + max 100 crashed traces (pinned rows never deleted, count within queue quota)
-- Thumbnails stored separately in ai_trace_media and fetched lazily on inspection only.

CREATE TABLE IF NOT EXISTS public.ai_trace_conversations (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id text NOT NULL,
  user_name text NOT NULL DEFAULT 'מתאמן',
  user_role text NOT NULL DEFAULT 'trainee',
  meal_slot_id text,
  meal_slot_name text,
  meal_date text,
  mode text NOT NULL DEFAULT 'analyze',
  queue_type text NOT NULL CHECK (queue_type IN ('history', 'crashed')),
  is_saved boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'new',
  crash_stage text,
  error_code text,
  error_message text,
  duration_ms integer,
  model text,
  image_count integer NOT NULL DEFAULT 0,
  total_image_kb integer NOT NULL DEFAULT 0,
  is_sandbox_replay boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_traces_queue_created
  ON public.ai_trace_conversations (queue_type, is_saved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_traces_user_created
  ON public.ai_trace_conversations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_trace_media (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trace_id text NOT NULL REFERENCES public.ai_trace_conversations(id) ON DELETE CASCADE,
  media_hash text NOT NULL,
  angle text NOT NULL DEFAULT 'unset',
  label_product_name text,
  thumbnail_data_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_trace_media_trace
  ON public.ai_trace_media (trace_id);

ALTER TABLE public.ai_trace_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_trace_media ENABLE ROW LEVEL SECURITY;

-- Atomically insert/upsert trace + lazy thumbnails, enforcing queue FIFO cap (250 history / 100 crashed)
-- Pinned (is_saved = true) rows are preserved forever and counted inside the total N limit.
CREATE OR REPLACE FUNCTION public.insert_ai_trace_with_prune(
  p_trace jsonb,
  p_media jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := COALESCE(NULLIF(p_trace->>'id', ''), 'aitrace-' || extract(epoch from now())::bigint::text);
  v_queue text := CASE WHEN p_trace->>'queueType' = 'crashed' THEN 'crashed' ELSE 'history' END;
  v_cap integer := CASE WHEN v_queue = 'crashed' THEN 100 ELSE 250 END;
  v_total_count integer := 0;
  v_excess integer := 0;
  v_pruned integer := 0;
  v_media_item jsonb;
BEGIN
  INSERT INTO public.ai_trace_conversations (
    id, created_at, user_id, user_name, user_role,
    meal_slot_id, meal_slot_name, meal_date, mode, queue_type,
    is_saved, review_status, crash_stage, error_code, error_message,
    duration_ms, model, image_count, total_image_kb, is_sandbox_replay, payload
  ) VALUES (
    v_id,
    COALESCE(NULLIF(p_trace->>'createdAt', '')::timestamptz, now()),
    COALESCE(p_trace->>'userId', 'anonymous'),
    COALESCE(p_trace->>'userName', 'משתמש'),
    COALESCE(p_trace->>'userRole', 'trainee'),
    NULLIF(p_trace->>'mealSlotId', ''),
    NULLIF(p_trace->>'mealSlotName', ''),
    NULLIF(p_trace->>'mealDate', ''),
    COALESCE(p_trace->>'mode', 'analyze'),
    v_queue,
    COALESCE((p_trace->>'isSaved')::boolean, false),
    COALESCE(NULLIF(p_trace->>'reviewStatus', ''), 'new'),
    NULLIF(p_trace->>'crashStage', ''),
    NULLIF(p_trace->>'errorCode', ''),
    NULLIF(p_trace->>'errorMessage', ''),
    CASE WHEN (p_trace->>'durationMs') ~ '^\d+$' THEN (p_trace->>'durationMs')::integer ELSE NULL END,
    NULLIF(p_trace->>'model', ''),
    COALESCE(CASE WHEN (p_trace->>'imageCount') ~ '^\d+$' THEN (p_trace->>'imageCount')::integer ELSE 0 END, 0),
    COALESCE(CASE WHEN (p_trace->>'totalImageKB') ~ '^\d+$' THEN (p_trace->>'totalImageKB')::integer ELSE 0 END, 0),
    COALESCE((p_trace->>'isSandboxReplay')::boolean, false),
    COALESCE(p_trace->'payload', '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    error_code = EXCLUDED.error_code,
    error_message = EXCLUDED.error_message,
    crash_stage = EXCLUDED.crash_stage,
    duration_ms = EXCLUDED.duration_ms,
    model = EXCLUDED.model,
    payload = EXCLUDED.payload;

  IF jsonb_typeof(p_media) = 'array' AND jsonb_array_length(p_media) > 0 THEN
    DELETE FROM public.ai_trace_media WHERE trace_id = v_id;
    FOR v_media_item IN SELECT * FROM jsonb_array_elements(p_media)
    LOOP
      INSERT INTO public.ai_trace_media (trace_id, media_hash, angle, label_product_name, thumbnail_data_url)
      VALUES (
        v_id,
        COALESCE(v_media_item->>'hash', 'h'),
        COALESCE(v_media_item->>'angle', 'unset'),
        NULLIF(v_media_item->>'labelProductName', ''),
        COALESCE(v_media_item->>'dataUrl', '')
      );
    END LOOP;
  END IF;

  SELECT COUNT(*) INTO v_total_count
  FROM public.ai_trace_conversations
  WHERE queue_type = v_queue;

  v_excess := GREATEST(0, v_total_count - v_cap);
  IF v_excess > 0 THEN
    WITH victims AS (
      SELECT id
      FROM public.ai_trace_conversations
      WHERE queue_type = v_queue
        AND is_saved = false
        AND id <> v_id
      ORDER BY created_at ASC
      LIMIT v_excess
    )
    DELETE FROM public.ai_trace_conversations
    WHERE id IN (SELECT id FROM victims);
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'queueType', v_queue,
    'pruned', v_pruned
  );
END;
$$;
