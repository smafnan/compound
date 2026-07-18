// Small WebAudio chime — no audio assets, works offline. The context is
// created lazily and resumed on demand; browsers allow it once the user
// has interacted with the page at any point in the session.

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** A gentle three-note bell, used when a countdown or focus block ends. */
export function playChime(notes: number[] = [880, 1108.7, 1318.5]): void {
  const ac = context()
  if (!ac) return
  const t0 = ac.currentTime + 0.02
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const at = t0 + i * 0.28
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.22, at + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + 0.65)
  })
}

/** Short double-beep for the focus timer's break transitions. */
export function playBeep(): void {
  playChime([660, 660])
}
