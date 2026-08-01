import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // relative base so the same build works on the web, in Capacitor
  // webviews and from file:// inside Electron
  base: './',
  // the running version, so the update check has something to compare
  // GitHub's newest release against
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new deploy waits for the person to accept
      // it (see src/update.ts) instead of swapping the app out mid-session
      registerType: 'prompt',
      // src/update.ts owns registration so the banner can hook into it
      injectRegister: null,
      manifest: false, // public/manifest.webmanifest is hand-maintained
      workbox: {
        // jpg picks up the scene posters (~200 KB total) — they are the offline
        // stand-in for the videos, which are far too big to precache
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webp,webmanifest,woff2}'],
        // the 20 MB designer-font library is fetched on demand, not precached
        globIgnores: ['fonts/library/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/library\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-library',
              expiration: { maxEntries: 60, maxAgeSeconds: 365 * 24 * 3600 },
            },
          },
          {
            // background videos: too big to precache, so they are cached the
            // first time a scene is actually chosen and stay offline after
            urlPattern: /\/scenes\/.*\.(mp4|webm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scene-video',
              expiration: { maxEntries: 12, maxAgeSeconds: 365 * 24 * 3600 },
              // videos are served as 206 Partial Content — without this the
              // SW cannot satisfy the browser's range requests
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // never let the SW interfere with auth/sync traffic
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
})
