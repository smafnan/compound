import { useEffect, useRef, useState } from 'react'

/** The plain (no backdrop) option. */
export type CssBg = 'none'
/** Scenes backed by a looping video file in public/scenes/. */
export type VideoBg = `vid-${string}`
export type BgKind = CssBg | VideoBg

export interface Scene {
  id: BgKind
  label: string
  icon: string
  /** present only on video scenes */
  video?: {
    /** file name inside public/scenes/ */
    file: string
    /** optional still (jpg/webp) shown while the video buffers */
    poster?: string
    /** the still colour behind it: covers buffering, decode failures and
     *  reduced-motion, so the app never sits on a blank backdrop */
    tint: string
    /** how much paper-coloured veil to lay over this scene, 0-1.
     *  Bright, busy footage needs more of it to keep text readable;
     *  a dark starfield needs almost none. Default is 0.34, as for the
     *  CSS scenes. Measured per clip from its centre-crop brightness
     *  and edge density — see docs/video-scenes.md. */
    scrim?: number
  }
}

/**
 * ADDING A VIDEO SCENE — full guide with ffmpeg settings in docs/video-scenes.md
 * 1. Drop the file in `public/scenes/` — MP4 (H.264 + yuv420p) plays everywhere.
 *    Keep it short and seamless (~10-15s), silent (strip the audio track) and
 *    compressed; every megabyte ships in the APK, the Electron build and the
 *    web bundle.
 * 2. Add one entry below. It shows up in both scene pickers automatically and
 *    becomes deep-linkable as `?bg=<id>`.
 * 3. `tint` should roughly match the video's average colour.
 */
export const VIDEO_SCENES: Scene[] = [
  {
    id: 'vid-milkyway', label: 'Milky Way', icon: '✧',
    video: { file: 'milky-way.mp4', poster: 'milky-way.jpg', tint: 'linear-gradient(#384049, #252b31)', scrim: 0.30 },
  },
  {
    id: 'vid-earth', label: 'Earth', icon: '◉',
    video: { file: 'earth.mp4', poster: 'earth.jpg', tint: 'linear-gradient(#454d52, #2e3437)', scrim: 0.32 },
  },
  {
    id: 'vid-amazon', label: 'Amazon', icon: '❧',
    video: { file: 'amazon.mp4', poster: 'amazon.jpg', tint: 'linear-gradient(#697060, #464b40)', scrim: 0.33 },
  },
  {
    id: 'vid-beach', label: 'Beach', icon: '≈',
    video: { file: 'beach.mp4', poster: 'beach.jpg', tint: 'linear-gradient(#8f9b9e, #60676a)', scrim: 0.39 },
  },
  {
    id: 'vid-rain', label: 'Rain', icon: '☂',
    video: { file: 'rain.mp4', poster: 'rain.jpg', tint: 'linear-gradient(#556a70, #39474b)', scrim: 0.36 },
  },
  {
    id: 'vid-berlin', label: 'Berlin', icon: '▤',
    video: { file: 'berlin.mp4', poster: 'berlin.jpg', tint: 'linear-gradient(#4e5b5d, #343d3e)', scrim: 0.40 },
  },
  {
    id: 'vid-oxford', label: 'Oxford', icon: '♖',
    video: { file: 'oxford.mp4', poster: 'oxford.jpg', tint: 'linear-gradient(#74705b, #4e4a3d)', scrim: 0.43 },
  },
  {
    id: 'vid-lahore', label: 'Lahore', icon: '❖',
    video: { file: 'lahore.mp4', poster: 'lahore.jpg', tint: 'linear-gradient(#81684b, #564632)', scrim: 0.39 },
  },
]

/** Plain is the only non-video option, and leads the list. */
export const PLAIN: Scene = { id: 'none', label: 'Plain', icon: '·' }

/** Every selectable scene: Plain first, then the video scenes. */
export const BACKDROPS: Scene[] = [PLAIN, ...VIDEO_SCENES]

export const sceneById = (id: BgKind): Scene | undefined =>
  BACKDROPS.find((s) => s.id === id)

/** Public-folder URL that survives the relative `base` used for Electron
 *  file:// and Capacitor webviews. */
export const assetUrl = (file: string) => `${import.meta.env.BASE_URL}scenes/${file}`

/** Background for a scene's picker card: its poster frame when there is one,
 *  over the tint so the card is never blank while the still loads. */
export function sceneCardBg(scene: Scene): string | undefined {
  const v = scene.video
  if (!v) return undefined
  return v.poster ? `url(${assetUrl(v.poster)}), ${v.tint}` : v.tint
}

/** Honour the OS "reduce motion" setting — video backgrounds are the most
 *  motion-heavy thing in the app, so they fall back to their still tint. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Fixed scene rendered behind the app. Video scenes pause themselves
 *  whenever the app isn't visible; a theme-aware scrim (see styles.css)
 *  keeps content readable on top. Plain renders nothing at all. */
export default function Backdrop({ kind }: { kind: BgKind }) {
  const scene = sceneById(kind)
  return scene?.video ? <VideoBackdrop scene={scene} /> : null
}

/**
 * A silent, looping video filling the viewport. Muted + playsInline are what
 * make autoplay legal on every browser; the tint sits underneath so a slow
 * network, a missing file or reduced-motion still looks deliberate.
 */
function VideoBackdrop({ scene }: { scene: Scene }) {
  const { file, poster, tint, scrim } = scene.video as NonNullable<Scene['video']>
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const reduced = usePrefersReducedMotion()
  const still = reduced || failed

  // don't decode frames for a window nobody is looking at
  useEffect(() => {
    if (still) return
    const sync = () => {
      const el = ref.current
      if (!el) return
      if (document.hidden) el.pause()
      else void el.play().catch(() => { /* autoplay blocked — tint shows */ })
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [still, file])

  return (
    <div
      className={`backdrop bg-video bg-${scene.id}`}
      style={{
        background: tint,
        // per-scene veil strength; .backdrop::after paints it over the frames
        ...(scrim
          ? { ['--scrim' as string]: `color-mix(in srgb, var(--paper) ${Math.round(scrim * 100)}%, transparent)` }
          : {}),
      }}
      aria-hidden
    >
      {!still && (
        <video
          ref={ref}
          className="bg-vid"
          src={assetUrl(file)}
          poster={poster ? assetUrl(poster) : undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
