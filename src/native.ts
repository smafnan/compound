import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const KEY = 'compound.v1'

/**
 * On Android/iOS the WebView's localStorage can be evicted by the OS, so
 * native Preferences (SharedPreferences / UserDefaults) is the durable copy.
 * Before first render, restore it into localStorage; the rest of the app
 * keeps its simple synchronous storage code.
 */
export async function bootstrapStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { value } = await Preferences.get({ key: KEY })
    if (value) localStorage.setItem(KEY, value)
  } catch {
    // fall back to whatever localStorage still has
  }
}

/** Fire-and-forget mirror of every save into native storage. */
export function mirrorToNative(json: string): void {
  if (!Capacitor.isNativePlatform()) return
  void Preferences.set({ key: KEY, value: json }).catch(() => {})
}
