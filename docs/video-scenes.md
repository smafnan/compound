# Background video scenes

Looping video backgrounds live in `public/scenes/` and are registered in
`VIDEO_SCENES` in `src/Backdrop.tsx`. Eight ship today: Milky Way, Earth,
Amazon, Beach, Rain, Berlin, Oxford, Lahore.

## Adding one

1. Encode the clip (below) into `public/scenes/`, plus a poster JPEG.
2. Add one entry to `VIDEO_SCENES`:

   ```ts
   {
     id: 'vid-rain',            // must start with "vid-"; also the ?bg= deep-link value
     label: 'Rain',
     icon: '☂',
     video: {
       file: 'rain.mp4',
       poster: 'rain.jpg',      // also becomes the picker card's thumbnail
       tint: 'linear-gradient(#556a70, #39474b)',  // avg colour, light→dark
       scrim: 0.36,             // veil strength, see below
     },
   },
   ```

That's the whole change — the scene appears in both pickers (the ✎ style popover
and Profile → Look & feel) and in `?bg=vid-rain` deep links.

## Encoding

No ffmpeg needed. `scripts/scene-encode.swift` uses AVFoundation/VideoToolbox,
which macOS ships. It does three things in one pass: caps the bitrate, drops the
audio track entirely, and **cross-dissolves the tail into the head so the clip
loops without a visible jump**.

```sh
swiftc -O scripts/scene-encode.swift -o /tmp/scene-encode
/tmp/scene-encode raw/beach.mp4 public/scenes/beach.mp4 900 1.0
#                 <source>       <dest>                  kbps crossfade-seconds
```

Note the output is **shorter than the source by the crossfade length** (a 10 s
source with a 1.0 s crossfade yields a 9 s seamless loop). That is expected.

Bitrate guide at 720p, for footage sitting behind the scrim and an 8px panel
blur — generators typically hand back 10–12 Mbps, which is 6–8× more than needed:

| scene type | kbps | examples |
| --- | --- | --- |
| dark, calm, low detail | 900 | Milky Way, Earth, Beach |
| medium detail | 1200 | Amazon, Rain |
| busy streets, fine texture | 1500 | Berlin, Oxford, Lahore |

At those rates a 9 s 720p loop is 1.0–1.6 MB, versus 12–15 MB raw. Measured
quality against the source at matched timestamps is ~35 dB PSNR, i.e. visually
indistinguishable at 1:1 — verified on the Lahore clip, the most detailed of the
eight.

Poster frames (640px wide, quality 70, ~25 KB each):

```sh
python3 -c "
from PIL import Image
im = Image.open('frame0.png').convert('RGB')
im = im.resize((640, round(640*im.height/im.width)), Image.LANCZOS)
im.save('public/scenes/beach.jpg','JPEG',quality=70,optimize=True,progressive=True)"
```

### Source requirements

- **1280×720 is plenty.** The backdrop sits behind a scrim and a blur, and gets
  cropped hard on phones. 1080p only adds bytes.
- **H.264 (`avc1`) + yuv420p.** Plays in every browser, Android WebView and
  Safari. Avoid HEVC — Chrome often can't decode it.
- **Centre-safe composition.** `object-fit: cover` means a portrait phone shows
  only the **middle ~26% of the frame's width**. Keep anything that matters in
  the central third; full-frame textures (starfield, canopy, water) crop best.
- Audio is stripped by the encoder, so don't bother removing it first. Note that
  `muted` on the element is what makes autoplay legal — dropping the track is a
  size and hygiene win, not a correctness requirement.

## The scrim

`scrim` is how much paper-coloured veil covers the footage, 0–1. The CSS scenes
use a global 0.34; video scenes set their own because brightness varies so much.
Values in use run 0.30 (Milky Way) to 0.43 (Oxford).

Remember the panels already carry their own 90%-opaque background plus an 8px
backdrop blur, so text *on* panels is safe regardless. The scrim only protects
the few elements outside panels (the footer, the ✎ style button, the tab bar) —
which is why these values are deliberately low. Going much above ~0.45 washes
the scene out for no readability gain.

To derive a value for a new clip, measure its centre-crop brightness and edge
density and apply:

```
scrim = 0.20 + (medianCentreLuminance / 255) * 0.28 + min(edgeDensity, 10) / 10 * 0.14
```

where `edgeDensity` is the mean absolute difference between adjacent pixels,
averaged over several frames. Then eyeball it — the formula is a starting point.

## Behaviour you get for free

- muted, looping, inline autoplay
- **paused whenever the tab/app is hidden**, so it doesn't burn battery
- replaced by the still `tint` when the OS asks for reduced motion
- falls back to the `poster`, then the `tint`, if the file is missing or fails
  to decode — the app never sits on a blank backdrop
- cached by the service worker after first play (`scene-video` cache in
  `vite.config.ts`, with `rangeRequests: true` because video is served as 206
  Partial Content), so scenes work offline once seen
- a saved scene whose file was later removed falls back to Plain rather than
  leaving the app translucent over nothing
