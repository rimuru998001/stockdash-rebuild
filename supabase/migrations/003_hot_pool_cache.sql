create table if not exists public.hot_pool_cache (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text,
  rank integer,
  source text,
  pool_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists hot_pool_cache_pool_date_rank_idx
on public.hot_pool_cache (pool_date, rank);

create index if not exists hot_pool_cache_pool_date_symbol_idx
on public.hot_pool_cache (pool_date, symbol);
