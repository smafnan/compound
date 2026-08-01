# Cutting a release

Everything is driven by a `v*` tag. Pushing one runs both workflows, which build
for five platforms and attach the results — installers *and* the update metadata
— to the GitHub release for that tag.

```sh
# 1. bump the version — this is what the update check compares against,
#    on every platform, so it has to be right
npm version 1.4.0 --no-git-tag-version

# 2. commit it
git add package.json package-lock.json
git commit -m "chore(release): 1.4.0"

# 3. tag and push
git tag v1.4.0
git push origin main --tags
```

Then, on the release GitHub creates, write the notes. They are not decoration:
the desktop and Android update cards show them under "what's new".

## What lands on the release

| File | Why it matters |
| --- | --- |
| `Compound-Setup-1.4.0.exe` + `.blockmap` | the Windows installer |
| `latest.yml` | **how installed Windows copies discover the update** |
| `Compound-1.4.0-arm64.dmg` / `.zip` + `.blockmap` | macOS; the `.zip` is what auto-update downloads |
| `latest-mac.yml` | **how installed Macs discover the update** |
| `Compound-1.4.0.AppImage` | Linux |
| `latest-linux.yml` | **how installed AppImages discover the update** |
| `Compound-android.apk` | Android |

The `latest*.yml` files are the part that is easy to lose. Without them the
release is downloadable but no installed copy will ever notice it exists. If
someone reports "it never told me there was an update", check that these three
files are attached to the newest release before looking anywhere else.

## Before tagging

- The release must end up **published, not a draft or prerelease** — the updater
  only looks at full releases.
- Version numbers must go up. `1.4.0` after `1.3.0`; the comparison is numeric,
  segment by segment.

## Testing the update path without shipping to everyone

Build a packaged app at a *lower* version than the newest release and run it:

```sh
npm version 1.2.0 --no-git-tag-version --allow-same-version
npm run build && npx electron-builder --mac --publish never
./release/mac-arm64/Compound.app/Contents/MacOS/Compound
```

The card should appear within about five seconds of launch. Put the version
back afterwards.

## Related

- [updates.md](updates.md) — how each platform delivers updates
