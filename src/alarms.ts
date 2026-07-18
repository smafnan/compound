import { useEffect, useRef, useState } from 'react'
import { AppState, deadlineEndMs } from './lib'
import { loadPref, savePref } from './prefs'
import { playChime } from './sound'

export const alarmEnabled = (): boolean => loadPref('alarm', 'on') === 'on'

export function setAlarmEnabled(on: boolean): void {
  savePref('alarm', on ? 'on' : 'off')
  // ask for notification permission when the user opts in (user gesture)
  if (on && 'Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

/**
 * Watches every deadline while the app is open. The moment one crosses
 * zero, it chimes, posts a system notification (if permitted) and
 * returns the deadline's title for ~8s so the shell can show a toast.
 * Deadlines already past when the app opens never fire.
 */
export function useDeadlineAlarms(state: AppState): string | null {
  const [alertFor, setAlertFor] = useState<string | null>(null)
  const prevRef = useRef<Map<string, number>>(new Map())
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const iv = setInterval(() => {
      const nowMs = Date.now()
      const prev = prevRef.current
      for (const d of stateRef.current.deadlines) {
        const rem = deadlineEndMs(d) - nowMs
        const was = prev.get(d.id)
        prev.set(d.id, rem)
        if (was === undefined || was <= 0 || rem > 0) continue
        if (!alarmEnabled()) continue
        playChime()
        setAlertFor(d.title)
        setTimeout(() => setAlertFor(null), 8000)
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Time is up', { body: d.title, tag: `deadline-${d.id}` })
          }
        } catch {
          /* notifications unavailable */
        }
      }
      // forget deleted deadlines
      for (const id of [...prev.keys()]) {
        if (!stateRef.current.deadlines.some((d) => d.id === id)) prev.delete(id)
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  return alertFor
}
