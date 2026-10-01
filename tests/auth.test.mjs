// Auth tests: the real src/cloud.ts with the real supabase-js, network
// faked. Guards against the refresh storm that logged web users out (every
// auth event triggered a token refresh, which triggered another event…),
// and checks the 2FA gate is still read correctly.
//   npm run test:auth
import { build } from 'esbuild'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = await build({
  stdin: {
    contents: `export { onAuth, needsSecondFactor } from './src/cloud'`,
    resolveDir: path.join(here, '..'),
    loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  define: { 'import.meta.env': '{}' },
  logLevel: 'error',
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /^@capacitor\// }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        loader: 'js',
        contents: a.path.endsWith('core')
          ? 'export const Capacitor = { isNativePlatform: () => false }'
          : 'export const Preferences = { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} }',
      }))
    },
  }],
})
const code = out.outputFiles[0].text
const STORAGE_KEY = 'sb-ghegbwdtfgkksbgnchfb-auth-token'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function session({ ttl = 3600, aal = 'aal1', mfa = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + ttl
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', aal, exp, role: 'authenticated' })}.sig`,
    refresh_token: 'r' + Math.random().toString(36).slice(2),
    token_type: 'bearer', expires_in: ttl, expires_at: exp,
    user: { id: 'u1', email: 'me@example.com', factors: mfa ? [{ id: 'f1', status: 'verified', factor_type: 'totp' }] : [] },
  }
}

/** Load cloud.ts in a fresh browser-like sandbox with a stored session. */
function boot(stored, issue) {
  const store = new Map([[STORAGE_KEY, JSON.stringify(stored)]])
  const counts = { refresh: 0 }
  const fetch = async (url) => {
    if (String(url).includes('grant_type=refresh_token')) counts.refresh++
    return new Response(JSON.stringify(issue()), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const noop = () => {}
  const sandbox = {
    module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch, Response, Request, Headers, URL, URLSearchParams, AbortController, TextEncoder, TextDecoder,
    atob, btoa, crypto: globalThis.crypto, Date, JSON, Math, Promise,
    // realtime wants one to exist; nothing here subscribes
    WebSocket: class { close() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    },
    location: { search: '', hash: '', protocol: 'https:', origin: 'https://x', href: 'https://x/' },
    navigator: { userAgent: 'node' },
    document: { hidden: false, visibilityState: 'visible', addEventListener: noop, removeEventListener: noop },
  }
  sandbox.window = sandbox
  sandbox.window.addEventListener = noop
  sandbox.window.removeEventListener = noop
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  return { api: sandbox.module.exports, counts, store }
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ', name) } else { fail++; console.log('  FAIL ', name, extra) }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('refresh storm')
{
  // every token the server hands out looks ~60 s from expiry: what a device
  // clock running an hour fast, or a very short JWT expiry, looks like
  const { api, counts, store } = boot(session({ ttl: 60 }), () => session({ ttl: 60 }))
  const seen = []
  api.onAuth((info) => seen.push(info))
  await wait(1000)
  const early = counts.refresh
  await wait(3000)
  // a few at startup is the library settling on near-expiry tokens; what
  // matters is that it stops (the bug made ~650 a second, indefinitely)
  ok('refreshes settle: a handful at startup, then none', early <= 5 && counts.refresh === early, `after 1 s=${early}, after 4 s=${counts.refresh}`)
  ok('the user is delivered', seen.some((i) => i.user?.id === 'u1'))
  ok('the session survives (not dropped)', store.has(STORAGE_KEY))
}

console.log('two-factor gate')
for (const [label, s, expect] of [
  ['no authenticator -> no code needed', session(), false],
  ['authenticator + password session -> code needed', session({ mfa: true }), true],
  ['authenticator + verified session -> no code needed', session({ mfa: true, aal: 'aal2' }), false],
]) {
  const { api } = boot(s, () => s)
  const seen = []
  api.onAuth((info) => seen.push(info))
  await wait(200)
  const last = seen[seen.length - 1]
  ok(`onAuth: ${label}`, last?.needsMfa === expect, JSON.stringify(last && { needsMfa: last.needsMfa }))
  ok(`needsSecondFactor(): ${label}`, (await api.needsSecondFactor()) === expect)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
