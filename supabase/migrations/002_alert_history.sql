create table if not exists public.alert_history (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text,
  final_category text,
  final_score integer,
  alert_type text not null,
  batch integer,
  created_at timestamptz default now()
);

create index if not exists alert_history_symbol_created_at_idx
on public.alert_history (symbol, created_at desc);

create index if not exists alert_history_created_at_idx
on public.alert_history (created_at desc);
