// Sync engine tests: bundles the real src/cloud.ts + src/lib.ts with a fake
// supabase (tests/fixtures/fake-supabase.js, same rules as save_state()),
// then runs several "devices" — each in its own VM context with its own
// storage — against one shared fake server.
//   npm run test:sync
import { build } from 'esbuild'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const stub = (contents) => ({ contents, loader: 'js' })
const out = await build({
  stdin: {
    contents: `
      export { absorbRemote, configureSync, flushPush, isFullySynced, pullState, pushState } from './src/cloud'
      export { loadPersisted, loadState, normalizeState, saveState, setting, syncNowIso, withSetting } from './src/lib'
    `,
    resolveDir: path.join(here, '..'),
    loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'neutral',
  define: { 'import.meta.env': '{}' },
  logLevel: 'error',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: path.join(here, 'fixtures', 'fake-supabase.js') }))
      b.onResolve({ filter: /^@capacitor\// }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => stub(a.path.endsWith('core')
        ? 'export const Capacitor = { isNativePlatform: () => false }'
        : 'export const Preferences = { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} }'))
    },
  }],
})
const code = out.outputFiles[0].text

const server = { row: null, writes: 0, conflicts: 0, legacy: false, failReads: false, skewMs: 0 }

/** A device with its own storage; `stored` pre-fills it (old preferences). */
function device(stored = {}) {
  const store = new Map(Object.entries(stored))
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  }
  const listeners = {}
  const sandbox = {
    module: { exports: {} }, localStorage, console, setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, URL, Date, JSON, Math, Promise, crypto: globalThis.crypto,
    location: { search: '', protocol: 'https:', origin: 'https://x' },
    navigator: { userAgent: 'node' },
    document: { hidden: false, addEventListener: (e, f) => ((listeners[e] ??= []).push(f)) },
    window: { addEventListener: () => {} },
    __server: server,
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  const api = sandbox.module.exports
  api.configureSync({ onStatus: () => {}, onAdopt: () => {} })
  return api
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ', name) } else { fail++; console.log('  FAIL ', name, extra) }
}
const blank = (dev, patch = {}) => dev.normalizeState({ tasks: [], deadlines: [], ...patch })
const edit = (dev, fn) => dev.saveState(fn(dev.loadPersisted()))
async function login(dev) {
  const r = await dev.pullState()
  if (r.kind === 'row' && dev.absorbRemote(r.remote)) dev.pushState()
  return r
}
const reset = () => Object.assign(server, { row: null, writes: 0, conflicts: 0, legacy: false, failReads: false, skewMs: 0 })

// ------------------------------------------------------------------
console.log('concurrent edits on two devices (x20 random interleavings)')
let lostAny = false, conflictsSeen = 0
for (let round = 0; round < 20; round++) {
  reset()
  const A = device(), B = device()
  A.saveState(blank(A, { tasks: [{ id: 't1', name: 'one', createdAt: '2026-09-01' }] }))
  A.pushState(); await A.flushPush()
  B.saveState(blank(B)); await login(B)

  edit(A, (s) => ({ ...s, tasks: [...s.tasks, { id: 't2', name: 'two', createdAt: '2026-09-02' }] }))
  edit(B, (s) => ({ ...s, deadlines: [{ id: 'd1', title: 'launch', date: '2026-12-01', start: '2026-09-01' }] }))
  A.pushState(); B.pushState()
  await Promise.all([A.flushPush(), B.flushPush()])
  await login(A); await login(B)
  await Promise.all([A.flushPush(), B.flushPush()])

  const cloud = server.row.data
  const has = (s) => s.tasks.some((t) => t.id === 't2') && s.deadlines.some((d) => d.id === 'd1')
  if (!has(cloud) || !has(A.loadPersisted()) || !has(B.loadPersisted())) lostAny = true
  conflictsSeen += server.conflicts
}
ok('both edits survive in the cloud and on both devices, every round', !lostAny)
ok('the race actually happened (conflicts were detected and resolved)', conflictsSeen > 0, `conflicts=${conflictsSeen}`)

// ------------------------------------------------------------------
console.log('same race against the OLD protocol (plain upsert), for comparison')
let legacyLost = 0
for (let round = 0; round < 20; round++) {
  reset(); server.legacy = true
  const A = device(), B = device()
  A.saveState(blank(A, { tasks: [{ id: 't1', name: 'one', createdAt: '2026-09-01' }] }))
  A.pushState(); await A.flushPush()
  B.saveState(blank(B)); await login(B)
  edit(A, (s) => ({ ...s, tasks: [...s.tasks, { id: 't2', name: 'two', createdAt: '2026-09-02' }] }))
  edit(B, (s) => ({ ...s, deadlines: [{ id: 'd1', title: 'launch', date: '2026-12-01', start: '2026-09-01' }] }))
  A.pushState(); B.pushState()
  await Promise.all([A.flushPush(), B.flushPush()])
  const c = server.row.data
  if (!(c.tasks.some((t) => t.id === 't2') && c.deadlines.some((d) => d.id === 'd1'))) legacyLost++
}
console.log(`  info  old protocol left the cloud missing an edit in ${legacyLost}/20 rounds`)
ok('fallback to plain upsert works against a pre-migration database', server.writes > 0)

