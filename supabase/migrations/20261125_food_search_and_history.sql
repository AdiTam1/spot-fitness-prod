-- =====================================================================
-- SPOT FITNESS — Hybrid Hebrew Food Search, Global Pick Count & Per-User History
-- Safe to re-run (idempotent) | Optimized for Supabase Free Tier (500 MB)
-- =====================================================================

create extension if not exists pg_trgm;

-- 1. Hebrew-aware food normalization helper (handles definite/preposition prefixes ה/ו/ב/ל/מ)
create or replace function public.normalize_hebrew_food(raw_text text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select btrim(
      regexp_replace(
        regexp_replace(lower(coalesce(raw_text, '')), '[''"`׳״\-–—,.()/\\_%:;]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    ) as txt
  ),
  toks as (
    select
      tok,
      ord
    from cleaned,
    unnest(string_to_array(cleaned.txt, ' ')) with ordinality as t(tok, ord)
    where tok <> ''
  ),
  expanded as (
    select ord * 2 as sort_ord, tok as word
    from toks
    union all
    select ord * 2 + 1 as sort_ord, substring(tok from 2) as word
    from toks
    where tok ~ '^[הובלמכ][א-ת]{3,}$'
  )
  select coalesce(string_agg(word, ' ' order by sort_ord), '')
  from expanded;
$$;

-- 2. Extend food_catalog_items with popularity + lightweight FTS columns
alter table public.food_catalog_items
  add column if not exists pick_count integer not null default 0;
alter table public.food_catalog_items
  add column if not exists search_tokens text not null default '';
alter table public.food_catalog_items
  add column if not exists search_tsv tsvector;

create or replace function public.food_catalog_sync_search_fields()
returns trigger
language plpgsql
as $$
begin
  new.search_tokens := left(
    public.normalize_hebrew_food(coalesce(new.name, '') || ' ' || coalesce(new.brand, '')),
    400
  );
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(new.name), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(new.brand), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(new.category), '')), 'C');
  return new;
end;
$$;

drop trigger if exists trg_food_catalog_search_fields on public.food_catalog_items;
create trigger trg_food_catalog_search_fields
before insert or update of name, brand, category on public.food_catalog_items
for each row execute function public.food_catalog_sync_search_fields();

-- Safe backfill for existing catalog rows
update public.food_catalog_items
set
  search_tokens = left(
    public.normalize_hebrew_food(coalesce(name, '') || ' ' || coalesce(brand, '')),
    400
  ),
  search_tsv =
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(name), '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(brand), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(public.normalize_hebrew_food(category), '')), 'C')
where search_tsv is null or search_tokens = '';

create index if not exists idx_food_catalog_name_trgm
  on public.food_catalog_items using gin (name_norm gin_trgm_ops);
create index if not exists idx_food_catalog_search_tsv
  on public.food_catalog_items using gin (search_tsv);
create index if not exists idx_food_catalog_name_prefix
  on public.food_catalog_items using btree (name_norm text_pattern_ops);
create index if not exists idx_food_catalog_pick_count
  on public.food_catalog_items (pick_count desc);

-- 3. Tighten RLS on food_catalog_items: public read-only, server-only writes via Service Role Key
alter table public.food_catalog_items enable row level security;
drop policy if exists "Allow full access to food_catalog_items" on public.food_catalog_items;
drop policy if exists "Allow public read food catalog" on public.food_catalog_items;
create policy "Allow public read food catalog"
  on public.food_catalog_items for select using (true);

-- 4. Per-User Food History table (tracks every picked catalog food, scanned barcode, and logged item)
create table if not exists public.user_food_history (
  user_id text not null,
  food_key text not null,
  catalog_id text,
  name text not null,
  brand text not null default '',
  category text not null default '',
  barcode text,
  calories numeric(6,1) not null,
  protein numeric(6,1) not null,
  carbs numeric(6,1) not null,
  fat numeric(6,1) not null,
  units jsonb not null default '[]'::jsonb,
  last_unit_label text,
  last_grams numeric(6,1),
  source text not null default 'catalog',
  source_site_id text,
  source_site_name text,
  source_url text,
  action_kind text not null default 'picked',
  use_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  primary key (user_id, food_key)
);

create index if not exists idx_user_food_history_recent
  on public.user_food_history (user_id, last_used_at desc);

alter table public.user_food_history enable row level security;

