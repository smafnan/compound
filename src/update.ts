// "There's a new version" — one hook, three delivery routes.
//
//   desktop   electron-updater talks to GitHub releases in the main process and
//             reports back over the preload bridge; we can install in place.
//   web/PWA   the service worker fetches the new build in the background and
//             parks it; accepting the prompt activates it and reloads.
//   Android   the APK is sideloaded, so nothing can replace it silently — we
//             ask GitHub for the newest tag and hand off to the browser.
//
// All three land on the same banner, so the app has one update story rather
// than three.

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'

const RELEASES_API = 'https://api.github.com/repos/smafnan/compound/releases/latest'
const RELEASES_PAGE = 'https://github.com/smafnan/compound/releases/latest'

/** Re-ask GitHub this often while the app stays open. */
const RECHECK_MS = 6 * 60 * 60 * 1000

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready'
  /** version on offer */
  version?: string
  /** version running right now */
  current?: string
  notes?: string
  url?: string
  percent?: number
  /** true when we cannot install it ourselves and must send them to a download */
  manual?: boolean
}

type UpdaterBridge = {
  status: () => Promise<UpdateStatus>
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  onStatus: (fn: (s: UpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    compound?: { platform: string; updater: UpdaterBridge }
  }
}

/** 1 when a is newer than b, -1 when older, 0 when the same. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v.replace(/^v/, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1
  }
  return 0
}

/** Versions the person has already waved away, so we stop nagging. */
function skipped(): string[] {
  try {
    return JSON.parse(localStorage.getItem('compound.update.skipped') || '[]')
  } catch {
    return []
  }
}

function skip(version: string): void {
  try {
    const all = Array.from(new Set([...skipped(), version])).slice(-10)
    localStorage.setItem('compound.update.skipped', JSON.stringify(all))
  } catch {
    /* unavailable */
  }
}

/** Ask GitHub for the newest release — the Android and fallback route. */
async function fetchLatest(): Promise<UpdateStatus | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return null
    const rel = await res.json()
    const version = String(rel.tag_name || '').replace(/^v/, '')
    if (!version || compareVersions(version, __APP_VERSION__) <= 0) return null
    return {
      state: 'available',
      manual: true,
      version,
      current: __APP_VERSION__,
      notes: typeof rel.body === 'string' ? rel.body : '',
      url: rel.html_url || RELEASES_PAGE,
    }
  } catch {
    return null // offline, rate-limited — try again on the next tick
  }
}

export interface AppUpdate {
  status: UpdateStatus
  /** The one button: download, install or open the release page. */
  act: () => void
  /** "Not now" — hidden until the next version, or the next launch. */
  dismiss: () => void
}

export function useAppUpdate(): AppUpdate {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', current: __APP_VERSION__ })
  // set by the web route so `act()` can activate the waiting worker
  const activateSW = useRef<(() => void) | null>(null)

  useEffect(() => {
    const bridge = window.compound?.updater

    // ---- desktop -------------------------------------------------------
    if (bridge) {
      const show = (s: UpdateStatus) => {
        if (s.state === 'available' && s.version && skipped().includes(s.version)) return
        setStatus(s)
      }
      void bridge.status().then(show)
      return bridge.onStatus(show)
    }

    // ---- Android (and any other sideloaded native build) ---------------
    if (Capacitor.isNativePlatform()) {
      let live = true
      const poll = async () => {
        const found = await fetchLatest()
        if (live && found && !skipped().includes(found.version!)) setStatus(found)
      }
      void poll()
      const iv = setInterval(() => void poll(), RECHECK_MS)
      return () => {
        live = false
        clearInterval(iv)
      }
    }

    // ---- web / installed PWA -------------------------------------------
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return
    let cancelled = false
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          // the new build is already downloaded and waiting — no version
          // number to show, the service worker does not carry one
          setStatus({ state: 'ready', current: __APP_VERSION__ })
        },
        onRegisteredSW(_url, reg) {
          if (!reg) return
          // a tab left open for days should still notice a deploy
          setInterval(() => void reg.update().catch(() => {}), RECHECK_MS)
        },
      })
      activateSW.current = () => void update(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function act() {
    const bridge = window.compound?.updater
    if (status.state === 'ready' && activateSW.current) {
      activateSW.current() // reloads the page onto the new build
      return
    }
    if (bridge) {
      void (status.state === 'ready' ? bridge.install() : bridge.download())
      return
    }
    if (status.url) window.open(status.url, '_blank', 'noopener')
  }

  function dismiss() {
    if (status.version) skip(status.version)
    setStatus({ state: 'idle', current: __APP_VERSION__ })
  }

  return { status, act, dismiss }
}
