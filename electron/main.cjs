const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { initUpdater } = require('./updater.cjs')

let mainWindow = null

// Only these ever leave the app for the system browser. Anything else
// (file:, smb:, custom protocol handlers…) could launch local programs.
const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

// The sign-in-with-provider round trip runs inside the window, so these
// hosts may be navigated to; every other site opens in the browser.
const AUTH_HOSTS = [/\.supabase\.co$/, /^github\.com$/, /^compoundtracker\.netlify\.app$/]

function openSafely(raw) {
  try {
    const url = new URL(raw)
    if (EXTERNAL_SCHEMES.has(url.protocol)) void shell.openExternal(url.toString())
  } catch {
    /* not a URL — ignore */
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#FBF7EE',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // camera, microphone, location… are never used — refuse them outright
  const ALLOWED_PERMISSIONS = new Set(['notifications', 'fullscreen', 'mediaKeySystem', 'clipboard-sanitized-write'])
  win.webContents.session.setPermissionRequestHandler((_wc, permission, done) => {
    done(ALLOWED_PERMISSIONS.has(permission))
  })

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // external links (fonts CDN etc. load inline; anything user-facing opens in the browser)
  win.webContents.setWindowOpenHandler(({ url }) => {
    openSafely(url)
    return { action: 'deny' }
  })

  // the window itself only ever shows the app (or the sign-in round trip)
  win.webContents.on('will-navigate', (event, raw) => {
    let url
    try {
      url = new URL(raw)
    } catch {
      event.preventDefault()
      return
    }
    if (url.protocol === 'file:') return
    if (url.protocol === 'https:' && AUTH_HOSTS.some((h) => h.test(url.hostname))) return
    event.preventDefault()
    openSafely(raw)
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

// One copy at a time: an update staged by this window should not be undercut by
// a second instance still running the old build.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    createWindow()
    initUpdater(() => mainWindow)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
