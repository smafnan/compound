import { useEffect, useState } from 'react'
import {
  DeviceRow, TotpEnrollment, enrollTotp, listDevices, listTotpFactors,
  removeDevice, signOutEverywhere, thisDeviceKey, unenrollTotp, verifyTotpEnrollment,
} from './cloud'

/** Security center: two-factor authentication + device/session list. */
export default function Security() {
  return (
    <div className="sec-wrap">
      <TwoFactor />
      <Devices />
    </div>
  )
}

function TwoFactor() {
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([])
  const [enroll, setEnroll] = useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = () => void listTotpFactors().then(setFactors)
  useEffect(refresh, [])

  const active = factors.find((f) => f.status === 'verified')

  async function start() {
    setBusy(true); setErr(null)
    const r = await enrollTotp()
    setBusy(false)
    if ('error' in r) setErr(r.error)
    else setEnroll(r)
  }

  async function confirm() {
    if (!enroll) return
    setBusy(true); setErr(null)
    const e = await verifyTotpEnrollment(enroll.factorId, code.trim())
    setBusy(false)
    if (e) { setErr(e); return }
    setEnroll(null); setCode(''); refresh()
  }

  async function turnOff(id: string) {
    if (!window.confirm('Turn off two-factor? Your password alone will then be enough to log in.')) return
    setBusy(true); setErr(null)
    const e = await unenrollTotp(id)
    setBusy(false)
    if (e) setErr(e)
    refresh()
  }

  return (
    <section className="sec-block">
      <div className="sec-head">
        <h3>Two-factor authentication</h3>
        <span className={`sec-pill ${active ? 'on' : ''}`}>{active ? 'On' : 'Off'}</span>
      </div>
      <p className="muted small">
        Protect your account with a code from an authenticator app (Google Authenticator, Authy,
        1Password…).
      </p>

      {active && (
        <button className="btn-ghost danger" disabled={busy} onClick={() => turnOff(active.id)}>
          Turn off 2FA
        </button>
      )}

      {!active && !enroll && (
        <button className="btn-accent" disabled={busy} onClick={() => void start()}>
          {busy ? '…' : 'Set up 2FA'}
        </button>
      )}

      {enroll && (
        <div className="totp-setup">
          <p className="small">1. Scan this in your authenticator app:</p>
          <img className="totp-qr" src={enroll.qr} alt="TOTP QR code" />
          <p className="small muted">or enter this key manually: <code>{enroll.secret}</code></p>
          <p className="small">2. Enter the 6-digit code it shows:</p>
          <div className="acc-inline">
            <input
              className="totp-code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <button className="btn-accent" disabled={busy || code.length < 6} onClick={() => void confirm()}>
              Verify
            </button>
          </div>
          <button className="chip-btn" onClick={() => { setEnroll(null); setCode('') }}>cancel</button>
        </div>
      )}

      {err && <p className="form-error">{err}</p>}
    </section>
  )
}

function Devices() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)
  const mine = thisDeviceKey()

  const refresh = () => void listDevices().then(setDevices)
  useEffect(refresh, [])

  return (
    <section className="sec-block">
      <div className="sec-head">
        <h3>Devices &amp; sessions</h3>
      </div>
      <p className="muted small">Places where your account is active. Anything unfamiliar? Log out everywhere.</p>

      {devices === null && <p className="muted small">Loading…</p>}
      {devices?.length === 0 && <p className="muted small">No other devices recorded yet.</p>}

      <div className="dev-list">
        {devices?.map((d) => (
          <div key={d.id} className={`dev-row ${d.device_key === mine ? 'current' : ''}`}>
            <span className="dev-icon" aria-hidden>{icon(d.platform)}</span>
            <div className="dev-text">
              <div className="dev-label">
                {d.label}
                {d.device_key === mine && <span className="dev-here"> · this device</span>}
              </div>
              <div className="dev-seen">last active {ago(d.last_seen)}</div>
            </div>
            {d.device_key !== mine && (
              <button className="icon-btn" title="Forget this device" onClick={async () => { await removeDevice(d.id); refresh() }}>✕</button>
            )}
          </div>
        ))}
      </div>

      <button className="btn-ghost danger" onClick={() => void signOutEverywhere()}>
        Log out of all devices
      </button>
    </section>
  )
}

function icon(platform: string): string {
  if (/Android/i.test(platform)) return '🤖'
  if (/iPhone|iOS/i.test(platform)) return '📱'
  if (/Windows|Desktop/i.test(platform)) return '🖥'
  if (/Mac/i.test(platform)) return '💻'
  return '🌐'
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
