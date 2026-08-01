# How updates reach people

Compound ships to five places from one repo. Each has its own idea of what
"install an update" means, so the app has three delivery routes that all end at
the same card in the corner of the screen.

| Where | How it finds out | What the button does |
| --- | --- | --- |
| Windows, macOS, Linux | `electron-updater` reads `latest*.yml` from the newest GitHub release | downloads in the background, then restarts into the installer |
| Web / installed PWA | the service worker fetches the new build and parks it | activates the waiting worker and reloads |
| Android APK | asks the GitHub releases API for the newest tag | opens the release page to download the new APK |

Nothing installs without being asked. On desktop the download does not even
start until the button is pressed.

## The pieces

- `electron/updater.cjs` — the desktop check, on a timer, in the main process.
- `electron/preload.cjs` — the only thing exposed to the page: five updater methods.
- `src/update.ts` — `useAppUpdate()`, which picks a route and normalises all
  three into one status object.
- `src/UpdateBanner.tsx` — the card.

## Desktop, in detail

On launch (after 4s, so it never competes with first paint) and every 6 hours
after that, the main process asks GitHub for the newest release and compares it
to `app.getVersion()`.

What makes this work is `latest.yml` / `latest-mac.yml` / `latest-linux.yml`.
electron-builder generates them next to the installers, and CI attaches them to
the release. **A release without them is downloadable but invisible to already-
installed copies** — this is the single most common way to ship an update that
nobody receives.

Two things can stop an in-place update:

- **An unsigned or ad-hoc-signed macOS build.** macOS will not let an app
  replace a bundle whose signature it cannot match, so the swap fails.
- **A read-only AppImage**, e.g. one launched straight from a mounted image.

Neither is treated as an error. `updater.cjs` catches the failure, asks the
GitHub API directly, and shows the same banner in `manual` mode — the button
just opens the release page instead. Nobody hits a dead end; Mac users get a
download link rather than a silent in-place swap. If the macOS build is ever
signed with a Developer ID certificate, the in-place path starts working on
Macs with no code change.

## Web, in detail

`vite.config.ts` sets `registerType: 'prompt'` and `injectRegister: null`: the
plugin no longer registers the worker itself, `src/update.ts` does, so the
banner can hook into `onNeedRefresh`.

This is a deliberate change from the old `autoUpdate` behaviour, where a new
deploy took over silently on the next visit. Silent was fine when the app was a
countdown; it is not fine now that a session can hold unsaved canvas work and a
running timer. A tab left open re-checks every 6 hours.

## Android, in detail

The APK is sideloaded, so no store and no updater can replace it. The app polls
the releases API and, when the newest tag is newer than `__APP_VERSION__`
(injected from `package.json` at build time), points at the download.

`https://api.github.com` is in the `connect-src` allow-list in `index.html` for
exactly this call. It is also what makes the desktop fallback possible.

## Dismissing

"Not now" writes the version into `compound.update.skipped` in localStorage and
the banner stays away for that version. The next version asks again.

## Cutting a release

See [releasing.md](releasing.md).
