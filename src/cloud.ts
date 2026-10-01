import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  AppState, calibrateClock, loadPersisted, mergeStates, normalizeState, saveState, setLocalOwner,
} from './lib'

/**
 * Cloud sync via Supabase (free tier is plenty). Configure with env vars:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (see .env.example)
 * When they're absent the app runs in local-only mode — nothing breaks.
 */

// Defaults are baked in so login works in EVERY build — web deploys,
// clones, CI desktop builds and the native apps. The publishable key is
// designed to be public (data is protected by row-level security, not
// by this key); env vars still override for anyone self-hosting.
const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://ghegbwdtfgkksbgnchfb.supabase.co'
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'sb_publishable_WTxkaZzmlQ6e3_Q3qTAf4w_jxzsEHhZ'

export const cloudEnabled = Boolean(url && key)

/** The deployed web app — where email links must land (a native webview
 *  can't receive an https redirect, and file:// origins are meaningless). */
const SITE_URL = 'https://compoundtracker.netlify.app'

function redirectHome(): string {
  if (Capacitor.isNativePlatform()) return SITE_URL
  if (typeof location === 'undefined' || location.protocol === 'file:') return SITE_URL
  return location.origin
}

/**
 * Durable auth storage. Native webviews (Android/iOS) may evict
 * localStorage under storage pressure, which silently logs users out.
 * Reads prefer localStorage (fast) and fall back to Capacitor
 * Preferences (SharedPreferences / UserDefaults); writes go to both.
 * On the plain web this is just localStorage.
 */
const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = localStorage.getItem(key)
    if (local !== null || !Capacitor.isNativePlatform()) return local
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null) localStorage.setItem(key, value)
      return value
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value }).catch(() => {})
    }
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key)
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key }).catch(() => {})
    }
  },
}

const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(url!, key!, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

// Webview timers pause while the app is backgrounded, so a session can
// expire before the refresh timer ever fires. Kick the refresher the
// moment the app becomes visible again — it refreshes immediately if
// the token is stale, preventing surprise logouts on mobile.
if (supabase && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void supabase.auth.startAutoRefresh()
  })
  window.addEventListener('focus', () => void supabase.auth.startAutoRefresh())
}

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error'

/** The signed-in user's id from the local session — no network round trip.
 *  The server still verifies the JWT on every request; this only decides
 *  whether to try. */
async function sessionUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

// ---------- auth ----------

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Cloud sync is not configured.'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export type SignUpOutcome =
  | { status: 'ok'; needsConfirm: boolean }
  | { status: 'exists' }
  | { status: 'error'; message: string }

export async function signUp(email: string, password: string): Promise<SignUpOutcome> {
  if (!supabase) return { status: 'error', message: 'Cloud sync is not configured.' }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // land verification clicks back in the app (never a blank tab)
    options: { emailRedirectTo: `${redirectHome()}/?verified=1` },
  })
  if (error) {
    if (/already (registered|exists)/i.test(error.message)) return { status: 'exists' }
    return { status: 'error', message: error.message }
  }
  // With email confirmation enabled, Supabase obfuscates duplicate
  // signups: instead of an error it returns a user with NO identities.
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { status: 'exists' }
  return { status: 'ok', needsConfirm: !data.session }
}

/** Sign out here. Pending changes are flushed to the cloud first, so the
 *  last few seconds of edits aren't stranded on this device. */
export async function signOut(): Promise<void> {
  await flushPush(4000)
  await supabase?.auth.signOut()
}

/** Sign out on every device where this account is logged in. */
export async function signOutEverywhere(): Promise<void> {
  await flushPush(4000)
  await supabase?.auth.signOut({ scope: 'global' })
}

/** Sign in with an external identity provider (Google / Apple / GitHub). */
export async function signInWithProvider(
  provider: 'google' | 'apple' | 'github',
): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectHome() },
  })
  return error ? error.message : null
}

// ---------- Two-factor authentication (TOTP) ----------

