// Device-local look & feel preferences (not synced — like the theme).

import { FONT_LIBRARY } from './fontlib'

export interface FontChoice {
  id: string
  label: string
  family: string
}

export const FONTS: FontChoice[] = [
  { id: 'goblock', label: 'Goblock', family: "'Goblock', 'Permanent Marker', cursive" },
  { id: 'marker', label: 'Marker', family: "'Permanent Marker', cursive" },
  { id: 'bangers', label: 'Bangers', family: "'Bangers', cursive" },
  { id: 'bebas', label: 'Bebas', family: "'Bebas Neue', sans-serif" },
  { id: 'orbitron', label: 'Orbitron', family: "'Orbitron', sans-serif" },
  { id: 'pixel', label: 'Pixel', family: "'Silkscreen', monospace" },
  { id: 'script', label: 'Script', family: "'Pacifico', cursive" },
]

/** Resolve a font pref (curated id or "lib:<Family>") to a CSS family. */
export function resolveFontFamily(id: string): string {
  if (id.startsWith('lib:')) {
    const f = FONT_LIBRARY.find((x) => x.label === id.slice(4))
    if (f) return `'${f.family}', sans-serif`
  }
  return (FONTS.find((x) => x.id === id) ?? FONTS[0]).family
}

/** Human label for whatever font pref is active. */
export function fontLabel(id: string): string {
  if (id.startsWith('lib:')) return id.slice(4)
  return (FONTS.find((x) => x.id === id) ?? FONTS[0]).label
}

export function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`compound.${key}`) ?? fallback
  } catch {
    return fallback
  }
}

export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(`compound.${key}`, value)
  } catch {
    /* unavailable */
  }
}
