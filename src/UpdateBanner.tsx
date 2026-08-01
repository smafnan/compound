import { useState } from 'react'
import { t } from './i18n'
import { AppUpdate } from './update'

/** The one thing every platform's update flow surfaces: a card in the corner
 *  with a version, optionally the release notes, and a single action. */
export default function UpdateBanner({ update }: { update: AppUpdate }) {
  const { status, act, dismiss } = update
  const [notesOpen, setNotesOpen] = useState(false)

  if (status.state === 'idle' || status.state === 'checking') return null

  const busy = status.state === 'downloading'
  const ready = status.state === 'ready'
  const action = ready
    ? window.compound
      ? t('updateRestart') // desktop: relaunch into the installer
      : t('updateReload') // web: swap in the waiting service worker
    : status.manual
      ? t('updateGet') // sideloaded: we can only point at the download
      : t('updateNow')

  return (
    <div className="update-card" role="status">
      <div className="update-head">
        <span className="update-mark" aria-hidden>↑</span>
        <div className="update-text">
          <b>{ready ? t('updateReady') : busy ? t('updateDownloading') : t('updateAvailable')}</b>
          {status.version && (
            <span className="update-ver">
              {status.current ? `${status.current} → ` : ''}
              {status.version}
            </span>
          )}
        </div>
      </div>

      {busy ? (
        <div className="update-prog">
          <div
            className="update-bar"
            role="progressbar"
            aria-label={t('updateDownloading')}
            aria-valuenow={status.percent ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${status.percent ?? 0}%` }} />
          </div>
          <span>{status.percent ?? 0}%</span>
        </div>
      ) : (
        <div className="update-acts">
          <button className="update-go" onClick={act}>
            {action}
          </button>
          <button className="update-skip" onClick={dismiss}>
            {t('updateLater')}
          </button>
          {status.notes && (
            <button
              className="update-skip"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((o) => !o)}
            >
              {t('whatsNew')} {notesOpen ? '▴' : '▾'}
            </button>
          )}
        </div>
      )}

      {notesOpen && status.notes && <pre className="update-notes">{status.notes.trim()}</pre>}
    </div>
  )
}
