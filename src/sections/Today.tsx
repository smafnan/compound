import { useEffect, useState } from 'react'
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
}

/** none → hit → miss → none, so one control cycles the whole verdict. */
const NEXT: Record<string, SlotMark | undefined> = { none: 'hit', hit: 'miss', miss: undefined }

export function useSlots({ state, setState }: SlotProps) {
  const date = todayStr()
  const marks = state?.slots?.[date] ?? {}

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

  return { marks, cycle }
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
  useEffect(() => { savePref('challenge', challenge ? 'on' : 'off') }, [challenge])
  return (
    <section className="section">
      <ClockHero now={now} />
      <ChallengeBar on={challenge} setOn={setChallenge} state={state} />
      <HoursPanel now={now} state={state} setState={setState} challenge={challenge} />
      <QuartersPanel now={now} state={state} setState={setState} challenge={challenge} />
    </section>
  )
}

/** The switch into challenge mode, plus today's running score. */
function ChallengeBar({ on, setOn, state }: { on: boolean; setOn: (v: boolean) => void; state?: AppState }) {
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

export function HoursPanel({ now, state, setState, challenge }: { now: Date } & SlotProps) {
  const h = now.getHours()
  const hourFill = ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100
  const hoursLeft = 24 - h - 1
  const { marks, cycle } = useSlots({ state, setState })
  const live = !!challenge && !!setState
  const score = tally(marks, 'h')

  return (
    <div className={`panel ${live ? 'challenging' : ''}`}>
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
          const label = `${String(i).padStart(2, '0')}:00`
          const tip = judgeable
            ? `${label} — ${mark === 'hit' ? 'used well' : mark === 'miss' ? 'wasted' : 'tap to judge'}`
            : i === h
              ? `${label} — ${Math.round(hourFill)}% filled · ${Math.round(100 - hourFill)}% left`
              : i < h
                ? `${label} — spent`
                : `${label} — still yours`
          const common = {
            className: `cell ${cls} ${mark ? `mark-${mark}` : ''} ${judgeable ? 'judgeable' : ''}`,
            'data-tip': tip,
            style: i === h ? ({ ['--fill' as string]: `${hourFill}%` }) : undefined,
          }
          return judgeable ? (
            <button key={i} type="button" {...common} onClick={() => cycle(key)} aria-label={tip}>
              {mark === 'hit' ? '✓' : mark === 'miss' ? '✗' : i}
            </button>
          ) : (
            <span key={i} {...common}>{i}</span>
          )
        })}
      </div>
      {live && <p className="muted small">{t('challengeLegend')}</p>}
    </div>
  )
}

export function QuartersPanel({ now, state, setState, challenge }: { now: Date } & SlotProps) {
  const minutesGone = now.getHours() * 60 + now.getMinutes()
  const quarterIdx = Math.floor(minutesGone / 15) // 0..95, the one running now
  const quartersLeft = 96 - quarterIdx - 1
  const quarterFill = ((((minutesGone % 15) * 60) + now.getSeconds()) / 900) * 100
  const { marks, cycle } = useSlots({ state, setState })
  const live = !!challenge && !!setState
  const score = tally(marks, 'q')

  return (
    <div className={`panel ${live ? 'challenging' : ''}`}>
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
          const tip = judgeable
            ? `${hh}:${mm} — ${mark === 'hit' ? 'used well' : mark === 'miss' ? 'wasted' : 'tap to judge'}`
            : i === quarterIdx
              ? `${hh}:${mm} — ${Math.round(quarterFill)}% filled · ${Math.round(100 - quarterFill)}% left`
              : `${hh}:${mm} — ${i < quarterIdx ? 'spent' : 'still yours'}`
          const common = {
            className: `qcell ${cls} ${mark ? `mark-${mark}` : ''} ${judgeable ? 'judgeable' : ''}`,
            'data-tip': tip,
            style: i === quarterIdx ? ({ ['--fill' as string]: `${quarterFill}%` }) : undefined,
          }
          return judgeable ? (
            <button key={i} type="button" {...common} onClick={() => cycle(key)} aria-label={tip}>
              {mark === 'hit' ? '✓' : mark === 'miss' ? '✗' : ''}
            </button>
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
    </div>
  )
}
