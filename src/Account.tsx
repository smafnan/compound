import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { AppState } from './lib'
import {
  SyncStatus, cloudEnabled, deleteAccount, signIn, signOut, signUp,
  updateEmail, updatePassword,
} from './cloud'
import { t } from './i18n'

interface Props {
  user: User | null
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
        {props.user ? <AccountInfo {...props} /> : <AuthForm {...props} />}
      </div>
    </div>
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    if (mode === 'in') {
      const err = await signIn(email, password)
      if (err) setError(friendly(err))
      else onClose()
    } else {
      const err = await signUp(email, password)
      if (err) setError(friendly(err))
      else {
        if (name.trim()) {
          setState((s) => ({ ...s, profile: { ...s.profile, name: name.trim() } }))
        }
        const auto = await signIn(email, password)
        if (!auto) onClose()
        else setNotice('Account created! Check your email to confirm it, then log in.')
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
        <button className={`auth-tab ${mode === 'in' ? 'on' : ''}`} onClick={() => { setMode('in'); setError(null) }}>
          {t('logIn')}
        </button>
        <button className={`auth-tab ${mode === 'up' ? 'on' : ''}`} onClick={() => { setMode('up'); setError(null) }}>
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
          minLength={6}
          placeholder={mode === 'up' ? 'Choose a password (6+ characters)' : 'Password'}
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-accent auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'in' ? t('logIn') : t('signUp')}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="muted small">{notice}</p>}

      <p className="muted small">
        One account keeps your streaks, checklists and progress safe — log in anywhere and
        everything follows you.
      </p>
    </>
  )
}

/* ---------------- account info (signed in) ---------------- */

function AccountInfo({ user, status, state, setState, onClose }: Props) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [pw1, setPw1] = useState('')
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
    if (pw1.length < 6) {
      setMsg({ ok: false, text: 'Password needs at least 6 characters.' })
      return
    }
    setBusy(true)
    const err = await updatePassword(pw1)
    setBusy(false)
    setPw1('')
    setMsg(err ? { ok: false, text: friendly(err) } : { ok: true, text: 'Password updated ✓' })
  }

  return (
    <>
      <ModalHead title={t('yourAccount')} onClose={onClose} />
      <p className="muted small acc-status">{STATUS_TEXT[status]}</p>

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

        <label className="acc-row">
          <span>{t('memberSince')}</span>
          <input type="text" value={state.profile.joined} readOnly />
        </label>
      </div>

      {msg && <p className={msg.ok ? 'muted small' : 'form-error'}>{msg.text}</p>}

      <div className="modal-actions">
        <button className="btn-ghost" disabled={busy} onClick={() => void signOut()}>
          {t('logOut')}
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
  if (e.includes('at least 6')) return 'Password needs at least 6 characters.'
  if (e.includes('rate limit')) return 'Too many tries — wait a minute and try again.'
  return err
}
