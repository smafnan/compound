// The only bridge across contextIsolation: a tiny, explicitly-listed updater
// API. No node, no ipcRenderer, nothing the page could turn into file access.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('compound', {
  platform: process.platform,
  updater: {
    /** Current status right now (the renderer may mount after the first check). */
    status: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    /** Subscribe to status changes; returns an unsubscribe function. */
    onStatus: (fn) => {
      const handler = (_e, status) => fn(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.off('updater:status', handler)
    },
  },
})
