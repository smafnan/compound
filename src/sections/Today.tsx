import { useEffect, useState } from 'react'
import { t } from '../i18n'

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export default function Today() {
  const now = useNow()
  return (
    <section className="section">
      <ClockHero now={now} />
      <HoursPanel now={now} />
      <QuartersPanel now={now} />
    </section>
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

export function HoursPanel({ now }: { now: Date }) {
  const h = now.getHours()
  const hourFill = ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100
  const hoursLeft = 24 - h - 1

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('hours')}</h2>
        <div className="panel-stat">
          <b>{h}</b> {t('spent')} · <b className="accent">{hoursLeft}</b> {t('wholeHoursLeft')}
        </div>
      </div>
      <div className="hgrid">
        {Array.from({ length: 24 }, (_, i) => {
          const cls = i < h ? 'spent' : i === h ? 'today' : 'left'
          const tip =
            i === h
              ? `${String(i).padStart(2, '0')}:00 — ${Math.round(hourFill)}% filled · ${Math.round(100 - hourFill)}% left`
              : i < h
                ? `${String(i).padStart(2, '0')}:00 — spent`
                : `${String(i).padStart(2, '0')}:00 — still yours`
          return (
            <span
              key={i}
              className={`cell ${cls}`}
              data-tip={tip}
              style={i === h ? ({ ['--fill' as string]: `${hourFill}%` }) : undefined}
            >
              {i}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function QuartersPanel({ now }: { now: Date }) {
  const minutesGone = now.getHours() * 60 + now.getMinutes()
  const quarterIdx = Math.floor(minutesGone / 15) // 0..95, the one running now
  const quartersLeft = 96 - quarterIdx - 1
  const quarterFill = ((((minutesGone % 15) * 60) + now.getSeconds()) / 900) * 100

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('quarterHours')}</h2>
        <div className="panel-stat">
          <b>{quarterIdx}</b> {t('spent')} · <b className="accent">{quartersLeft}</b> {t('minLeft')}
        </div>
      </div>
      <div className="qgrid">
        {Array.from({ length: 96 }, (_, i) => {
          const hh = String(Math.floor(i / 4)).padStart(2, '0')
          const mm = String((i % 4) * 15).padStart(2, '0')
          const cls = i < quarterIdx ? 'spent' : i === quarterIdx ? 'today' : 'left'
          const tip =
            i === quarterIdx
              ? `${hh}:${mm} — ${Math.round(quarterFill)}% filled · ${Math.round(100 - quarterFill)}% left`
              : `${hh}:${mm} — ${i < quarterIdx ? 'spent' : 'still yours'}`
          return (
            <span
              key={i}
              className={`qcell ${cls}`}
              data-tip={tip}
              style={i === quarterIdx ? ({ ['--fill' as string]: `${quarterFill}%` }) : undefined}
            />
          )
        })}
      </div>
      <p className="muted small">
        Each square is 15 minutes. {quartersLeft} blocks is {(quartersLeft / 4).toFixed(1)} hours —
        enough to move something forward.
      </p>
    </div>
  )
}
