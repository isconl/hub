# iSconl Master Task Backlog
<!-- LIVE DOCUMENT — update this file after every task touched, in every session -->
<!-- Accessible to both AGY and Claude via hub/docs/task-backlog.md -->
<!-- Last updated: 2026-08-17T02:27 EAT (Antigravity) -->

---

## Legend
| Symbol | Meaning |
|--------|---------|
| 🔴 | Blocked — cannot proceed without external action |
| 🟡 | In progress |
| 🟢 | Done this session |
| ⬜ | Queued |
| 🔵 | Suggested / not yet committed to |

---

## DONE THIS SESSION (2026-08-17)

| # | Task | Commit / Location |
|---|------|-------------------|
| ✅ | **Hub command view: complete layout redesign** | `hub: 96c576d` — Right rail = mini-calendar (compact/square) + upcoming events. Left = morning brief + stat tiles + intelligent top-3 tasks + 5-item inbox. Removed Jira live-feed and Equicycle cards from hub. |
| ✅ | **Intelligent top-3 task engine (`scoreTask()`)** | `hub: app.js` — Multi-signal urgency scoring: status (today/in-progress/todo), priority (critical/high/medium), due-date proximity (overdue days amplified), Jira linkage. Hub always surfaces highest-leverage 3 tasks. |
| ✅ | **My Day section: borderless floating layout** | `hub: app.js + style.css` — Removed `card` class from day-card wrapper. `.day-card` now has `background:transparent; border:none; box-shadow:none` — floats inline in hub without a box. Layout/rail/blocks unchanged. |
| ✅ | **Contacts CRM right-plane integration** | `hub: app.js` — Contact dossiers open in the right rail `#reader-dock`. Added `navigate('contacts')` hook with `fetchCircle()` auto-refresh. Fixed duplicate renderContactDetail syntax error. |
| ✅ | **Duplicate old renderToday body cleaned up** | `hub: app.js` — Orphaned old layout body (Equicycle, Jira, 4-item inbox) removed. Syntax clean: `node -c` passing. |

---

## DONE IN PRIOR SESSIONS (2026-08-16)

| # | Task | Commit / Location |
|---|------|-------------------|
| ✅ | **GitHub CI: secrets-scan failing across all repos** | `hub: aed4e31`, `scope: d1ffde4`. All 6 repos CI GREEN. |
| ✅ | **Branch lockstep: dev/main/staging synced** | All 6 repos aligned and pushed to remote. |
| ✅ | **Grand campus audit: all 11 courses (123/123 modules)** | All upgraded to full depth standard (Book, Research, Fun fact, Jargon, Watch for, Objectives). |
| ✅ | **Bundled portable Chatterbox TTS engine** | `vault/scripts/tts_service.py`, `vault/lib/narration.js`, `hub/scripts/dev-local.sh`. Runs at http://127.0.0.1:5001. Female narrator voice, seed 482193. ElevenLabs fallback retained. |
| ✅ | **Unified monochrome SVG icon standard** | 38+ icons in SVG_ICONS/svgIcon() in app.js. Documented in hub/docs/design-system.md + vault/memory + _handoff. |
| ✅ | **Custom scrollbars across whole UI** | Elegant minimal scrollbars in style.css. |
| ✅ | **Alert/toast positioning: right 1rem, bottom 2rem** | style.css .vault-banner and toast stack repositioned. |
| ✅ | **Contacts CRM space: full build** | KPI strip, card grid, dense table view, right-plane dossier, photo upload, OneDrive folder mapping, one-click open in file manager. |
| ✅ | **Circle folder pull & DIA profile generation** | 46 contacts mapped, SDIAIF v2.1 profiles in circle/memory/circle/dia/ & OneDrive. |
| ✅ | **Lesson reader typography upgrade** | hub: style.css — font-size 1.08rem, line-height 1.82. |
| ✅ | **Meeting 08: Sunday 16 August Sam Strategic Alignment codified** | viva-meetings/20260816_campus_viva_meetings_08_*.md — full depth standard. |
| ✅ | **Pre.IPO.Capital deep-dive due diligence** | vault/memory/scope/due_diligence_pre_ipo_capital.md |
| ✅ | **Webconsole: natural unboxed reader experience** | hub: dab2a8a |
| ✅ | **Fleet resilience: Bitwarden credentials auto-bootstrap** | hub/scripts/dev-local.sh |
| ✅ | **Learning Engine: track classification & module metadata** | spark: 007c2a3, hub: 1ed8dc0 |
| ✅ | **Campus Advice elevation** | hub: app.js — advice block prominent above track cards |

---

## ACTIVE QUEUE (ordered: urgency × impact ÷ complexity)

### Tier 1 — HIGH urgency, HIGH impact (do next)