export interface TotpEnrollment {
  factorId: string
  qr: string // SVG data-uri from Supabase
  secret: string // manual-entry key
}

/** Begin TOTP enrollment — returns a QR to scan in an authenticator app. */
export async function enrollTotp(): Promise<TotpEnrollment | { error: string }> {
  if (!supabase) return { error: 'Accounts are not available in this build.' }
  // an abandoned earlier attempt leaves an unverified factor behind, which
  // blocks a fresh enrollment — clear those first
  const { data: existing } = await supabase.auth.mfa.listFactors()
  for (const f of existing?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) return { error: error.message }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Verify the 6-digit code to finish enabling TOTP. */
export async function verifyTotpEnrollment(factorId: string, code: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const chal = await supabase.auth.mfa.challenge({ factorId })
  if (chal.error) return chal.error.message
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: chal.data.id,
    code,
  })
  return error ? error.message : null
}

/** List enrolled TOTP factors (to show status / allow removal). */
export async function listTotpFactors(): Promise<{ id: string; status: string }[]> {
  if (!supabase) return []
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status }))
}

/** Turn off two-factor by removing a factor. */
export async function unenrollTotp(factorId: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  return error ? error.message : null
}

/**
 * Does this session still owe a second factor? True when the account has a
 * verified authenticator but the session was opened with only a password,
 * magic link or OAuth (aal1). Until it's answered the database refuses the
 * account's rows, and the app treats the user as not yet signed in.
 *
 * Read straight off the session — no client call. Asking the client
 * (getAuthenticatorAssuranceLevel → getSession) from inside an auth event
 * refreshes any token within 90 s of expiry, which fires another event:
 * with a fast device clock or a short JWT lifetime that loop sent ~650
 * refreshes a second until Supabase rate-limited it and dropped the login.
 */
function owesSecondFactor(session: Session): boolean {
  const verified = (session.user.factors ?? []).some((f) => f.status === 'verified')
  if (!verified) return false
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(payload)) as { aal?: string }).aal !== 'aal2'
  } catch {
    return true // unreadable token: fail closed, the code step will sort it out
  }
}

/** Same check for code outside auth events (e.g. right after a password
 *  login). Reads the stored session once; never loops. */
export async function needsSecondFactor(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  return data.session ? owesSecondFactor(data.session) : false
}

/** Answer the login-time 2FA challenge with a code from the authenticator. */
export async function verifyLoginCode(code: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { data, error: listErr } = await supabase.auth.mfa.listFactors()
  if (listErr) return listErr.message
  const factor = data?.totp.find((f) => f.status === 'verified')
  if (!factor) return 'No authenticator is set up for this account.'
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  return error ? error.message : null
}

// ---------- Device / session registry ----------

export interface DeviceRow {
  id: string
  device_key: string
  label: string
  platform: string
  last_seen: string
  created_at: string
}

const DEVICE_KEY = 'compound.deviceKey'

function deviceKey(): string {
  let k = localStorage.getItem(DEVICE_KEY)
  if (!k) {
    k = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) + Date.now().toString(36)
    localStorage.setItem(DEVICE_KEY, k)
  }
  return k
}

/** A friendly name for this device from the user-agent. */
export function describeThisDevice(): { label: string; platform: string } {
  const ua = navigator.userAgent
  const isNative = /Capacitor/i.test(ua)
  let os = 'Web'
  if (isNative && /Android/i.test(ua)) os = 'Android app'
  else if (isNative) os = 'iOS app'
  else if (/Electron/i.test(ua)) os = 'Desktop app'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad/i.test(ua)) os = 'iPhone/iPad'
  else if (/Linux/i.test(ua)) os = 'Linux'
  let browser = ''
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'
  const label = browser ? `${os} · ${browser}` : os
  return { label, platform: os }
}

