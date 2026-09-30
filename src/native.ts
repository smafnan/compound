import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const KEY = 'compound.v1'
/** which account the data belongs to — must survive eviction with it */
const OWNER_KEY = 'compound.owner'

/**
 * On Android/iOS the WebView's localStorage can be evicted by the OS, so
 * native Preferences (SharedPreferences / UserDefaults) is the durable copy.
 * Before first render, restore it into localStorage; the rest of the app
 * keeps its simple synchronous storage code.
 */
export async function bootstrapStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    for (const key of [KEY, OWNER_KEY]) {
      const { value } = await Preferences.get({ key })
      if (value && localStorage.getItem(key) === null) localStorage.setItem(key, value)
    }
  } catch {
    // fall back to whatever localStorage still has
  }
}

/** Fire-and-forget mirror of every save into native storage. */
export function mirrorToNative(json: string): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.set({ key: KEY, value: json }).catch(() => {})
}

export function mirrorOwnerToNative(userId: string): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.set({ key: OWNER_KEY, value: userId }).catch(() => {})
}

export function forgetNativeOwner(): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.remove({ key: OWNER_KEY }).catch(() => {})
}

/** Drop the durable copies too, so a cleared device stays cleared. */
export function clearNative(): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.remove({ key: KEY }).catch(() => {})
  void Preferences.remove({ key: OWNER_KEY }).catch(() => {})
}
