import { mirrorToNative } from './native'

// ---------- Types ----------

export interface Deadline {
  id: string
  title: string
  date: string // yyyy-mm-dd, the target
  start: string // yyyy-mm-dd, when the countdown began
  /** optional HH:MM — the moment on `date` the deadline ends
   *  (omitted = the deadline runs through its whole final day) */
  time?: string
}

export interface Task {
  id: string
  name: string
  createdAt: string // yyyy-mm-dd — days before this don't count against the task
}

export type WidgetKind =
  | 'clock' | 'countdown' | 'hours' | 'quarters' | 'month' | 'growth' | 'curve' | 'pomodoro'
  | 'spotify' | 'video'

export interface CanvasItem {
  id: string
  kind: WidgetKind
  x: number
  y: number
  z: number
  /** user-resized width in px (falls back to the kind's default) */
  w?: number
  /** user-resized height in px (default: content height) */
  h?: number
  /** per-widget config: spotify/video URLs, focus-timer task, … */
  cfg?: Record<string, string>
}

/** One completed focus-timer session. */
export interface FocusSession {
  id: string
  task: string
  minutes: number
  endedAt: string // ISO
}

export interface Profile {
  name: string
  goal: string
  phone: string
  joined: string // yyyy-mm-dd
}

export interface AppState {
  deadlines: Deadline[]
  primaryId: string | null
  /** the one deadline marked as the active priority (shown pinned on top) */
  priorityId: string | null
  tasks: Task[]
  /** date (yyyy-mm-dd) -> ids of tasks completed that day */
  completions: Record<string, string[]>
  /** free-form dashboard: widgets and where you dropped them */
  canvas: CanvasItem[]
  /** completed focus-timer sessions */
  focus: FocusSession[]
  profile: Profile
  /** last CONTENT change (ISO). Only bumped when something is actually edited. */
  updatedAt?: string
  /** per-section last-edit stamps — the basis for cross-device merging */
  sec?: Record<string, string>
  /** per-date last-edit stamps for checklist completions */
  compAt?: Record<string, string>
}

/** Fill in any missing fields (older saves, cloud payloads). */
export function normalizeState(parsed: Partial<AppState> | null | undefined): AppState {
  return {
    deadlines: parsed?.deadlines ?? [],
    primaryId: parsed?.primaryId ?? null,
    priorityId: parsed?.priorityId ?? null,
    tasks: parsed?.tasks ?? [],
    completions: parsed?.completions ?? {},
    canvas: parsed?.canvas ?? [],
    focus: parsed?.focus ?? [],
    profile: {
      name: parsed?.profile?.name ?? '',
      goal: parsed?.profile?.goal ?? '',
      phone: parsed?.profile?.phone ?? '',
      joined: parsed?.profile?.joined ?? todayStr(),
    },
    updatedAt: parsed?.updatedAt,
    sec: parsed?.sec ?? {},
    compAt: parsed?.compAt ?? {},
  }
}

// ---------- Dates ----------

const DAY_MS = 86_400_000

export function fmtDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr(): string {
  return fmtDate(new Date())
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/** Whole days from a to b (b - a), ignoring time of day. */
export function daysBetween(a: Date, b: Date): number {
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((b0 - a0) / DAY_MS)
}

export interface TimePart {
  value: number
  unit: 'day' | 'hour' | 'minute' | 'second'
}

/**
 * Split remaining milliseconds into the two most significant units:
 * ≥1 day → days+hours, <1 day → hours+minutes, <1 hour → minutes+seconds,
 * <1 minute → seconds only. Never negative.
 */
export function remainingParts(ms: number): TimePart[] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  if (days >= 1) return [{ value: days, unit: 'day' }, { value: hours, unit: 'hour' }]
  if (hours >= 1) return [{ value: hours, unit: 'hour' }, { value: minutes, unit: 'minute' }]
  if (minutes >= 1) return [{ value: minutes, unit: 'minute' }, { value: seconds, unit: 'second' }]
  return [{ value: seconds, unit: 'second' }]
}

/** The exact moment a deadline ends: `time` on its date when set,
 *  otherwise the midnight that closes `date` (whole final day counts). */
export function deadlineEndMs(d: Deadline): number {
  const day = parseDate(d.date).getTime()
  if (d.time && /^\d{2}:\d{2}$/.test(d.time)) {
    const [h, m] = d.time.split(':').map(Number)
    return day + (h * 60 + m) * 60_000
  }
  return day + DAY_MS
}

