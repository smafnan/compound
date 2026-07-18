import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AppState, IS_DEMO, loadPersisted, loadState, mergeStates, saveState } from './lib'
import { useDeadlineAlarms } from './alarms'
import { SyncStatus, cloudEnabled, onAuth, pullState, pushState, subscribeToState, touchDevice } from './cloud'
import { loadPref, resolveFontFamily, savePref } from './prefs'
import FontPicker from './FontPicker'
import { LANGS, LangId, applyLang, langDir, t } from './i18n'
import Backdrop, { BACKDROPS, BgKind } from './Backdrop'
import Account from './Account'
import Countdown from './sections/Countdown'
import Today from './sections/Today'
import Checklist from './sections/Checklist'
import Growth from './sections/Growth'
import Overview from './sections/Overview'
import Canvas from './sections/Canvas'
import Profile from './sections/Profile'

type Tab = 'countdown' | 'today' | 'checklist' | 'growth' | 'all' | 'canvas' | 'you'
type Theme = 'paper' | 'night' | 'neo'

const TABS: { id: Tab; key: string; icon: string }[] = [
  { id: 'countdown', key: 'countdown', icon: '◳' },
  { id: 'today', key: 'today', icon: '◔' },
  { id: 'checklist', key: 'checklist', icon: '▦' },
  { id: 'growth', key: 'growth', icon: '◮' },
  { id: 'all', key: 'all', icon: '✦' },
  { id: 'canvas', key: 'canvas', icon: '✥' },
  { id: 'you', key: 'you', icon: '◉' },
]

const THEMES: { id: Theme; icon: string; title: string }[] = [
  { id: 'paper', icon: '☀', title: 'Paper — hand-drawn light' },
  { id: 'night', icon: '☾', title: 'Night — hand-drawn dark' },
  { id: 'neo', icon: '◇', title: 'Neo — modern & futuristic' },
]

function initialTab(): Tab {
  const t = new URLSearchParams(location.search).get('tab')
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'countdown'
}

function initialTheme(): Theme {
  const q = new URLSearchParams(location.search).get('theme') // shareable looks
  if (q && THEMES.some((x) => x.id === q)) return q as Theme
  const t = localStorage.getItem('compound.theme')
  return THEMES.some((x) => x.id === t) ? (t as Theme) : 'paper'
}

