-- Compound — auth & sync hardening.
--
-- Safe to run more than once, and safe against a database created from the
-- original schema.sql (or by hand). Run it in the Supabase SQL editor, or
-- with `supabase db push`.
--
-- What it does:
--   1. app_state: server-owned `version` + `synced_at`, a size cap and a
--      shape check, and a trigger that maintains them on EVERY write — so
--      even old clients that upsert directly bump the version.
--   2. save_state(): compare-and-swap write. A device that saves on top of a
--      copy it hasn't seen gets `ok = false` back instead of silently
--      overwriting another device's edits; it re-pulls, merges, retries.
--   3. Two-factor is enforced by the database: once a user has a verified
--      TOTP factor, their rows are only reachable with an aal2 session.
--   4. devices: the table the app already uses, now in the schema with RLS,
--      column limits and a per-user cap.
--   5. RLS policies scoped `to authenticated` and written with
--      `(select auth.uid())` so Postgres evaluates it once per statement.
--   6. delete_user() refuses an aal1 session when 2FA is on.

begin;

-- ---------------------------------------------------------------- app_state

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state add column if not exists version bigint not null default 0;
alter table public.app_state add column if not exists synced_at timestamptz not null default now();
alter table public.app_state add column if not exists created_at timestamptz not null default now();

-- `not valid`: enforced on every new write, without failing the migration
-- on some pre-existing row
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_state_data_is_object') then
    alter table public.app_state
      add constraint app_state_data_is_object check (jsonb_typeof(data) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_state_data_size') then
    -- ~2 MB of JSON: years of heavy use is a few hundred KB; this only stops
    -- the table being used as free blob storage with the public key
    alter table public.app_state
      add constraint app_state_data_size check (octet_length(data::text) <= 2000000) not valid;
  end if;
end $$;

-- the server, not the client, owns version and synced_at
create or replace function public.app_state_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.synced_at := now();
  -- the content stamp is the client's, but a wildly fast clock must not
  -- be able to pin the row "in the future"
  new.updated_at := least(coalesce(new.updated_at, now()), now() + interval '5 minutes');
  return new;
end $$;

drop trigger if exists app_state_stamp on public.app_state;
create trigger app_state_stamp
  before insert or update on public.app_state
  for each row execute function public.app_state_stamp();

alter table public.app_state enable row level security;

drop policy if exists "own state select" on public.app_state;
drop policy if exists "own state insert" on public.app_state;
drop policy if exists "own state update" on public.app_state;
drop policy if exists "own state delete" on public.app_state;
drop policy if exists "mfa when enrolled" on public.app_state;

create policy "own state select" on public.app_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state insert" on public.app_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state update" on public.app_state
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own state delete" on public.app_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Restrictive: ANDed with the policies above. Users without a verified
-- factor are unaffected; users with one need an aal2 (password + code) JWT.
create policy "mfa when enrolled" on public.app_state
  as restrictive for all to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

revoke all on public.app_state from anon;

-- Compare-and-swap save. Runs as the caller, so every policy above applies.
-- p_base_version is the version this device last saw (0 = "no row yet").
create or replace function public.save_state(
  p_data jsonb,
  p_base_version bigint,
  p_updated_at timestamptz default null
)
returns table (ok boolean, version bigint, server_now timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cur bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select s.version into v_cur
  from public.app_state s
  where s.user_id = v_uid
  for update;

  if not found then
    if p_base_version <> 0 then
      -- the device thinks a row exists that doesn't (deleted elsewhere):
      -- make it re-pull rather than guess
      return query select false, 0::bigint, now();
      return;
    end if;
    insert into public.app_state (user_id, data, updated_at)
    values (v_uid, p_data, p_updated_at)
    on conflict (user_id) do nothing;
    if not found then
      -- another device created the row a moment ago
      return query select false, s.version, now() from public.app_state s where s.user_id = v_uid;
      return;
    end if;
    return query select true, 1::bigint, now();
    return;
  end if;

  if v_cur <> p_base_version then
    return query select false, v_cur, now();
    return;
  end if;

  update public.app_state s
  set data = p_data, updated_at = p_updated_at
  where s.user_id = v_uid;

  return query select true, v_cur + 1, now();
end $$;

revoke execute on function public.save_state(jsonb, bigint, timestamptz) from anon, public;
grant execute on function public.save_state(jsonb, bigint, timestamptz) to authenticated;

-- live sync needs the table in the realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
     ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

-- ------------------------------------------------------------------ devices

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_key text not null,
  label text not null default '',
  platform text not null default '',
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'devices' and indexname = 'devices_user_device_key'
  ) and not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'devices' and c.contype = 'u'
  ) then
    create unique index devices_user_device_key on public.devices (user_id, device_key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'devices_field_lengths') then
    alter table public.devices add constraint devices_field_lengths check (
      char_length(device_key) <= 128 and char_length(label) <= 120 and char_length(platform) <= 60
    ) not valid;
  end if;
end $$;

-- a user can't grow the table without bound with random device keys:
-- keep their 25 most recently seen devices
create or replace function public.devices_prune()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.devices d
  where d.user_id = new.user_id
    and d.id not in (
      select k.id from public.devices k
      where k.user_id = new.user_id
      order by k.last_seen desc
      limit 25
    );
  return null;
end $$;

drop trigger if exists devices_prune on public.devices;
create trigger devices_prune
  after insert on public.devices
  for each row execute function public.devices_prune();

alter table public.devices enable row level security;

drop policy if exists "own devices select" on public.devices;
drop policy if exists "own devices insert" on public.devices;
drop policy if exists "own devices update" on public.devices;
drop policy if exists "own devices delete" on public.devices;
drop policy if exists "devices mfa when enrolled" on public.devices;

create policy "own devices select" on public.devices
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own devices insert" on public.devices
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own devices update" on public.devices
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own devices delete" on public.devices
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "devices mfa when enrolled" on public.devices
  as restrictive for all to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where user_id = (select auth.uid()) and status = 'verified'
    )
  );

revoke all on public.devices from anon;

-- ------------------------------------------------------------ delete_user

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  -- a stolen password alone must not be able to wipe a 2FA account
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'two-factor verification required' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end $$;

revoke execute on function public.delete_user() from anon, public;
grant execute on function public.delete_user() to authenticated;

commit;
