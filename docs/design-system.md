# iSconl Design System & UI Architecture Standard

Version: `5.1.0`  
Last Updated: `2026-08-17`  
Scope: `hub/web`, `circle`, `vault`, `spark`

---


## 1. Core Visual Philosophy

1. **Sovereign & Purpose-Built**: Every pixel and interaction serves executive velocity. No decorative fluff, no generic dashboard cliché patterns.
2. **Data-Agnostic Engine**: All personal, client, and tenant data rehydrates dynamically from OneDrive and vault storage. Zero hardcoded personal data in repository source code.
3. **Monochrome Geometric Precision**: A unified, razor-sharp monochrome aesthetic accented by contextual group hues.

---

## 2. Universal Monochrome SVG Icon Standard

All interactive controls, buttons, cards, badges, and headers must use the centralized monochrome SVG icon kit (`SVG_ICONS` / `svgIcon()`). **Raw emojis (e.g. 📁, ⚙, 💬, 📚) in operational UI chrome are strictly prohibited.**

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