export function daysInMonth(year: number, month: number): number {
  // month is 0-based
  return new Date(year, month + 1, 0).getDate()
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---------- Persistence ----------

const KEY = 'compound.v1'

/** Demo mode (?demo in the URL): shows generated sample data, never persisted. */
export const IS_DEMO =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

function demoState(): AppState {
  const today = new Date()
  const day = (offset: number) => fmtDate(addDays(today, offset))

  const names = ['Wake up early', 'Exercise 30 min', 'Deep work 2 hrs', 'Read 20 pages', 'No junk food']
  const tasks: Task[] = names.map((name, i) => ({ id: `demo-task-${i}`, name, createdAt: day(-34) }))

  // 34 days of history that trends upward, with a believable wobble
  const completions: Record<string, string[]> = {}
  for (let i = 34; i >= 1; i--) {
    const rate = Math.min(1, Math.max(0.2, 0.35 + 0.55 * (1 - i / 34) + Math.sin(i * 2.7) * 0.14))
    const count = Math.round(rate * tasks.length)
    if (count === 0) continue
    const picked: string[] = []
    for (let k = 0; k < count; k++) picked.push(tasks[(i + k) % tasks.length].id)
    completions[day(-i)] = picked
  }
  completions[day(0)] = tasks.slice(0, 4).map((t) => t.id) // 4 of 5 so far today

  const dl: Deadline = { id: 'demo-dl', title: 'Ship the app', date: day(90), start: day(-25) }
  const canvas: CanvasItem[] = [
    { id: 'demo-w1', kind: 'clock', x: 24, y: 24, z: 1 },
    { id: 'demo-w2', kind: 'month', x: 420, y: 24, z: 2 },
    { id: 'demo-w3', kind: 'pomodoro', x: 760, y: 60, z: 3 },
  ]
  const focus: FocusSession[] = [
    { id: 'demo-f1', task: 'Deep work — landing page', minutes: 25, endedAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
    { id: 'demo-f2', task: 'Read: Atomic Habits', minutes: 15, endedAt: new Date(Date.now() - 26 * 3600_000).toISOString() },
  ]
  return normalizeState({
    deadlines: [dl], primaryId: dl.id, priorityId: dl.id, tasks, completions, canvas, focus,
    profile: { name: 'Demo Pilgrim', goal: 'Ship the app before winter', phone: '', joined: day(-34) },
  })
}

export function loadState(): AppState {
  if (IS_DEMO) return demoState()
  const empty: AppState = normalizeState(null)
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      // First run: seed a few common daily tasks (no fake completions).
      const t = todayStr()
      empty.tasks = [
        { id: uid(), name: 'Wake up early', createdAt: t },
        { id: uid(), name: 'Exercise 30 min', createdAt: t },
        { id: uid(), name: 'Deep work 2 hrs', createdAt: t },
        { id: uid(), name: 'Read 20 pages', createdAt: t },
      ]
      return empty
    }
    return normalizeState(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return empty
  }
}

/** Freshest local save time, straight from disk. */
export function localUpdatedAt(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return (JSON.parse(raw) as Partial<AppState>).updatedAt ?? null
  } catch {
    return null
  }
}

/** The persisted copy, WITHOUT first-run seeding (null on a fresh device). */
export function loadPersisted(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeState(JSON.parse(raw) as Partial<AppState>) : null
  } catch {
    return null
  }
}

/** Sections that merge wholesale by their own edit-stamp. */
const SECTIONS = ['deadlines', 'primaryId', 'priorityId', 'tasks', 'canvas', 'profile'] as const
type SectionKey = (typeof SECTIONS)[number]

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Persist state. Compares against the previous persisted copy and stamps
 * ONLY the sections that actually changed — merely opening the app no
 * longer makes this device look "newer" than the cloud (that was the
 * cause of cross-device resets). Returns the stamped state so the caller
 * can push exactly what was written.
 *
 * @param preStamped true when `s` came out of mergeStates()/the cloud and
 *                   already carries correct stamps — written verbatim.
 */
export function saveState(s: AppState, preStamped = false): AppState {
  if (IS_DEMO) return s
  try {
    const prev = loadPersisted()
    let out: AppState
    if (preStamped || !prev) {
      // first-ever save (seed data — deliberately unstamped so any real
      // account data beats it) or an adopted merge with its own stamps
      out = s
    } else {
      const now = new Date().toISOString()
      const sec: Record<string, string> = { ...prev.sec, ...s.sec }
      const compAt: Record<string, string> = { ...prev.compAt, ...s.compAt }
      let changed = false
      for (const k of SECTIONS) {
        if (!eq(s[k], prev[k])) {
          sec[k] = now
          changed = true
        }
      }
      const dates = new Set([...Object.keys(s.completions), ...Object.keys(prev.completions)])
      for (const d of dates) {
        if (!eq(s.completions[d], prev.completions[d])) {
          compAt[d] = now
          changed = true
        }
      }
      if (!eq(s.focus, prev.focus)) changed = true
      out = { ...s, sec, compAt, updatedAt: changed ? now : prev.updatedAt }
    }
    const json = JSON.stringify(out)
    localStorage.setItem(KEY, json)
    mirrorToNative(json)
    return out
  } catch {
    return s // storage unavailable — keep going in memory
  }
}

