<div align="center">

<img src="public/icon.svg" width="90" alt="Compound icon" />

# C O M P O U N D

**A motivational countdown timer · daily checklist matrix · compounding growth tracker**

*Days spent are blacked out. Days remaining stay white. Sand fills the box you're living in right now.*

<br/>

![React](https://img.shields.io/badge/React_18-1B1B1B?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-1B1B1B?logo=typescript&logoColor=3178C6)
![Vite](https://img.shields.io/badge/Vite-1B1B1B?logo=vite&logoColor=F7C948)
![Capacitor](https://img.shields.io/badge/Capacitor_8-Android_%26_iOS-1B1B1B?logo=capacitor&logoColor=119EFF)
![PWA](https://img.shields.io/badge/PWA-installable-E4572E)
![No backend](https://img.shields.io/badge/backend-none%2C_your_data_stays_local-2C8C4A)
![License](https://img.shields.io/badge/license-MIT-0080FF)

<br/>

<img src="docs/countdown.png" width="920" alt="Countdown — the wall of days" />

</div>

<br/>

## The idea

> 1% better every day for a year is **×37.8**. 1% worse every day is **×0.03**.
> Small things, done daily, are not small.

Compound makes time *visible* so you actually feel it passing — and makes your daily
routine *measurable* so you can watch it compound.

<br/>

## ✦ What's inside

### ⏳ Countdown — "The Wall"

Add any goal with a **start date** (set it in the past — *"how many days ago did I plan
to start this?"*) and a **deadline**, both editable at any time. You get:

- a giant **days-left** number,
- **day N** of your journey and a sand progress tube,
- **The Wall** — real calendar pages where every day you've spent is blacked out, every
  day you have left stays white, and **today's box slowly fills with sand** as the day
  goes by. Each month card shows its own % spent.

There is no better cure for "I still have time" than watching the boxes go black.

### ◔ Today — hours & quarter hours

<div align="center"><img src="docs/today.png" width="880" alt="Today — live clock, 24 hour boxes, 96 quarter-hour boxes" /></div>

A live clock with **% of today gone**, a 24-box hour grid, and a 96-box grid of
**15-minute blocks**. The box you are inside right now fills with sand in real time.
"74 blocks left" hits different when you can see all 74 of them.

### ▦ Checklist — the habit matrix

<div align="center"><img src="docs/checklist.png" width="880" alt="Checklist — days across the top, daily tasks down the side" /></div>

Days **1–31 across the top**, your daily tasks **down the side** — tick what you did,
day by day. Compound computes:

- a **productivity score for every day** (the little bar chart along the bottom),
- a **monthly % for every task** (the column on the right),
- your **overall month productivity**.

Future days are locked, so the record stays honest.

### ◮ Growth — the compounding engine

<div align="center"><img src="docs/growth.png" width="880" alt="Growth — compound index, better/worse comparisons, 90-day curve" /></div>

Every day's checklist score feeds the **compound index**: a fully productive day
multiplies you by **1.01**. Compound then answers the questions that matter:

| Question | How it's answered |
|---|---|
| Did I do better **today**? | today's score vs yesterday's, as *% better / worse* |
| Was this a better **week**? | this week's average vs last week's |
| A better **month**? | this month vs last month |
| A better **year**? | this year vs last year |
| Where is this all going? | your 90-day curve + a *"×N in a year at this pace"* projection |

### ✦ All — everything on one page

<div align="center"><img src="docs/all.png" width="880" alt="All mode — countdown, month, clock, hours, quarters and growth together" /></div>

One mode that shows **every calculation together**: the countdown, this month's calendar,
the live clock, the hour grid, the quarter-hour grid, and all the growth comparisons —
your entire relationship with time on a single page.

### 📱 Native Android & iOS apps

<div align="center"><img src="docs/mobile.png" width="300" alt="Mobile layout with bottom tab bar" /></div>

The repo ships **real native projects** for both platforms (built with
[Capacitor 8](https://capacitorjs.com)) in `android/` and `ios/`, with generated app
icons and splash screens. On phones your data lives in **native storage**
(SharedPreferences on Android, UserDefaults on iOS), so the OS can't evict it the way
it can browser storage. The layout is fully responsive with a bottom tab bar — and if
you'd rather not build anything, the web app also installs as a **PWA** via
*Add to Home Screen*.

<br/>

## 🚀 Getting started

```bash
git clone https://github.com/smafnan/Motivational-Time-Tracker.git
cd Motivational-Time-Tracker
npm install
npm run dev     # → http://localhost:5173
```

Want to see it with data before building your own routine? Open the **demo mode**:

```
http://localhost:5173/?demo
```

(generated sample data — it never touches your real records). You can also deep-link any
tab with `?tab=countdown|today|checklist|growth|all`.

Production build:

```bash
npm run build   # static site in dist/ — deploy anywhere (Vercel, Netlify, GitHub Pages…)
```

### Build the Android app

Requires [Android Studio](https://developer.android.com/studio) (any OS):

```bash
npm run build && npx cap sync
npx cap open android        # opens Android Studio → press Run ▶
```

Or from the command line, if you have the Android SDK + JDK 17+:

```bash
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk — install it on any Android phone
```

### Build the iOS app

Requires a **Mac with Xcode 15+** (an Apple platform rule — iOS apps can't be compiled
elsewhere). Dependencies use Swift Package Manager, so there's no CocoaPods setup:

```bash
npm install && npm run build && npx cap sync
npx cap open ios            # opens Xcode → pick your signing team → press Run ▶
```

A free Apple ID is enough to run it on your own iPhone; App Store distribution needs a
developer account.

<br/>

## 🧮 The math, honestly

- **Day score** = tasks completed ÷ tasks that existed that day. Days before a task was
  created don't count against it.
- **Compound index** = start at 1.0; each day multiply by `1 + score/100`. A 100% day
  is +1%, a 50% day is +0.5%, an empty day changes nothing.
- **"% better"** = relative change between periods: `(current − previous) / previous`.
  Weeks start on Monday; months and years are calendar periods.
- Everything is stored in `localStorage` under `compound.v1` — no account, no server,
  no tracking. Your data never leaves your browser.

<br/>

## 🎨 Design

Hand-drawn **"ink on paper"** aesthetic inspired by playful illustrated portfolio sites:
warm paper background, black marker outlines, wobbly borders, sticker-style buttons with
comic offset shadows, and a dashed street line under the header. Type is set in
[Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker),
[Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) and
[Caveat](https://fonts.google.com/specimen/Caveat). The palette is ink `#1B1B1B` on paper
`#FBF7EE`, with sun-yellow sand `#F7C948`, hydrant red `#E4572E`, sky blue `#0080FF` and
a green `#2C8C4A` for wins.

<br/>

## 🛠 Tech

Vite · React 18 · TypeScript · hand-rolled CSS (no UI framework) · Capacitor 8 for the
native Android/iOS shells · PWA manifest · localStorage on the web, mirrored to native
Preferences (SharedPreferences / UserDefaults) on phones. Web bundle ~56 KB gzipped.

<br/>

## License

[MIT](LICENSE) — do whatever compounds you.

<div align="center"><br/><em>every day counts !</em></div>