/** Register / refresh this device's presence for the current user. */
export async function touchDevice(): Promise<void> {
  const userId = await sessionUserId()
  if (!supabase || !userId) return
  const { label, platform } = describeThisDevice()
  await supabase.from('devices').upsert(
    {
      user_id: userId,
      device_key: deviceKey(),
      label,
      platform,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_key' },
  )
}

/** List this account's known devices, most-recent first. */
export async function listDevices(): Promise<DeviceRow[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('devices')
    .select('id, device_key, label, platform, last_seen, created_at')
    .order('last_seen', { ascending: false })
  return (data as DeviceRow[]) ?? []
}

export const thisDeviceKey = () => deviceKey()

/** Forget a device from the registry (it re-appears if it syncs again). */
export async function removeDevice(id: string): Promise<void> {
  await supabase?.from('devices').delete().eq('id', id)
}

/** Email a one-tap login link (passwordless). */
export async function sendMagicLink(email: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectHome() },
  })
  return error ? error.message : null
}

/** Email a password-reset link; opening it logs the user in so they
 *  can set a new password from the account page. */
export async function sendPasswordReset(email: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectHome(),
  })
  return error ? error.message : null
}

/** Change the account email (provider sends a confirmation link). */
export async function updateEmail(email: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.updateUser({ email })
  return error ? error.message : null
}

/** Change the account password. With "secure password change" on (see
 *  docs/security.md) a session that isn't fresh must prove it's really the
 *  owner: the result then asks for a code, which `sendReauthCode` emails. */
export async function updatePassword(
  password: string,
  nonce?: string,
): Promise<{ error: string | null; needsReauth?: boolean }> {
  if (!supabase) return { error: 'Accounts are not available in this build.' }
  const { error } = await supabase.auth.updateUser(nonce ? { password, nonce } : { password })
  if (!error) return { error: null }
  const code = (error as { code?: string }).code
  if (code === 'reauthentication_needed' || /reauthenticat/i.test(error.message)) {
    return { error: null, needsReauth: true }
  }
  return { error: error.message }
}

/** Email a one-time code that authorises a sensitive change. */
export async function sendReauthCode(): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.reauthenticate()
  return error ? error.message : null
}

/** Permanently delete the signed-in account and all its cloud data. */
export async function deleteAccount(): Promise<string | null> {
  if (!supabase) return 'Cloud sync is not configured.'
  const { error } = await supabase.rpc('delete_user')
  if (error) return error.message
  await supabase.auth.signOut()
  return null
}

export interface AuthInfo {
  user: User | null
  /** signed in, but the 2FA code hasn't been entered yet */
  needsMfa: boolean
}

/**
 * Subscribe to auth changes; fires first with the stored session
 * (INITIAL_SESSION), then on every sign-in, sign-out, refresh and MFA step.
 * Callers should key their work on `user.id` + `needsMfa`, since token
 * refreshes fire this too.
 */
export function onAuth(cb: (info: AuthInfo) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      resetSync()
      setTimeout(() => cb({ user: null, needsMfa: false }), 0)
      return
    }
    // worked out right here from the event's own session, so nothing calls
    // back into the client from inside its callback (see owesSecondFactor);
    // the caller's own work (pulling data…) runs just after it returns
    const info = { user: session.user, needsMfa: owesSecondFactor(session) }
    setTimeout(() => cb(info), 0)
  })
  return () => data.subscription.unsubscribe()
}

// ---------- state sync ----------
//
// One row per user holds the whole app state. Three rules keep devices
// from clobbering each other:
//
//  1. Every write is compare-and-swap on the row's `version` (save_state()
//     in the database). A device may only write on top of the version it
//     last merged; if another device got there first, the write is refused
//     and this device pulls, merges and tries again.
//  2. A cloud copy is merged AND persisted locally before its version is
//     accepted, so nothing can be written over content this device hasn't
//     folded in yet.
//  3. What gets written is always the latest persisted local copy, not a
//     snapshot from when the edit was queued.
//
// Against a database that predates the migration (no `version` column or
// no save_state()), it falls back to the old plain upsert.

export interface RemoteState {
  state: AppState
  updatedAt: string
  /** null against a pre-migration database */
  version: number | null
}

export type PullResult =
  | { kind: 'row'; remote: RemoteState }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

