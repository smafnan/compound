import { useEffect, useRef, useState } from 'react'
import { AppState, CanvasItem, FocusSession, WidgetKind, parseDate, uid } from '../lib'
import { Hero, MonthGrid } from './Countdown'
import { ClockHero, HoursPanel, QuartersPanel, useNow } from './Today'
import { ChartPanel, GrowthCards } from './Growth'
import { playBeep, playChime } from '../sound'

interface Props {
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
}

const PALETTE: { kind: WidgetKind; label: string; icon: string }[] = [
  { kind: 'clock', label: 'Clock', icon: '◔' },
  { kind: 'pomodoro', label: 'Focus timer', icon: '⏱' },
  { kind: 'countdown', label: 'Countdown', icon: '◳' },
  { kind: 'month', label: 'Month', icon: '▤' },
  { kind: 'hours', label: 'Hours', icon: '▥' },
  { kind: 'quarters', label: 'Quarters', icon: '▦' },
  { kind: 'growth', label: 'Growth', icon: '◮' },
  { kind: 'curve', label: 'Curve', icon: '∿' },
  { kind: 'spotify', label: 'Spotify', icon: '♫' },
  { kind: 'video', label: 'Video', icon: '▶' },
]

const DEFAULT_W: Record<WidgetKind, number> = {
  clock: 350, pomodoro: 280, countdown: 400, month: 300, hours: 460,
  quarters: 500, growth: 520, curve: 520, spotify: 360, video: 480,
}
const MIN_W = 230
const MAX_W = 860
const MIN_H = 120
const MAX_H = 900