function initialBg(): BgKind {
  const q = new URLSearchParams(location.search).get('bg')
  if (q && BACKDROPS.some((x) => x.id === q)) return q as BgKind
  return loadPref('bg', 'none') as BgKind
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [font, setFont] = useState(() => loadPref('font', 'goblock'))
  const [bg, setBg] = useState<BgKind>(initialBg)
  const [lang, setLang] = useState<LangId>(() => {
    const l = loadPref('lang', 'en') as LangId
    return LANGS.some((x) => x.id === l) ? l : 'en'
  })
  const [fullscreen, setFullscreen] = useState(false)

  // make t() speak the right language for everything rendered below
  applyLang(lang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = langDir(lang)
    savePref('lang', lang)
  }, [lang])
  const [user, setUser] = useState<User | null>(null)
  const [sync, setSync] = useState<SyncStatus>(cloudEnabled ? 'signed-out' : 'off')
  const [showAccount, setShowAccount] = useState(false)
  const [verified, setVerified] = useState(false)
  // chime + toast the moment any deadline's clock hits zero, app-wide
  const timeUp = useDeadlineAlarms(state)

  // Landing here from an email-verification link (?verified=1): the
  // Supabase client has already consumed the tokens in the URL hash and
  // logged the user in — greet them and clean the address bar.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.get('verified')) return
    setVerified(true)
    params.delete('verified')
    const q = params.toString()
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : ''))
    const id = setTimeout(() => setVerified(false), 7000)
    return () => clearTimeout(id)
  }, [])
  const stateRef = useRef(state)
  stateRef.current = state
  // set while adopting a merged copy, so the save effect writes it
  // verbatim (stamps intact) instead of re-stamping and re-pushing
  const adoptingRef = useRef(false)

  /** Combine the cloud copy with what this device has — never overwrite.
   *  Ticks, tasks, titles and progress from BOTH sides survive. */
  function reconcile(remoteState: AppState, remoteAt?: string) {
    const local = loadPersisted() ?? stateRef.current
    const remote = { ...remoteState, updatedAt: remoteState.updatedAt ?? remoteAt }
    const merged = mergeStates(local, remote)
    const mergedJson = JSON.stringify(merged)
    if (mergedJson !== JSON.stringify(local)) {
      adoptingRef.current = true
      setState(merged)
    }
    if (mergedJson !== JSON.stringify(remote)) {
      pushState(merged, setSync) // cloud was missing something we have
    }
    setSync('synced')
  }

  useEffect(() => {
    const adopted = adoptingRef.current
    adoptingRef.current = false
    const stamped = saveState(state, adopted)
    if (!adopted && user && !IS_DEMO) pushState(stamped, setSync)
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  // login → merge the cloud copy with this device's copy
  useEffect(() => {
    if (!cloudEnabled || IS_DEMO) return
    return onAuth((u) => {
      setUser(u)
      if (!u) {
        setSync('signed-out')
        return
      }
      setSync('syncing')
      void pullState().then((remote) => {
        if (remote) {
          reconcile(remote.state, remote.updatedAt)
        } else {
          pushState(saveState(stateRef.current), setSync) // brand-new account
          setSync('synced')
        }
      })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // live sync: realtime row changes + re-pull on focus and every 30s,
  // so progress made on any device appears everywhere it's logged in
  useEffect(() => {
    if (!user || IS_DEMO) return
    const pull = () => {
      void pullState().then((r) => {
        if (r) reconcile(r.state, r.updatedAt)
      })
    }
    const onVis = () => {
      if (!document.hidden) pull()
    }
    void touchDevice() // register this device in the account's session list
    const iv = setInterval(pull, 30_000)
    const dev = setInterval(() => void touchDevice(), 5 * 60_000) // keep "last active" fresh
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const unsub = subscribeToState(user.id, reconcile)
    return () => {
      clearInterval(iv)
      clearInterval(dev)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      unsub()
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('compound.theme', theme)
  }, [theme])

  useEffect(() => {
    const family = resolveFontFamily(font)
    const root = document.documentElement.style
    root.setProperty('--display', family)
    // non-default fonts take over the labels and hand-written notes too,
    // so the whole page speaks in the chosen voice
    if (font === 'goblock') {
      root.removeProperty('--script')
      root.removeProperty('--hand')
    } else {
      root.setProperty('--script', family)
      root.setProperty('--hand', family)
    }
    savePref('font', font)
  }, [font])

  useEffect(() => {
    document.documentElement.dataset.bg = bg
    savePref('bg', bg)
  }, [bg])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-sun" viewBox="0 0 48 48" aria-hidden>
            <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="24" cy="24" r="11" fill="#F7C948" />
              <line x1="24" y1="3" x2="24" y2="9" />
              <line x1="24" y1="39" x2="24" y2="45" />
              <line x1="3" y1="24" x2="9" y2="24" />
              <line x1="39" y1="24" x2="45" y2="24" />
              <line x1="9" y1="9" x2="13.5" y2="13.5" />
              <line x1="34.5" y1="34.5" x2="39" y2="39" />
              <line x1="39" y1="9" x2="34.5" y2="13.5" />
              <line x1="13.5" y1="34.5" x2="9" y2="39" />
            </g>
            <g fill="#1B1B1B">
              <rect x="17" y="20" width="6" height="4" rx="1.5" />
              <rect x="25" y="20" width="6" height="4" rx="1.5" />
              <rect x="22" y="21" width="4" height="1.6" />
            </g>
            <path d="M19 29 q5 4 10 0" stroke="#1B1B1B" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          COMPOUND
        </div>

        <nav className="tabs" aria-label="Sections">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              className={`tab ${tab === tb.id ? 'active' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              <span className="tab-icon" aria-hidden>{tb.icon}</span>
              <span className="tab-label">{t(tb.key)}</span>
            </button>
          ))}
        </nav>

        <div className="ctrls">
          <select
            className="ctrl-btn lang-sel"
            value={lang}
            title={t('language')}
            aria-label={t('language')}
            onChange={(e) => setLang(e.target.value as LangId)}
          >
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <div className="theme-picker" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`ctrl-btn ${theme === t.id ? 'active' : ''}`}
                title={t.title}
                onClick={() => setTheme(t.id)}
              >
                {t.icon}
              </button>
            ))}
          </div>
          <button
            className="ctrl-btn"
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
          >
            {fullscreen ? '🗗' : '⛶'}
          </button>
          <button
            className={`ctrl-btn account-btn ${user ? 'signed-in' : ''}`}
            title={
              !cloudEnabled
                ? 'Account (cloud sync not configured)'
                : user
                  ? `${user.email} — ${sync}`
                  : 'Sign in to back up your progress'
            }
            onClick={() => setShowAccount(true)}
          >
            👤
          </button>
        </div>
      </header>

      {showAccount && (
        <Account
          user={user}
          status={sync}
          state={state}
          setState={setState}
          onClose={() => setShowAccount(false)}
        />
      )}

      <main className="content">
        {tab === 'countdown' && (
          <StyleQuick
            theme={theme} setTheme={(t) => setTheme(t as Theme)}
            font={font} setFont={setFont}
            bg={bg} setBg={setBg}
          />
        )}
        <div className="view" key={tab}>
          {tab === 'countdown' && <Countdown state={state} setState={setState} />}
          {tab === 'today' && <Today />}
          {tab === 'checklist' && <Checklist state={state} setState={setState} />}
          {tab === 'growth' && <Growth state={state} />}
          {tab === 'all' && <Overview state={state} />}
          {tab === 'canvas' && <Canvas state={state} setState={setState} />}
          {tab === 'you' && (
            <Profile
              state={state}
              setState={setState}
              user={user}
              sync={sync}
              font={font}
              setFont={setFont}
              bg={bg}
              setBg={setBg}
              theme={theme}
              setTheme={(t) => setTheme(t as Theme)}
            />
          )}
        </div>
      </main>

      {verified && (
        <div className="toast" role="status">
          ✓ Email verified — {user ? 'you are logged in. Welcome!' : 'you can log in now.'}
        </div>
      )}
      {timeUp && (
        <div className="toast alarm" role="alert">
          ⏰ Time's up — <b>{timeUp}</b>
        </div>
      )}

      <footer className="foot">{t('everyDayCounts')}</footer>
      <Backdrop kind={bg} />
      <TipLayer />
    </div>
  )
}

/** Discreet look-&-feel switcher that lives on the home page. */
function StyleQuick({ theme, setTheme, font, setFont, bg, setBg }: {
  theme: string; setTheme: (t: string) => void
  font: string; setFont: (f: string) => void
  bg: BgKind; setBg: (b: BgKind) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // defer so the click that opened the menu isn't the one that closes it
    const id = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="style-quick" ref={ref}>
      <button
        className={`style-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        data-tip={open ? undefined : `${t('theme')} · ${t('font')} · ${t('scene')}`}
      >
        ✎ {t('style')}
      </button>
      {open && (
        <div className="style-pop">
          <div className="style-row">
            <span className="style-k">{t('theme')}</span>
            <div className="chips">
              {(['paper', 'night', 'neo'] as const).map((th) => (
                <button key={th} className={`chip ${theme === th ? 'on' : ''}`} onClick={() => setTheme(th)}>
                  {th === 'paper' ? '☀ paper' : th === 'night' ? '☾ night' : '◇ neo'}
                </button>
              ))}
            </div>
          </div>
          <div className="style-row">
            <span className="style-k">{t('font')}</span>
            <FontPicker value={font} onChange={setFont} />
          </div>
          <div className="style-row">
            <span className="style-k">{t('scene')}</span>
            <div className="chips">
              {BACKDROPS.map((b) => (
                <button key={b.id} className={`chip ${bg === b.id ? 'on' : ''}`} onClick={() => setBg(b.id)}>
                  {b.icon} {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** One global tooltip that follows any element carrying data-tip —
 *  escapes overflow clipping and works across every widget. */
function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const over = (e: PointerEvent) => {
      const el = (e.target as Element).closest?.('[data-tip]') as HTMLElement | null
      if (!el || !el.dataset.tip) {
        setTip(null)
        return
      }
      const r = el.getBoundingClientRect()
      const x = Math.min(Math.max(r.left + r.width / 2, 100), window.innerWidth - 100)
      setTip({ text: el.dataset.tip, x, y: Math.max(r.top, 44) })
    }
    const clear = () => setTip(null)
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerdown', clear)
    window.addEventListener('scroll', clear, true)
    return () => {
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerdown', clear)
      window.removeEventListener('scroll', clear, true)
    }
  }, [])

  if (!tip) return null
  return (
    <div className="tipfly" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  )
}
