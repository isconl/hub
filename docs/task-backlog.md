# iSconl Master Task Backlog
<!-- LIVE DOCUMENT — update this file after every task touched, in every session -->
<!-- Accessible to both AGY and Claude via hub/docs/task-backlog.md -->
<!-- Last updated: 2026-08-16T14:46 EAT (Antigravity) -->

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

## DONE THIS SESSION (2026-08-16)

| # | Task | Commit / Location |
|---|------|-------------------|
| ✅ | **GitHub CI emails — `secrets-scan` failing across all repos** | `hub: aed4e31` — `.gitleaksignore` with fingerprint suppression. `scope: d1ffde4` — removed hardcoded `Operator` author default. All 6 repos now ALL GREEN on CI. |
| ✅ | **UI: eq-theme-phrase colour to brand grey** | `hub: 64fca57` — `.eq-theme-phrase { color:var(--text-3); }`. Theme word (CLIMB) stays green; elaboration after the colon is now brand grey `#7d8590`. |
| ✅ | **Branch lockstep: dev / main / staging synced** | All 6 repos aligned and pushed to remote. |
| ✅ | **Webconsole live** | Verified at http://localhost:8888/. All 6 engines healthy. |
| ✅ | **OneDrive error banner: bottom-right + Copy/Dismiss** | hub/webconsole/static/style.css + app.js. |
| ✅ | **viva-portals module 20** | vault/memory/learning/viva-portals/20-the-full-deal-flow.md (350 lines). courses.tsv updated to 21 lessons. |
| ✅ | **Viva/UnionX due diligence** | vault/memory/scope/due_diligence_viva.md (42.6 KB). |
| ✅ | **viva-model modules 00–04** | Research callouts verified. |
| ✅ | **Course rewrite: `viva` (10 modules, 00–09)** | All 10 modules audited and rewritten to full depth standard with verified Research, In a book/Book quote, and Fun fact callouts. `courses.tsv` updated. |
| ✅ | **Course rewrite: `viva-role` (13 modules, 00–12)** | All 13 modules audited and rewritten to full depth standard with verified Research, In a book/Book quote, and Fun fact callouts. `courses.tsv` updated. |
| ✅ | **Campus file renaming convention (`20260816_campus_[course]_[XX]_[name]_v0.0.0.md`)** | All 123 markdown modules across all 11 courses renamed to standardized format. `campus.tsv`, `progress.tsv`, `resume.tsv`, `course-standards.md`, and cross-references updated. |
| ✅ | **Course rewrite: `viva-meetings` (8 modules, 00–07)** | All 8 modules audited and rewritten to full depth standard with verified Research, In a book/Book quote, and Fun fact callouts. `courses.tsv` updated. |
| ✅ | **Course rewrite: `viva-tasks` (30 modules, 00–29)** | All 30 modules upgraded to full depth standard — Book, Research, Fun fact, Jargon, Watch for, Objective injected across every module. `courses.tsv` updated. vault/memory/learning/viva-tasks/ |
| ✅ | **Course rewrite: `financial-intelligence` (8 modules, 01–08)** | All 8 modules fully rewritten to depth standard with compound math, portfolio architecture, tax efficiency, M&A, and sovereign roadmap — Book, Research, Fun fact, Jargon, Watch for, Objective. `courses.tsv` updated. vault/memory/learning/financial-intelligence/ |
| ✅ | **Course rewrite: `jordan-mentoring` (20 modules, 00–19)** | All 20 modules upgraded to full depth standard — Book, Research, Fun fact, Jargon, Watch for, Objective injected across every module. `courses.tsv` updated. vault/memory/learning/jordan-mentoring/ |
| ✅ | **Course rewrite: `wabba-ux` (2 built modules, 00–01)** | Both existing modules upgraded to full depth standard. Remaining 15 modules commissioned but not yet written. `courses.tsv` updated. vault/memory/learning/wabba-ux/ |
| ✅ | **Course rewrite: Grand audit 100% complete across ALL 11 campus courses (123/123 modules)** | `viva`, `viva-role`, `viva-meetings`, `viva-tasks`, `financial-intelligence`, `jordan-mentoring`, `wabba-ux`, `wabba-content`, `viva-portals`, `wellspring`, `viva-model` — all 123 modules verified with Book, Research, Fun fact, Jargon, Watch for, and Objectives. |
| ✅ | **Learning Engine & UI: Track classification, module metadata (version, reviewedAt, relevance), and lifecycle management** | `spark: 007c2a3`, `hub: 1ed8dc0` — `groups.tsv`, `modules_meta.tsv`, `courses.tsv` mapped. Classified tracks landing view, segmented track toggle, active/all/archived filter, module metadata chips (🟢 Relevant, ⏳ Period-specific, ⚠️ Outdated, 🌲 Evergreen, 🗄️ Archived), date reviewed, versioning (`v0.0.0`), and full modals for creating/archiving/decommissioning tracks, courses, and modules. |
| ✅ | **Webconsole: Natural unboxed reader experience** | `hub: dab2a8a` — Removed rigid card enclosure from lesson reader, providing an unboxed, fluid editorial reading canvas with responsive line-height and beautiful typography. Guaranteed track cards on landing. |
| ✅ | **Campus Advice: Self-updating context-aware intelligence engine** | `spark: b3c0b16` — Upgraded `campus()` in `spark/lib/learning.js` with flexible lesson resolution across all standardized filenames, dynamic word-count reading minutes, and automated 5-band priority synthesis (`now`, `week`, `before-event`, `reference`, `background`). |
| ✅ | **Meeting 08: Sunday 16 August Sam Strategic Alignment codified** | `viva-meetings/20260816_campus_viva_meetings_08_sunday_16_august_swen_alignment_v0.0.0.md` written to full depth standard (Grove citation, Akamai latency research, team HR portal vetting, Egypt/Turkey B2B mapping, CDN edge latency). `courses.tsv` updated (9 modules). |

