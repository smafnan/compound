-- Compound — trigger functions are not API endpoints.
--
-- Postgres grants EXECUTE on new functions to PUBLIC, so the two trigger
-- functions from the previous migration showed up as callable RPCs
-- (/rest/v1/rpc/devices_prune). Calling one directly only errors, but they
-- have no business being exposed. Triggers keep firing without EXECUTE:
-- the privilege is checked when a trigger is created, not when it runs.
--
-- delete_user() stays callable by signed-in users on purpose: it is the
-- in-app "Delete account", it can only delete the caller, and it demands
-- an aal2 session when 2FA is on. The Security Advisor will keep listing
-- it (lint 0029) — that entry is expected.

revoke execute on function public.devices_prune() from public, anon, authenticated;
revoke execute on function public.app_state_stamp() from public, anon, authenticated;
