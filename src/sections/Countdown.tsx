import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState, Deadline, MONTHS, TimePart, clockLeft, daysBetween, deadlineEndMs,
  fmtClock, fmtDate, fmtDuration, isTimer, makeTimer, parseDate, remainingParts,
  timerAt, timerStartMs, todayStr, uid,
} from '../lib'
import { t } from '../i18n'
import { alarmEnabled, setAlarmEnabled } from '../alarms'

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

/** One-tap timer lengths, in minutes. */
const PRESETS = [25, 60, 120, 240, 480]

const presetLabel = (min: number) => (min < 60 ? `${min}m` : `${min / 60}h`)

/** Digits only, capped — keeps the hour/minute boxes from taking junk. */
function digits(raw: string, max: number): string {
  const clean = raw.replace(/\D/g, '').slice(0, 3)
  if (!clean) return ''
  return String(Math.min(max, Number(clean)))
}

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export default function Countdown({ state, setState }: Props) {
  const [mode, setMode] = useState<'date' | 'timer'>('date')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [endTime, setEndTime] = useState('')
  const [hrs, setHrs] = useState('')
  const [mins, setMins] = useState('')
  const [alarm, setAlarm] = useState(alarmEnabled)
  const [now, setNow] = useState(() => new Date())

  const totalMin = Number(hrs || 0) * 60 + Number(mins || 0)

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
    let d: Deadline
    if (mode === 'timer') {
      if (totalMin < 1) return
      d = makeTimer(title, totalMin)
    } else {
      if (!date) return
      d = {
        id: uid(),
        title: title.trim() || 'Deadline',
        date,
        start: start || todayStr(),
        ...(endTime ? { time: endTime } : {}),
      }
    }
    setState((s) => ({ ...s, deadlines: [...s.deadlines, d], primaryId: d.id }))
    setTitle('')
    setDate('')
    setStart('')
    setEndTime('')
    setHrs('')
    setMins('')
  }

  /** Move a running timer's finish line, keeping its start fixed so the
   *  progress bar still measures the whole stretch. Never lands in the past. */
  function nudge(id: string, deltaMin: number) {
    setState((s) => ({
      ...s,
      deadlines: s.deadlines.map((d) => {
        if (d.id !== id || !isTimer(d)) return d
        const from = timerStartMs(d)
        const end = Math.max(Date.now(), (d.endMs as number) + deltaMin * 60_000)
        return { ...d, ...timerAt(end, (end - from) / 60_000) }
      }),
    }))
  }

  /** Run the same timer again from this moment. */
  function restart(id: string) {
    setState((s) => ({
      ...s,
      deadlines: s.deadlines.map((d) => {
        if (d.id !== id || !isTimer(d)) return d
        const len = Math.max(1, d.durMin ?? 1)
        const from = Date.now()
        return { ...d, start: fmtDate(new Date(from)), ...timerAt(from + len * 60_000, len) }
      }),
    }))
  }

  function patch(id: string, field: 'date' | 'start' | 'title' | 'time', value: string) {
    // clearing is allowed for title and time; dates must stay set
    if (!value && field !== 'title' && field !== 'time') return
    setState((s) => ({
      ...s,
      deadlines: s.deadlines.map((d) =>
        d.id === id ? { ...d, [field]: field === 'time' && !value ? undefined : value } : d,
      ),
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
  // hundreds of calendar cells on every 1-second timer tick. A duration
  // timer has no days to cross off, so it gets no wall.
  const wallTick = Math.floor(now.getTime() / 30_000)
  const wall = useMemo(
    () => (primary && !isTimer(primary)
      ? <CalendarWall deadline={primary} now={new Date(wallTick * 30_000)} />
      : null),
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
          <button
            className={`icon-btn bell ${alarm ? 'on' : ''}`}
            title={alarm ? 'Alarm on — chime + notification when a countdown ends' : 'Alarm off'}
            aria-pressed={alarm}
            onClick={() => {
              const v = !alarm
              setAlarm(v)
              setAlarmEnabled(v)
            }}
          >
            {alarm ? '🔔' : '🔕'}
          </button>
        </div>
        {state.deadlines.length > 0 && (
          <ul className="dl-list" ref={listRef}>
            {state.deadlines.map((d) => {
              const left = daysBetween(now, parseDate(d.date))
              const since = daysBetween(parseDate(d.start), now)
              const isPrio = state.priorityId === d.id
              const end = deadlineEndMs(d)
              const over = end <= now.getTime()
              const timer = isTimer(d)
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
                      className={`dl-left ${over ? 'over' : ''}`}
                      title="Show this countdown"
                      onClick={() => setState((s) => ({ ...s, primaryId: d.id }))}
                    >
                      {!timer && since >= 0 && <em>{t('day')} {since + 1} · </em>}
                      {!over
                        ? timer
                          ? `⏱ ${clockLeft(end - Math.max(now.getTime(), Date.now()))}`
                          : `${smartLeft(d, now.getTime())} ${t('left')}`
                        : !timer && left < 0
                          ? `${-left} ${t('daysPast')}`
                          : `⏰ ${t('timeOver')}`}
                    </button>
                  </div>
                  <button
                    className={`icon-btn star ${isPrio ? 'on' : ''}`}
                    title={isPrio ? t('clearPriority') : t('markPriority')}
                    onClick={() => togglePriority(d.id)}
                  >
                    {isPrio ? '★' : '☆'}
                  </button>
                  {timer ? (
                    <div className="fld dl-timer">
                      <span>{t('ends')}</span>
                      <div className="tm-row">
                        <span
                          className="tm-at"
                          data-tip={`${fmtDuration(d.durMin ?? 0)} timer — ends ${new Date(end).toLocaleString()}`}
                        >
                          {fmtClock(end)}
                        </span>
                        <button
                          type="button"
                          className="tm-step"
                          title="15 minutes less"
                          aria-label={`Take 15 minutes off ${d.title}`}
                          onClick={() => nudge(d.id, -15)}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="tm-step"
                          title="15 minutes more"
                          aria-label={`Add 15 minutes to ${d.title}`}
                          onClick={() => nudge(d.id, 15)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="tm-step"
                          title={`${t('restartTimer')} — ${fmtDuration(d.durMin ?? 0)}`}
                          aria-label={`${t('restartTimer')}: ${d.title}`}
                          onClick={() => restart(d.id)}
                        >
                          ↻
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                        <div className="fld-pair">
                          <input
                            type="date"
                            className="dl-date"
                            value={d.date}
                            min={d.start}
                            onClick={openPicker}
                            onChange={(e) => patch(d.id, 'date', e.target.value)}
                            aria-label={`Change deadline date for ${d.title}`}
                          />
                          <input
                            type="time"
                            className="dl-date dl-time"
                            value={d.time ?? ''}
                            onClick={openPicker}
                            onChange={(e) => patch(d.id, 'time', e.target.value)}
                            aria-label={`Change end time for ${d.title} (optional)`}
                            data-tip="Optional end time — clear it to count the whole day"
                          />
                        </div>
                      </label>
                    </>
                  )}
                  <button className="icon-btn" title="Delete" onClick={() => remove(d.id)}>
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <form className={`add-form ${mode === 'timer' ? 'timer-mode' : ''}`} onSubmit={addDeadline}>
          <div className="mode-seg" role="group" aria-label="Count down to a date or for a length of time">
            <button
              type="button"
              className={mode === 'date' ? 'on' : ''}
              aria-pressed={mode === 'date'}
              onClick={() => setMode('date')}
            >
              📅 {t('byDate')}
            </button>
            <button
              type="button"
              className={mode === 'timer' ? 'on' : ''}
              aria-pressed={mode === 'timer'}
              onClick={() => setMode('timer')}
            >
              ⏱ {t('byTimer')}
            </button>
          </div>
          <input
            type="text"
            placeholder={
              mode === 'timer'
                ? "What are you timing? (e.g. Deep work)"
                : "What's the goal? (e.g. Launch day)"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {mode === 'date' ? (
            <>
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
              <label className="fld">
                <span>{t('atTime')}</span>
                <input
                  type="time"
                  value={endTime}
                  onClick={openPicker}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </>
          ) : (
            <>
              <label className="fld">
                <span>{t('hrsLabel')}</span>
                <input
                  className="dur-in"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={hrs}
                  onChange={(e) => setHrs(digits(e.target.value, 999))}
                  aria-label="Hours to count down"
                />
              </label>
              <label className="fld">
                <span>{t('minLabel')}</span>
                <input
                  className="dur-in"
                  type="text"
                  inputMode="numeric"
                  placeholder="00"
                  value={mins}
                  onChange={(e) => setMins(digits(e.target.value, 59))}
                  aria-label="Minutes to count down"
                />
              </label>
              <div className="dur-chips">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip-btn ${totalMin === p ? 'on' : ''}`}
                    onClick={() => {
                      setHrs(p >= 60 ? String(Math.floor(p / 60)) : '')
                      setMins(p % 60 ? String(p % 60) : '')
                    }}
                  >
                    {presetLabel(p)}
                  </button>
                ))}
              </div>
            </>
          )}
          <button type="submit" className="btn-accent">
            {mode === 'timer' ? t('startTimer') : t('addDeadline')}
          </button>
        </form>
        <p className="muted small">
          {mode === 'timer'
            ? totalMin > 0
              ? <>Counts down <b>{fmtDuration(totalMin)}</b> from the moment you start — ending
                  around <b>{fmtClock(now.getTime() + totalMin * 60_000)}</b>. It keeps running
                  while the app is closed.</>
              : <>Pick a length — hours, minutes, or one of the presets — for a session you want
                  to finish inside, like deep work or an exam.</>
            : <>"Started" can be in the past — set it to the day you planned to begin, and every
                day since then gets blacked out on the wall.</>}
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
  // live smart countdown: days+hours → hours+minutes → minutes+seconds → seconds
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  // tick/now only force the re-render — read the clock fresh so a timer
  // face never sits a second behind the real remaining time
  const nowMs = Math.max(tick, now.getTime(), Date.now())
  const endMs = deadlineEndMs(deadline)
  const over = endMs <= nowMs

  if (isTimer(deadline)) {
    return <TimerHero deadline={deadline} nowMs={nowMs} endMs={endMs} over={over} flag={flag} />
  }

  const end = parseDate(deadline.date)
  const start = parseDate(deadline.start)
  const total = Math.max(daysBetween(start, end), 1)
  const gone = Math.min(Math.max(daysBetween(start, now), 0), total)
  const pct = Math.round((gone / total) * 100)
  const since = daysBetween(start, now)

  const parts = remainingParts(endMs - nowMs)
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
        {deadline.time ? <> at <b>{deadline.time}</b></> : null}
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

/** The same speech-bubble hero, told in clock time: a live H:MM:SS face and
 *  a bar that measures the timer's own length instead of calendar days. */
function TimerHero({
  deadline, nowMs, endMs, over, flag,
}: { deadline: Deadline; nowMs: number; endMs: number; over: boolean; flag?: string }) {
  const startMs = timerStartMs(deadline)
  const total = Math.max(endMs - startMs, 60_000)
  const gone = Math.min(Math.max(nowMs - startMs, 0), total)
  const pct = Math.round((gone / total) * 100)
  const spentMin = Math.round(gone / 60_000)
  const leftMin = Math.round((total - gone) / 60_000)

  return (
    <div className="hero">
      {flag && <p className="hero-flag">{flag}</p>}
      <p className="hero-kicker">{deadline.title}</p>
      <div className={`hero-num timer ${over ? 'dim' : ''}`}>
        {over ? '0:00' : clockLeft(endMs - nowMs)}
        <span className="hero-unit">{over ? t('timeOver') : t('left')}</span>
      </div>
      <p className="hero-sub">
        <b>{fmtDuration(deadline.durMin ?? 0)}</b> timer · {over ? 'ended' : 'ends'} at{' '}
        <b>{fmtClock(endMs)}</b> · {fmtDuration(spentMin)} spent
      </p>
      <div className="bar" data-tip={`${fmtDuration(spentMin)} spent · ${fmtDuration(leftMin)} remain`}>
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
