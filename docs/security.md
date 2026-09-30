# Accounts, sync & security

How Compound stores data and keeps accounts safe, and the Supabase settings that SQL can't
configure.

## Data model

| Table | What it holds | Who can touch it |
| --- | --- | --- |
| `app_state` | One row per user: the whole app state as JSON, plus `version`, `updated_at` (content stamp), `synced_at`, `created_at`. | The owning user only. If the user has 2FA on, only an `aal2` (password + code) session. |
| `devices` | Places the account has been used, shown under **Security → Devices**. Capped at 25 per user. | Same as above. |

Row-level security is on for both tables, policies are scoped `to authenticated`, and `anon`
has no table access at all. `app_state.data` must be a JSON object of 2 MB or less.

## How sync stays consistent

1. **Every device keeps a full local copy**, so the app works offline, and every edit is saved
   locally first.
2. **Saves are compare-and-swap.** `save_state(data, base_version)` only writes if the row is
   still at the version this device last merged. Otherwise it refuses, and the device pulls,
   merges and retries (`src/cloud.ts`). A database trigger owns `version`, so clients can't
   forge it, and old app builds that still upsert directly bump it too.
3. **Merges never drop edits.** Each section (deadlines, tasks, …) goes to the side that edited
   *that section* most recently, and checklist days, challenge slots and focus sessions merge
   day-by-day or by id (`mergeStates` in `src/lib.ts`).
4. **Edits are stamped with the server's time.** Each save returns the server's clock, so a
   phone whose clock is wrong can't win every conflict. The database also clamps content stamps
   more than 5 minutes in the future.
5. **Data never crosses accounts.** The device remembers which account its data belongs to. If
   a different account signs in, the local copy is replaced, not merged.
6. **A failed read is never treated as "no data".** Only a confirmed empty result counts as a
   brand-new account.

`npm test` runs the migration against Postgres (PGlite) and simulates concurrent devices
against the sync engine.

## Deploying a schema change

1. Run the new file(s) in `supabase/migrations/` (SQL editor, or `supabase db push`). They are
   idempotent and backward-compatible: builds from before the migration keep syncing.
2. Then ship the app. The new client detects an old database and falls back to the plain upsert
   until the migration is in, so the order is forgiving, but migrating first is what gives you
   conflict detection.

> Once the 2FA policy is live, a user who has 2FA turned on needs a build that asks for the
> code. Older builds will stop syncing for that user until they update, which is the point.

## Supabase dashboard checklist

These are Auth settings, not SQL. Set them once per project.

**Authentication → Sign In / Providers → Email**
- [ ] *Confirm email*: **on**
- [ ] *Secure email change*: **on** (confirm on both old and new address)
- [ ] *Secure password change*: **on**. A session older than 24 h must re-verify by emailed code
      before changing the password. The app handles the prompt.
- [ ] *Minimum password length*: **8**, matching `MIN_PASSWORD` in `src/Account.tsx`
- [ ] *Password requirements*: letters and digits
- [ ] *Leaked password protection* (HaveIBeenPwned): **on** if your plan includes it

**Authentication → Multi-Factor**
- [ ] TOTP: **enabled**

**Authentication → Sessions**
- [ ] *Detect and revoke compromised refresh tokens*: **on**, reuse interval 10 s

**Authentication → URL Configuration**
- [ ] *Site URL*: `https://compoundtracker.netlify.app`
- [ ] *Redirect URLs*: only the exact origins the app uses (the Site URL and local dev). Avoid
      broad wildcards.

**Authentication → Rate Limits / Attack Protection**
- [ ] Keep the default rate limits. If bot sign-ups appear, turn on CAPTCHA (Turnstile or
      hCaptcha). That also needs a small client change to pass the token.

**Advisors**
- [ ] Run **Security Advisor** and **Performance Advisor** after each migration. Both should be
      clean for `app_state` and `devices`. One entry is expected and intentional:
      *"Signed-In Users Can Execute SECURITY DEFINER Function: `public.delete_user()`"* (lint
      0029). That function is the in-app account deletion. It can only delete the caller and
      requires aal2 when 2FA is on.

## Client hardening already in place

- **Web:** a strict CSP in `index.html`, plus `public/_headers` for clickjacking protection
  (`frame-ancestors 'none'`), `nosniff`, a referrer policy, a permissions policy and HSTS.
- **Desktop (Electron):**
  - context isolation, sandbox, no Node in the page, and a minimal preload bridge
  - links open externally only for `https`/`http`/`mailto`
  - the window can only navigate to the app itself and the sign-in round trip
  - camera, microphone and location permissions are refused
- **Auth:**
  - a 2FA login step, and the database refuses aal1 sessions for users who have 2FA
  - re-authentication before password changes
  - `delete_user()` requires aal2 when 2FA is on
  - "Log out & clear this device" for shared computers
- **Key:** the Supabase publishable key in `src/cloud.ts` is public by design. RLS protects
  the data, not the key. Never put the `service_role` key in the app.
