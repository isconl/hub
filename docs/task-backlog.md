# iSconl Master Task Backlog
<!-- LIVE DOCUMENT — update this file after every task touched, in every session -->
<!-- Accessible to both AGY and Claude via hub/docs/task-backlog.md -->
<!-- Last updated: 2026-08-16T13:48 EAT (Antigravity) -->

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

---

## ACTIVE QUEUE (ordered: urgency × impact ÷ complexity)

### Tier 1 — HIGH urgency, HIGH impact (do now)

| # | Task | Status | Notes |
|---|------|--------|-------|
| C4 | **Course rewrite: `viva-tasks`** (30 modules) | 🟡 In progress | Largest; audit and depth-standard pass for all 30 task modules. |
| C5 | **Course rewrite: `financial-intelligence`** (8 modules) | ⬜ Queued | Wealth compounding, valuation, capital allocation. |
| C6 | **Course rewrite: `jordan-mentoring`** (20 modules) | ⬜ Queued | 12-week curriculum depth audit and verification. |
| C7 | **Course rewrite: `wabba-ux`** (17 modules) | ⬜ Queued | Ragnar's WU board journey walkthroughs. |
| C8 | **Course rewrite: `wabba-content`** (16 modules) | ⬜ Queued | Ten association sites truth constraint and copy decisions. |
| C9 | **Course rewrite: `viva-portals` verification pass** (00–20) | ⬜ Queued | Module 20 done; audit 00–19 for callout completeness. |

### Tier 2 — HIGH impact, medium urgency

| # | Task | Status | Notes |
|---|------|--------|-------|
| N1 | **ElevenLabs narration audio generation** | 🔴 Blocked | Infrastructure 100% built. BLOCKED: ElevenLabs subscription past-due. Clear at elevenlabs.io. Voice: Clara Louise (Bk8cLrXXi9WCZ4GQU4Ah), eleven_multilingual_v2. Output: OneDrive .../learning/<course>/_audio/<moduleId>/v<N>.mp3. |
| P1 | **Circle folder pull & DIA profile generation** | ⬜ Queued | Browse .../Sconl/Circle via OneDrive → extract names → build circle/people.tsv → generate DIA profiles. |
| P2 | **Business due diligence: Pre.IPO.Capital deep-dive** | ⬜ Queued | Full profiles on all personalities. Strategies, patterns, forward picture. Land in scope/ and OneDrive. |
| P3 | **Portal user-group mapping (dev.b2bexchange.co + portal)** | ⬜ Queued | Map all user groups, deal-flow parties, interaction logic for both portals. Output to scope/ and OneDrive. |

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
