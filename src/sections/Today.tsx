import { useEffect, useRef, useState } from 'react'
import { AppState, SlotMark, hourKey, quarterKey, todayStr } from '../lib'
import { loadPref, savePref } from '../prefs'
import { t } from '../i18n'

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Panels that can offer challenge mode take the state; without it they
 *  render exactly as they always have (the Canvas widgets pass it too). */
export interface SlotProps {
  state?: AppState
  setState?: React.Dispatch<React.SetStateAction<AppState>>
  /** challenge mode on — cells become tick/cross buttons */
  challenge?: boolean
  /** note mode on — the per-slot "what did you do" list is shown */
  notesOn?: boolean
  /** office mode on — the blocks inside these hours stand out */
  office?: OfficeHours | null
}

/** Office hours in minutes from midnight. end < start is an overnight shift. */
export interface OfficeHours { start: number; end: number }

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}

/** The office day as plain [from, to) ranges, split at midnight if needed. */
function officeRanges({ start, end }: OfficeHours): [number, number][] {
  if (start === end) return []
  return start < end ? [[start, end]] : [[start, 1440], [0, end]]
}

/** Does the block [from, from + len) overlap the office day at all? */
export function inOffice(office: OfficeHours | null | undefined, from: number, len: number) {
  if (!office) return false
  return officeRanges(office).some(([a, b]) => from < b && from + len > a)
}

/** Office minutes still ahead of `nowMin` today. */
function officeMinutesLeft(office: OfficeHours, nowMin: number) {
  return officeRanges(office).reduce((sum, [a, b]) => sum + Math.max(0, b - Math.max(a, nowMin)), 0)
}

/** none → hit → miss → none, so one control cycles the whole verdict. */
const NEXT: Record<string, SlotMark | undefined> = { none: 'hit', hit: 'miss', miss: undefined }

export function useSlots({ state, setState }: SlotProps) {
  const date = todayStr()
  const marks = state?.slots?.[date] ?? {}
  const notes = state?.slotNotes?.[date] ?? {}

  function note(key: string, text: string) {
    if (!setState) return
    setState((s) => {
      const day = { ...(s.slotNotes[date] ?? {}) }
      if (text.trim()) day[key] = text
      else delete day[key]
      const slotNotes = { ...s.slotNotes }
      if (Object.keys(day).length) slotNotes[date] = day
      else delete slotNotes[date]
      return { ...s, slotNotes }
    })
  }

  function cycle(key: string) {
    if (!setState) return
    setState((s) => {
      const day = { ...(s.slots[date] ?? {}) }
      const next = NEXT[day[key] ?? 'none']
      if (next) day[key] = next
      else delete day[key]
      const slots = { ...s.slots }
      if (Object.keys(day).length) slots[date] = day
      else delete slots[date]
      return { ...s, slots }
    })
  }

  return { marks, notes, cycle, note }
}

/** hits / misses / how much of what you judged you actually used */
export function tally(marks: Record<string, SlotMark>, prefix: 'h' | 'q') {
  const keys = Object.keys(marks).filter((k) => k.startsWith(prefix))
  const hit = keys.filter((k) => marks[k] === 'hit').length
  const miss = keys.length - hit
  return { hit, miss, pct: keys.length ? Math.round((hit / keys.length) * 100) : null }
}

