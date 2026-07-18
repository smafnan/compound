import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // relative base so the same build works on the web, in Capacitor
  // webviews and from file:// inside Electron
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // new deploys take over silently on next visit
      manifest: false, // public/manifest.webmanifest is hand-maintained
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,webmanifest,woff2}'],
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
