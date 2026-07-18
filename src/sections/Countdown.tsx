import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState, Deadline, MONTHS, TimePart, daysBetween, deadlineEndMs, parseDate,
  remainingParts, todayStr, uid,
} from '../lib'
import { t } from '../i18n'

const UNIT_ONE = { day: 'unitDay', hour: 'unitHour', minute: 'unitMinute', second: 'unitSecond' } as const
const UNIT_MANY = { day: 'unitDays', hour: 'unitHours', minute: 'unitMinutes', second: 'unitSeconds' } as const

function unitLabel(p: TimePart): string {
  return t(p.value === 1 ? UNIT_ONE[p.unit] : UNIT_MANY[p.unit])
}

/** "8 days 5 hours" / "23 hours 15 minutes" / "58 minutes 12 seconds" / "9 seconds" */
export function smartLeft(d: Deadline, nowMs: number): string {
  return remainingParts(deadlineEndMs(d) - nowMs)
    .map((p) => `${p.value} ${unitLabel(p)}`)
    .join(' ')
}

/** Open the native calendar dropdown when the field is clicked anywhere,
 *  not only on the small icon. showPicker needs a user gesture and isn't
 *  in every browser, so it's guarded. */
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
  try {
    el.showPicker?.()
  } catch {
    /* not supported / not user-activated — the field still works normally */
  }
}

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export default function Countdown({ state, setState }: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [now, setNow] = useState(() => new Date())

  // tick every second so the countdown text stays live
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const primary =
    state.deadlines.find((d) => d.id === state.primaryId) ?? state.deadlines[0] ?? null
  const priority = state.deadlines.find((d) => d.id === state.priorityId) ?? null

  function addDeadline(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    const d: Deadline = {
      id: uid(),
      title: title.trim() || 'Deadline',
      date,
      start: start || todayStr(),
    }
    setState((s) => ({ ...s, deadlines: [...s.deadlines, d], primaryId: d.id }))
    setTitle('')
    setDate('')
    setStart('')
  }

  function patch(id: string, field: 'date' | 'start' | 'title', value: string) {
    if (!value && field !== 'title') return
    setState((s) => ({
      ...s,
      deadlines: s.deadlines.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    }))
  }

  function remove(id: string) {
    setState((s) => ({
      ...s,
      deadlines: s.deadlines.filter((d) => d.id !== id),
      primaryId: s.primaryId === id ? null : s.primaryId,
      priorityId: s.priorityId === id ? null : s.priorityId,
    }))
  }

  function togglePriority(id: string) {
    setState((s) => ({ ...s, priorityId: s.priorityId === id ? null : id }))
  }

  // ----- drag-and-drop reorder (pointer events, so touch works too) -----
  const listRef = useRef<HTMLUListElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  function moveDeadline(from: number, to: number) {
    setState((s) => {
      const arr = [...s.deadlines]
      const [x] = arr.splice(from, 1)
      arr.splice(to, 0, x)
      return { ...s, deadlines: arr }
    })
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragId) return
    const rows = Array.from(listRef.current?.children ?? []) as HTMLElement[]
    const from = state.deadlines.findIndex((d) => d.id === dragId)
    if (from < 0) return
    // insertion index = how many OTHER rows sit above the pointer
    let to = 0
    rows.forEach((r, i) => {
      if (i === from) return
      const box = r.getBoundingClientRect()
      if (e.clientY > box.top + box.height / 2) to++
    })
    if (to !== from) moveDeadline(from, to)
  }

  // the wall only needs a fresh "now" every 30s — no point redrawing
  // hundreds of calendar cells on every 1-second timer tick
  const wallTick = Math.floor(now.getTime() / 30_000)
  const wall = useMemo(
    () => (primary ? <CalendarWall deadline={primary} now={new Date(wallTick * 30_000)} /> : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [primary, wallTick],
  )

  return (
    <section className="section">
      {priority && (
        <div className="priority-sec">
          <Hero deadline={priority} now={now} flag={`★ ${t('activePriority')}`} />
          <button
            className="chip-btn prio-clear"
            title={t('clearPriority')}
            onClick={() => togglePriority(priority.id)}
          >
            ✕ {t('clearPriority')}
          </button>
        </div>
      )}
      {primary && primary.id !== priority?.id
        ? <Hero deadline={primary} now={now} />
        : !priority && <EmptyHero />}

      <div className="panel">
        <div className="panel-head">
          <h2>{t('yourDeadlines')}</h2>
        </div>
        {state.deadlines.length > 0 && (
          <ul className="dl-list" ref={listRef}>
            {state.deadlines.map((d) => {
              const left = daysBetween(now, parseDate(d.date))
              const since = daysBetween(parseDate(d.start), now)
              const isPrio = state.priorityId === d.id
              return (
                <li
                  key={d.id}
                  className={`dl-row ${primary?.id === d.id ? 'primary' : ''} ${dragId === d.id ? 'dragging' : ''}`}
                >
                  <span
                    className="dl-drag"
                    title={t('dragToReorder')}
                    aria-label={t('dragToReorder')}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      setDragId(d.id)
                    }}
                    onPointerMove={onDragMove}
                    onPointerUp={() => setDragId(null)}
                    onPointerCancel={() => setDragId(null)}
                  >
                    ⠿
                  </span>
                  <div className="dl-pick">
                    <input
                      className="dl-title"
                      value={d.title}
                      data-tip={d.title.length > 18 ? d.title : undefined}
                      onChange={(e) => patch(d.id, 'title', e.target.value)}
                      onBlur={(e) => { if (!e.target.value.trim()) patch(d.id, 'title', 'Deadline') }}
                      aria-label={`Deadline title: ${d.title}`}
                    />
                    <button
                      className={`dl-left ${left < 0 ? 'over' : ''}`}
                      title="Show this countdown"
                      onClick={() => setState((s) => ({ ...s, primaryId: d.id }))}
                    >
                      {since >= 0 && <em>{t('day')} {since + 1} · </em>}
                      {left >= 0
                        ? `${smartLeft(d, now.getTime())} ${t('left')}`
                        : `${-left} ${t('daysPast')}`}
                    </button>
                  </div>
                  <button
                    className={`icon-btn star ${isPrio ? 'on' : ''}`}
                    title={isPrio ? t('clearPriority') : t('markPriority')}
                    onClick={() => togglePriority(d.id)}
                  >
                    {isPrio ? '★' : '☆'}
                  </button>
                  <label className="fld">
                    <span>{t('started')}</span>
                    <input
                      type="date"
                      className="dl-date"
                      value={d.start}
                      max={d.date}
                      onClick={openPicker}
                      onChange={(e) => patch(d.id, 'start', e.target.value)}
                      aria-label={`Change start date for ${d.title}`}
                    />
                  </label>
                  <label className="fld">
                    <span>{t('ends')}</span>
                    <input
                      type="date"
                      className="dl-date"
                      value={d.date}
                      min={d.start}
                      onClick={openPicker}
                      onChange={(e) => patch(d.id, 'date', e.target.value)}
                      aria-label={`Change deadline date for ${d.title}`}
                    />
                  </label>
                  <button className="icon-btn" title="Delete" onClick={() => remove(d.id)}>
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className="add-form" onSubmit={addDeadline}>
          <input
            type="text"
            placeholder="What's the goal? (e.g. Launch day)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="fld">
            <span>{t('started')}</span>
            <input
              type="date"
              value={start}
              max={date || undefined}
              onClick={openPicker}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="fld">
            <span>{t('deadline')}</span>
            <input
              type="date"
              required
              value={date}
              min={start || undefined}
              onClick={openPicker}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-accent">{t('addDeadline')}</button>
        </form>
        <p className="muted small">
          "Started" can be in the past — set it to the day you planned to begin, and every day
          since then gets blacked out on the wall.
        </p>
      </div>

      {wall}
    </section>
  )
}

function EmptyHero() {
  return (
    <div className="hero">
      <p className="hero-kicker">no deadline yet</p>
      <div className="hero-num dim">—</div>
      <p className="hero-sub">Add a date below and watch every day get counted.</p>
    </div>
  )
}

export function Hero({ deadline, now, flag }: { deadline: Deadline; now: Date; flag?: string }) {
  const end = parseDate(deadline.date)
  const start = parseDate(deadline.start)
  const total = Math.max(daysBetween(start, end), 1)
  const gone = Math.min(Math.max(daysBetween(start, now), 0), total)
  const pct = Math.round((gone / total) * 100)
  const over = daysBetween(now, end) < 0
  const since = daysBetween(start, now)

  // live smart countdown: days+hours → hours+minutes → minutes+seconds → seconds
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  const parts = remainingParts(deadlineEndMs(deadline) - Math.max(tick, now.getTime()))
  const rest = parts.slice(1).map((p) => `${p.value} ${unitLabel(p)}`).join(' ')

  return (
    <div className="hero">
      {flag && <p className="hero-flag">{flag}</p>}
      <p className="hero-kicker">{deadline.title}</p>
      <div className="hero-num">
        {over ? '0' : parts[0].value}
        <span className="hero-unit">
          {over
            ? t('daysLeft')
            : `${unitLabel(parts[0])}${rest ? ` ${rest}` : ''} ${t('left')}`}
        </span>
      </div>
      <p className="hero-sub">
        {since >= 0
          ? <>started <b>{since === 0 ? 'today' : `${since} days ago`}</b> · </>
          : <>starts in <b>{-since} days</b> · </>}
        ends {end.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        {' · '}
        {gone} of {total} days spent
      </p>
      <div className="bar" data-tip={`${gone} days spent · ${total - gone} days remain`}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="bar-meta">
        <span>{pct}% {t('gone')}</span>
        <span>{100 - pct}% {t('remains')}</span>
      </div>
    </div>
  )
}

/** Traditional calendar pages from start month to deadline month.
 *  Days gone are blacked out, days remaining stay white, today fills with sand. */
function CalendarWall({ deadline, now }: { deadline: Deadline; now: Date }) {
  const start = parseDate(deadline.start)
  const end = parseDate(deadline.date)
  if (end < start) return null

  const months: { y: number; m: number }[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= last && months.length < 24) {
    months.push({ y: cursor.getFullYear(), m: cursor.getMonth() })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const truncated = cursor <= last

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('theWall')}</h2>
        <div className="legend">
          <span><i className="sw spent" /> {t('spent')}</span>
          <span><i className="sw today" /> {t('todayCell')}</span>
          <span><i className="sw left" /> {t('remaining')}</span>
        </div>
      </div>
      <div className="cal-wall">
        {months.map(({ y, m }) => (
          <MonthGrid key={`${y}-${m}`} year={y} month={m} start={start} end={end} now={now} />
        ))}
      </div>
      {truncated && <p className="muted small">Showing the first 24 months of this countdown.</p>}
    </div>
  )
}

export function MonthGrid({
  year, month, start, end, now,
}: { year: number; month: number; start: Date; end: Date; now: Date }) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Monday-first
  const count = new Date(year, month + 1, 0).getDate()

  // sand: how much of today has trickled by
  const dayFill = ((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400) * 100

  // sand: how much of this calendar month is gone
  const monthEnd = new Date(year, month + 1, 0)
  let monthFill = 0
  if (today > monthEnd) monthFill = 100
  else if (today >= first) monthFill = ((now.getDate() - 1 + dayFill / 100) / count) * 100

  const cells: React.ReactNode[] = []
  for (let i = 0; i < offset; i++) cells.push(<span key={`b${i}`} className="cell off" />)
  for (let d = 1; d <= count; d++) {
    const date = new Date(year, month, d)
    let cls = 'off'
    if (date >= start && date <= end) {
      if (daysBetween(date, today) === 0) cls = 'today'
      else if (date < today) cls = 'spent'
      else cls = 'left'
    }
    const tip =
      cls === 'off'
        ? undefined
        : cls === 'today'
          ? `${MONTHS[month]} ${d} — ${Math.round(dayFill)}% filled · ${Math.round(100 - dayFill)}% left`
          : `${MONTHS[month]} ${d}, ${year} — ${cls === 'spent' ? 'spent' : 'remaining'}`
    cells.push(
      <span
        key={d}
        className={`cell ${cls}`}
        data-tip={tip}
        style={cls === 'today' ? ({ ['--fill' as string]: `${dayFill}%` }) : undefined}
      >
        {cls === 'off' ? '' : d}
      </span>,
    )
  }

  return (
    <div className="month">
      <div className="month-name">
        {MONTHS[month]} <span className="muted">{year}</span>
        <span className="month-pct">{Math.round(monthFill)}%</span>
      </div>
      <div className="mgrid dow">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <span key={i} className="dowc">{w}</span>
        ))}
      </div>
      <div className="mgrid">{cells}</div>
      <div className="msand" data-tip={`${MONTHS[month]}: ${Math.round(monthFill)}% gone · ${Math.round(100 - monthFill)}% left`}>
        <i style={{ width: `${monthFill}%` }} />
      </div>
    </div>
  )
}
