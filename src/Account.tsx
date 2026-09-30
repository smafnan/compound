import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AppState, clearLocalData, forgetLocalOwner } from './lib'
import {
  SyncStatus, cloudEnabled, deleteAccount, flushPush, needsSecondFactor, sendMagicLink,
  sendPasswordReset, sendReauthCode, signIn, signInWithProvider, signOut, signOutEverywhere,
  signUp, updateEmail, updatePassword, verifyLoginCode,
} from './cloud'
import Security from './Security'
import { t } from './i18n'

/** Kept in step with the Auth setting in docs/security.md. */
const MIN_PASSWORD = 8

interface Props {
  user: User | null
  /** signed in with a password/link, but the 2FA code is still owed */
  needsMfa: boolean
  status: SyncStatus
  state: AppState
  setState: React.Dispatch<React.SetStateAction<AppState>>
  onClose: () => void
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  'off': 'saved on this device',
  'signed-out': 'not logged in',
  'syncing': 'saving…',
  'synced': 'everything backed up ✓',
  'error': 'save failed — will retry automatically',
}

export default function Account(props: Props) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        {props.needsMfa ? <MfaStep {...props} /> : props.user ? <AccountInfo {...props} /> : <AuthForm {...props} />}
      </div>
    </div>
  )
}

/* ---------------- second factor at login ---------------- */

function MfaStep({ onClose }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || code.length !== 6) return
    setBusy(true)
    setError(null)
    const err = await verifyLoginCode(code)
    setBusy(false)
    if (err) {
      setError(friendly(err))
      setCode('')
    } else {
      onClose()
    }
  }

  return (
    <>
      <ModalHead title="Two-factor check" onClose={onClose} />
      <p>Enter the 6-digit code from your authenticator app to finish logging in.</p>
      <form className="account-form" onSubmit={submit}>
        <input
          className="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-label="Authenticator code"
        />
        <button type="submit" className="btn-accent auth-submit" disabled={busy || code.length !== 6}>
          {busy ? '…' : 'Verify'}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      <div className="auth-alt">
        <button className="chip-btn" disabled={busy} onClick={() => void signOut()}>
          Cancel and log out
        </button>
      </div>
      <p className="muted small">
        Your data stays locked until this step is done — that's what makes two-factor worth having.
      </p>
    </>
  )
}

/* ---------------- log in / create account ---------------- */