// ---------- Cross-device merge ----------

const maxIso = (a?: string, b?: string): string | undefined =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b

/** How much user content a section holds — the tie-breaker when neither
 *  side carries stamps (legacy data / fresh installs). */
function sectionScore(s: AppState, k: SectionKey): number {
  switch (k) {
    case 'deadlines': return s.deadlines.length
    case 'tasks': return s.tasks.length
    case 'canvas': return s.canvas.length
    case 'primaryId': return s.primaryId ? 1 : 0
    case 'priorityId': return s.priorityId ? 1 : 0
    case 'profile': return (s.profile.name ? 1 : 0) + (s.profile.goal ? 1 : 0) + (s.profile.phone ? 1 : 0)
  }
}

/**
 * Combine two copies of the state so that NOTHING is lost:
 * - each section goes to whichever side edited it more recently
 *   (falling back to the whole-copy stamp, then to whichever side
 *   actually has content — so an empty fresh device can never beat
 *   a cloud copy full of progress);
 * - checklist ticks merge day-by-day, and days without stamps are
 *   unioned so a tick made anywhere always survives;
 * - focus sessions are unioned by id.
 */
export function mergeStates(local: AppState, remote: AppState): AppState {
  const effective = (side: AppState, k: SectionKey) => side.sec?.[k] ?? side.updatedAt

  const winner = (k: SectionKey): AppState => {
    const lt = effective(local, k)
    const rt = effective(remote, k)
    if (lt && rt) return Date.parse(rt) > Date.parse(lt) ? remote : local
    if (lt) return local
    if (rt) return remote
    return sectionScore(remote, k) > sectionScore(local, k) ? remote : local
  }

  // per-day completions
  const completions: Record<string, string[]> = {}
  const compAt: Record<string, string> = {}
  const dates = new Set([
    ...Object.keys(local.completions), ...Object.keys(remote.completions),
    ...Object.keys(local.compAt ?? {}), ...Object.keys(remote.compAt ?? {}),
  ])
  for (const d of dates) {
    const la = local.compAt?.[d]
    const ra = remote.compAt?.[d]
    let val: string[] | undefined
    if (la && ra) val = Date.parse(ra) > Date.parse(la) ? remote.completions[d] : local.completions[d]
    else if (la) val = local.completions[d]
    else if (ra) val = remote.completions[d]
    else {
      // no stamps on either side — union so no tick is ever lost
      val = [...new Set([...(local.completions[d] ?? []), ...(remote.completions[d] ?? [])])]
      if (val.length === 0) val = undefined
    }
    if (val && val.length) completions[d] = val
    const at = maxIso(la, ra)
    if (at) compAt[d] = at
  }

  // focus sessions: append-only union
  const focusMap = new Map<string, FocusSession>()
  for (const f of [...remote.focus, ...local.focus]) focusMap.set(f.id, f)
  const focus = [...focusMap.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt))

  const sec: Record<string, string> = {}
  for (const k of SECTIONS) {
    const at = maxIso(local.sec?.[k], remote.sec?.[k])
    if (at) sec[k] = at
  }

  return {
    deadlines: winner('deadlines').deadlines,
    primaryId: winner('primaryId').primaryId,
    priorityId: winner('priorityId').priorityId,
    tasks: winner('tasks').tasks,
    canvas: winner('canvas').canvas,
    profile: winner('profile').profile,
    completions,
    focus,
    sec,
    compAt,
    updatedAt: maxIso(local.updatedAt, remote.updatedAt),
  }
}

// ---------- Scoring ----------

/**
 * Productivity score for one day: completed / tasks-that-existed-that-day.
 * null when no tasks existed yet (day doesn't count toward averages).
 */
export function dayScore(state: AppState, date: string): number | null {
  const active = state.tasks.filter((t) => t.createdAt <= date)
  if (active.length === 0) return null
  const done = new Set(state.completions[date] ?? [])
  let n = 0
  for (const t of active) if (done.has(t.id)) n++
  return n / active.length
}

/** Mean score across [from, to] inclusive, skipping null days. */
export function avgScore(state: AppState, from: Date, to: Date): number | null {
  let sum = 0
  let n = 0
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    const s = dayScore(state, fmtDate(d))
    if (s !== null) {
      sum += s
      n++
    }
  }
  return n === 0 ? null : sum / n
}

export interface PeriodComparison {
  key: 'day' | 'week' | 'month' | 'year'
  label: string
  sub: string
  current: number | null
  previous: number | null
}

