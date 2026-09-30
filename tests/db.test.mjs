// Database tests: runs supabase/migrations/* against PGlite (Postgres in
// WebAssembly) with a minimal stand-in for Supabase's auth schema, then
// checks every rule as the real `authenticated` / `anon` roles.
//   npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const MIGRATION = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n')
const db = new PGlite()

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ', name) } else { fail++; console.log('  FAIL ', name, extra) }
}
async function throws(name, fn, re) {
  try { await fn(); ok(name, false, '(no error)') } catch (e) { ok(name, !re || re.test(e.message), e.message) }
}

// ---- Supabase stand-in ----
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, status text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant select on auth.mfa_factors to authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`)
try { await db.exec(`create publication supabase_realtime`) } catch { console.log('  (no publication support — skipped)') }

// a database built from the ORIGINAL schema.sql, with a row already in it
const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
await db.exec(`
  insert into auth.users values ('${A}'), ('${B}');
  create table public.app_state (user_id uuid primary key references auth.users (id) on delete cascade, data jsonb not null, updated_at timestamptz not null default now());
  alter table public.app_state enable row level security;
  create policy "own state select" on public.app_state for select using (auth.uid() = user_id);
  grant all on public.app_state to anon, authenticated;
  insert into public.app_state (user_id, data) values ('${B}', '{"legacy": true}');
`)

console.log('migration')
await db.exec(MIGRATION)
ok('applies over the original schema', true)
await db.exec(MIGRATION)
ok('is idempotent (second run)', true)
const legacyRow = await db.query(`select version, data from public.app_state where user_id = '${B}'`)
ok('keeps existing rows', legacyRow.rows[0]?.data?.legacy === true)

async function as(uid, aal = 'aal1') {
  await db.exec(`reset role`)
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(uid ? { sub: uid, aal, role: 'authenticated' } : {})])
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
}
const save = async (data, base, at = null) =>
  (await db.query(`select * from public.save_state($1::jsonb, $2, $3)`, [JSON.stringify(data), base, at])).rows[0]

console.log('compare-and-swap')
await as(A)
let r = await save({ n: 1 }, 0)
ok('first save creates row at version 1', r.ok === true && Number(r.version) === 1, JSON.stringify(r))
r = await save({ n: 2 }, 0)
ok('stale base is refused, reports current version', r.ok === false && Number(r.version) === 1, JSON.stringify(r))
let row = (await db.query(`select data from public.app_state`)).rows[0]
ok('refused write left data untouched', row.data.n === 1)
r = await save({ n: 2 }, 1)
ok('save on current version succeeds -> 2', r.ok === true && Number(r.version) === 2)
ok('server_now returned', !!r.server_now)
r = await save({ n: 3 }, 5)
ok('base from the future is refused', r.ok === false)

console.log('old clients (direct upsert)')
await db.query(`insert into public.app_state (user_id, data, version) values ($1, '{"n":9}', 999)
  on conflict (user_id) do update set data = excluded.data, version = excluded.version`, [A])
row = (await db.query(`select version, data from public.app_state`)).rows[0]
ok('direct upsert still works', row.data.n === 9)
ok('...but cannot set version (trigger owns it) -> 3', Number(row.version) === 3, row.version)
r = await save({ n: 10 }, 2)
ok('a device based on v2 is refused after the upsert', r.ok === false && Number(r.version) === 3)

console.log('timestamps')
await db.query(`update public.app_state set updated_at = now() + interval '10 years' where user_id = $1`, [A])
row = (await db.query(`select updated_at > now() + interval '6 minutes' as far from public.app_state`)).rows[0]
ok('future content stamp is clamped', row.far === false)

console.log('limits')
await throws('non-object payload rejected', () => save([1, 2], 4), /app_state_data_is_object/)
await throws('> 2 MB payload rejected', () => save({ big: 'x'.repeat(2_100_000) }, 4), /app_state_data_size/)

console.log('isolation')
await as(B)
ok('B sees only its own row', (await db.query(`select user_id from public.app_state`)).rows.every((x) => x.user_id === B))
const upd = await db.query(`update public.app_state set data = '{"pwned":1}' where user_id = $1`, [A])
ok('B cannot update A', upd.affectedRows === 0)
const del = await db.query(`delete from public.app_state where user_id = $1`, [A])
ok('B cannot delete A', del.affectedRows === 0)
await throws('B cannot insert a row for A', () => db.query(`insert into public.app_state (user_id, data) values ($1, '{}')`, [A]))
await as(null)
await throws('anon cannot read app_state', () => db.query(`select * from public.app_state`), /permission denied/)
await throws('anon cannot call save_state', () => save({}, 0), /permission denied/)

console.log('two-factor enforcement')
await db.exec(`reset role`)
await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [A])
await as(A, 'aal1')
ok('aal1 session sees nothing', (await db.query(`select * from public.app_state`)).rows.length === 0)
r = await save({ n: 11 }, 3)
ok('aal1 save refused', r.ok === false)
await throws('aal1 insert blocked', () => save({ n: 11 }, 0), /row-level security/)
await throws('aal1 cannot delete the account', () => db.query(`select public.delete_user()`), /two-factor/)
await as(A, 'aal2')
const seen = (await db.query(`select version from public.app_state`)).rows
ok('aal2 session sees the row', seen.length === 1)
r = await save({ n: 11 }, Number(seen[0].version))
ok('aal2 save succeeds', r.ok === true, JSON.stringify(r))
await as(B, 'aal1')
ok('users without 2FA are unaffected', (await db.query(`select * from public.app_state`)).rows.length === 1)

console.log('devices')
await as(B)
for (let i = 0; i < 30; i++) {
  await db.query(`insert into public.devices (user_id, device_key, label, platform, last_seen) values ($1, $2, 'x', 'Web', now() - ($3 || ' minutes')::interval)`, [B, 'k' + i, i])
}
ok('capped at 25 per user', Number((await db.query(`select count(*) c from public.devices`)).rows[0].c) === 25)
await db.query(`insert into public.devices (user_id, device_key, label, platform) values ($1, 'k0', 'y', 'Web') on conflict (user_id, device_key) do update set label = excluded.label`, [B])
ok('upsert on (user_id, device_key) works', true)
await throws('oversized label rejected', () => db.query(`insert into public.devices (user_id, device_key, label) values ($1, 'z', $2)`, [B, 'x'.repeat(500)]), /devices_field_lengths/)
await throws('cannot register a device for someone else', () => db.query(`insert into public.devices (user_id, device_key) values ($1, 'evil')`, [A]))

console.log('delete_user')
await as(B)
await db.query(`select public.delete_user()`)
await db.exec(`reset role`)
ok('account + data + devices gone (cascade)', Number((await db.query(`select (select count(*) from auth.users where id = $1) + (select count(*) from public.app_state where user_id = $1) + (select count(*) from public.devices where user_id = $1) c`, [B])).rows[0].c) === 0)
ok('other account untouched', Number((await db.query(`select count(*) c from public.app_state where user_id = $1`, [A])).rows[0].c) === 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
