# iSconl · native Android client

Offline-first Flutter client for the iSconl sovereign personal agent.
Lives on the **`apk` branch** - a parallel, orphan branch of
`Sconl/isconl-agent`. The web dashboard (dev/staging/main) is untouched.

## What it is

- A native mirror of the dashboard: Command · Tasks · Ask · Alerts, plus
  Planning, Calendar, Inbox, Kanban, GitHub, Finance, Journal, Learning,
  Circle, Projects, Spaces, Decisions & Risks, Audit Chain, Outbox, Settings.
- **Offline-first**: every domain is cached in SQLite on the phone. Reads
  work with no connection. Writes queue in an outbox and deliver on
  reconnect; the server then pushes the vault to OneDrive (the app also
  triggers `/api/vault/sync` after each drain so files land promptly).
- **Same security model**: TOTP or static-token login (404-as-denial
  semantics preserved), token in encrypted storage, optional biometric
  lock, no anonymous surface. GATE-sensitive actions (deletes, Jira writes)
  are online-only and always confirmed - never queued, never optimistic.
- **Native capabilities**: share any text into the inbox from the Android
  share sheet, photograph receipts into `/api/finance/receipt`, native
  dial/WhatsApp/mail actions from Circle, haptics, system notifications
  for high-severity alerts after sync.

## Design

Ported 1:1 from `dashboard/style.css` - the GitHub-dark green system:
`#0d1117` ground, `#161b22` panels with 1px `#30363d` borders, green
`#3fb950` as the only brand accent, Inter for UI, JetBrains Mono for
IDs/hashes/timestamps. Empty states teach. No em-dashes anywhere.

## Build & release flow (automated)

- CI (`.github/workflows/apk-build.yml`) runs on every push to `apk` and
  on manual dispatch: bumps the patch version, regenerates icons, analyzes,
  tests, builds a signed APK named `YYYYMMDD_isconl_vX.Y.Z.apk`, and
  publishes it as GitHub Release `apk-vX.Y.Z`.
- **Update on cue**: in the app, Settings -> Check for update pulls the
  latest `apk-v*` release (needs a fine-grained PAT with contents:read,
  stored in Settings) and hands the APK to the Android installer.
- **Main-branch trigger (staged)**: when ARCHITECT cues the main push, copy
  `docs/main-trigger/trigger-apk-build.yml` into `.github/workflows/` on
  main - from then on every main push also cuts an APK build.
- One-time setup: `powershell -File tool/setup_ci_secrets.ps1` uploads the
  signing keystore to GitHub secrets (same key as local builds, so
  in-place upgrades keep working). Keystore lives at
  `C:\Users\PC\dev\keys\` - never in git.

## Custom branding

- Launcher icon: drop a square PNG at `branding/icon.png` and the next
  build adopts it (`tool/icon_gen.js` falls back to the favicon design).
- In-app logo: Settings -> Appearance -> Choose logo (runtime, no rebuild).

## Local development

```
flutter pub get
flutter analyze && flutter test
flutter build apk --release      # signing via android/key.properties
node tool/icon_gen.js            # regenerate launcher icons
```

Toolchain on this workstation: Flutter at `C:\Users\PC\dev\flutter`,
JDK 17 at `C:\Users\PC\dev\jdk17`, Android SDK at
`C:\Users\PC\dev\android-sdk`.
