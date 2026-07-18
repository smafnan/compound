import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { AppState, normalizeState } from './lib'

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

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

/** Sign out on every device where this account is logged in. */
export async function signOutEverywhere(): Promise<void> {
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
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  const { label, platform } = describeThisDevice()
  await supabase.from('devices').upsert(
    {
      user_id: data.user.id,
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

/** Change the account password. */
export async function updatePassword(password: string): Promise<string | null> {
  if (!supabase) return 'Accounts are not available in this build.'
  const { error } = await supabase.auth.updateUser({ password })
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

/** Subscribe to auth changes; fires immediately with the current user. */
export function onAuth(cb: (user: User | null) => void): () => void {
  if (!supabase) return () => {}
  void supabase.auth.getUser().then(({ data }) => cb(data.user ?? null))
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}

// ---------- state sync ----------

export async function pullState(): Promise<{ state: AppState; updatedAt: string } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('app_state')
    .select('data, updated_at')
    .maybeSingle()
  if (error || !data) return null
  return {
    state: normalizeState(data.data as Partial<AppState>),
    updatedAt: data.updated_at as string,
  }
}

/**
 * Live cross-device sync: listen for changes to this user's row so an
 * edit made on any other device shows up here within a second.
 * (Requires the table to be in the realtime publication; the app also
 * re-pulls on focus and on a timer as a fallback.)
 */
export function subscribeToState(
  userId: string,
  onRemote: (state: AppState, updatedAt: string) => void,
): () => void {
  if (!supabase) return () => {}
  const ch = supabase
    .channel(`app_state_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as { data?: Partial<AppState>; updated_at?: string } | null
        if (row?.data && row.updated_at) {
          onRemote(normalizeState(row.data), row.updated_at)
        }
      },
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(ch)
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined

/** Debounced upsert of the whole state into the user's row. */
export function pushState(state: AppState, onStatus?: (s: SyncStatus) => void): void {
  if (!supabase) return
  clearTimeout(pushTimer)
  onStatus?.('syncing')
  pushTimer = setTimeout(async () => {
    const { data } = await supabase!.auth.getUser()
    if (!data.user) {
      onStatus?.('signed-out')
      return
    }
    const { error } = await supabase!.from('app_state').upsert({
      user_id: data.user.id,
      data: state,
      // the CONTENT stamp, not "now" — so a device that merely pushed
      // an unchanged copy never looks like the latest editor
      updated_at: state.updatedAt ?? new Date().toISOString(),
    })
    onStatus?.(error ? 'error' : 'synced')
  }, 1200)
}
