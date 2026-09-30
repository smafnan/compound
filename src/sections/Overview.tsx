import { useMemo } from 'react'
import { AppState, avgScore, mainDeadline, parseDate } from '../lib'
import { Hero, MonthGrid } from './Countdown'
import { ClockHero, HoursPanel, QuartersPanel, useNow } from './Today'
import { ChartPanel, GrowthCards } from './Growth'

/** The "everything at once" mode: countdown, month, day, hours,
 *  quarter hours and growth — all together on a single page. */
export default function Overview({ state }: { state: AppState }) {
  const now = useNow()

  const primary = mainDeadline(state, now.getTime())

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // if a deadline overlaps this month, use its range so spent/left match the wall
  const range = primary
    ? { start: parseDate(primary.start), end: parseDate(primary.date) }
    : { start: monthStart, end: monthEnd }

  const monthAvg = useMemo(
    () => avgScore(state, monthStart, new Date(now.getFullYear(), now.getMonth(), now.getDate())),
    [state, now.getDate()], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <section className="section">
      {primary ? (
        <Hero deadline={primary} now={now} />
      ) : (
        <div className="hero">
          <p className="hero-kicker">the whole picture</p>
          <div className="hero-num dim">—</div>
          <p className="hero-sub">Add a deadline in the Countdown tab to see it here too.</p>
        </div>
      )}

      <div className="ov-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>This month</h2>
            <div className="panel-stat">
              productivity{' '}
              <b className="accent">{monthAvg === null ? '—' : `${Math.round(monthAvg * 100)}%`}</b>
            </div>
          </div>
          <MonthGrid
            year={now.getFullYear()}
            month={now.getMonth()}
            start={range.start}
            end={range.end}
            now={now}
          />
        </div>

        <div className="ov-col">
          <ClockHero now={now} />
        </div>
      </div>

      <HoursPanel now={now} />
      <QuartersPanel now={now} />
      <GrowthCards state={state} />
      <ChartPanel state={state} />
    </section>
  )
}
