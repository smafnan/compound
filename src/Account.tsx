import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { SyncStatus, cloudEnabled, signIn, signOut, signUp } from './cloud'

interface Props {
  user: User | null
  status: SyncStatus
  onClose: () => void
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  'off': 'cloud sync is off',
  'signed-out': 'not signed in',
  'syncing': 'syncing…',
  'synced': 'synced ✓ — your progress is safe in the cloud',
  'error': 'sync failed — will retry on your next change',
}

export default function Account({ user, status, onClose }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(mode: 'in' | 'up') {
    setBusy(true)
    setError(null)
    setNotice(null)
    const err = mode === 'in' ? await signIn(email, password) : await signUp(email, password)
    setBusy(false)
    if (err) setError(err)
    else if (mode === 'up') setNotice('Account created! If your project requires email confirmation, check your inbox — then sign in.')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Account</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!cloudEnabled && (
          <>
            <p>
              Cloud sync isn't configured for this build, so your progress lives in this
              device's storage only.
            </p>
            <p className="muted small">
              To enable login + backup: create a free <b>Supabase</b> project, run
              <code> supabase/schema.sql</code>, put your URL and anon key in
              <code> .env</code> (see <code>.env.example</code>) and rebuild.
            </p>
          </>
        )}

        {cloudEnabled && user && (
          <>
            <p>Signed in as <b>{user.email}</b></p>
            <p className="muted">{STATUS_TEXT[status]}</p>
            <div className="modal-actions">
              <button className="btn-ghost" disabled={busy} onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
            <p className="muted small">
              Every change is backed up automatically. Sign in on any other device and
              your whole history walks in with you.
            </p>
          </>
        )}

        {cloudEnabled && !user && (
          <>
            <p className="muted">
              Sign in to back up your progress and continue on any device.
            </p>
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault()
                void submit('in')
              }}
            >
              <input
                type="email"
                required
                placeholder="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="password (6+ characters)"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="modal-actions">
                <button type="submit" className="btn-accent" disabled={busy}>
                  {busy ? '…' : 'Sign in'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => void submit('up')}
                >
                  Create account
                </button>
              </div>
            </form>
            {error && <p className="form-error">{error}</p>}
            {notice && <p className="muted small">{notice}</p>}
          </>
        )}
      </div>
    </div>
  )
}
