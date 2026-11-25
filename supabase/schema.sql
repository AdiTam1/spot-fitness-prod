-- =====================================================================
-- SPOT FITNESS — סכמת מסד נתונים מלאה ומעודכנת (Idempotent / Safe to re-run)
-- כולל: מאמנים, קבוצות, טמפלייטים, מתאמנים, Onboarding, היקפים,
-- ימי תשקיף, יעדי אימון/שינה, פיצול אימון/מנוחה, למידת AI וצ'ק-אינים.
-- העתק והדבק את כל הקוד הזה ב-SQL Editor של Supabase ולחץ על RUN.
-- =====================================================================

-- 1. טבלת מאמנים (Coaches)
create table if not exists public.coaches (
  id text primary key,
  email text unique not null,
  password text not null,
  name text not null,
  avatar text not null default 'מ',
  phone text,
  invite_code text unique not null,
  status text not null default 'active', -- 'active' | 'paused'
  session_version integer not null default 1,
  last_seen_at timestamptz,
  onboarding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coaches add column if not exists avatar text not null default 'מ';
alter table public.coaches add column if not exists phone text;
alter table public.coaches add column if not exists status text not null default 'active';
alter table public.coaches add column if not exists session_version integer not null default 1;
alter table public.coaches add column if not exists last_seen_at timestamptz;
alter table public.coaches add column if not exists onboarding jsonb not null default '{}'::jsonb;
alter table public.coaches add column if not exists updated_at timestamptz not null default now();

-- 2. טבלת קבוצות מתאמנים (Trainee Groups)
create table if not exists public.trainee_groups (
  id text primary key,
  name text not null,
  color text not null default '#d67d09',
  owner_coach_id text not null default 'coach-admin',
  custom_quick_chips jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trainee_groups add column if not exists color text not null default '#d67d09';
alter table public.trainee_groups add column if not exists owner_coach_id text not null default 'coach-admin';
alter table public.trainee_groups add column if not exists custom_quick_chips jsonb not null default '[]'::jsonb;
alter table public.trainee_groups add column if not exists updated_at timestamptz not null default now();

-- 3. טבלת טמפלייטים של תזונה (Global + Personal Coach Templates)
create table if not exists public.nutrition_templates (
  id text primary key,
  name text not null,
  description text,
  day_type text not null default 'workout',
  tolerance_percent integer not null default 10,
  owner_coach_id text not null default 'coach-admin',
  meals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nutrition_templates add column if not exists description text;
alter table public.nutrition_templates add column if not exists day_type text not null default 'workout';
alter table public.nutrition_templates add column if not exists tolerance_percent integer not null default 10;
alter table public.nutrition_templates add column if not exists owner_coach_id text not null default 'coach-admin';
alter table public.nutrition_templates add column if not exists meals jsonb not null default '[]'::jsonb;
alter table public.nutrition_templates add column if not exists updated_at timestamptz not null default now();

-- 4. טבלת מתאמנים (Trainees)
create table if not exists public.trainees (
  id text primary key,
  email text unique,
  password text,
  status text not null default 'active',
  name text not null,
  avatar text not null default 'מ',
  phone text,
  goal text,
  current_weight numeric(5,2) default 75.0,
  target_weight numeric(5,2) default 70.0,
  tolerance_percent integer not null default 10,
  primary_coach_id text not null default 'coach-admin',
  shared_coach_ids jsonb not null default '[]'::jsonb,
  group_id text,
  workout_template jsonb not null,
  rest_template jsonb not null,
  favorite_food_ids jsonb not null default '[]'::jsonb,
  weight_history jsonb not null default '[]'::jsonb,
  measurements_history jsonb not null default '[]'::jsonb,
  onboarding jsonb not null default '{}'::jsonb,
  observation_dates jsonb not null default '[]'::jsonb,
  blocked_dates jsonb not null default '[]'::jsonb,
  restrict_to_obs_on_obs_days boolean not null default false,
  count_observation_in_stats boolean not null default false,
  activity_targets jsonb not null default '{}'::jsonb,
  enable_workout_rest_split boolean not null default false,
  coach_ai_notes text not null default '',
  ai_learned_preferences jsonb not null default '[]'::jsonb,
  weekly_check_ins jsonb not null default '[]'::jsonb,
  saved_meals jsonb not null default '[]'::jsonb,
  custom_serving_tools jsonb not null default '[]'::jsonb,
  custom_food_units jsonb not null default '[]'::jsonb,
  recent_context_chips jsonb not null default '[]'::jsonb,
  pending_ai_jobs jsonb not null default '[]'::jsonb,
  logs jsonb not null default '{}'::jsonb,
  session_version integer not null default 1,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.trainees add column if not exists email text;
alter table public.trainees add column if not exists password text;
alter table public.trainees add column if not exists status text not null default 'active';
alter table public.trainees add column if not exists avatar text not null default 'מ';
alter table public.trainees add column if not exists phone text;
alter table public.trainees add column if not exists goal text;
alter table public.trainees add column if not exists current_weight numeric(5,2) default 75.0;
alter table public.trainees add column if not exists target_weight numeric(5,2) default 70.0;
alter table public.trainees add column if not exists tolerance_percent integer not null default 10;
alter table public.trainees add column if not exists primary_coach_id text not null default 'coach-admin';
alter table public.trainees add column if not exists shared_coach_ids jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists group_id text;
alter table public.trainees add column if not exists favorite_food_ids jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists weight_history jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists measurements_history jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists onboarding jsonb not null default '{}'::jsonb;
alter table public.trainees add column if not exists observation_dates jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists blocked_dates jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists restrict_to_obs_on_obs_days boolean not null default false;
alter table public.trainees add column if not exists count_observation_in_stats boolean not null default false;
alter table public.trainees add column if not exists activity_targets jsonb not null default '{}'::jsonb;
alter table public.trainees add column if not exists enable_workout_rest_split boolean not null default false;
alter table public.trainees add column if not exists coach_ai_notes text not null default '';
alter table public.trainees add column if not exists ai_learned_preferences jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists weekly_check_ins jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists saved_meals jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists custom_serving_tools jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists custom_food_units jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists recent_context_chips jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists pending_ai_jobs jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists logs jsonb not null default '{}'::jsonb;
alter table public.trainees add column if not exists session_version integer not null default 1;
alter table public.trainees add column if not exists last_seen_at timestamptz;
alter table public.trainees add column if not exists updated_at timestamptz not null default now();

-- 5. אינדקסים לביצועים מהירים
create index if not exists idx_trainees_primary_coach on public.trainees (primary_coach_id);
create index if not exists idx_trainees_group on public.trainees (group_id);
create index if not exists idx_groups_owner on public.trainee_groups (owner_coach_id);
create index if not exists idx_templates_owner on public.nutrition_templates (owner_coach_id);

-- 6. סנכרון אוטומטי בטוח עבור מתאמנים קיימים מתוך הגיבוי שב-logs->__profile_meta
update public.trainees
set
  primary_coach_id = coalesce(nullif(logs->'__profile_meta'->>'primaryCoachId', ''), primary_coach_id),
  shared_coach_ids = case
    when jsonb_typeof(logs->'__profile_meta'->'sharedCoachIds') = 'array'
      then logs->'__profile_meta'->'sharedCoachIds'
    else shared_coach_ids
  end,
  group_id = case
    when (logs->'__profile_meta') ? 'groupId'
      then nullif(logs->'__profile_meta'->>'groupId', '')
    else group_id
  end,
  measurements_history = case
    when jsonb_typeof(logs->'__profile_meta'->'measurementsHistory') = 'array'
      then logs->'__profile_meta'->'measurementsHistory'
    else measurements_history
  end,
  onboarding = case
    when jsonb_typeof(logs->'__profile_meta'->'onboarding') = 'object'
      then logs->'__profile_meta'->'onboarding'
    else onboarding
  end,
  observation_dates = case
    when jsonb_typeof(logs->'__profile_meta'->'observationDates') = 'array'
      then logs->'__profile_meta'->'observationDates'
    else observation_dates
  end,
  count_observation_in_stats = case
    when jsonb_typeof(logs->'__profile_meta'->'countObservationInStats') = 'boolean'
      then (logs->'__profile_meta'->>'countObservationInStats')::boolean
    else count_observation_in_stats
  end,
  activity_targets = case
    when jsonb_typeof(logs->'__profile_meta'->'activityTargets') = 'object'
      then logs->'__profile_meta'->'activityTargets'
    else activity_targets
  end,
  enable_workout_rest_split = case
    when jsonb_typeof(logs->'__profile_meta'->'enableWorkoutRestSplit') = 'boolean'
      then (logs->'__profile_meta'->>'enableWorkoutRestSplit')::boolean
    else enable_workout_rest_split
  end,
  coach_ai_notes = case
    when jsonb_typeof(logs->'__profile_meta'->'coachAiNotes') = 'string'
      then logs->'__profile_meta'->>'coachAiNotes'
    else coach_ai_notes
  end,
  ai_learned_preferences = case
    when jsonb_typeof(logs->'__profile_meta'->'aiLearnedPreferences') = 'array'
      then logs->'__profile_meta'->'aiLearnedPreferences'
    else ai_learned_preferences
  end,
  weekly_check_ins = case
    when jsonb_typeof(logs->'__profile_meta'->'weeklyCheckIns') = 'array'
      then logs->'__profile_meta'->'weeklyCheckIns'
    else weekly_check_ins
  end,
  saved_meals = case
    when jsonb_typeof(logs->'__profile_meta'->'savedMeals') = 'array'
      then logs->'__profile_meta'->'savedMeals'
    else saved_meals
  end,
  custom_serving_tools = case
    when jsonb_typeof(logs->'__profile_meta'->'customServingTools') = 'array'
      then logs->'__profile_meta'->'customServingTools'
    else custom_serving_tools
  end,
  custom_food_units = case
    when jsonb_typeof(logs->'__profile_meta'->'customFoodUnits') = 'array'
      then logs->'__profile_meta'->'customFoodUnits'
    else custom_food_units
  end,
  recent_context_chips = case
    when jsonb_typeof(logs->'__profile_meta'->'recentContextChips') = 'array'
      then logs->'__profile_meta'->'recentContextChips'
    else recent_context_chips
  end,
  pending_ai_jobs = case
    when jsonb_typeof(logs->'__profile_meta'->'pendingAiJobs') = 'array'
      then logs->'__profile_meta'->'pendingAiJobs'
    else pending_ai_jobs
  end
where logs ? '__profile_meta';

-- 7. טבלת קטלוג מזון מנורמלת ומאונדקסת (עשרות אלפי מוצרים מסופרים/ברקוד ללא עומס RAM)
create extension if not exists pg_trgm;

create table if not exists public.food_catalog_items (
  id text primary key,
  name text not null,
  name_norm text not null,
  brand text not null default '',
  category text not null default '',
  barcode text,
  calories numeric(6,1) not null,
  protein numeric(6,1) not null,
  carbs numeric(6,1) not null,
  fat numeric(6,1) not null,
  units jsonb not null default '[]'::jsonb,
  source text not null default 'scraper',
  source_site_id text,
  source_site_name text,
  source_url text,
  pick_count integer not null default 0,
  search_tokens text not null default '',
  search_tsv tsvector,
  updated_at timestamptz not null default now()
);

alter table public.food_catalog_items add column if not exists pick_count integer not null default 0;
alter table public.food_catalog_items add column if not exists search_tokens text not null default '';
alter table public.food_catalog_items add column if not exists search_tsv tsvector;

create index if not exists idx_food_catalog_name_trgm
  on public.food_catalog_items using gin (name_norm gin_trgm_ops);
create index if not exists idx_food_catalog_search_tsv
  on public.food_catalog_items using gin (search_tsv);
create index if not exists idx_food_catalog_name_prefix
  on public.food_catalog_items using btree (name_norm text_pattern_ops);
create index if not exists idx_food_catalog_pick_count
  on public.food_catalog_items (pick_count desc);
create index if not exists idx_food_catalog_barcode
  on public.food_catalog_items (barcode)
  where barcode is not null;
create index if not exists idx_food_catalog_source_site
  on public.food_catalog_items (source_site_id);
create index if not exists idx_food_catalog_updated
  on public.food_catalog_items (updated_at desc);

-- 8. הגדרות הרשאות גישה (Row Level Security)
alter table public.coaches enable row level security;
alter table public.trainee_groups enable row level security;
alter table public.nutrition_templates enable row level security;
alter table public.trainees enable row level security;
alter table public.food_catalog_items enable row level security;

drop policy if exists "Allow full access to coaches" on public.coaches;
create policy "Allow full access to coaches"
  on public.coaches for all using (true) with check (true);

drop policy if exists "Allow full access to trainee_groups" on public.trainee_groups;
create policy "Allow full access to trainee_groups"
  on public.trainee_groups for all using (true) with check (true);

drop policy if exists "Allow full access to nutrition_templates" on public.nutrition_templates;
create policy "Allow full access to nutrition_templates"
  on public.nutrition_templates for all using (true) with check (true);

drop policy if exists "Allow full access to trainees" on public.trainees;
create policy "Allow full access to trainees"
  on public.trainees for all using (true) with check (true);

drop policy if exists "Allow full access to food_catalog_items" on public.food_catalog_items;
drop policy if exists "Allow public read food catalog" on public.food_catalog_items;
create policy "Allow public read food catalog"
  on public.food_catalog_items for select using (true);

-- 9. טבלת היסטוריית מוצרים וברקודים פר משתמש + פונקציות החיפוש ההיברידי
-- מנוהלות בקובץ המיגרציה supabase/migrations/20261125_food_search_and_history.sql
-- רענון מיידי של Schema Cache ב-PostgREST
notify pgrst, 'reload schema';
