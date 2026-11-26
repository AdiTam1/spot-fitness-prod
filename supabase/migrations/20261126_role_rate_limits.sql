-- =====================================================================
-- SPOT FITNESS — Persistent Role-Based Multi-Window Rate Limits (Hour / Day)
-- Safe to re-run (idempotent) | Reset daily in Asia/Jerusalem midnight
-- =====================================================================

create table if not exists public.api_rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  hit_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (bucket_key, window_start, window_seconds)
);

create index if not exists idx_api_rate_limit_expires
  on public.api_rate_limit_counters (expires_at);

alter table public.api_rate_limit_counters enable row level security;

-- שורה מנוהלת ע"י RPC מאובטח בשרת בלבד (SECURITY DEFINER)
create or replace function public.consume_api_rate_limits(
  p_actor_key text,
  p_hour_limit integer,
  p_day_limit integer
)
returns table (
  allowed boolean,
  blocked_window text,
  hour_count integer,
  day_count integer,
  retry_after_sec integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_hour_start timestamptz := date_trunc('hour', v_now);
  v_hour_end timestamptz := v_hour_start + interval '1 hour';
  v_day_start timestamptz := (date_trunc('day', v_now at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem');
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_key text := left(btrim(coalesce(p_actor_key, '')), 160);
  v_cur_hour integer := 0;
  v_cur_day integer := 0;
begin
  if v_key = '' then
    return query select false, 'hour'::text, 0, 0, 60;
    return;
  end if;

  -- ניקוי אקראי קל של רשומות שפג תוקפן (~2% מהבקשות)
  if random() < 0.02 then
    delete from public.api_rate_limit_counters where expires_at < v_now;
  end if;

  -- נעילה דטרמיניסטית לשתי שורות החלון למניעת Race Conditions בבקשות מקבילות
  insert into public.api_rate_limit_counters (bucket_key, window_start, window_seconds, hit_count, expires_at)
  values
    (v_key, v_hour_start, 3600, 0, v_hour_end + interval '1 hour'),
    (v_key, v_day_start, 86400, 0, v_day_end + interval '2 hours')
  on conflict (bucket_key, window_start, window_seconds) do nothing;

  select coalesce(hit_count, 0)
  into v_cur_hour
  from public.api_rate_limit_counters
  where bucket_key = v_key and window_start = v_hour_start and window_seconds = 3600
  for update;

  select coalesce(hit_count, 0)
  into v_cur_day
  from public.api_rate_limit_counters
  where bucket_key = v_key and window_start = v_day_start and window_seconds = 86400
  for update;

  if p_hour_limit > 0 and v_cur_hour >= p_hour_limit then
    return query select
      false,
      'hour'::text,
      v_cur_hour,
      v_cur_day,
      greatest(1, extract(epoch from (v_hour_end - v_now))::integer);
    return;
  end if;

  if p_day_limit > 0 and v_cur_day >= p_day_limit then
    return query select
      false,
      'day'::text,
      v_cur_hour,
      v_cur_day,
      greatest(1, extract(epoch from (v_day_end - v_now))::integer);
    return;
  end if;

  update public.api_rate_limit_counters
  set hit_count = hit_count + 1
  where bucket_key = v_key and window_start = v_hour_start and window_seconds = 3600;

  update public.api_rate_limit_counters
  set hit_count = hit_count + 1
  where bucket_key = v_key and window_start = v_day_start and window_seconds = 86400;

  return query select
    true,
    null::text,
    v_cur_hour + 1,
    v_cur_day + 1,
    0;
end;
$$;

notify pgrst, 'reload schema';
