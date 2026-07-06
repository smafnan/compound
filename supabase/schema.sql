-- Compound cloud sync — run this once in your Supabase project's SQL editor.
-- One row per user holding their whole app state as JSON.

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- users can only ever touch their own row
create policy "own state select" on public.app_state
  for select using (auth.uid() = user_id);
create policy "own state insert" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "own state update" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own state delete" on public.app_state
  for delete using (auth.uid() = user_id);