-- 5. Hybrid Hebrew + pg_trgm + Pick Count SQL RPC (single round-trip, relevance-first)
create or replace function public.search_food_catalog_hybrid(
  q_raw text default '',
  q_norm text default '',
  source_mode text default 'all',
  source_site text default null,
  max_rows integer default 36
)
returns table (
  id text,
  name text,
  brand text,
  category text,
  barcode text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  units jsonb,
  source text,
  source_site_id text,
  source_site_name text,
  source_url text,
  updated_at timestamptz,
  pick_count integer,
  relevance_score double precision
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_limit integer := least(60, greatest(1, coalesce(max_rows, 36)));
  v_raw text := btrim(coalesce(q_raw, ''));
  v_clean text;
  v_like text;
  v_tsq_text text;
  v_tsq tsquery := null;
  v_char_len integer;
  v_site text := nullif(btrim(coalesce(source_site, '')), '');
  v_mode text := coalesce(nullif(btrim(source_mode), ''), 'all');
begin
  v_clean := btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(nullif(q_norm, ''), v_raw)), '[''"`׳״\-–—,.()/\\_%:;]+', ' ', 'g'),
      '\s+',
      ' ',
      'g'
    )
  );
  v_like := replace(replace(replace(v_clean, '\', '\\'), '%', '\%'), '_', '\_');
  v_char_len := length(replace(v_clean, ' ', ''));

  -- Build safe prefix tsquery using stripped Hebrew + alphanumeric tokens
  select string_agg(clean_tok || ':*', ' & ')
  into v_tsq_text
  from (
    select regexp_replace(tok, '[^a-z0-9א-ת]', '', 'g') as clean_tok
    from unnest(string_to_array(v_clean, ' ')) as t(tok)
    limit 5
  ) sub
  where clean_tok <> '';

  if v_tsq_text is not null and v_tsq_text <> '' then
    v_tsq := to_tsquery('simple', v_tsq_text);
  end if;

  -- A) Numeric Barcode Lookup (B-Tree fast path)
  if v_raw ~ '^[0-9]{6,16}$' then
    return query
    select
      f.id, f.name, f.brand, f.category, f.barcode,
      f.calories, f.protein, f.carbs, f.fat, f.units,
      f.source, f.source_site_id, f.source_site_name, f.source_url,
      f.updated_at, f.pick_count,
      (case
        when f.barcode = v_raw or f.id = ('shufersal-P_' || v_raw) or f.id = ('openfoodfacts-' || v_raw)
          then 150.0
        else 90.0
      end + ln(1.0 + greatest(0, f.pick_count)) * 4.0)::double precision as relevance_score
    from public.food_catalog_items f
    where
      (
        f.barcode = v_raw
        or f.id = ('shufersal-P_' || v_raw)
        or f.id = ('openfoodfacts-' || v_raw)
        or f.name_norm like ('%' || v_raw || '%')
      )
      and (v_site is null or f.source_site_id = v_site)
    order by relevance_score desc, f.pick_count desc, f.updated_at desc
    limit v_limit;
    return;
  end if;

  -- B) Empty Browse Query (diversified popular + recent items)
  if v_clean = '' then
    return query
    with base as (
      select
        f.*,
        (50.0 + ln(1.0 + greatest(0, f.pick_count)) * 10.0)::double precision as base_score,
        row_number() over (
          partition by coalesce(f.source_site_id, f.source, 'other')
          order by f.pick_count desc, f.updated_at desc
        ) as site_rank
      from public.food_catalog_items f
      where
        (v_site is null or f.source_site_id = v_site)
        and (
          v_mode = 'all'
          or (v_mode = 'retail' and coalesce(f.source_site_id, '') <> 'moh_gov' and coalesce(f.source, '') <> 'moh')
          or (v_mode = 'moh_gov' and (f.source_site_id = 'moh_gov' or f.source = 'moh'))
          or (v_mode = 'openfoodfacts' and f.source_site_id = 'openfoodfacts')
        )
    )
    select
      b.id, b.name, b.brand, b.category, b.barcode,
      b.calories, b.protein, b.carbs, b.fat, b.units,
      b.source, b.source_site_id, b.source_site_name, b.source_url,
      b.updated_at, b.pick_count,
      (b.base_score - (b.site_rank - 1) * 5.0)::double precision as relevance_score
    from base b
    order by (b.site_rank <= 5) desc, relevance_score desc, b.updated_at desc
    limit v_limit;
    return;
  end if;

  -- C) Very short query (1-2 chars): use FTS prefix GIN + text_pattern_ops B-tree (no slow trigram scans)
  if v_char_len <= 2 then
    return query
    with matches as (
      select
        f.*,
        (
          case
            when f.name_norm = v_clean then 120.0
            when f.name_norm like (v_like || ' %') escape '\' then 92.0
            when f.name_norm like (v_like || '%') escape '\' then 78.0
            else 42.0
          end
          + case
              when v_tsq is not null and f.search_tsv @@ v_tsq
                then 45.0 * ts_rank_cd('{0.1, 0.2, 0.5, 1.0}'::float4[], f.search_tsv, v_tsq)
              else 0.0
            end
          + 7.0 * ln(1.0 + greatest(0, f.pick_count))
          - least(12.0, greatest(0, length(f.name_norm) - length(v_clean)) * 0.15)
        )::double precision as raw_score
      from public.food_catalog_items f
      where
        (
          (v_tsq is not null and f.search_tsv @@ v_tsq)
          or f.name_norm like (v_like || '%') escape '\'
        )
        and (v_site is null or f.source_site_id = v_site)
        and (
          v_mode = 'all'
          or (v_mode = 'retail' and coalesce(f.source_site_id, '') <> 'moh_gov' and coalesce(f.source, '') <> 'moh')
          or (v_mode = 'moh_gov' and (f.source_site_id = 'moh_gov' or f.source = 'moh'))
          or (v_mode = 'openfoodfacts' and f.source_site_id = 'openfoodfacts')
        )
      limit 350
    ),
    diversified as (
      select
        m.*,
        row_number() over (
          partition by coalesce(m.source_site_id, m.source, 'other')
          order by m.raw_score desc
        ) as site_rank
      from matches m
    )
    select
      d.id, d.name, d.brand, d.category, d.barcode,
      d.calories, d.protein, d.carbs, d.fat, d.units,
      d.source, d.source_site_id, d.source_site_name, d.source_url,
      d.updated_at, d.pick_count,
      (d.raw_score - (d.site_rank - 1) * 4.0)::double precision as relevance_score
    from diversified d
    order by relevance_score desc
    limit v_limit;
    return;
  end if;

  -- D) Full Hybrid Search (>= 3 chars): FTS ('simple' + Hebrew prefix tokens) + pg_trgm typo tolerance + Popularity
  perform set_limit(0.18);

  return query
  with matches as (
    select
      f.*,
      (
        case
          when f.name_norm = v_clean then 120.0
          when f.name_norm like (v_like || ' %') escape '\' then 92.0
          when f.name_norm like (v_like || '%') escape '\' then 78.0
          when f.name_norm like ('%' || v_like || '%') escape '\' then 56.0
          else 0.0
        end
        + case
            when v_tsq is not null and f.search_tsv @@ v_tsq
              then 55.0 * ts_rank_cd('{0.1, 0.2, 0.5, 1.0}'::float4[], f.search_tsv, v_tsq)
            else 0.0
          end
        + 35.0 * coalesce(word_similarity(v_clean, f.name_norm), 0.0)
        + 7.0 * ln(1.0 + greatest(0, f.pick_count))
        - least(12.0, greatest(0, length(f.name_norm) - length(v_clean)) * 0.15)
      )::double precision as raw_score
    from public.food_catalog_items f
    where
      (
        (v_tsq is not null and f.search_tsv @@ v_tsq)
        or f.name_norm like (v_like || '%') escape '\'
        or f.name_norm % v_clean
      )
      and (v_site is null or f.source_site_id = v_site)
      and (
        v_mode = 'all'
        or (v_mode = 'retail' and coalesce(f.source_site_id, '') <> 'moh_gov' and coalesce(f.source, '') <> 'moh')
        or (v_mode = 'moh_gov' and (f.source_site_id = 'moh_gov' or f.source = 'moh'))
        or (v_mode = 'openfoodfacts' and f.source_site_id = 'openfoodfacts')
      )
    limit 400
  ),
  diversified as (
    select
      m.*,
      row_number() over (
        partition by coalesce(m.source_site_id, m.source, 'other')
        order by m.raw_score desc
      ) as site_rank
    from matches m
    where m.raw_score > 6.0
  )
  select
    d.id, d.name, d.brand, d.category, d.barcode,
    d.calories, d.protein, d.carbs, d.fat, d.units,
    d.source, d.source_site_id, d.source_site_name, d.source_url,
    d.updated_at, d.pick_count,
    (d.raw_score - (d.site_rank - 1) * 4.5)::double precision as relevance_score
  from diversified d
  order by relevance_score desc
  limit v_limit;
