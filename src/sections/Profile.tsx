import { useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AppState, currentStreak, focusMinutes, taskStats, totalTicks, trailingAvg, weekSplit,
} from '../lib'
import { SyncStatus, cloudEnabled } from '../cloud'
import FontPicker from '../FontPicker'
import { BACKDROPS, BgKind } from '../Backdrop'
import { downloadReport, ReportRange } from '../report'
import { t } from '../i18n'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  user: User | null
  sync: SyncStatus
  font: string
  setFont: (f: string) => void
  bg: BgKind
  setBg: (b: BgKind) => void
  theme: string
  setTheme: (t: string) => void
}

const RANGES: { id: ReportRange; key: string }[] = [
  { id: 7, key: 'last7' },
  { id: 30, key: 'last30d' },
  { id: 90, key: 'last90' },
  { id: 365, key: 'lastYear' },
]

export default function Profile({
  state, setState, user, sync, font, setFont, bg, setBg, theme, setTheme,
}: Props) {
  const now = new Date()
  const [range, setRange] = useState<ReportRange>(30)
  const [busyPdf, setBusyPdf] = useState(false)

  const stats = useMemo(() => taskStats(state, 30, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const streak = useMemo(() => currentStreak(state, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const avg30 = useMemo(() => trailingAvg(state, 30, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const split = useMemo(() => weekSplit(state, 30, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const focus30 = useMemo(() => focusMinutes(state, 30, now), [state]) // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = useMemo(() => totalTicks(state), [state])

  const rated = stats.filter((s) => s.pct !== null)
  const strong = [...rated].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 3).filter((s) => (s.pct ?? 0) >= 0.6)
  const weak = [...rated].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 3).filter((s) => (s.pct ?? 0) < 0.5)

  const suggestions = useMemo(() => {
    const out: string[] = []
    if (weak.length > 0) {
      out.push(`"${weak[0].name}" is landing ${Math.round((weak[0].pct ?? 0) * 100)}% of days — shrink it (5-minute version) or move it to a time it can't be skipped.`)
    }
    if (split.weekday !== null && split.weekend !== null && split.weekday - split.weekend > 0.15) {
      out.push('Weekends are your weak spot — plan a lighter weekend routine instead of skipping entirely.')
    }
    if (streak === 0) out.push('Your streak is at zero. Do the smallest task on the list right now — streaks start with one tick.')
    if (state.tasks.length < 3) out.push('You track very few habits — add one small anchor habit (e.g. "2-minute tidy") to build momentum.')
    if (state.tasks.length > 8) out.push('You track a lot of habits — consider pruning to the vital few; consistency beats coverage.')
    if (focus30 === 0) out.push('No focus sessions logged this month — try the Focus timer on the Canvas with a named task.')
    if (avg30 !== null && avg30 >= 0.8) out.push('You are above 80% this month — raise the bar: add one stretch habit before the routine gets too comfortable.')
    if (out.length === 0) out.push('Steady as she goes — keep the streak alive and revisit the routine at month end.')
    return out
  }, [weak, split, streak, state.tasks.length, focus30, avg30])

  const focusRecent = [...state.focus]
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, 6)

  const initial = (state.profile.name || user?.email || 'C').trim().charAt(0).toUpperCase()

  function patchProfile(field: 'name' | 'goal', value: string) {
    setState((s) => ({ ...s, profile: { ...s.profile, [field]: value } }))
  }

  async function exportPdf() {
    setBusyPdf(true)
    try {
      await downloadReport(state, range)
    } finally {
      setBusyPdf(false)
    }
  }

  return (
    <section className="section">
      {/* identity */}
      <div className="panel id-card">
        <div className="avatar" aria-hidden>{initial}</div>
        <div className="id-fields">
          <input
            className="id-name"
            placeholder="Your name"
            value={state.profile.name}
            onChange={(e) => patchProfile('name', e.target.value)}
          />
          <input
            className="id-goal"
            placeholder="Your goal — why are you compounding?"
            value={state.profile.goal}
            onChange={(e) => patchProfile('goal', e.target.value)}
          />
          <div className="id-meta">
            {user ? <span className="ok">☁ {user.email} · {sync}</span> : cloudEnabled ? <span>☁ not signed in — data on this device only</span> : <span>☁ cloud sync off</span>}
            <span>joined {state.profile.joined}</span>
          </div>
        </div>
      </div>

      {/* headline stats */}
      <div className="cards" data-cols="5">
        <StatTile label={t('streak')} value={`${streak}`} sub={t('days')} hot={streak > 0} />
        <StatTile label={t('avg30')} value={avg30 === null ? '—' : `${Math.round(avg30 * 100)}%`} sub={t('productivity')} />
        <StatTile label={t('totalTicks')} value={`${ticks}`} sub={t('allTime')} />
        <StatTile label={t('focus')} value={`${Math.round(focus30 / 60 * 10) / 10}h`} sub={t('last30')} />
        <StatTile
          label={t('weekends')}
          value={split.weekend === null ? '—' : `${Math.round(split.weekend * 100)}%`}
          sub={split.weekday === null ? '—' : `${Math.round(split.weekday * 100)}%`}
        />
      </div>

      {/* insights */}
      <div className="row-2 insights">
        <div className="panel">
          <div className="panel-head"><h2>{t('goingWell')}</h2></div>
          {strong.length === 0 && <p className="muted">Nothing above 60% yet — pick one habit and protect it.</p>}
          {strong.map((s) => (
            <div key={s.id} className="insight-row good" data-tip={`${s.streak} day streak`}>
              <span className="insight-name">{s.name}</span>
              <span className="insight-pct">{Math.round((s.pct ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>{t('painPoints')}</h2></div>
          {weak.length === 0 && <p className="muted">No habit under 50% — clean sheet.</p>}
          {weak.map((s) => (
            <div key={s.id} className="insight-row bad" data-tip={`${s.streak} day streak`}>
              <span className="insight-name">{s.name}</span>
              <span className="insight-pct">{Math.round((s.pct ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>{t('whatToImprove')}</h2></div>
        <ul className="suggestions">
          {suggestions.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      {/* focus history */}
      <div className="panel">
        <div className="panel-head">
          <h2>{t('focusSessions')}</h2>
          <div className="panel-stat"><b className="accent">{state.focus.length}</b> {t('logged')}</div>
        </div>
        {focusRecent.length === 0 && (
          <p className="muted">None yet — add a Focus timer on the Canvas, name the task, and finish a block.</p>
        )}
        {focusRecent.map((f) => (
          <div key={f.id} className="focus-row">
            <span className="focus-task">{f.task || 'Untitled focus'}</span>
            <span className="focus-min">{f.minutes} min</span>
            <span className="focus-when">{new Date(f.endedAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>

      {/* PDF export */}
      <div className="panel">
        <div className="panel-head">
          <h2>{t('progressReport')}</h2>
          <div className="panel-stat">PDF</div>
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          {RANGES.map((r) => (
            <button key={r.id} className={`chip ${range === r.id ? 'on' : ''}`} onClick={() => setRange(r.id)}>
              {t(r.key)}
            </button>
          ))}
        </div>
        <button className="btn-accent" disabled={busyPdf} onClick={() => void exportPdf()}>
          {busyPdf ? t('drawing') : `⭳ ${t('downloadPdf')}`}
        </button>
      </div>

      {/* look & feel */}
      <div className="panel">
        <div className="panel-head"><h2>{t('lookFeel')}</h2></div>
        <div className="pref-block">
          <span className="pref-label">{t('displayFont')}</span>
          <FontPicker value={font} onChange={setFont} />
        </div>
        <div className="pref-block">
          <span className="pref-label">{t('backgroundScene')}</span>
          <div className="bg-grid">
            {BACKDROPS.map((b) => (
              <button
                key={b.id}
                className={`bg-card bgp-${b.id} ${bg === b.id ? 'on' : ''}`}
                onClick={() => setBg(b.id)}
                data-tip={b.id === 'none' ? 'No background' : `${b.label} — animated`}
              >
                <span className="bg-icon">{b.icon}</span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pref-block">
          <span className="pref-label">{t('theme')}</span>
          <div className="chips">
            {['paper', 'night', 'neo'].map((t) => (
              <button key={t} className={`chip ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)}>
                {t === 'paper' ? '☀ Paper' : t === 'night' ? '☾ Night' : '◇ Neo'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function StatTile({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`stat-card tile ${hot ? 'hot' : ''}`} data-tip={`${label}: ${value} ${sub}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-num">{value}</div>
      <div className="stat-foot"><span className="muted">{sub}</span></div>
    </div>
  )
}
