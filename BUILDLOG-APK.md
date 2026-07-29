# BUILDLOG - apk branch

Continuity organ for the native client, mirroring the root BUILDLOG
convention. Newest entries on top. Status words: DONE / PARTIAL / BLOCKED.

---

## 2026-07-29 · Session 1 - the whole client, from zero

**DONE - toolchain.** Workstation had no Flutter/Dart/Java/Android SDK.
Installed: Flutter 3.44.8 stable (`C:\Users\PC\dev\flutter`), Temurin JDK
17.0.20 (`C:\Users\PC\dev\jdk17`), Android SDK platforms 35+36 +
build-tools 35/36 + platform-tools (`C:\Users\PC\dev\android-sdk`),
licenses accepted. `flutter doctor` green for Android.

**DONE - branch topology.** Orphan branch `apk` in a separate worktree at
`iSconl/_worktrees/isconl-agent-apk` (underscore folder = trifractal-exempt).
dev/staging/main untouched; ARCHITECT's dirty dev tree untouched.

**DONE - the app.** ~7k lines of Dart, zero third-party UI kits.
Architecture: `ApiClient` (Bearer auth, 404-as-denial heuristic, SSE
parser, 75s cold-start budget for Render wake) -> `Store` of `Snapshot`s
(SQLite-cached endpoint mirrors, hydrate-then-refresh) -> `OutboxService`
(FIFO queue of offline writes) -> `SyncEngine` (connectivity watcher, 90s
poll parity with the dashboard, drain -> `/api/vault/sync` nudge -> pull
all domains) -> `Mutations` (single policy point: online-direct /
offline-queue+optimistic / GATE-actions-online-only).

Views: Command, Tasks (+detail), Ask (SSE chat sheet), Alerts, Calendar
(+key dates), Inbox, Kanban, GitHub, Finance (+receipt camera), Journal,
Learning (+lesson reader), Circle (+DIA profiles, native contact actions),
Projects, Planning, Spaces, Decisions & Risks, Audit Chain (chain-of-dots
with linkage verification), Outbox, Settings, Login (TOTP countdown +
static token), biometric lock screen.

Design tokens ported 1:1 from `dashboard/style.css` into `lib/theme.dart`.
Fonts bundled (Inter 4.1, JetBrains Mono 2.304) for offline. Launcher icon
rasterized from the favicon design by `tool/icon_gen.js` (pure Node PNG
encoder; adopts `branding/icon.png` when present, incl. adaptive +
monochrome layers).

**DONE - native capabilities.** Share-sheet -> inbox capture (cold start +
warm via MethodChannel `isconl/platform`), camera/gallery receipts ->
`/api/finance/receipt`, tel/wa.me/mailto actions from Circle, biometric
lock (local_auth, FlutterFragmentActivity), system notifications for
fresh high-severity alerts after sync, haptics on primary actions.

**DONE - quality gates.** `flutter analyze`: No issues found.
`flutter test`: 11/11 green (TSV sentinel parsing, money/date formatting,
version compare, markdown renderer widget tests).

**DONE - automation.** `.github/workflows/apk-build.yml` on this branch:
push/dispatch -> bump patch (`tool/bump_version.js`) -> regen icons ->
analyze -> test -> signed release build -> commit bump `[skip ci]` ->
GitHub Release `apk-vX.Y.Z` with `YYYYMMDD_isconl_vX.Y.Z.apk`. In-app
updater (Settings) reads those releases with a fine-grained PAT and hands
the APK to the system installer (REQUEST_INSTALL_PACKAGES + FileProvider).

**PARTIAL - CI signing secrets.** The permission classifier in this
session declined uploading the keystore to GitHub secrets. One-time
manual step: `powershell -File tool/setup_ci_secrets.ps1` (keystore at
`C:\Users\PC\dev\keys\isconl-apk.keystore`, RSA-2048, 30y validity,
alias `isconl`). Until then the workflow fails loudly at the keystore
step - by design, releases must be signed with the same key.

**STAGED - main trigger.** `docs/main-trigger/trigger-apk-build.yml` is
ready to copy onto main when ARCHITECT cues the main push - uses
`gh workflow run` (workflow_dispatch is exempt from the GITHUB_TOKEN
no-retrigger rule, so no PAT needed).

**DECISION-NEEDED (non-blocking).**
1. Buffer/Social composer and the OneDrive file manager were left out of
   v0 - lower daily value on the phone vs. the risk budget. Say the word
   and they ship in a patch release.
2. "Native capabilities into the main agent": candidate server additions
   (device pings, push channel via Telegram relay, receipt OCR feedback
   loop) are listed in IDEAS-APK below rather than pushed to dev tonight -
   dev auto-deploys to Render and the tree carries uncommitted dashboard
   work.

## IDEAS-APK
- Server: `POST /api/device/state` (battery, connectivity, last-sync) so
  the agent can reason about the phone.
- Server: WhatsApp-style push via Telegram bot when RANK > threshold.
- App: workmanager background sync (15-min WorkManager job) once the
  foreground loop has proven itself for a week.
- App: voice capture -> inbox via speech-to-text intent.

## LESSONS
- `flutter build` mid-edit compiles broken intermediate states - always
  gate builds on `flutter analyze` first (CI does).
- PowerShell `"y" | sdkmanager.bat` does not reach stdin; pre-writing
  `licenses/*` hash files is the deterministic path.
- The theme class `T` collided with a generic `<T>` - generics in this
  codebase use `<R>`.
