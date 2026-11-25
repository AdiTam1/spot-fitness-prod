-- =====================================================================
-- SPOT FITNESS — Semantic Hybrid Food Search (pgvector halfvec + RRF)
-- Safe to re-run (idempotent) | Optimized for Supabase Free Tier (500 MB)
-- Preserves existing lexical search completely when semantic mode is OFF
-- =====================================================================

-- 1. Enable pgvector extension (works seamlessly whether Supabase places extensions in 'extensions' or 'public')
create extension if not exists vector;

-- 2. Add compact 16-bit halfvec(768) embedding column to food_catalog_items
alter table public.food_catalog_items
  add column if not exists embedding halfvec(768);
alter table public.food_catalog_items
  add column if not exists embedding_updated_at timestamptz;

-- HNSW index using halfvec cosine distance (~50% smaller than float32 vector)
create index if not exists idx_food_catalog_embedding_hnsw
  on public.food_catalog_items
  using hnsw (embedding halfvec_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Partial index to quickly find rows still missing embeddings for cron/backfill
create index if not exists idx_food_catalog_missing_embedding
  on public.food_catalog_items (pick_count desc, updated_at desc)
  where embedding is null;

-- Reset embedding cleanly only if name or brand actually changed on update
create or replace function public.food_catalog_invalidate_stale_embedding()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name or new.brand is distinct from old.brand then
    new.embedding := null;
    new.embedding_updated_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_catalog_invalidate_embedding on public.food_catalog_items;
create trigger trg_food_catalog_invalidate_embedding
before update of name, brand on public.food_catalog_items
for each row execute function public.food_catalog_invalidate_stale_embedding();

-- 3. Persistent Query Embedding Cache (prevents repeated Gemini API calls across users)
create table if not exists public.search_query_embeddings (
  query_norm text primary key,
  query_raw text not null default '',
  embedding halfvec(768) not null,
  hit_count integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists idx_search_query_embeddings_hits
  on public.search_query_embeddings (hit_count desc, updated_at desc);

alter table public.search_query_embeddings enable row level security;

drop policy if exists "Allow public read query embeddings cache" on public.search_query_embeddings;
create policy "Allow public read query embeddings cache"
  on public.search_query_embeddings for select using (true);

-- 4. Helper RPCs for batch embedding writes & query cache (safe SECURITY DEFINER)
create or replace function public.upsert_food_catalog_embeddings(
  p_ids text[],
  p_vectors text[]
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_updated integer := 0;
begin
  if p_ids is null or p_vectors is null then
    return 0;
  end if;

  with pairs as (
    select
      u.id,
      u.vec_text
    from unnest(p_ids, p_vectors) as u(id, vec_text)
    where coalesce(btrim(u.id), '') <> ''
      and coalesce(btrim(u.vec_text), '') <> ''
  )
  update public.food_catalog_items f
  set
    embedding = (p.vec_text)::halfvec(768),
    embedding_updated_at = now()
  from pairs p
  where f.id = p.id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.get_food_catalog_semantic_stats()
returns table (
  total_count bigint,
  embedded_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    count(*)::bigint as total_count,
    count(embedding)::bigint as embedded_count
  from public.food_catalog_items;
$$;

create or replace function public.get_cached_query_embedding(p_query_norm text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_norm text := btrim(coalesce(p_query_norm, ''));
  v_vec_text text;
begin
  if v_norm = '' then
    return null;
  end if;

  select embedding::text
  into v_vec_text
  from public.search_query_embeddings
  where query_norm = v_norm;

  if v_vec_text is not null then
    update public.search_query_embeddings
    set hit_count = coalesce(hit_count, 0) + 1,
        updated_at = now()
    where query_norm = v_norm;
  end if;

  return v_vec_text;
end;
$$;

create or replace function public.upsert_cached_query_embedding(
  p_query_norm text,
  p_query_raw text,
  p_vector_text text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_norm text := btrim(coalesce(p_query_norm, ''));
begin
  if v_norm = '' or coalesce(btrim(p_vector_text), '') = '' then
    return false;
  end if;

  insert into public.search_query_embeddings (query_norm, query_raw, embedding, hit_count, updated_at)
  values (
    left(v_norm, 120),
    left(coalesce(p_query_raw, v_norm), 160),
    (p_vector_text)::halfvec(768),
    1,
    now()
  )
  on conflict (query_norm) do update
  set
    query_raw = excluded.query_raw,
    embedding = excluded.embedding,
    hit_count = public.search_query_embeddings.hit_count + 1,
    updated_at = now();

  return true;
end;
$$;

-- 5. Upgrade search_food_catalog_hybrid:
--    - Supports brand_terms filter directly inside the hybrid RPC
--    - Keeps 100% existing lexical fast-path when query_embedding_text is NULL
--    - Performs True Hybrid Search (Lexical + halfvec HNSW via RRF) when query_embedding_text is provided
drop function if exists public.search_food_catalog_hybrid(text, text, text, text, integer);

create or replace function public.search_food_catalog_hybrid(
  q_raw text default '',
  q_norm text default '',
  source_mode text default 'all',
  source_site text default null,
  max_rows integer default 36,
  brand_terms text[] default null,
  query_embedding_text text default null,
  semantic_weight double precision default 0.0
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
  v_has_brand boolean := brand_terms is not null and array_length(brand_terms, 1) is not null;
  v_brand_patterns text[] := null;
  v_qvec halfvec(768) := null;
  v_sem_weight double precision := greatest(0.0, coalesce(semantic_weight, 0.0));
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

  if v_has_brand then
    select array_agg('%' || replace(replace(replace(lower(btrim(t)), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into v_brand_patterns
    from unnest(brand_terms) as t
    where btrim(t) <> '';
    if v_brand_patterns is null or array_length(v_brand_patterns, 1) is null then
      v_has_brand := false;
    end if;
  end if;

  if coalesce(btrim(query_embedding_text), '') <> '' and v_sem_weight > 0 then
    v_qvec := (btrim(query_embedding_text))::halfvec(768);
  end if;

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
      and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
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
        and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
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

  -- C) Very short query (1-2 chars): fast FTS prefix GIN + text_pattern_ops B-tree
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
        and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
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

  -- D1) Pure Lexical Hybrid Path (>= 3 chars, when semantic vectors are OFF or not escalated)
  if v_qvec is null or v_sem_weight <= 0 then
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
        and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
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
    return;
  end if;

  -- D2) Semantic Hybrid RRF Path (Lexical FTS/pg_trgm + halfvec HNSW Vector Fusion)
  perform set_limit(0.18);

  return query
  with lexical_raw as (
    select
      f.id,
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
      )::double precision as lex_score
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
      and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
    order by lex_score desc
    limit 120
  ),
  lexical_ranked as (
    select
      l.id,
      l.lex_score,
      row_number() over (order by l.lex_score desc) as lex_rank
    from lexical_raw l
    where l.lex_score > 6.0
  ),
  semantic_raw as (
    select
      f.id,
      (1.0 - (f.embedding <=> v_qvec))::double precision as sem_sim
    from public.food_catalog_items f
    where
      f.embedding is not null
      and (v_site is null or f.source_site_id = v_site)
      and (
        v_mode = 'all'
        or (v_mode = 'retail' and coalesce(f.source_site_id, '') <> 'moh_gov' and coalesce(f.source, '') <> 'moh')
        or (v_mode = 'moh_gov' and (f.source_site_id = 'moh_gov' or f.source = 'moh'))
        or (v_mode = 'openfoodfacts' and f.source_site_id = 'openfoodfacts')
      )
      and (not v_has_brand or lower(coalesce(f.brand, '')) like any(v_brand_patterns) or f.name_norm like any(v_brand_patterns))
    order by f.embedding <=> v_qvec asc
    limit 80
  ),
  semantic_ranked as (
    select
      s.id,
      s.sem_sim,
      row_number() over (order by s.sem_sim desc) as sem_rank
    from semantic_raw s
    where s.sem_sim >= 0.44
  ),
  fused as (
    select
      coalesce(lr.id, sr.id) as id,
      coalesce(lr.lex_score, 0.0) as lex_score,
      coalesce(sr.sem_sim, 0.0) as sem_sim,
      (
        -- RRF (Reciprocal Rank Fusion, k = 50) scaled cleanly onto 0..100+ range
        (case when lr.lex_rank is not null then (1.0 / (50.0 + lr.lex_rank)) * 2200.0 else 0.0 end)
        + (case when sr.sem_rank is not null then (1.0 / (50.0 + sr.sem_rank)) * (1800.0 * v_sem_weight) else 0.0 end)
        + (case when coalesce(lr.lex_score, 0.0) >= 78.0 then 35.0 else 0.0 end)
        + (case when coalesce(sr.sem_sim, 0.0) >= 0.72 then 16.0 else 0.0 end)
      )::double precision as base_fused
    from lexical_ranked lr
    full outer join semantic_ranked sr on lr.id = sr.id
  ),
  scored as (
    select
      f.*,
      (
        fu.base_fused
        + 4.5 * ln(1.0 + greatest(0, f.pick_count))
        - least(8.0, greatest(0, length(f.name_norm) - length(v_clean)) * 0.08)
      )::double precision as combined_score,
      row_number() over (
        partition by coalesce(f.source_site_id, f.source, 'other')
        order by fu.base_fused desc, f.pick_count desc
      ) as site_rank
    from fused fu
    join public.food_catalog_items f on f.id = fu.id
  )
  select
    sc.id, sc.name, sc.brand, sc.category, sc.barcode,
    sc.calories, sc.protein, sc.carbs, sc.fat, sc.units,
    sc.source, sc.source_site_id, sc.source_site_name, sc.source_url,
    sc.updated_at, sc.pick_count,
    (sc.combined_score - (sc.site_rank - 1) * 3.5)::double precision as relevance_score
  from scored sc
  order by relevance_score desc
  limit v_limit;
end;
$$;

notify pgrst, 'reload schema';
