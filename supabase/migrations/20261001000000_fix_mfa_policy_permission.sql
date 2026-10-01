-- Compound — fix: every read and write of app_state / devices returned 403.
--
-- The "mfa when enrolled" policies (20260930000000) looked up
-- auth.mfa_factors directly. Signed-in users have no SELECT on that table
-- in Supabase, so evaluating the policy failed with "permission denied for
-- table mfa_factors" — and with it every request: sync and the device list
-- stopped working entirely.
--
-- The check now goes through a SECURITY DEFINER helper that can read the
-- table but only ever answers for the caller. It lives in a `private`
-- schema, which the Data API does not expose, so it isn't an RPC endpoint.
--
-- Safe to run more than once.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Does the signed-in user have a verified authenticator? Takes no
-- argument on purpose: it can't be asked about anyone else.
create or replace function private.caller_has_verified_factor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = (select auth.uid()) and f.status = 'verified'
  );
$$;

revoke execute on function private.caller_has_verified_factor() from public, anon;
grant execute on function private.caller_has_verified_factor() to authenticated;

-- Same rule as before — users with 2FA need an aal2 session — minus the
-- direct table read.
drop policy if exists "mfa when enrolled" on public.app_state;
create policy "mfa when enrolled" on public.app_state
  as restrictive for all to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    or not (select private.caller_has_verified_factor())
  );

drop policy if exists "devices mfa when enrolled" on public.devices;
create policy "devices mfa when enrolled" on public.devices
  as restrictive for all to authenticated
  using (
    (select auth.jwt() ->> 'aal') = 'aal2'
    or not (select private.caller_has_verified_factor())
  );

commit;