end;
$$;

-- 6. Batch Popularity Counter RPC
create or replace function public.increment_food_pick_counts(food_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if food_ids is null or array_length(food_ids, 1) is null then
    return 0;
  end if;

  update public.food_catalog_items
  set pick_count = coalesce(pick_count, 0) + 1
  where id = any(food_ids);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- 7. Atomic Per-User Food History Upsert + Prune (keeps latest 120 items per user) + Global Pick Count
create or replace function public.record_user_food_history_batch(
  p_user_id text,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved integer := 0;
  v_catalog_ids text[];
begin
  if coalesce(btrim(p_user_id), '') = '' or p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;

  with raw_incoming as (
    select
      nullif(btrim(el->>'foodKey'), '') as food_key,
      nullif(btrim(el->>'catalogId'), '') as catalog_id,
      left(coalesce(nullif(btrim(el->>'name'), ''), 'מוצר'), 180) as name,
      left(coalesce(btrim(el->>'brand'), ''), 100) as brand,
      left(coalesce(btrim(el->>'category'), ''), 100) as category,
      nullif(regexp_replace(coalesce(el->>'barcode', ''), '[^0-9]', '', 'g'), '') as barcode,
      greatest(0, least(950, coalesce((el->>'calories')::numeric, 0))) as calories,
      greatest(0, least(100, coalesce((el->>'protein')::numeric, 0))) as protein,
      greatest(0, least(100, coalesce((el->>'carbs')::numeric, 0))) as carbs,
      greatest(0, least(100, coalesce((el->>'fat')::numeric, 0))) as fat,
      case when jsonb_typeof(el->'units') = 'array' then el->'units' else '[]'::jsonb end as units,
      nullif(btrim(el->>'lastUnitLabel'), '') as last_unit_label,
      case when (el->>'lastGrams') is not null then greatest(1, least(5000, (el->>'lastGrams')::numeric)) else null end as last_grams,
      coalesce(nullif(btrim(el->>'source'), ''), 'catalog') as source,
      nullif(btrim(el->>'sourceSiteId'), '') as source_site_id,
      nullif(btrim(el->>'sourceSiteName'), '') as source_site_name,
      nullif(btrim(el->>'sourceUrl'), '') as source_url,
      case when el->>'actionKind' in ('picked', 'barcode', 'logged') then el->>'actionKind' else 'picked' end as action_kind
    from jsonb_array_elements(p_items) as el
    limit 20
  ),
  incoming as (
    select distinct on (food_key) *
    from raw_incoming
    where food_key is not null and (calories > 0 or protein > 0 or carbs > 0 or fat > 0)
  ),
  upserted as (
    insert into public.user_food_history (
      user_id, food_key, catalog_id, name, brand, category, barcode,
      calories, protein, carbs, fat, units, last_unit_label, last_grams,
      source, source_site_id, source_site_name, source_url,
      action_kind, use_count, last_used_at
    )
    select
      p_user_id, food_key, catalog_id, name, brand, category, barcode,
      calories, protein, carbs, fat, units, last_unit_label, last_grams,
      source, source_site_id, source_site_name, source_url,
      action_kind, 1, now()
    from incoming
    on conflict (user_id, food_key) do update set
      catalog_id = coalesce(excluded.catalog_id, user_food_history.catalog_id),
      name = excluded.name,
      brand = case when excluded.brand <> '' then excluded.brand else user_food_history.brand end,
      category = case when excluded.category <> '' then excluded.category else user_food_history.category end,
      barcode = coalesce(excluded.barcode, user_food_history.barcode),
      calories = excluded.calories,
      protein = excluded.protein,
      carbs = excluded.carbs,
      fat = excluded.fat,
      units = case when jsonb_array_length(excluded.units) > 0 then excluded.units else user_food_history.units end,
      last_unit_label = coalesce(excluded.last_unit_label, user_food_history.last_unit_label),
      last_grams = coalesce(excluded.last_grams, user_food_history.last_grams),
      source = excluded.source,
      source_site_id = coalesce(excluded.source_site_id, user_food_history.source_site_id),
      source_site_name = coalesce(excluded.source_site_name, user_food_history.source_site_name),
      source_url = coalesce(excluded.source_url, user_food_history.source_url),
      action_kind = case
        when user_food_history.action_kind = 'barcode' or excluded.action_kind = 'barcode' then 'barcode'
        else excluded.action_kind
      end,
      use_count = user_food_history.use_count + 1,
      last_used_at = now()
    returning catalog_id
  )
  select count(*), array_agg(catalog_id) filter (where catalog_id is not null)
  into v_saved, v_catalog_ids
  from upserted;

  -- Increment global popularity counters for matched catalog items
  if v_catalog_ids is not null and array_length(v_catalog_ids, 1) > 0 then
    perform public.increment_food_pick_counts(v_catalog_ids);
  end if;

  -- Prune per-user history beyond top 120 most recently used items (Free-Tier storage guard)
  delete from public.user_food_history
  where user_id = p_user_id
    and food_key in (
      select food_key
      from public.user_food_history
      where user_id = p_user_id
      order by last_used_at desc
      offset 120
    );

  return v_saved;
end;
$$;

-- Restrict mutating/private RPCs strictly to server-side Service Role Key
revoke all on function public.increment_food_pick_counts(text[]) from public, anon, authenticated;
grant execute on function public.increment_food_pick_counts(text[]) to service_role;

revoke all on function public.record_user_food_history_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_user_food_history_batch(text, jsonb) to service_role;

grant execute on function public.search_food_catalog_hybrid(text, text, text, text, integer) to service_role, anon, authenticated;

notify pgrst, 'reload schema';
