-- =====================================================================
-- SPOT FITNESS — סכמת מסד נתונים מלאה עבור Supabase (חינם - Free Tier)
-- העתק והדבק את כל הקוד הזה ב-SQL Editor של Supabase ולחץ על RUN
-- =====================================================================

-- 1. טבלת טמפלייטים של תזונה
create table if not exists public.nutrition_templates (
  id text primary key,
  name text not null,
  description text,
  day_type text not null default 'workout',
  tolerance_percent integer not null default 10,
  meals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. טבלת מתאמנים ויומני האכילה שלהם
create table if not exists public.trainees (
  id text primary key,
  name text not null,
  avatar text not null default 'מ',
  phone text,
  goal text,
  current_weight numeric(5,2) default 75.0,
  target_weight numeric(5,2) default 70.0,
  tolerance_percent integer not null default 10,
  workout_template jsonb not null,
  rest_template jsonb not null,
  favorite_food_ids jsonb not null default '[]'::jsonb,
  weight_history jsonb not null default '[]'::jsonb,
  logs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. פתיחת הרשאות גישה (Row Level Security) לעבודה ישירה מהאפליקציה
alter table public.nutrition_templates enable row level security;
alter table public.trainees enable row level security;

drop policy if exists "Allow full access to nutrition_templates" on public.nutrition_templates;
create policy "Allow full access to nutrition_templates"
  on public.nutrition_templates
  for all
  using (true)
  with check (true);

drop policy if exists "Allow full access to trainees" on public.trainees;
create policy "Allow full access to trainees"
  on public.trainees
  for all
  using (true)
  with check (true);
