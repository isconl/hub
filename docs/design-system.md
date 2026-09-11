# iSconl Design System & UI Architecture Standard

Version: `5.3.0`  
Last Updated: `2026-09-11`  
Scope: `hub/web`, `circle`, `vault`, `spark`, **`app` (Flutter mobile)**

**Scope correction, 2026-09-06:** `app` (the Flutter mobile client) was
missing from this list even though every rule below already governs it in
practice — the omission is exactly what let a real violation ship
unnoticed (see §2's hardened rule). Any surface that renders UI for
Sconl is in scope, full stop, whether or not this header happened to
name it yet.

**Sync note, 2026-09-11:** this file is a near-duplicate of
`_next/design-system.md`'s §2 (the canonical, more actively edited copy)
— kept in sync here per `BG26091017`, which found this copy had drifted
~3 weeks behind (missing the 2026-09-06 hardened rule entirely). Edit
both when §2 changes; don't let one drift again.

---


## 1. Core Visual Philosophy

1. **Sovereign & Purpose-Built**: Every pixel and interaction serves executive velocity. No decorative fluff, no generic dashboard cliché patterns.
2. **Data-Agnostic Engine**: All personal, client, and tenant data rehydrates dynamically from OneDrive and vault storage. Zero hardcoded personal data in repository source code.
3. **Monochrome Geometric Precision**: A unified, razor-sharp monochrome aesthetic accented by contextual group hues.

---

## 2. Universal Monochrome SVG Icon Standard

All interactive controls, buttons, cards, badges, and headers must use the centralized monochrome SVG icon kit (`SVG_ICONS` / `svgIcon()`). **Raw emojis (e.g. 📁, ⚙, 💬, 📚) in operational UI chrome are strictly prohibited.**

**Hardened, 2026-09-11 (`BG26091017`) — no per-feature exceptions, ever:** no client may ever render a raw `icon` (or any emoji-shaped) field from ANY data source — a habit, a task, a Kanban column, a track, a contact, or any future field shaped the same way — directly as UI. Full stop. This is not a case-by-case judgment call; it generalizes the 2026-09-06 hardened rule below (which closed this class of bug for Learning tracks specifically) to every present and future feature, because that incident already proved a narrowly-scoped fix doesn't stay contained — the exact same pattern (`h.icon ? h.icon : ...`, a raw emoji/color literal bound straight into UI) turned up independently in Rhythm/habits (web and mobile) and web Kanban within days of the Learning-tracks fix landing. For any user-configurable item with no fixed finite semantic category (a habit, a Kanban column), the two compliant options are: (a) a curated picker of monochrome icons from the client's own local icon set (`SVG_ICONS`/`IconData`), never free-text emoji entry, or (b) one fixed neutral glyph for every item of that type, dropping per-item icon choice entirely. A raw data field is never an acceptable silent fallback either way — see the "Hardened rule, 2026-09-06" section immediately below for the full mechanics (why, the color-only exception, and the per-client mapping requirement) this statement generalizes.

### Geometric Specifications
- **ViewBox**: `0 0 24 24`
- **Fill**: `none`
- **Stroke**: `currentColor` (inherits text or accent color)
- **Stroke Width**: `1.75` (clean, modern line weight)
- **Linecap / Linejoin**: `round`

### Icon Registry (`SVG_ICONS`)

| Icon Name | Category | Primary Use Cases |
| :--- | :--- | :--- |
| `search` | Navigation / Filters | Global search, contacts search, file filtering |
| `plus` | Actions | Add contact, new task, create track, new idea |
| `edit` | Actions | Edit contact, edit course settings, rename file |
| `trash` | Actions | Delete record, discard draft, archive item |
| `import` | Data Exchange | Google Contacts import, CRM CSV upload |
| `export` | Data Exchange | CSV export, dossier export |
| `refresh` | Sync / State | Reload data, re-run sync loop, refresh board |
| `user` | Entity | Single person, personal dossier |
| `users` | Entity | Team, group, mentoring roster, contact list |
| `phone` | Communication | Phone number, call touch |
| `mail` | Communication | Email address, newsletter, inbox |
| `message` | Communication | Log interaction, WhatsApp touch, chat rail |
| `book` | Knowledge | Course, documentation, reading library |
| `folder` | Storage | OneDrive dossier folder, file manager directory |
| `file` | Storage | Markdown module, DIA profile, document |
| `tag` | Metadata | Skill badge, contact group tag, task category |
| `settings` | System | Configuration modal, track settings, credentials |
| `zap` | Intelligence | DIA dossier badge, spark synthesis, quick action |
| `check` | Feedback | Success toast, completed task, saved notes |
| `x` | Feedback / Dismiss | Close modal, dismiss error toast, clear query |
| `copy` | Utility | Copy error log, copy code snippet, copy link |
| `briefcase` | Workspace | Corporate engagement, professional ring, company |
| `shield` | Security / Status | Evergreen status, audit chain verification |
| `external` | Navigation | Open folder in Files, open OneDrive web link |
| `chevronDown` | Navigation | Expand section, dropdown trigger, accordion open |
| `chevronRight` | Navigation | Collapsed section, breadcrumb separator |
| `arrowRight` | Navigation | Explore track, continue reading, next step |
| `arrowLeft` | Navigation | Back to previous view, return to list |
| `clock` | Time / Rhythm | Period-specific status, cadence, history timeline |
| `calendar` | Time / Rhythm | Event date, scheduler, touch due date |
| `alert` | Feedback | Outdated badge, caution callout, validation error |
| `info` | Feedback | Help tooltip, jargon callout, computed status |
| `layers` | Structure | Platform & systems track, multi-plane layout |
| `grid` | Layout | Card grid view toggle |
| `list` | Layout | Table/list view toggle |
| `eye` | Media | Photo preview, preview drawer |
| `audio` | Media | Voice narration player, TTS playback |

### JavaScript Usage Pattern
```javascript
// Render inline SVG icon with customizable size and CSS class
const buttonHtml = `<button class="btn btn-primary">${svgIcon('plus', 13)} Add Contact</button>`;
```

### Hardened rule, 2026-09-06 — never render a raw icon value from shared API data

**Incident this rule closes:** `/api/learning`'s `groups[].icon` field carries
a raw emoji string (`'📚'`, `'⚠️'`, etc.) as a convenience default. The
webconsole never renders it — `renderLearnGroupCard()`/`renderLearnCourseCard()`
resolve every track to a monochrome icon via `learnGroupIcon(g, size)`
(`hub/web/static/app.js:17011-17021`, a fixed `g.id → svgIcon(name)` switch)
and never touch `g.icon` at all. The mobile app (`app/lib/ui/views/learning.dart`)
had no equivalent mapping and rendered `group.icon` directly as `Text` —
full-color platform emoji glyphs, on every track tile, discovered by Sconl
and reported as "why do we have multicolored icons in the tracks in the
app." The rule was never violated *in code that existed when v5.1.0 was
written* — it broke because a new client (mobile) consumed a shared payload
field the rule didn't yet explicitly cover, and nothing caught it until a
human looked at the screen. That is the gap this hardening closes.

**Standing rule, applies to every current and future client (web, mobile,
any future surface) consuming shared backend/API data:**

1. **A raw icon value from an API payload — an emoji string, a font-icon
   class name, a color hex, anything not already a resolved reference into
   that client's own local monochrome icon set — is data, never a
   renderable UI element.** Never bind it directly into `Text`/innerHTML/a
   glyph widget. Treat it exactly like an untrusted string: something to
   look up, not something to display.
2. **Every client resolves shared identifiers (e.g. a track's `group.id`)
   through its OWN local icon mapping**, matching the *semantic category*
   (briefcase/tag/shield/layers/zap/grid/users/settings/folder, per the
   Icon Registry above) — not by copying the API's literal `icon` field.
   The web's `learnGroupIcon()` switch is the canonical mapping; any new
   client (the mobile app now, anything future) ports the same `id →
   category` associations into its own icon system (SVG kit web-side,
   `IconData` switch Flutter-side, etc.) rather than trusting the payload.
   Where a client's local mapping and the web's mapping drift out of sync,
   that is a design-system violation to fix, same severity as a raw emoji
   leaking through.
3. **Color-only exception:** a genuine per-group *accent hue* (`group.color`,
   used for a progress-bar fill or a thin border accent) is fine to consume
   directly from the API — hue-as-accent is explicitly allowed by this
   document's Core Visual Philosophy (#3, "monochrome... accented by
   contextual group hues"). The exception is narrow: **the icon GLYPH
   itself stays monochrome always; only a secondary accent element (bar
   fill, border stripe, dot) may carry the group's hue.** Tinting the icon
   glyph itself with `group.color` is the same violation as rendering a
   raw multicolor emoji — don't reach for it as a "compliant-looking"
   workaround.
4. **A new engine/API author does not need to stop sending a convenience
   `icon` field for non-Claude tooling or debugging** — the fix lives on
   the *consuming* side (map, don't trust), not by stripping the field from
   the API. If a field is later confirmed to have zero remaining
   consumers reading it directly (check every client, not just the one
   just fixed), it can be dropped as a separate cleanup — don't couple that
   decision to this rule's enforcement.
5. **A design-system audit that only diffs git commits (like `BN26090601`'s
   UI-parity pass) will not catch this class of bug** — a payload field
   existed unchanged the whole time; what changed was a new client reading
   it naively. Any future parity/consistency audit across clients should
   explicitly grep for direct rendering of known "convenience" API fields
   (`icon`, and any future field shaped the same way) in every client, not
   just diff what code changed since the last audit.

---

## 3. Universal Minimal Scrollbar Architecture

To maintain a sleek editorial interface, custom minimal scrollbars are applied universally across all HTML elements:

```css
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(125, 133, 144, 0.28) transparent;
}
*::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: rgba(125, 133, 144, 0.25);
  border-radius: 10px;
  transition: background 0.15s ease;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(125, 133, 144, 0.48);
}
```

### Layout Preference: Viewport-Fitted, No-Scroll Structure
- Outer page layouts, headers, and toolbars have `overflow: hidden`.
- Scrolling is strictly isolated to internal overflow lists (e.g. `.contacts-list`, `.chat-rail-messages`) rather than scrolling the entire page body.

---

## 4. Alert & Toast Viewport Positioning

All floating feedback elements are anchored directly to the true bottom-right corner of the viewport:
- **Position**: `right: 1rem; bottom: 2rem;`
- **Z-Index Hierarchy**:
  - Toast Container: `z-index: 99999;` (topmost)
  - Vault Link Banner: `z-index: 99998;`
- **Behavior**:
  - Info / Success toasts auto-vanish after 3.5s.
  - Error toasts persist until manually dismissed, offering a one-click `Copy Error` button.

---

## 5. Circle & Contacts CRM Specification

1. **Roster Split-View**:
   - 290px Left List + Fluid Right Dossier.
   - Filter chips: `All`, `Professional`, `Family`, `Social`, `Due Now`, `DIA Dossier`.
2. **Dossier Folder Mapping**:
   - Standard path: `Sconl/Circle/{Ring}/{Name}/`
   - One-click `${svgIcon('folder', 13)} Open Folder` opens File Manager directly to that exact directory.
3. **Profile Images**:
   - Supports avatar photos stored on OneDrive or via image URL.
   - Fallback to color-ringed initials avatar.
4. **Touch & Cadence Tracking**:
   - Tracks `CADENCE_DAYS`, calculates real-time `dueIn` days, and records multi-channel interaction history.

---

## 6. Bundled Portable TTS Engine (Chatterbox)

1. **Zero-Cost Sovereign Narration**:
   - Runs locally on `http://127.0.0.1:5001/v1/audio/speech` (OpenAI-compatible).
   - Bundled with the fleet via [`vault/scripts/tts_service.py`](file:///home/sconl/_/engineer-systems/Systems/iSconl/vault/scripts/tts_service.py).
2. **Deterministic Female Voice Profile**:
   - Reference voice: `narrator_female.wav` (Clara Louise style).
   - Deterministic parameters: `seed: 482193, temperature: 0.75, exaggeration: 0.5`.
3. **Sentence Chunking & FFmpeg Assembly**:
   - Automatically chunks long scripts into 350–700 character sentence boundaries and stitches into 128kbps MP3s.

---

## 7. Hub Command View Layout (v5.1)

The Hub uses a two-column CSS grid layout. **Do not revert to the old stacked layout** — Jira and Equicycle are intentionally absent from the hub.

### Column Structure
```css
.command-hero-grid {
  display: grid;
  grid-template-columns: 1fr 260px;   /* left content, right rail */
  gap: 1rem;
  align-items: start;
}
.command-right.hub-right-rail {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  position: sticky;
  top: 1rem;                          /* sticks as you scroll the left column */
}
```

### Right Rail Panels
- `.hub-cal-panel` — wraps `renderMiniCalendar()`. Overrides: `padding: 0.6rem`, smaller cell fonts.
- `.hub-events-panel` — upcoming events card (up to 5 events from `STATE.calendarEvents`).
- `.hub-event-item` — individual event row with bottom border separator.

### Left Column Panels
- `.hub-panels-row` — the `.cards-grid` (2-col) holding tasks + inbox side by side.
- `.hub-panel-card` — flexbox column, `min-height: 220px`; `.inline-form` pushed to bottom via `margin-top: auto`.

### Intelligent Top-3 Task Engine (`scoreTask()`)
Defined inside `renderToday()`. Scores every open top-level task:
| Signal | Points |
|--------|--------|
| Status: `today` | +60 |
| Status: `in-progress` | +40 |
| Status: `todo` | +10 |
| Priority: `critical` | +50 |
| Priority: `high` | +30 |
| Priority: `medium` | +10 |
| Overdue (each day past due) | +45 + 3×days |
| Due today | +35 |
| Due ≤ 2 days | +20 |
| Due ≤ 7 days | +10 |
| Jira-linked | +8 |

### My Day Section: Borderless / Floating
`renderDayBlocks()` wraps its content in `<div class="day-card">` — NOT `.card.day-card`.
```css
.day-card {
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
}
.day-card .card-header { padding-left: 0; padding-right: 0; }
```
The rail strip, progress bar, day-blocks-window, overflow/unplaced sections — all unchanged.
The title "My Day" floats inline, reading as a content header rather than a card.

### Responsive Collapse (≤ 780px)
```css
.command-hero-grid { grid-template-columns: 1fr; }
```
Right rail stacks below left column on smaller viewports.