// ------------------------------------------------------------------
console.log('failed read at login on a fresh device')
reset()
{
  const A = device()
  A.saveState(blank(A, { tasks: [{ id: 'real', name: 'years of data', createdAt: '2024-01-01' }] }))
  A.pushState(); await A.flushPush()
  const writesBefore = server.writes
  const F = device()
  F.saveState(blank(F, { tasks: [{ id: 'seed', name: 'Wake up early', createdAt: '2026-09-30' }] }))
  server.failReads = true
  const r = await login(F)
  ok('a failed read is reported as an error, not "empty"', r.kind === 'error')
  F.pushState(); await F.flushPush(3000)
  ok('...and the fresh device does NOT write its starter data over the cloud', server.writes === writesBefore && server.row.data.tasks[0].id === 'real')
  ok('...and it knows it still has unsynced work (will retry)', !F.isFullySynced())
  server.failReads = false
  await F.flushPush()
  const tasks = server.row.data.tasks.map((t) => t.id)
  ok('once reads work, the real data wins and nothing is lost', tasks.includes('real'), JSON.stringify(tasks))
}

// ------------------------------------------------------------------
console.log('clock skew')
reset(); server.skewMs = 24 * 3600_000
{
  const A = device()
  A.saveState(blank(A)); A.pushState(); await A.flushPush()
  const drift = Date.parse(A.syncNowIso()) - Date.now()
  ok('edit stamps follow the server clock after one save', Math.abs(drift - server.skewMs) < 5000, `drift=${drift}`)
}

// ------------------------------------------------------------------
console.log('settings follow the account')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
{
  reset()
  const A = device(), B = device()
  A.saveState(blank(A)); A.pushState(); await A.flushPush()
  B.saveState(blank(B)); await login(B)
  // at the same time: A picks a theme, B sets office hours
  edit(A, (s) => A.withSetting(s, 'theme', 'night'))
  edit(B, (s) => B.withSetting(B.withSetting(s, 'office', 'on'), 'officeStart', '08:30'))
  A.pushState(); B.pushState()
  await Promise.all([A.flushPush(), B.flushPush()])
  await login(A); await login(B)
  await Promise.all([A.flushPush(), B.flushPush()])
  for (const [name, dev] of [['A', A], ['B', B]]) {
    const s = dev.loadPersisted()
    ok(`device ${name} has both changes (theme + office hours)`,
      dev.setting(s, 'theme') === 'night' && dev.setting(s, 'office') === 'on' && dev.setting(s, 'officeStart') === '08:30',
      JSON.stringify(s.settings))
  }

  // the same setting changed on both: the later edit wins everywhere
  edit(A, (s) => A.withSetting(s, 'lang', 'fr'))
  await sleep(5)
  edit(B, (s) => B.withSetting(s, 'lang', 'de'))
  A.pushState(); B.pushState()
  await Promise.all([A.flushPush(), B.flushPush()])
  await login(A); await login(B)
  ok('same setting on both: the newer edit wins on both devices',
    A.setting(A.loadPersisted(), 'lang') === 'de' && B.setting(B.loadPersisted(), 'lang') === 'de')
}
{
  reset()
  // a PC that chose a look before settings synced, and a fresh second PC
  const Old = device({ 'compound.theme': 'neo', 'compound.office': 'on', 'compound.officeEnd': '17:00' })
  Old.saveState(Old.loadState()); Old.pushState(); await Old.flushPush()
  const New = device()
  New.saveState(New.loadState()); await login(New)
  const s = New.loadPersisted()
  ok('choices saved per device before this update carry over to a new PC',
    New.setting(s, 'theme') === 'neo' && New.setting(s, 'office') === 'on' && New.setting(s, 'officeEnd') === '17:00',
    JSON.stringify(s.settings))
  // …but any real change made since beats a carried-over value
  edit(New, (x) => New.withSetting(x, 'theme', 'paper'))
  New.pushState(); await New.flushPush()
  await login(Old)
  ok('a real change beats a carried-over value', Old.setting(Old.loadPersisted(), 'theme') === 'paper')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
