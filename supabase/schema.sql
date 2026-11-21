-- =====================================================================
-- SPOT FITNESS — סכמת מסד נתונים מלאה עבור ארכיטקטורת 3 שכבות:
-- מנהל ראשי (Admin), מאמנים (Coaches), קבוצות (Groups), מתאמנים (Trainees),
-- שאלון קליטה (Onboarding), היקפים (Measurements) וימי תשקיף (Observation Days)
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
  onboarding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.coaches add column if not exists onboarding jsonb not null default '{}'::jsonb;

-- 2. טבלת קבוצות מתאמנים (Trainee Groups)
create table if not exists public.trainee_groups (
  id text primary key,
  name text not null,
  color text not null default '#d2ff28',
  owner_coach_id text not null default 'coach-admin',
  updated_at timestamptz not null default now()
);

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

alter table public.nutrition_templates add column if not exists owner_coach_id text not null default 'coach-admin';

-- 4. טבלת מתאמנים (כולל בעלות מאמן ראשי, שותפים, קבוצה, Onboarding, היקפים וימי תשקיף)
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
  count_observation_in_stats boolean not null default false,
  logs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.trainees add column if not exists email text;
alter table public.trainees add column if not exists password text;
alter table public.trainees add column if not exists status text not null default 'active';
alter table public.trainees add column if not exists primary_coach_id text not null default 'coach-admin';
alter table public.trainees add column if not exists shared_coach_ids jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists group_id text;
alter table public.trainees add column if not exists measurements_history jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists onboarding jsonb not null default '{}'::jsonb;
alter table public.trainees add column if not exists observation_dates jsonb not null default '[]'::jsonb;
alter table public.trainees add column if not exists count_observation_in_stats boolean not null default false;

-- 5. הגדרות הרשאות גישה (Row Level Security)
alter table public.coaches enable row level security;
alter table public.trainee_groups enable row level security;
alter table public.nutrition_templates enable row level security;
alter table public.trainees enable row level security;

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
