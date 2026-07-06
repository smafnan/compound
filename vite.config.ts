import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // relative base so the same build works on the web, in Capacitor
  // webviews and from file:// inside Electron
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
