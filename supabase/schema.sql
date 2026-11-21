-- =====================================================================
-- SPOT FITNESS — סכמת מסד נתונים מלאה ומעודכנת עבור Supabase
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

-- 2. איפוס והקמת טבלת המתאמנים עם כל העמודות החדשות (אימייל, סיסמה מוצפנת, סטטוס ויומן ארוחות)
drop table if exists public.daily_meal_logs cascade;
drop table if exists public.trainees cascade;

create table public.trainees (
  id text primary key,
  email text unique,
  password text,
  status text not null default 'active', -- 'active' | 'pending' | 'paused'
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

-- 3. הגדרות הרשאות גישה (Row Level Security) עבור שרת ה-API
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