/** Free-form dashboard: drop widgets, drag them anywhere, resize at the corner. */
export default function Canvas({ state, setState }: Props) {
  const now = useNow()
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const sizeRef = useRef<{ id: string; x0: number; y0: number; w0: number; h0: number } | null>(null)
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null)
  const liveRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const [liveW, setLiveW] = useState<{ id: string; w: number; h: number } | null>(null)
  const liveWRef = useRef<{ id: string; w: number; h: number } | null>(null)

  const items = state.canvas
  const maxZ = items.reduce((m, i) => Math.max(m, i.z), 0)

  function add(kind: WidgetKind, x?: number, y?: number) {
    setState((s) => {
      const n = s.canvas.length
      const z = s.canvas.reduce((m, i) => Math.max(m, i.z), 0) + 1
      const item: CanvasItem = {
        id: uid(), kind, z,
        x: Math.max(0, x ?? 24 + (n % 6) * 48),
        y: Math.max(0, y ?? 24 + (n % 6) * 48),
      }
      return { ...s, canvas: [...s.canvas, item] }
    })
  }

  function remove(id: string) {
    setState((s) => ({ ...s, canvas: s.canvas.filter((i) => i.id !== id) }))
  }

  function patchCfg(id: string, patch: Record<string, string>) {
    setState((s) => ({
      ...s,
      canvas: s.canvas.map((i) => (i.id === id ? { ...i, cfg: { ...i.cfg, ...patch } } : i)),
    }))
  }

  function logFocus(session: FocusSession) {
    setState((s) => ({ ...s, focus: [session, ...s.focus] }))
  }

  function bringToFront(id: string) {
    setState((s) => ({ ...s, canvas: s.canvas.map((i) => (i.id === id ? { ...i, z: maxZ + 1 } : i)) }))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const kind = e.dataTransfer.getData('widget') as WidgetKind
    if (!PALETTE.some((p) => p.kind === kind)) return
    const r = boardRef.current!.getBoundingClientRect()
    add(kind, e.clientX - r.left - 60, e.clientY - r.top - 16)
  }

  // ---- move ----
  function onHandleDown(e: React.PointerEvent, item: CanvasItem) {
    if ((e.target as Element).closest('button')) return
    const r = boardRef.current!.getBoundingClientRect()
    dragRef.current = { id: item.id, dx: e.clientX - r.left - item.x, dy: e.clientY - r.top - item.y }
    bringToFront(item.id)
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ok */ }
  }
  function onHandleMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const r = boardRef.current!.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - r.left - d.dx, 0), Math.max(r.width - 120, 0))
    const y = Math.min(Math.max(e.clientY - r.top - d.dy, 0), Math.max(r.height - 48, 0))
    liveRef.current = { id: d.id, x, y }
    setLive(liveRef.current)
  }
  function onHandleUp() {
    const d = dragRef.current
    const pos = liveRef.current
    dragRef.current = null
    liveRef.current = null
    if (d && pos && pos.id === d.id) {
      setState((s) => ({ ...s, canvas: s.canvas.map((i) => (i.id === d.id ? { ...i, x: pos.x, y: pos.y } : i)) }))
    }
    setLive(null)
  }

  // ---- resize (both axes, like a normal window) ----
  function onGripDown(e: React.PointerEvent, item: CanvasItem) {
    e.stopPropagation()
    const el = (e.currentTarget as HTMLElement).closest('.widget') as HTMLElement | null
    sizeRef.current = {
      id: item.id,
      x0: e.clientX,
      y0: e.clientY,
      w0: item.w ?? DEFAULT_W[item.kind],
      h0: item.h ?? el?.offsetHeight ?? 200,
    }
    bringToFront(item.id)
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* ok */ }
  }
  function onGripMove(e: React.PointerEvent) {
    const s = sizeRef.current
    if (!s) return
    const w = Math.min(MAX_W, Math.max(MIN_W, s.w0 + (e.clientX - s.x0)))
    const h = Math.min(MAX_H, Math.max(MIN_H, s.h0 + (e.clientY - s.y0)))
    liveWRef.current = { id: s.id, w, h }
    setLiveW(liveWRef.current)
  }
  function onGripUp() {
    const s = sizeRef.current
    const lw = liveWRef.current
    sizeRef.current = null
    liveWRef.current = null
    if (s && lw && lw.id === s.id) {
      setState((st) => ({
        ...st,
        canvas: st.canvas.map((i) => (i.id === s.id ? { ...i, w: lw.w, h: lw.h } : i)),
      }))
    }
    setLiveW(null)
  }

  return (
    <section className="section">
      <div className="panel pal-panel">
        <div className="panel-head">
          <h2>Canvas</h2>
          <div className="panel-stat">click to add · drag to place · pull the corner to resize</div>
        </div>
        <div className="palette">
          {PALETTE.map((p) => (
            <button
              key={p.kind}
              className="pal-chip"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('widget', p.kind)}
              onClick={() => add(p.kind)}
              title={`Add ${p.label}`}
            >
              <span aria-hidden>{p.icon}</span> {p.label}
            </button>
          ))}
          {items.length > 0 && (
            <button className="btn-ghost" onClick={() => setState((s) => ({ ...s, canvas: [] }))}>
              clear all
            </button>
          )}
        </div>
      </div>

      <div className="board" ref={boardRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {items.length === 0 && (
          <div className="board-hint">
            your space is empty — grab a widget from the tray above
            <br />
            and build the screen <em>you</em> want to stare at
          </div>
        )}
        {items.map((item) => {
          const pos = live && live.id === item.id ? live : item
          const sizing = liveW && liveW.id === item.id ? liveW : null
          const width = sizing ? sizing.w : item.w ?? DEFAULT_W[item.kind]
          const height = sizing ? sizing.h : item.h
          return (
            <div
              key={item.id}
              className={`widget widget-${item.kind} ${height ? 'fixed-h' : ''}`}
              style={{ left: pos.x, top: pos.y, zIndex: item.z, width, height }}
            >
              <div
                className="widget-head"
                onPointerDown={(e) => onHandleDown(e, item)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <span className="widget-grip" aria-hidden>⣿</span>
                <span className="widget-title">{PALETTE.find((p) => p.kind === item.kind)?.label}</span>
                <button className="icon-btn tiny" title="Remove" onClick={() => remove(item.id)}>✕</button>
              </div>
              <div className="widget-body">
                <Widget
                  item={item}
                  state={state}
                  now={now}
                  onCfg={(patch) => patchCfg(item.id, patch)}
                  onFocusDone={logFocus}
                />
              </div>
              <div
                className="widget-resize"
                data-tip="Drag to resize"
                onPointerDown={(e) => onGripDown(e, item)}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onPointerCancel={onGripUp}
              >
                ◢
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

interface WidgetProps {
  item: CanvasItem
  state: AppState
  now: Date
  onCfg: (patch: Record<string, string>) => void
  onFocusDone: (s: FocusSession) => void
}

function Widget({ item, state, now, onCfg, onFocusDone }: WidgetProps) {
  const primary =
    state.deadlines.find((d) => d.id === state.primaryId) ?? state.deadlines[0] ?? null

  switch (item.kind) {
    case 'clock':
      return <ClockHero now={now} />
    case 'pomodoro':
      return (
        <Pomodoro
          task={item.cfg?.task ?? ''}
          focusMin={clampMin(item.cfg?.focusMin, 25)}
          breakMin={clampMin(item.cfg?.breakMin, 5)}
          onCfg={onCfg}
          onDone={onFocusDone}
        />
      )
    case 'countdown':
      return primary
        ? <Hero deadline={primary} now={now} />
        : <p className="muted">No deadline yet — add one in the Countdown tab.</p>
    case 'month': {
      const start = primary ? parseDate(primary.start) : new Date(now.getFullYear(), now.getMonth(), 1)
      const end = primary ? parseDate(primary.date) : new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return <MonthGrid year={now.getFullYear()} month={now.getMonth()} start={start} end={end} now={now} />
    }
    case 'hours':
      return <HoursPanel now={now} />
    case 'quarters':
      return <QuartersPanel now={now} />
    case 'growth':
      return <GrowthCards state={state} />
    case 'curve':
      return <ChartPanel state={state} />
    case 'spotify':
      return <SpotifyWidget url={item.cfg?.url ?? ''} onUrl={(u) => onCfg({ url: u })} />
    case 'video':
      return <VideoWidget url={item.cfg?.url ?? ''} onUrl={(u) => onCfg({ url: u })} />
  }
}

/** Keep configured minutes sane (1–180) with a fallback default. */
function clampMin(raw: string | undefined, dflt: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.min(180, Math.round(n)) : dflt
}

/**
 * Focus timer with a named task and adjustable focus/break lengths
 * (persisted in the widget's config, so they survive restarts and sync
 * across devices). A finished focus block chimes, logs to your history
 * and rolls straight into the break; the break chimes and re-arms focus.
 */
function Pomodoro({ task, focusMin, breakMin, onCfg, onDone }: {
  task: string
  focusMin: number
  breakMin: number
  onCfg: (patch: Record<string, string>) => void
  onDone: (s: FocusSession) => void
}) {
  const [phase, setPhase] = useState<'focus' | 'break'>('focus')
  const [left, setLeft] = useState(focusMin * 60)
  const [running, setRunning] = useState(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const total = (phase === 'focus' ? focusMin : breakMin) * 60

  useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      setLeft((l) => (l <= 1 ? 0 : l - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [running])

  // phase transitions — log + chime exactly once when the sand runs out
  const doneRef = useRef(false)
  useEffect(() => {
    if (left > 0) {
      doneRef.current = false
      return
    }
    if (doneRef.current) return
    doneRef.current = true
    if (phaseRef.current === 'focus') {
      playChime()
      onDone({
        id: uid(),
        task: task.trim() || 'Untitled focus',
        minutes: focusMin,
        endedAt: new Date().toISOString(),
      })
      // roll straight into the break
      setPhase('break')
      setLeft(breakMin * 60)
    } else {
      playBeep()
      setPhase('focus')
      setLeft(focusMin * 60)
      setRunning(false) // focus starts on your command, not by surprise
    }
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps

  function adjust(key: 'focusMin' | 'breakMin', delta: number) {
    const cur = key === 'focusMin' ? focusMin : breakMin
    const next = Math.min(180, Math.max(1, cur + delta))
    onCfg({ [key]: String(next) })
    // re-arm an idle timer in the phase being adjusted
    if (!running && ((key === 'focusMin' && phase === 'focus') || (key === 'breakMin' && phase === 'break'))) {
      setLeft(next * 60)
    }
  }

  function restart() {
    setPhase('focus')
    setLeft(focusMin * 60)
    setRunning(false)
  }

  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  const pct = total === 0 ? 0 : ((total - left) / total) * 100

  return (
    <div className={`pomodoro ${phase}`}>
      <input
        className="pomo-task"
        placeholder="What are you focusing on?"
        value={task}
        onChange={(e) => onCfg({ task: e.target.value })}
      />
      <div className="pomo-phase">{phase === 'focus' ? '● focus' : '☕ break'}</div>
      <div className={`pomo-time ${left === 0 ? 'done' : ''}`}>{mm}:{ss}</div>
      <div className="bar" data-tip={`${Math.round(pct)}% done · ${Math.round(100 - pct)}% to go`}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="pomo-controls">
        <button className="btn-accent" onClick={() => setRunning(!running)}>
          {running ? 'pause' : 'start'}
        </button>
        <button className="btn-ghost" onClick={restart}>reset</button>
      </div>
      <div className="pomo-settings">
        <span className="pomo-set">
          focus
          <button className="pomo-step" aria-label="Shorter focus" onClick={() => adjust('focusMin', -5)}>−</button>
          <b>{focusMin}m</b>
          <button className="pomo-step" aria-label="Longer focus" onClick={() => adjust('focusMin', 5)}>+</button>
        </span>
        <span className="pomo-set">
          break
          <button className="pomo-step" aria-label="Shorter break" onClick={() => adjust('breakMin', -1)}>−</button>
          <b>{breakMin}m</b>
          <button className="pomo-step" aria-label="Longer break" onClick={() => adjust('breakMin', 1)}>+</button>
        </span>
      </div>
    </div>
  )
}

/** Optional Spotify embed: paste any track / playlist / album link. */
function SpotifyWidget({ url, onUrl }: { url: string; onUrl: (u: string) => void }) {
  const [draft, setDraft] = useState('')
  const m = url.match(/open\.spotify\.com\/(track|playlist|album|episode|artist)\/([A-Za-z0-9]+)/)

  if (!m) {
    return (
      <form
        className="media-setup"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) onUrl(draft.trim())
        }}
      >
        <p className="muted small">Paste a Spotify track, playlist or album link — the player shows the art and what's playing.</p>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://open.spotify.com/track/…" />
        <button type="submit" className="btn-accent">Connect</button>
      </form>
    )
  }

  const kind = m[1]
  const h = kind === 'track' || kind === 'episode' ? 152 : 352
  return (
    <div className="media-embed">
      <iframe
        title="Spotify player"
        src={`https://open.spotify.com/embed/${kind}/${m[2]}?theme=0`}
        width="100%"
        height={h}
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
      <button className="chip-btn" onClick={() => onUrl('')}>change</button>
    </div>
  )
}

/** Optional video: a YouTube link (persisted) or a local file (this session). */
function VideoWidget({ url, onUrl }: { url: string; onUrl: (u: string) => void }) {
  const [draft, setDraft] = useState('')
  const [localSrc, setLocalSrc] = useState<string | null>(null)

  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,20})/)

  if (localSrc) {
    return (
      <div className="media-embed">
        <video src={localSrc} controls style={{ width: '100%', borderRadius: 10 }} />
        <button className="chip-btn" onClick={() => setLocalSrc(null)}>change</button>
        <p className="muted small">Local videos play this session only — they aren't uploaded or stored.</p>
      </div>
    )
  }

  if (yt) {
    return (
      <div className="media-embed">
        <div className="video-frame">
          <iframe
            title="YouTube player"
            src={`https://www.youtube-nocookie.com/embed/${yt[1]}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <button className="chip-btn" onClick={() => onUrl('')}>change</button>
      </div>
    )
  }

  return (
    <form
      className="media-setup"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim()) onUrl(draft.trim())
      }}
    >
      <p className="muted small">Embed a study-with-me or any YouTube video — or play a file from this device.</p>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
      <div className="pomo-controls">
        <button type="submit" className="btn-accent">Embed</button>
        <label className="btn-ghost file-btn">
          local file
          <input
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setLocalSrc(URL.createObjectURL(f))
            }}
          />
        </label>
      </div>
    </form>
  )
}
