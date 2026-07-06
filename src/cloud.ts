import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { AppState, normalizeState } from './lib'

/**
 * Cloud sync via Supabase (free tier is plenty). Configure with env vars:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (see .env.example)
 * When they're absent the app runs in local-only mode — nothing breaks.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const cloudEnabled = Boolean(url && key)

const supabase: SupabaseClient | null = cloudEnabled ? createClient(url!, key!) : null

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error'

// ---------- auth ----------

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Cloud sync is not configured.'
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Cloud sync is not configured.'
  const { error } = await supabase.auth.signUp({ email, password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
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
      updated_at: new Date().toISOString(),
    })
    onStatus?.(error ? 'error' : 'synced')
  }, 1200)
}