/** Day / week / month / year — current period vs the one before it. */
export function comparisons(state: AppState, now: Date): PeriodComparison[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = addDays(today, -1)

  // Week starts Monday
  const dow = (today.getDay() + 6) % 7 // 0 = Monday
  const weekStart = addDays(today, -dow)
  const prevWeekStart = addDays(weekStart, -7)
  const prevWeekEnd = addDays(weekStart, -1)

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMonthEnd = addDays(monthStart, -1)

  const yearStart = new Date(today.getFullYear(), 0, 1)
  const prevYearStart = new Date(today.getFullYear() - 1, 0, 1)
  const prevYearEnd = addDays(yearStart, -1)

  return [
    {
      key: 'day',
      label: 'Today',
      sub: 'vs yesterday',
      current: dayScore(state, fmtDate(today)),
      previous: dayScore(state, fmtDate(yesterday)),
    },
    {
      key: 'week',
      label: 'This week',
      sub: 'vs last week',
      current: avgScore(state, weekStart, today),
      previous: avgScore(state, prevWeekStart, prevWeekEnd),
    },
    {
      key: 'month',
      label: 'This month',
      sub: 'vs last month',
      current: avgScore(state, monthStart, today),
      previous: avgScore(state, prevMonthStart, prevMonthEnd),
    },
    {
      key: 'year',
      label: 'This year',
      sub: 'vs last year',
      current: avgScore(state, yearStart, today),
      previous: avgScore(state, prevYearStart, prevYearEnd),
    },
  ]
}

/** Relative change in percent, or null when it can't be computed. */
export function relDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  if (previous === 0) return current > 0 ? Infinity : 0
  return ((current - previous) / previous) * 100
}

// ---------- Compounding ----------

/**
 * The "1% better" index: start at 1.0, and every day multiply by
 * (1 + score/100) — a fully productive day compounds you +1%.
 * Days without data leave the index unchanged.
 */
export function compoundSeries(state: AppState, days: number, now: Date): number[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: number[] = []
  let idx = 1
  for (let i = days - 1; i >= 0; i--) {
    const s = dayScore(state, fmtDate(addDays(today, -i)))
    if (s !== null) idx *= 1 + s / 100
    out.push(idx)
  }
  return out
}

/** Average score over the trailing `days` days (skipping empty days). */
export function trailingAvg(state: AppState, days: number, now: Date): number | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return avgScore(state, addDays(today, -(days - 1)), today)
}

// ---------- Dashboard analytics ----------

export interface TaskStat {
  id: string
  name: string
  /** completion rate over the window (null = task newer than window) */
  pct: number | null
  /** consecutive days done, ending today or yesterday */
  streak: number
}

export function taskStats(state: AppState, days: number, now: Date): TaskStat[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return state.tasks.map((t) => {
    let done = 0
    let countable = 0
    for (let i = 0; i < days; i++) {
      const date = fmtDate(addDays(today, -i))
      if (date < t.createdAt) continue
      countable++
      if ((state.completions[date] ?? []).includes(t.id)) done++
    }
    // streak: allow it to survive an unticked today
    let streak = 0
    let cursor = (state.completions[fmtDate(today)] ?? []).includes(t.id) ? 0 : 1
    for (; ; cursor++) {
      const date = fmtDate(addDays(today, -cursor))
      if (date < t.createdAt) break
      if ((state.completions[date] ?? []).includes(t.id)) streak++
      else break
    }
    return { id: t.id, name: t.name, pct: countable === 0 ? null : done / countable, streak }
  })
}

/** Consecutive days (ending today/yesterday) with at least one tick. */
export function currentStreak(state: AppState, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const has = (d: Date) => (state.completions[fmtDate(d)] ?? []).length > 0
  let streak = 0
  let i = has(today) ? 0 : 1
  for (; i < 3650; i++) {
    if (has(addDays(today, -i))) streak++
    else break
  }
  return streak
}

export function totalTicks(state: AppState): number {
  return Object.values(state.completions).reduce((n, arr) => n + arr.length, 0)
}

/** Weekday vs weekend average score over the trailing window. */
export function weekSplit(state: AppState, days: number, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let wd = 0, wdN = 0, we = 0, weN = 0
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i)
    const s = dayScore(state, fmtDate(d))
    if (s === null) continue
    if (d.getDay() === 0 || d.getDay() === 6) { we += s; weN++ } else { wd += s; wdN++ }
  }
  return {
    weekday: wdN ? wd / wdN : null,
    weekend: weN ? we / weN : null,
  }
}

/** Focus minutes in the trailing window. */
export function focusMinutes(state: AppState, days: number, now: Date): number {
  const cutoff = now.getTime() - days * 86_400_000
  return state.focus
    .filter((f) => new Date(f.endedAt).getTime() >= cutoff)
    .reduce((n, f) => n + f.minutes, 0)
}