| # | Task | Status | Notes |
|---|------|--------|-------|
| C1 | **Chat Archive Ingestion & Intelligence Extraction** | 🟡 Active | Unpack WhatsApp Chat zips from ~/Downloads (Alex Rivera Viva, Jordan, Operator (Viva), Sam Whitfield). Extract timelines, enrich DIA profiles, log to circle/touches.tsv, upload archives to OneDrive Sconl/Circle/.../chat-archives/. |
| C2 | **Codify Sam Strategic Meeting Notes (16 Aug)** | 🟡 Active | Cross-engine synthesis across viva-meetings, task register, decisions, and OneDrive scope dossiers. |
| P3 | **Portal user-group mapping (dev.b2bexchange.co + portal)** | ⬜ Queued | Map user groups, deal-flow parties, interaction logic. Output to scope/ and OneDrive. |

### Tier 2 — HIGH impact, medium urgency

| # | Task | Status | Notes |
|---|------|--------|-------|
| N1 | **ElevenLabs narration audio generation** | 🔴 Blocked | BLOCKED: ElevenLabs subscription past-due. Clear at elevenlabs.io. Voice: Clara Louise (Bk8cLrXXi9WCZ4GQU4Ah), eleven_multilingual_v2. Chatterbox TTS is active fallback (local, portable, female narrator). |
| B1 | **Self-improving background insight engine** | 🔴 Blocked | MS365 MCP connector connected at claude.ai but not yet visible to routines. Re-check /schedule connector list — may have propagated. Plan: daily cron reads campus.tsv/theme_days.tsv/plans.tsv, writes improved curated rows. |

### Tier 3 — Medium impact, lower urgency

| # | Task | Status | Notes |
|---|------|--------|-------|
| D1 | **Deliverables engine** | ⬜ Queued | scope/deliverable_roots.tsv, Graph-resolved paths, naming-convention parser. Design: OneDrive paths via vault Graph client, not hardcoded. |
| D2 | **Corporate engagement dashboards** | ⬜ Queued | Cards per engagement: days worked, people, master disable toggle. |
| G1 | **GitHub integration: replace legacy routing** | ⬜ Queued | Replace legacy:true on /api/github/snapshot with native engine routing. |
| J1 | **Jira Cloud integration** | ⬜ Queued | Full OAuth/token flow. Needs own scoping pass. |
| BF | **Buffer engine (Social scheduling)** | ⬜ Queued | New engine-level capability, not started. |

### Tier 4 — UI polish

| # | Task | Status | Notes |
|---|------|--------|-------|
| U1 | **Rhythm SVG icons & Settings branding section** | ⬜ Queued | Replace 📌 emoji with monochrome SVG. Add Branding section to Settings. |
| U2 | **Error toast copy + manual dismiss** | ⬜ Queued | showToast() type 'error' should get copy button + manual dismiss instead of 3.5s auto-vanish. |
| U3 | **Task view depth & Jira review** | ⬜ Queued | Task-detail view is "shallow" vs legacy — briefs, explanations, deliverables link. |
| U4 | **Inbox: bulk select + bulk actions** | ⬜ Queued | Bulk mark-as-seen + bulk delete. |
| U5 | **Teams (Channels space)** | ⬜ Queued | Each team as clickable card → team dashboard. Check legacy renderTeams. |
| U6 | **Vault-link banner live re-verify** | ⬜ Queued | Re-verify corner-card banner renders correctly against a REAL failure (not injected fake). |
| U7 | **Planning insight: curated background-engine database** | ⬜ Queued | scope/planning_insights.tsv once background engine is unblocked. |

---

## STANDING RULES (carry forward every session)

1. **After completing a task:** move it to DONE with a commit SHA or file reference.
2. **After receiving a new task:** add it to the right tier with priority context.
3. **Reorder tiers** after each session so Active Queue top always reflects current reality.
4. **Branch hygiene:** every code change committed on `dev`, fast-forwarded to `main` and `staging`, pushed to `origin`. All 6 repos (hub, vault, pulse, scope, circle, spark) stay in lockstep.
5. **Both AGY and Claude** must update this file at the start and end of each session.
6. **Zero client/tenant PII in git repos.** All personal data (circle/people.tsv, touches.tsv, dia/ profiles, OneDrive content) lives ONLY in OneDrive. Code repos are open-source & multi-tenant agnostic.
7. **Icon rule:** every icon in the UI comes from the unified SVG_ICONS / svgIcon() set. No emojis for UI chrome.
8. **Chatterbox TTS** is the primary local narration engine (http://127.0.0.1:5001). ElevenLabs is the cloud fallback when billing is clear.

---

## BRANCH STATUS (2026-08-17T02:27 EAT)

| Repo | Branches | Last commit | CI |
|------|----------|-------------|-----|
| hub | dev/main/staging | 96c576d | ✅ |
| vault | dev/main/staging | latest | ✅ |
| pulse | dev/main/staging | latest | ✅ |
| scope | dev/main/staging | latest | ✅ |
| circle | dev/main/staging | latest | ✅ |
| spark | dev/main/staging | latest | ✅ |