interface SyncHooks {
  onStatus?: (s: SyncStatus) => void
  /** a merged copy was persisted — show it */
  onAdopt?: (s: AppState) => void
}

let hooks: SyncHooks = {}
/** the server predates the migration — use the plain upsert */
let legacy = false
/** the row version this device's copy is known to include; null = unknown */
let baseVersion: number | null = null
/** there are local changes the cloud hasn't got */
let dirty = false
/** used only if nothing has been persisted locally (storage unavailable) */
let fallbackState: AppState | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let draining: Promise<void> | null = null
let retryDelay = 0

export function configureSync(h: SyncHooks): void {
  hooks = h
}

function resetSync(): void {
  clearTimeout(timer)
  baseVersion = null
  dirty = false
  fallbackState = null
  retryDelay = 0
}

function isMissingSchema(err: { code?: string; message?: string }): boolean {
  return (
    err.code === '42703' || // undefined column
    err.code === 'PGRST202' || // function not found
    err.code === 'PGRST204' || // column not in schema cache
    /could not find the function|column .* does not exist/i.test(err.message ?? '')
  )
}

/** Read this account's row. Distinguishes "no row yet" from "couldn't
 *  read" — treating a failed read as a new account used to upload a fresh
 *  device's starter data over a full cloud copy. */
export async function pullState(): Promise<PullResult> {
  if (!supabase) return { kind: 'error', message: 'Cloud sync is not configured.' }
  const cols = legacy ? 'data, updated_at' : 'data, updated_at, version'
  const { data, error } = await supabase.from('app_state').select(cols).maybeSingle()
  if (error) {
    if (!legacy && isMissingSchema(error)) {
      legacy = true
      return pullState()
    }
    return { kind: 'error', message: error.message }
  }
  if (!data) return { kind: 'empty' }
  const row = data as unknown as { data: Partial<AppState>; updated_at: string; version?: number }
  return {
    kind: 'row',
    remote: {
      state: normalizeState(row.data),
      updatedAt: row.updated_at,
      version: typeof row.version === 'number' ? row.version : null,
    },
  }
}

/**
 * Fold a cloud copy into this device's copy: merge, persist, show, and only
 * then record its version as seen. Returns true when the cloud is missing
 * something this device has (the caller should push).
 */
export function absorbRemote(remote: RemoteState): boolean {
  const incoming = { ...remote.state, updatedAt: remote.state.updatedAt ?? remote.updatedAt }
  const local = loadPersisted()
  const merged = local ? mergeStates(local, incoming) : incoming
  const mergedJson = JSON.stringify(merged)
  if (!local || mergedJson !== JSON.stringify(local)) {
    saveState(merged, true)
    hooks.onAdopt?.(merged)
  }
  if (remote.version !== null && (baseVersion === null || remote.version > baseVersion)) {
    baseVersion = remote.version
  }
  const behind = mergedJson !== JSON.stringify(incoming)
  if (!behind && !dirty && !draining) hooks.onStatus?.('synced')
  return behind
}

/** Queue a save of this device's copy (debounced). */
export function pushState(state?: AppState): void {
  if (!supabase) return
  dirty = true
  if (state) fallbackState = state
  hooks.onStatus?.('syncing')
  clearTimeout(timer)
  timer = setTimeout(() => void drain(), 1200)
}

/** Save now instead of after the debounce. Resolves true when nothing is
 *  left unsaved; gives up waiting after `timeoutMs` (the save carries on). */
export async function flushPush(timeoutMs?: number): Promise<boolean> {
  if (!supabase) return true
  clearTimeout(timer)
  const run = drain()
  if (timeoutMs) await Promise.race([run, new Promise((r) => setTimeout(r, timeoutMs))])
  else await run
  return isFullySynced()
}

/** Everything this device has is in the cloud. */
export function isFullySynced(): boolean {
  return !dirty && !draining
}

