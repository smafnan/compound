// Desktop auto-update.
//
// electron-builder writes an `app-update.yml` into the packaged app that points
// electron-updater at this repo's GitHub releases, and publishes a `latest.yml`
// (`latest-mac.yml`, `latest-linux.yml`) next to the installers describing the
// newest build. On launch we read that file, tell the window what we found and
// let the person decide — nothing downloads until they say yes.
//
// Two things can stop an in-place update: an unsigned/ad-hoc macOS build (the
// OS refuses to swap a bundle whose signature it cannot match) and an AppImage
// launched read-only. Rather than dead-end there, every failure downgrades to
// `manual` mode: same banner, but the button opens the release page instead.

const { app, ipcMain, shell } = require('electron')
const { autoUpdater } = require('electron-updater')

const RELEASES_PAGE = 'https://github.com/smafnan/compound/releases/latest'
const RELEASES_API = 'https://api.github.com/repos/smafnan/compound/releases/latest'

// re-check while the app stays open for days at a time
const RECHECK_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_MS = 4000

/** Newest first: 1 when a is newer than b, -1 when older, 0 when equal. */
function compareVersions(a, b) {
  const parts = (v) => String(v).replace(/^v/, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1
  }
  return 0
}

function initUpdater(getWindow) {
  autoUpdater.autoDownload = false // ask first
  autoUpdater.autoInstallOnAppQuit = true // if they close before restarting, install then
  autoUpdater.logger = null

  let state = { state: 'idle', current: app.getVersion() }

  const publish = (next) => {
    state = { ...next, current: app.getVersion() }
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send('updater:status', state)
  }

  /** Last resort when electron-updater cannot install in place: ask GitHub
   *  directly, so we can still say "1.4.0 is out" and link to the download. */
  async function manualCheck() {
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return false
      const rel = await res.json()
      const version = String(rel.tag_name || '').replace(/^v/, '')
      if (!version || compareVersions(version, app.getVersion()) <= 0) return false
      publish({ state: 'available', manual: true, version, notes: rel.body || '', url: rel.html_url || RELEASES_PAGE })
      return true
    } catch {
      return false
    }
  }

  autoUpdater.on('update-available', (info) => {
    publish({ state: 'available', version: info.version, notes: releaseNotes(info), url: RELEASES_PAGE })
  })
  autoUpdater.on('update-not-available', () => {
    // keep an already-downloaded update visible instead of clearing it
    if (state.state === 'idle' || state.state === 'checking') publish({ state: 'idle' })
  })
  autoUpdater.on('download-progress', (p) => {
    publish({ state: 'downloading', version: state.version, percent: Math.round(p.percent || 0) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    publish({ state: 'ready', version: info.version, notes: releaseNotes(info) })
  })
  autoUpdater.on('error', () => {
    // an unsigned macOS build or a read-only AppImage lands here — fall back to
    // pointing at the release page rather than showing an error nobody can act on
    void manualCheck().then((found) => {
      if (!found && state.state !== 'ready') publish({ state: 'idle' })
    })
  })

  async function check() {
    if (!app.isPackaged) return // dev runs from source; there is nothing to update
    publish({ state: 'checking' })
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      await manualCheck()
    }
  }

  ipcMain.handle('updater:status', () => state)
  ipcMain.handle('updater:check', () => check())
  ipcMain.handle('updater:download', async () => {
    if (state.manual) {
      await shell.openExternal(state.url || RELEASES_PAGE)
      return
    }
    publish({ state: 'downloading', version: state.version, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      // the error handler above has already switched us to manual mode
    }
  })
  ipcMain.handle('updater:install', () => {
    // isSilent=false so the installer UI shows, isForceRunAfter=true to reopen
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })

  setTimeout(() => void check(), FIRST_CHECK_MS)
  setInterval(() => void check(), RECHECK_MS)
}

/** electron-updater hands back either a string or a list of release entries. */
function releaseNotes(info) {
  const n = info && info.releaseNotes
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map((e) => e.note || '').join('\n\n')
  return ''
}

module.exports = { initUpdater }
