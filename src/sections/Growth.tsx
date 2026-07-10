import { useMemo } from 'react'
import {
  AppState, comparisons, compoundSeries, relDelta, trailingAvg,
} from '../lib'
import { t } from '../i18n'

const CMP_LABEL: Record<string, [string, string]> = {
  day: ['today', 'vsYesterday'],
  week: ['thisWeek', 'vsLastWeek'],
  month: ['thisMonth', 'vsLastMonth'],
  year: ['thisYear', 'vsLastYear'],
}

export default function Growth({ state }: { state: AppState }) {
  const now = new Date()
  const series = useMemo(() => compoundSeries(state, 90, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const avg30 = useMemo(() => trailingAvg(state, 30, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps

  const index = series[series.length - 1] ?? 1
  const yearPace = avg30 === null ? null : Math.pow(1 + avg30 / 100, 365)

  return (
    <section className="section">
      <div className="hero">
        <p className="hero-kicker">{t('compoundIndex')}</p>
        <div className="hero-num">
          ×{index.toFixed(3)}
        </div>
        <p className="hero-sub">
          Every fully productive day compounds you +1%.
          {yearPace !== null && (
            <> At your current pace that's <b className="accent">×{yearPace.toFixed(2)}</b> in a year.</>
          )}
        </p>
      </div>

      <GrowthCards state={state} />
      <ChartPanel state={state} />
    </section>
  )
}

export function GrowthCards({ state }: { state: AppState }) {
  const now = new Date()
  const cards = useMemo(() => comparisons(state, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cards">
      {cards.map((c) => (
        <StatCard
          key={c.key}
          label={t(CMP_LABEL[c.key][0])}
          sub={t(CMP_LABEL[c.key][1])}
          current={c.current}
          previous={c.previous}
        />
      ))}
    </div>
  )
}

export function ChartPanel({ state }: { state: AppState }) {
  const now = new Date()
  const series = useMemo(() => compoundSeries(state, 90, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{t('yourCurve')}</h2>
        <div className="panel-stat">1.00 = where you started 90 days ago</div>
      </div>
      <Chart series={series} />
      <p className="muted small">
        1% better every day for a year is ×37.8. 1% worse every day is ×0.03.
        Small things, done daily, are not small.
      </p>
    </div>
  )
}

function StatCard({
  label, sub, current, previous,
}: { label: string; sub: string; current: number | null; previous: number | null }) {
  const delta = relDelta(current, previous)

  let badge: React.ReactNode
  if (current === null) {
    badge = <span className="delta none">no data yet</span>
  } else if (delta === null) {
    badge = <span className="delta none">no baseline</span>
  } else if (delta === Infinity) {
    badge = <span className="delta up">▲ from zero</span>
  } else if (Math.abs(delta) < 0.5) {
    badge = <span className="delta flat">■ steady</span>
  } else if (delta > 0) {
    badge = <span className="delta up">▲ {delta.toFixed(0)}% {t('better')}</span>
  } else {
    badge = <span className="delta down">▼ {Math.abs(delta).toFixed(0)}% {t('worse')}</span>
  }

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-num">{current === null ? '—' : `${Math.round(current * 100)}%`}</div>
      <div className="stat-foot">
        {badge}
        <span className="muted">{sub}</span>
      </div>
    </div>
  )
}

function Chart({ series }: { series: number[] }) {
  const W = 640
  const H = 220
  const PAD = 12

  const min = Math.min(...series, 1)
  const max = Math.max(...series, 1.001)
  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2)

  const line = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
  const lastX = x(series.length - 1)
  const lastY = y(series[series.length - 1])
  const baseY = y(1)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Compound growth over the last 90 days">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--blue)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* baseline at 1.0 */}
      <line x1={PAD} y1={baseY} x2={W - PAD} y2={baseY} className="chart-base" />
      <text x={PAD + 2} y={baseY - 5} className="chart-tick">1.00</text>
      <polygon points={area} fill="url(#area)" />
      <polyline points={line} className="chart-line" fill="none" />
      <circle cx={lastX} cy={lastY} r="4.5" className="chart-dot" />
      <text
        x={Math.min(lastX, W - 60)}
        y={Math.max(lastY - 10, 14)}
        className="chart-label"
      >
        ×{series[series.length - 1].toFixed(3)}
      </text>
    </svg>
  )
}