export default function Today({ state, setState }: SlotProps) {
  const now = useNow()
  // the mode sticks between visits, so the verdicts you left keep their
  // context instead of reappearing as unexplained coloured cells
  const [challenge, setChallenge] = useState(() => loadPref('challenge', 'off') === 'on')
  // deliberately independent of challenge mode: judging your time and
  // recording what you did are separate habits, so neither drags the
  // other on
  const [notesOn, setNotesOn] = useState(() => loadPref('notes', 'off') === 'on')
  useEffect(() => { savePref('challenge', challenge ? 'on' : 'off') }, [challenge])
  useEffect(() => { savePref('notes', notesOn ? 'on' : 'off') }, [notesOn])
  // office hours are a per-device routine setting, like the modes above
  const [officeOn, setOfficeOn] = useState(() => loadPref('office', 'off') === 'on')
  const [officeStart, setOfficeStart] = useState(() => loadPref('officeStart', '09:00'))
  const [officeEnd, setOfficeEnd] = useState(() => loadPref('officeEnd', '18:00'))
  useEffect(() => { savePref('office', officeOn ? 'on' : 'off') }, [officeOn])
  useEffect(() => { savePref('officeStart', officeStart) }, [officeStart])
  useEffect(() => { savePref('officeEnd', officeEnd) }, [officeEnd])
  const start = toMin(officeStart)
  const end = toMin(officeEnd)
  const office = officeOn && Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
  return (
    <section className="section">
      <ClockHero now={now} />
      <ChallengeBar
        on={challenge} setOn={setChallenge}
        notesOn={notesOn} setNotesOn={setNotesOn}
        state={state}
      />
      <OfficeBar
        now={now} on={officeOn} setOn={setOfficeOn} office={office}
        start={officeStart} setStart={setOfficeStart}
        end={officeEnd} setEnd={setOfficeEnd}
      />
      <HoursPanel now={now} state={state} setState={setState} challenge={challenge} notesOn={notesOn} office={office} />
      <QuartersPanel now={now} state={state} setState={setState} challenge={challenge} notesOn={notesOn} office={office} />
    </section>
  )
}

/** Office mode: pick the routine's hours, see how much of it is left. */
function OfficeBar({ now, on, setOn, office, start, setStart, end, setEnd }: {
  now: Date
  on: boolean; setOn: (v: boolean) => void
  office: OfficeHours | null
  start: string; setStart: (v: string) => void
  end: string; setEnd: (v: string) => void
}) {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const left = office ? officeMinutesLeft(office, nowMin) : 0
  const total = office ? officeMinutesLeft(office, 0) : 0
  const status = !office || total === 0
    ? null
    : left === 0
      ? t('officeDone')
      : left === total
        ? `${(total / 60).toFixed(1)} h ${t('officeAhead')}`
        : `${(left / 60).toFixed(1)} h ${t('officeLeft')}`

  return (
    <div className={`office-bar ${on ? 'on' : ''}`}>
      <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setOn(!on)}>
        ▣ {t('officeMode')}
      </button>
      {on && (
        <>
          <label className="office-time">
            {t('officeFrom')}
            <input type="time" step={900} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </label>
          <label className="office-time">
            {t('officeTo')}
            <input type="time" step={900} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </label>
          {status && <span className="office-status">{status}</span>}
        </>
      )}
    </div>
  )
}

/** The two independent switches, plus today's running score. */
function ChallengeBar({ on, setOn, notesOn, setNotesOn, state }: {
  on: boolean; setOn: (v: boolean) => void
  notesOn: boolean; setNotesOn: (v: boolean) => void
  state?: AppState
}) {
  const marks = state?.slots?.[todayStr()] ?? {}
  const all = Object.values(marks)
  const hit = all.filter((m) => m === 'hit').length
  const miss = all.length - hit
  const pct = all.length ? Math.round((hit / all.length) * 100) : null

  return (
    <div className={`challenge-bar ${on ? 'on' : ''}`}>
      <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setOn(!on)}>
        ⚔ {t('challengeMode')}
      </button>
      <button className={`chip ${notesOn ? 'on' : ''}`} aria-pressed={notesOn} onClick={() => setNotesOn(!notesOn)}>
        ✎ {t('noteYourself')}
      </button>
      {on ? (
        <span className="challenge-score">
          <b className="good">✓ {hit}</b> · <b className="bad">✗ {miss}</b>
          {pct !== null && <> · <b className="accent">{pct}%</b> {t('slotsUsed')}</>}
        </span>
      ) : (
        <span className="muted small challenge-hint">{t('challengeHint')}</span>
      )}
    </div>
  )
}

/** A block the user asked to write a note for. A fresh object per tap, so
 *  tapping the same block twice still re-focuses its field. */
type NotePick = { i: number } | null

