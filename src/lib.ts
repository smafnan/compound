import { mirrorToNative } from './native'

// ---------- Types ----------

export interface Deadline {
  id: string
  title: string
  date: string // yyyy-mm-dd, the target
  start: string // yyyy-mm-dd, when the countdown began
}

export interface Task {
  id: string
  name: string
  createdAt: string // yyyy-mm-dd — days before this don't count against the task
}

export interface AppState {
  deadlines: Deadline[]
  primaryId: string | null
  tasks: Task[]
  /** date (yyyy-mm-dd) -> ids of tasks completed that day */
  completions: Record<string, string[]>
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
const IS_DEMO =
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
  return { deadlines: [dl], primaryId: dl.id, tasks, completions }
}

export function loadState(): AppState {
  if (IS_DEMO) return demoState()
  const empty: AppState = { deadlines: [], primaryId: null, tasks: [], completions: {} }
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
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      deadlines: parsed.deadlines ?? [],
      primaryId: parsed.primaryId ?? null,
      tasks: parsed.tasks ?? [],
      completions: parsed.completions ?? {},
    }
  } catch {
    return empty
  }
}

export function saveState(s: AppState): void {
  if (IS_DEMO) return // demo data must never overwrite real data
  try {
    const json = JSON.stringify(s)
    localStorage.setItem(KEY, json)
    mirrorToNative(json)
  } catch {
    // storage full or unavailable — nothing sensible to do
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
      label: 'Today',
      sub: 'vs yesterday',
      current: dayScore(state, fmtDate(today)),
      previous: dayScore(state, fmtDate(yesterday)),
    },
    {
      label: 'This week',
      sub: 'vs last week',
      current: avgScore(state, weekStart, today),
      previous: avgScore(state, prevWeekStart, prevWeekEnd),
    },
    {
      label: 'This month',
      sub: 'vs last month',
      current: avgScore(state, monthStart, today),
      previous: avgScore(state, prevMonthStart, prevMonthEnd),
    },
    {
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