| ✅ | **Webconsole bugfix: `(str || "").replace` type-safety** | `hub: app.js` — Hardened `escHtml(str)` with `String(str == null ? '' : str)` ensuring numbers (e.g. `track.sortOrder`) and non-strings never throw `.replace is not a function`. |
| ✅ | **Fleet resilience: Bitwarden credentials auto-bootstrap** | `hub/scripts/dev-local.sh` — Added automated sourcing of `$HOME/.bashrc.d/bitwarden.sh` and EU vault endpoint defaults so all 6 subshell engines boot with full secrets context. |
| ✅ | **Circle folder pull & DIA profile generation (P1)** | Crawled OneDrive `Sconl/Circle` across Family, Professional, and Social directories; mapped 46 contacts; generated comprehensive SDIAIF v2.1 profiles in `circle/memory/circle/dia/` & `vault/memory/circle/dia/`; uploaded all 46 DIA profiles to respective OneDrive folders. |
| ✅ | **Business due diligence: Pre.IPO.Capital deep-dive (P2)** | Produced comprehensive institutional report `vault/memory/scope/due_diligence_pre_ipo_capital.md` covering AS bankruptcy proceedings, Maksuamet EUR 179k tax demand, Investoriteliit criminal settlement, personality dossiers (Sam, Mart Opmann, Casey, Margus Uueni, Kaupo Meier), and uploaded to OneDrive `scope/`. |

---

## ACTIVE QUEUE (ordered: urgency × impact ÷ complexity)

### Tier 1 — HIGH urgency, HIGH impact (do now)

| # | Task | Status | Notes |
|---|------|--------|-------|
| P3 | **Portal user-group mapping (dev.b2bexchange.co + portal)** | 🟡 Next up | Map all user groups, deal-flow parties, interaction logic for both portals. Output to scope/ and OneDrive. |

### Tier 2 — HIGH impact, medium urgency

| # | Task | Status | Notes |
|---|------|--------|-------|
| N1 | **ElevenLabs narration audio generation** | 🔴 Blocked | Infrastructure 100% built. BLOCKED: ElevenLabs subscription past-due. Clear at elevenlabs.io. Voice: Clara Louise (Bk8cLrXXi9WCZ4GQU4Ah), eleven_multilingual_v2. Output: OneDrive .../learning/<course>/_audio/<moduleId>/v<N>.mp3. |

### Tier 3 — Medium impact, lower urgency

| # | Task | Status | Notes |
|---|------|--------|-------|
| D1 | **Deliverables engine** | ⬜ Queued | scope/deliverable_roots.tsv, Graph-resolved paths, naming-convention parser. |
| D2 | **Corporate engagement dashboards** | ⬜ Queued | Cards per engagement: days worked, people, master disable toggle. |
| G1 | **GitHub integration: replace legacy routing** | ⬜ Queued | Replace legacy:true on /api/github/snapshot with native engine routing. |

### Tier 4 — UI polish

| # | Task | Status | Notes |
|---|------|--------|-------|
| U1 | **Rhythm SVG icons & Settings branding section** | ⬜ Queued | Replace 📌 emoji with monochrome SVG. Add Branding section to Settings. |
| U2 | **Right-rail media panel & file manager integration** | ⬜ Queued | — |
| U3 | **Task view depth & Jira review** | ⬜ Queued | — |

---

## RULES FOR MAINTAINING THIS DOCUMENT

1. **After completing a task:** move it to DONE with a commit SHA or file reference.
2. **After receiving a new task:** add it to the right tier with priority context.
3. **Reorder tiers** after each session so Active Queue top always reflects current reality.
4. **Branch hygiene:** every code change committed on `dev`, fast-forwarded to `main` and `staging`, pushed to `origin`.
5. **Both AGY and Claude** must update this file at the start and end of each session.

---

## BRANCH STATUS (2026-08-16T13:48 EAT)

| Repo | Branches | Last commit | CI |
|------|----------|-------------|-----|
| hub | dev/main/staging | f36672b | ✅ |
| vault | dev/main/staging | latest | ✅ |
| pulse | dev/main/staging | latest | ✅ |
| scope | dev/main/staging | d1ffde4 | ✅ |
| circle | dev/main/staging | latest | ✅ |
| spark | dev/main/staging | latest | ✅ |