/**
 * "Note yourself": one line per block saying what you did in it — or, for a
 * block that hasn't started yet, what you mean to do in it.
 * It lives under the grid rather than inside the cells — a 96-cell grid has
 * no room for a text field, and a list is far easier to fill on a phone.
 * Any block can be opened here, by tapping it in the grid or picking it from
 * the "note a block" menu.
 */
function SlotNotes({
  marks, notes, note, label, prefix, current, count, picked,
}: {
  marks: Record<string, SlotMark>
  notes: Record<string, string>
  note: (key: string, text: string) => void
  label: (i: number) => string
  prefix: 'h' | 'q'
  current: number
  count: number
  picked: NotePick
}) {
  // blocks opened this visit; they stay put while you type, even when the
  // field is momentarily empty
  const [opened, setOpened] = useState<Set<number>>(() => new Set())
  const [focusIdx, setFocusIdx] = useState<number | null>(null)
  const inputs = useRef(new Map<number, HTMLInputElement>())

  function open(i: number) {
    setOpened((o) => (o.has(i) ? o : new Set(o).add(i)))
    setFocusIdx(i)
  }
  function close(i: number) {
    note(`${prefix}${i}`, '')
    setOpened((o) => {
      const n = new Set(o)
      n.delete(i)
      return n
    })
  }

  useEffect(() => { if (picked) open(picked.i) }, [picked])
  useEffect(() => {
    if (focusIdx === null) return
    const el = inputs.current.get(focusIdx)
    el?.focus()
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setFocusIdx(null)
  }, [focusIdx])

  // everything judged, annotated or opened, plus the block running now
  const idx = new Set<number>(opened)
  for (const k of Object.keys(marks)) if (k.startsWith(prefix)) idx.add(Number(k.slice(1)))
  for (const k of Object.keys(notes)) if (k.startsWith(prefix)) idx.add(Number(k.slice(1)))
  idx.add(current)
  const rows = [...idx].filter((i) => Number.isFinite(i) && i >= 0 && i < count).sort((a, b) => a - b)
  const rest = Array.from({ length: count }, (_, i) => i).filter((i) => !idx.has(i))

  return (
    <div className="slot-notes">
      <div className="slot-notes-head">
        <span>✎ {t('noteYourself')}</span>
        {rest.length > 0 && (
          <select
            className="slot-note-add"
            value=""
            onChange={(e) => { if (e.target.value !== '') open(Number(e.target.value)) }}
            aria-label={t('noteAddBlock')}
          >
            <option value="">＋ {t('noteAddBlock')}</option>
            {rest.map((i) => (
              <option key={i} value={i}>
                {label(i)}{i > current ? ` · ${t('noteTodo')}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted small slot-notes-hint">{t('noteHint')}</p>
      {rows.map((i) => {
        const key = `${prefix}${i}`
        const mark = marks[key]
        // a block that hasn't started is a plan, not a record
        const todo = i > current
        return (
          <div className={`slot-note ${todo ? 'is-todo' : ''}`} key={key}>
            <label className={`slot-note-when ${mark ? `is-${mark}` : ''}`} htmlFor={`note-${key}`}>
              {mark === 'hit' ? '✓' : mark === 'miss' ? '✗' : todo ? '○' : '·'} {label(i)}
              {todo && <em className="slot-note-tag">{t('noteTodo')}</em>}
            </label>
            <input
              id={`note-${key}`}
              ref={(el) => { if (el) inputs.current.set(i, el); else inputs.current.delete(i) }}
              type="text"
              value={notes[key] ?? ''}
              placeholder={todo ? t('notePlaceholderTodo') : t('notePlaceholder')}
              onChange={(e) => note(key, e.target.value)}
              aria-label={todo ? `What you will do at ${label(i)}` : `What you did at ${label(i)}`}
            />
            {i !== current && !mark && (
              <button
                type="button"
                className="slot-note-x"
                onClick={() => close(i)}
                aria-label={`Remove the note for ${label(i)}`}
                data-tip="remove"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ClockHero({ now }: { now: Date }) {
  const h = now.getHours()
  const m = now.getMinutes()
  const s = now.getSeconds()
  const dayPct = ((h * 60 + m + s / 60) / 1440) * 100
  const clock = [h, m, s].map((v) => String(v).padStart(2, '0'))

  return (
    <div className="hero">
      <p className="hero-kicker">
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
      <div className="hero-num clock">
        {clock[0]}
        <span className="clock-sep">:</span>
        {clock[1]}
        <span className="clock-sec">{clock[2]}</span>
      </div>
      <div className="bar" data-tip={`${dayPct.toFixed(1)}% gone · ${(100 - dayPct).toFixed(1)}% remaining`}>
        <div className="bar-fill" style={{ width: `${dayPct}%` }} />
      </div>
      <div className="bar-meta">
        <span>{dayPct.toFixed(1)}% {t('ofTodayGone')}</span>
        <span>{(100 - dayPct).toFixed(1)}% {t('stillYours')}</span>
      </div>
    </div>
  )
}

export function HoursPanel({ now, state, setState, challenge, notesOn, office }: { now: Date } & SlotProps) {
  const h = now.getHours()
  const hourFill = ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100
  const hoursLeft = 24 - h - 1
  const { marks, notes, cycle, note } = useSlots({ state, setState })
  const live = !!challenge && !!setState
  const noting = !!notesOn && !!setState
  const [picked, setPicked] = useState<NotePick>(null)
  const score = tally(marks, 'h')

  return (
    <div className={`panel ${live ? 'challenging' : ''} ${office ? 'office-on' : ''}`}>
      <div className="panel-head">
        <h2>{t('hours')}</h2>
        <div className="panel-stat">
          {live && score.pct !== null ? (
            <><b className="good">✓ {score.hit}</b> · <b className="bad">✗ {score.miss}</b> · <b className="accent">{score.pct}%</b></>
          ) : (
            <><b>{h}</b> {t('spent')} · <b className="accent">{hoursLeft}</b> {t('wholeHoursLeft')}</>
          )}
        </div>
      </div>
      <div className="hgrid">
        {Array.from({ length: 24 }, (_, i) => {
          const cls = i < h ? 'spent' : i === h ? 'today' : 'left'
          const key = hourKey(i)
          const mark = live ? marks[key] : undefined
          // only slots that have actually started can be judged
          const judgeable = live && i <= h
          // with challenge off, taps are free to open the block's note
          const notable = noting && !live
          const hasNote = noting && !!notes[key]?.trim()
          const work = inOffice(office, i * 60, 60)
          const label = `${String(i).padStart(2, '0')}:00${work ? ` · ${t('officeTag')}` : ''}`
          const tip = judgeable
            ? `${label} — ${mark === 'hit' ? 'used well' : mark === 'miss' ? 'wasted' : 'tap to judge'}`
            : notable
              ? `${label} — ${hasNote ? notes[key] : i > h ? 'tap to plan this block' : 'tap to add a note'}`
              : i === h
                ? `${label} — ${Math.round(hourFill)}% filled · ${Math.round(100 - hourFill)}% left`
                : i < h
                  ? `${label} — spent`
                  : `${label} — still yours`
          const common = {
            className: `cell ${cls} ${mark ? `mark-${mark}` : ''} ${judgeable ? 'judgeable' : ''} ${notable ? 'notable' : ''} ${hasNote ? 'has-note' : ''} ${work ? 'office' : ''}`,
            'data-tip': tip,
            style: i === h ? ({ ['--fill' as string]: `${hourFill}%` }) : undefined,
          }
          return judgeable ? (
            <button key={i} type="button" {...common} onClick={() => cycle(key)} aria-label={tip}>
              {mark === 'hit' ? '✓' : mark === 'miss' ? '✗' : i}
            </button>
          ) : notable ? (
            <button key={i} type="button" {...common} onClick={() => setPicked({ i })} aria-label={tip}>
              {i}
            </button>
          ) : (
            <span key={i} {...common}>{i}</span>
          )
        })}
      </div>
      {live && <p className="muted small">{t('challengeLegend')}</p>}
      {noting && (
        <SlotNotes
          marks={marks} notes={notes} note={note} prefix="h" current={h}
          count={24} picked={picked}
          label={(i) => `${String(i).padStart(2, '0')}:00`}
        />
      )}
    </div>
  )
}

export function QuartersPanel({ now, state, setState, challenge, notesOn, office }: { now: Date } & SlotProps) {
  const minutesGone = now.getHours() * 60 + now.getMinutes()
  const quarterIdx = Math.floor(minutesGone / 15) // 0..95, the one running now
  const quartersLeft = 96 - quarterIdx - 1
  const quarterFill = ((((minutesGone % 15) * 60) + now.getSeconds()) / 900) * 100
  const { marks, notes, cycle, note } = useSlots({ state, setState })
  const live = !!challenge && !!setState
  const noting = !!notesOn && !!setState
  const [picked, setPicked] = useState<NotePick>(null)
  const score = tally(marks, 'q')

  return (
    <div className={`panel ${live ? 'challenging' : ''} ${office ? 'office-on' : ''}`}>
      <div className="panel-head">
        <h2>{t('quarterHours')}</h2>
        <div className="panel-stat">
          {live && score.pct !== null ? (
            <><b className="good">✓ {score.hit}</b> · <b className="bad">✗ {score.miss}</b> · <b className="accent">{score.pct}%</b></>
          ) : (
            <><b>{quarterIdx}</b> {t('spent')} · <b className="accent">{quartersLeft}</b> {t('minLeft')}</>
          )}
        </div>
      </div>
      <div className="qgrid">
        {Array.from({ length: 96 }, (_, i) => {
          const hh = String(Math.floor(i / 4)).padStart(2, '0')
          const mm = String((i % 4) * 15).padStart(2, '0')
          const cls = i < quarterIdx ? 'spent' : i === quarterIdx ? 'today' : 'left'
          const key = quarterKey(i)
          const mark = live ? marks[key] : undefined
          const judgeable = live && i <= quarterIdx
          const notable = noting && !live
          const hasNote = noting && !!notes[key]?.trim()
          const work = inOffice(office, i * 15, 15)
          const at = `${hh}:${mm}${work ? ` · ${t('officeTag')}` : ''}`
          const tip = judgeable
            ? `${at} — ${mark === 'hit' ? 'used well' : mark === 'miss' ? 'wasted' : 'tap to judge'}`
            : notable
              ? `${at} — ${hasNote ? notes[key] : i > quarterIdx ? 'tap to plan this block' : 'tap to add a note'}`
              : i === quarterIdx
                ? `${at} — ${Math.round(quarterFill)}% filled · ${Math.round(100 - quarterFill)}% left`
                : `${at} — ${i < quarterIdx ? 'spent' : 'still yours'}`
          const common = {
            className: `qcell ${cls} ${mark ? `mark-${mark}` : ''} ${judgeable ? 'judgeable' : ''} ${notable ? 'notable' : ''} ${hasNote ? 'has-note' : ''} ${work ? 'office' : ''}`,
            'data-tip': tip,
            style: i === quarterIdx ? ({ ['--fill' as string]: `${quarterFill}%` }) : undefined,
          }
          return judgeable ? (
            <button key={i} type="button" {...common} onClick={() => cycle(key)} aria-label={tip}>
              {mark === 'hit' ? '✓' : mark === 'miss' ? '✗' : ''}
            </button>
          ) : notable ? (
            <button key={i} type="button" {...common} onClick={() => setPicked({ i })} aria-label={tip} />
          ) : (
            <span key={i} {...common} />
          )
        })}
      </div>
      <p className="muted small">
        {live
          ? t('challengeLegend')
          : `Each square is 15 minutes. ${quartersLeft} blocks is ${(quartersLeft / 4).toFixed(1)} hours — enough to move something forward.`}
      </p>
      {noting && (
        <SlotNotes
          marks={marks} notes={notes} note={note} prefix="q" current={quarterIdx}
          count={96} picked={picked}
          label={(i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`}
        />
      )}
    </div>
  )
}