function AuthForm({ onClose, setState }: Props) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exists, setExists] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    setExists(false)
    if (mode === 'in') {
      const err = await signIn(email, password)
      if (err) setError(friendly(err))
      // with 2FA on, stay open: the modal switches to the code step
      else if (!(await needsSecondFactor())) onClose()
    } else {
      if (password.length < MIN_PASSWORD) {
        setError(`Password needs at least ${MIN_PASSWORD} characters.`)
        setBusy(false)
        return
      }
      const res = await signUp(email, password)
      if (res.status === 'exists') {
        setExists(true)
      } else if (res.status === 'error') {
        setError(friendly(res.message))
      } else {
        if (name.trim()) {
          setState((s) => ({ ...s, profile: { ...s.profile, name: name.trim() } }))
        }
        if (res.needsConfirm) {
          setNotice(
            'Account created! We sent you a verification email — the link brings you straight back here, logged in.',
          )
        } else {
          onClose() // confirmations are off — the session is already live
        }
      }
    }
    setBusy(false)
  }

  if (!cloudEnabled) {
    return (
      <>
        <ModalHead title="Account" onClose={onClose} />
        <p>Accounts aren't available in this version of the app.</p>
        <p className="muted">
          Everything you do is saved safely on this device — nothing is lost when you close the app.
        </p>
      </>
    )
  }

  return (
    <>
      <ModalHead title={mode === 'in' ? t('logIn') : t('createAccount')} onClose={onClose} />

      <div className="auth-tabs">
        <button className={`auth-tab ${mode === 'in' ? 'on' : ''}`} onClick={() => { setMode('in'); setError(null); setExists(false) }}>
          {t('logIn')}
        </button>
        <button className={`auth-tab ${mode === 'up' ? 'on' : ''}`} onClick={() => { setMode('up'); setError(null); setExists(false) }}>
          {t('createAccount')}
        </button>
      </div>

      <form className="account-form" onSubmit={submit}>
        {mode === 'up' && (
          <input
            type="text"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          type="email"
          required
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={mode === 'up' ? MIN_PASSWORD : undefined}
          placeholder={mode === 'up' ? `Choose a password (${MIN_PASSWORD}+ characters)` : 'Password'}
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-accent auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'in' ? t('logIn') : t('signUp')}
        </button>
      </form>

      <div className="auth-divider"><span>or</span></div>
      <div className="social-row">
        <button className="social-btn" disabled={busy} onClick={() => void signInWithProvider('github')}>
           Continue with GitHub
        </button>
      </div>

      {mode === 'in' && (
        <div className="auth-alt">
          <button
            className="chip-btn"
            disabled={busy}
            onClick={async () => {
              if (!email.trim()) { setError('Type your email first.'); return }
              setBusy(true); setError(null)
              const err = await sendMagicLink(email.trim())
              setBusy(false)
              if (err) setError(friendly(err))
              else setNotice('Login link sent — check your inbox and tap it on this device.')
            }}
          >
            ✉ {t('magicLink')}
          </button>
          <button
            className="chip-btn"
            disabled={busy}
            onClick={async () => {
              if (!email.trim()) { setError('Type your email first.'); return }
              setBusy(true); setError(null)
              const err = await sendPasswordReset(email.trim())
              setBusy(false)
              if (err) setError(friendly(err))
              else setNotice('Reset link sent — opening it logs you in so you can set a new password.')
            }}
          >
            {t('forgotPassword')}
          </button>
        </div>
      )}

      {exists && (
        <div className="form-error exists-note">
          <p>An account with this email already exists. Please log in instead.</p>
          <button
            className="btn-accent"
            onClick={() => {
              setMode('in')
              setExists(false)
              setError(null)
            }}
          >
            Go to log in →
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="muted small">{notice}</p>}

      <p className="muted small">
        One account keeps your streaks, checklists and progress safe — log in anywhere and
        everything follows you, live.
      </p>
    </>
  )
}

/* ---------------- account info (signed in) ---------------- */

function AccountInfo({ user, status, state, setState, onClose }: Props) {
  const [view, setView] = useState<'profile' | 'security'>('profile')
  const [email, setEmail] = useState(user?.email ?? '')
  const [pw1, setPw1] = useState('')
  // set once the server asks for proof before a password change
  const [reauth, setReauth] = useState(false)
  const [nonce, setNonce] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function patch(field: 'name' | 'phone', value: string) {
    setState((s) => ({ ...s, profile: { ...s.profile, [field]: value } }))
  }

  async function saveEmail() {
    if (!email.trim() || email === user?.email) return
    setBusy(true)
    const err = await updateEmail(email.trim())
    setBusy(false)
    setMsg(err ? { ok: false, text: friendly(err) } : { ok: true, text: 'Check your new email for a confirmation link.' })
  }

  async function savePassword() {
    if (pw1.length < MIN_PASSWORD) {
      setMsg({ ok: false, text: `Password needs at least ${MIN_PASSWORD} characters.` })
      return
    }
    setBusy(true)
    const res = await updatePassword(pw1, reauth ? nonce.trim() : undefined)
    if (res.needsReauth && !reauth) {
      // the session isn't fresh: prove it's you with a code sent by email
      const err = await sendReauthCode()
      setBusy(false)
      if (err) {
        setMsg({ ok: false, text: friendly(err) })
      } else {
        setReauth(true)
        setMsg({ ok: true, text: `For your security we emailed a code to ${user?.email} — enter it to confirm.` })
      }
      return
    }
    setBusy(false)
    if (res.error || res.needsReauth) {
      setMsg({ ok: false, text: res.error ? friendly(res.error) : 'That code didn’t work — check the latest email.' })
      return
    }
    setPw1('')
    setNonce('')
    setReauth(false)
    setMsg({ ok: true, text: 'Password updated ✓' })
  }

  /** Log out; optionally wipe this device's copy (shared computers). */
  async function logOut(clear: boolean) {
    setBusy(true)
    const saved = await flushPush(5000)
    if (clear) {
      if (!saved && !window.confirm(
        'Some recent changes haven’t reached the cloud yet. Clearing this device now would lose them. Clear anyway?',
      )) {
        setBusy(false)
        return
      }
      await signOut()
      clearLocalData()
      location.reload() // start from a clean slate
      return
    }
    await signOut()
    setBusy(false)
  }

  return (
    <>
      <ModalHead title={t('yourAccount')} onClose={onClose} />
      <p className="muted small acc-status">{STATUS_TEXT[status]}</p>

      <div className="auth-tabs">
        <button className={`auth-tab ${view === 'profile' ? 'on' : ''}`} onClick={() => setView('profile')}>
          {t('profile')}
        </button>
        <button className={`auth-tab ${view === 'security' ? 'on' : ''}`} onClick={() => setView('security')}>
          {t('security')}
        </button>
      </div>

      {view === 'security' && <Security />}

      {view === 'profile' && (
      <>
      <div className="acc-fields">
        <label className="acc-row">
          <span>{t('name')}</span>
          <input
            type="text"
            placeholder="Your name"
            value={state.profile.name}
            onChange={(e) => patch('name', e.target.value)}
          />
        </label>

        <label className="acc-row">
          <span>{t('phone')}</span>
          <input
            type="tel"
            placeholder="Add a phone number"
            value={state.profile.phone}
            onChange={(e) => patch('phone', e.target.value)}
          />
        </label>

        <label className="acc-row">
          <span>{t('email')}</span>
          <div className="acc-inline">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {email !== user?.email && (
              <button className="btn-ghost" disabled={busy} onClick={() => void saveEmail()}>{t('save')}</button>
            )}
          </div>
        </label>

        <label className="acc-row">
          <span>{t('password')}</span>
          <div className="acc-inline">
            <input
              type="password"
              placeholder="New password"
              autoComplete="new-password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
            />
            {pw1 && (
              <button className="btn-ghost" disabled={busy} onClick={() => void savePassword()}>{t('save')}</button>
            )}
          </div>
        </label>

        {reauth && (
          <label className="acc-row">
            <span>Email code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the email"
              value={nonce}
              onChange={(e) => setNonce(e.target.value.trim())}
            />
          </label>
        )}

        <label className="acc-row">
          <span>{t('memberSince')}</span>
          <input type="text" value={state.profile.joined} readOnly />
        </label>
      </div>

      {msg && <p className={msg.ok ? 'muted small' : 'form-error'}>{msg.text}</p>}

      <div className="modal-actions">
        <button className="btn-ghost" disabled={busy} onClick={() => void logOut(false)}>
          {t('logOut')}
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          title="Log out and remove this account's data from this device — use it on a shared computer"
          onClick={() => void logOut(true)}
        >
          Log out &amp; clear this device
        </button>
        <button
          className="btn-ghost"
          disabled={busy}
          title="Sign out on every device where this account is logged in"
          onClick={() => void signOutEverywhere()}
        >
          {t('logOutAll')}
        </button>
        <button
          className="btn-ghost danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('Delete your account and ALL backed-up data permanently? The copy on this device stays.')) return
            setBusy(true)
            const err = await deleteAccount()
            setBusy(false)
            if (err) setMsg({ ok: false, text: friendly(err) })
            else forgetLocalOwner() // the copy here stays, now belonging to no account
          }}
        >
          {t('deleteAccount')}
        </button>
      </div>
      <p className="muted small">
        Name and phone save instantly. Everything you do here is backed up to your account
        automatically.
      </p>
      </>
      )}
    </>
  )
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
    </div>
  )
}

/** Turn provider errors into plain human language. */
function friendly(err: string): string {
  const e = err.toLowerCase()
  if (e.includes('invalid login')) return 'Wrong email or password.'
  if (e.includes('not confirmed')) return 'Please confirm your email first — check your inbox.'
  if (e.includes('already registered')) return 'That email already has an account — try logging in.'
  if (/at least \d+|weak.?password|password should/.test(e)) {
    return `Password is too weak — use at least ${MIN_PASSWORD} characters with a mix of letters and numbers.`
  }
  if (e.includes('pwned') || e.includes('leaked') || e.includes('breach')) {
    return 'That password has appeared in a data breach — please choose a different one.'
  }
  if (e.includes('invalid totp') || e.includes('invalid code') || e.includes('expired')) {
    return 'That code didn’t work — codes change every 30 seconds, try the current one.'
  }
  if (e.includes('two-factor verification required') || e.includes('aal2')) {
    return 'Please log out and back in with your two-factor code, then try again.'
  }
  if (e.includes('rate limit') || e.includes('too many')) return 'Too many tries — wait a minute and try again.'
  return err
}