function drain(): Promise<void> {
  if (!draining) {
    draining = (async () => {
      try {
        while (dirty) {
          dirty = false
          if (!(await writeOnce())) {
            dirty = true
            retryDelay = Math.min(Math.max(retryDelay * 2, 5000), 60_000)
            clearTimeout(timer)
            timer = setTimeout(() => void drain(), retryDelay)
            break
          }
        }
      } finally {
        draining = null
      }
    })()
  }
  return draining
}

async function legacyUpsert(userId: string, state: AppState): Promise<boolean> {
  const { error } = await supabase!.from('app_state').upsert({
    user_id: userId,
    data: state,
    // the CONTENT stamp, not "now" — so a device that merely pushed an
    // unchanged copy never looks like the latest editor
    updated_at: state.updatedAt ?? new Date().toISOString(),
  })
  if (error) {
    hooks.onStatus?.('error')
    return false
  }
  setLocalOwner(userId)
  retryDelay = 0
  if (!dirty) hooks.onStatus?.('synced')
  return true
}

/** One save, including any pull-merge-retry rounds. false = try later. */
async function writeOnce(): Promise<boolean> {
  if (!supabase) return true
  const userId = await sessionUserId()
  if (!userId) {
    hooks.onStatus?.('signed-out')
    return true
  }
  let state = loadPersisted() ?? fallbackState
  if (!state) return true
  if (legacy) return legacyUpsert(userId, state)

  // never seen the cloud copy this session: read it before writing over it
  if (baseVersion === null) {
    const r = await pullState()
    if (r.kind === 'error') {
      hooks.onStatus?.('error')
      return false
    }
    if (legacy) return legacyUpsert(userId, state)
    if (r.kind === 'empty') baseVersion = 0
    else absorbRemote(r.remote)
    state = loadPersisted() ?? state
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const sentAt = Date.now()
    const { data, error } = await supabase.rpc('save_state', {
      p_data: state,
      p_base_version: baseVersion ?? 0,
      p_updated_at: state.updatedAt ?? null,
    })
    if (error) {
      if (isMissingSchema(error)) {
        legacy = true
        return legacyUpsert(userId, state)
      }
      hooks.onStatus?.('error')
      return false
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { ok: boolean; version: number; server_now: string }
      | undefined
    if (!row) {
      hooks.onStatus?.('error')
      return false
    }
    calibrateClock(row.server_now, sentAt, Date.now())
    if (row.ok) {
      baseVersion = row.version
      retryDelay = 0
      setLocalOwner(userId)
      if (!dirty) hooks.onStatus?.('synced')
      return true
    }
    // another device saved first: take its copy in, then write on top of it
    const r = await pullState()
    if (r.kind === 'error') {
      hooks.onStatus?.('error')
      return false
    }
    if (r.kind === 'empty') baseVersion = 0
    else absorbRemote(r.remote)
    state = loadPersisted() ?? state
  }
  hooks.onStatus?.('error')
  return false
}

// the app may be killed soon after it's hidden — don't sit on unsaved edits
if (supabase && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty) void flushPush()
  })
  window.addEventListener('pagehide', () => {
    if (dirty) void flushPush()
  })
}

/**
 * Live cross-device sync: listen for changes to this user's row so an
 * edit made on any other device shows up here within a second.
 * (The migration adds the table to the realtime publication; the app also
 * re-pulls on focus and on a timer as a fallback.)
 */
export function subscribeToState(
  userId: string,
  onRemote: (remote: RemoteState) => void,
): () => void {
  if (!supabase) return () => {}
  const ch = supabase
    .channel(`app_state_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as
          | { data?: Partial<AppState>; updated_at?: string; version?: number }
          | null
        if (row?.data && row.updated_at) {
          onRemote({
            state: normalizeState(row.data),
            updatedAt: row.updated_at,
            version: typeof row.version === 'number' ? row.version : null,
          })
        } else if (row && Object.keys(row).length) {
          // a large row can arrive without its payload — fetch it instead
          void pullState().then((r) => {
            if (r.kind === 'row') onRemote(r.remote)
          })
        }
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(ch)
  }
}
