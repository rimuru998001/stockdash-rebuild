create table if not exists public.user_stock_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_name text not null default '自訂清單',
  stocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, list_name)
);

alter table public.user_stock_lists enable row level security;

drop policy if exists "Users can read own stock lists" on public.user_stock_lists;
drop policy if exists "Users can insert own stock lists" on public.user_stock_lists;
drop policy if exists "Users can update own stock lists" on public.user_stock_lists;
drop policy if exists "Users can delete own stock lists" on public.user_stock_lists;

create policy "Users can read own stock lists"
on public.user_stock_lists
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own stock lists"
on public.user_stock_lists
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own stock lists"
on public.user_stock_lists
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own stock lists"
on public.user_stock_lists
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_stock_lists_updated_at on public.user_stock_lists;

create trigger set_user_stock_lists_updated_at
before update on public.user_stock_lists
for each row
execute function public.set_updated_at();
