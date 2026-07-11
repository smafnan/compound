import { useEffect, useRef, useState } from 'react'
import { FONTS, fontLabel, resolveFontFamily } from './prefs'
import { FONT_LIBRARY } from './fontlib'

interface Entry {
  id: string
  label: string
  family: string
}

const ALL: Entry[] = [
  ...FONTS.map((f) => ({ id: f.id, label: f.label, family: f.family })),
  ...FONT_LIBRARY.map((f) => ({ id: `lib:${f.label}`, label: f.label, family: `'${f.family}', sans-serif` })),
]

/** Searchable font dropdown; every option previews its own typeface.
 *  Items render lazily (content-visibility) so the 400+ font files
 *  only load as they scroll into view. */
export default function FontPicker({ value, onChange }: {
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const needle = q.trim().toLowerCase()
  const list = needle ? ALL.filter((f) => f.label.toLowerCase().includes(needle)) : ALL

  return (
    <div className="fontpick" ref={boxRef}>
      <button
        type="button"
        className="fontpick-btn"
        style={{ fontFamily: resolveFontFamily(value) }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="fontpick-current">{fontLabel(value)}</span>
        <span className="fontpick-chev" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="fontpick-pop">
          <input
            className="fontpick-search"
            placeholder={`⌕  ${ALL.length} fonts`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="fontpick-list">
            {list.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`fontpick-item ${value === f.id ? 'on' : ''}`}
                style={{ fontFamily: f.family }}
                onClick={() => {
                  onChange(f.id)
                  setOpen(false)
                }}
              >
                {f.label}
              </button>
            ))}
            {list.length === 0 && <div className="fontpick-none">—</div>}
          </div>
        </div>
      )}
    </div>
  )
}
