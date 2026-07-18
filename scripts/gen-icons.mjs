// Rasterize public/icon.svg into the PNG icons + iOS splash screens the
// PWA needs. Run when the icon changes:  npm i -D sharp && node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const svg = readFileSync(`${root}/public/icon.svg`)
const BG = '#FBF7EE'

// plain icons (transparent-ish → flatten onto brand background for apple)
const jobs = [
  { size: 192, out: 'icons/icon-192.png', pad: 0 },
  { size: 512, out: 'icons/icon-512.png', pad: 0 },
  { size: 180, out: 'icons/apple-touch-icon.png', pad: 20 }, // iOS wants opaque + a little padding
  { size: 512, out: 'icons/maskable-512.png', pad: 64 }, // maskable safe zone
]

for (const j of jobs) {
  const inner = j.size - j.pad * 2
  const icon = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer()
  await sharp({
    create: { width: j.size, height: j.size, channels: 4, background: BG },
  })
    .composite([{ input: icon }])
    .png()
    .toFile(`${root}/public/${j.out}`)
  console.log('wrote', j.out)
}

// iOS splash screens: brand background + centered icon
const splashes = [
  [1170, 2532], // iPhone 12–14
  [1290, 2796], // iPhone 14/15/16 Pro Max
  [1179, 2556], // iPhone 14/15/16 Pro
  [828, 1792],  // iPhone 11 / XR
  [1536, 2048], // iPad 9.7/10.2
  [1668, 2388], // iPad Pro 11
  [2048, 2732], // iPad Pro 12.9
]
for (const [w, h] of splashes) {
  const iconSize = Math.round(Math.min(w, h) * 0.28)
  const icon = await sharp(svg, { density: 300 }).resize(iconSize, iconSize).png().toBuffer()
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: icon, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(`${root}/public/splash/apple-splash-${w}-${h}.png`)
  console.log('wrote', `splash/apple-splash-${w}-${h}.png`)
}
