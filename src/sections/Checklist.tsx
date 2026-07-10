import { useMemo, useState } from 'react'
import {
  AppState, MONTHS, daysInMonth, dayScore, fmtDate, todayStr, uid,
} from '../lib'
import { t } from '../i18n'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

export default function Checklist({ state, setState }: Props) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [newTask, setNewTask] = useState('')

  const today = todayStr()
  const days = daysInMonth(view.y, view.m)
  const dateOf = (d: number) => fmtDate(new Date(view.y, view.m, d))

  function shift(dir: number) {
    setView(({ y, m }) => {
      const d = new Date(y, m + dir, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  function toggle(taskId: string, date: string) {
    if (date > today) return
    setState((s) => {
      const cur = s.completions[date] ?? []
      const next = cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]
      const completions = { ...s.completions }
      if (next.length === 0) delete completions[date]
      else completions[date] = next
      return { ...s, completions }
    })
  }

  function addTask(e: React.FormEvent) {
    e.preventDefault()
    const name = newTask.trim()
    if (!name) return
    setState((s) => ({ ...s, tasks: [...s.tasks, { id: uid(), name, createdAt: today }] }))
    setNewTask('')
  }

  function removeTask(id: string) {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }))
  }

  function renameTask(id: string, name: string) {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, name } : t)),
    }))
  }

  // per-day scores for the footer, per-task monthly % for the right column
  const dayScores = useMemo(
    () => Array.from({ length: days }, (_, i) => dayScore(state, dateOf(i + 1))),
    [state, view, days], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const monthAvg = useMemo(() => {
    const vals = dayScores.filter((v, i): v is number => v !== null && dateOf(i + 1) <= today)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }, [dayScores]) // eslint-disable-line react-hooks/exhaustive-deps

  function taskMonthPct(taskId: string, createdAt: string): number | null {
    let done = 0
    let countable = 0
    for (let d = 1; d <= days; d++) {
      const date = dateOf(d)
      if (date > today || date < createdAt) continue
      countable++
      if ((state.completions[date] ?? []).includes(taskId)) done++
    }
    return countable === 0 ? null : done / countable
  }

  const isThisMonth = view.y === now.getFullYear() && view.m === now.getMonth()

  return (
    <section className="section">
      <div className="panel">
        <div className="panel-head sheet-head">
          <div className="month-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
            <h2>{MONTHS[view.m]} <span className="muted">{view.y}</span></h2>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month">›</button>
            {!isThisMonth && (
              <button
                className="btn-ghost"
                onClick={() => setView({ y: now.getFullYear(), m: now.getMonth() })}
              >
                Today
              </button>
            )}
          </div>
          <div className="panel-stat">
            {t('monthProductivity')}{' '}
            <b className="accent">{monthAvg === null ? '—' : `${Math.round(monthAvg * 100)}%`}</b>
          </div>
        </div>

        <div className="sheet-scroll">
          <div className="sheet" style={{ ['--days' as string]: days }}>
            {/* header row */}
            <div className="sh-corner">{t('task')}</div>
            {Array.from({ length: days }, (_, i) => {
              const date = dateOf(i + 1)
              return (
                <div key={i} className={`sh-day ${date === today ? 'is-today' : ''} ${date > today ? 'future' : ''}`}>
                  {i + 1}
                </div>
              )
            })}
            <div className="sh-corner right stick-r">%</div>

            {/* one row per task */}
            {state.tasks.map((t) => {
              const pct = taskMonthPct(t.id, t.createdAt)
              return (
                <TaskRow
                  key={t.id}
                  name={t.name}
                  onRename={(name) => renameTask(t.id, name)}
                  onRemove={() => removeTask(t.id)}
                  cells={Array.from({ length: days }, (_, i) => {
                    const date = dateOf(i + 1)
                    const done = (state.completions[date] ?? []).includes(t.id)
                    const disabled = date > today || date < t.createdAt
                    return (
                      <button
                        key={i}
                        className={`tick ${done ? 'done' : ''} ${date === today ? 'is-today' : ''}`}
                        disabled={disabled}
                        onClick={() => toggle(t.id, date)}
                        aria-label={`${t.name} on day ${i + 1}: ${done ? 'done' : 'not done'}`}
                      >
                        {done ? '✓' : ''}
                      </button>
                    )
                  })}
                  pct={pct}
                />
              )
            })}

            {/* footer: per-day productivity */}
            <div className="sh-corner foot-label">{t('dayScore')}</div>
            {dayScores.map((v, i) => {
              const date = dateOf(i + 1)
              const future = date > today
              return (
                <div
                  key={i}
                  className={`day-bar ${date === today ? 'is-today' : ''}`}
                  data-tip={v === null || future ? undefined : `Day ${i + 1}: ${Math.round(v * 100)}% productive`}
                >
                  {!future && v !== null && (
                    <i style={{ height: `${Math.max(v * 100, 4)}%` }} className={v >= 0.7 ? 'hi' : v >= 0.4 ? 'mid' : 'lo'} />
                  )}
                </div>
              )
            })}
            <div className="sh-corner right foot-label stick-r">
              {monthAvg === null ? '—' : `${Math.round(monthAvg * 100)}%`}
            </div>
          </div>
        </div>

        <form className="add-form" onSubmit={addTask}>
          <input
            type="text"
            placeholder="Add a daily task (e.g. Meditate 10 min)"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
          />
          <button type="submit" className="btn-accent">{t('addTask')}</button>
        </form>
        {state.tasks.length === 0 && (
          <p className="muted">No tasks yet — add the things you want to do every single day.</p>
        )}
      </div>
    </section>
  )
}

function TaskRow({
  name, cells, pct, onRename, onRemove,
}: {
  name: string
  cells: React.ReactNode[]
  pct: number | null
  onRename: (name: string) => void
  onRemove: () => void
}) {
  return (
    <>
      <div className="sh-task">
        <input
          className="sh-task-name"
          value={name}
          data-tip={name.length > 16 ? name : undefined}
          onChange={(e) => onRename(e.target.value)}
          onBlur={(e) => { if (!e.target.value.trim()) onRename('Untitled task') }}
          aria-label={`Task name: ${name}`}
        />
        <button className="icon-btn tiny" title={`Delete ${name}`} onClick={onRemove}>✕</button>
      </div>
      {cells}
      <div className="sh-pct stick-r" data-tip={pct === null ? undefined : `${name}: ${Math.round(pct * 100)}% this month`}>
        {pct === null ? '—' : `${Math.round(pct * 100)}%`}
      </div>
    </>
  )
}
