# Corporate Engagements — Plan

Status: **partially built — read-only half live, write paths and Gmail
still open.** Written to survive across Claude sessions and machines —
lives in the `hub` repo (git-backed, pulled fresh on any machine) rather
than any one session's memory. Cross-references:
[[isconl-fleet-layout]] for repo layout, and
`D:\work\dev\iSconl\scope\docs\document-generation-canon.md` +
`document-generation-build-plan.md` for the document-generation system
this plan's toggle also governs.

**Revised 20 Aug 2026 (build-state check, `FC26081807`):** confirmed
built — `scope/lib/corporate.js` (§6.1/Phase 1); `GET /api/corporate` +
`GET /api/corporate/detail` (§6.3/Phase 3, **read-only half only** — the
`POST /api/corporate/status` and `POST /api/corporate/connect` write
routes are NOT built); both UI implementations, web
(`renderCorporate`/`renderCorporateDetail`, `hub/web/static/
app.js:5309,5346`) and Flutter (`hub/app/lib/ui/views/corporate.dart`).
Confirmed **not** built — `vault/lib/google.js` (§4/Phase 2, Gmail
OAuth), any `connections.yaml` file anywhere (§1's schema addition), and
the Phase 5 write paths/cascade wiring. See `PC26081816` (backlog
`plan.md`) for the newer org-discovery decision this doc's §1 predates —
cross-referenced there.

**Revised 14 Aug 2026**: §6 replaces an earlier, more speculative build
sketch after finding this needs far less new infrastructure than first
assumed — `circle/lib/career.js` and `scope/lib/decisions.js` already do
most of the data-layer work. Read §6.0 first.

---

## 0. What triggered this

Building the document-archetype naming convention surfaced that it's
Viva-specific and must be toggle-able — Viva Valentia is explicitly "one
instance of Operator's career, not its top level"
([[viva-is-one-org-instance-not-the-whole-career]]): more engagements are
expected, and turning Viva off must cascade everywhere Viva-specific
behavior lives, not just in one config file. Rather than bolt a toggle onto
one feature at a time, this plan builds the generic **Corporate Engagement**
concept once, with Viva Valentia as its first real instance, and a
dashboard in `hub` to see and control it.

---

## 1. The data model already exists — reuse it, don't reinvent it

`legacy/memory/career/` already implements almost exactly what was asked
for, built 27-29 Jul 2026, well before this session:

```
career/_active.yaml            <- active_org pointer + registry of all engagements
career/doctrine/                <- org-neutral base (principles, playbooks)
career/orgs/_template/          <- copy this to onboard a new engagement
career/orgs/viva-valentia/      <- org.yaml, doctrine.yaml, decision_log.yaml,
                                    playbooks.yaml, power_map.yaml, risk_register.yaml
```

`_active.yaml`'s own header comment states the doctrine plainly: "Nothing
outside this file should hard-code an organization name... adding one is a
copy of `career/orgs/_template/`." This IS the "corporate engagement
template" the request asks for — it already exists as a **data** template.
What's missing is (a) a UI over it, (b) live stats pulled from the other
engines rather than static YAML, (c) a real cascade when an engagement
toggles off, and (d) wiring it as the parameter other systems (like
document naming) key off of. This plan builds those four, not a new data
layer.

**One addition to the schema**, `_template/connections.yaml` (new file,
mirrors the existing per-org file pattern):

```yaml
# Per-engagement external service connections. Never store secrets here --
# only WHICH connection is wired and its status; the credential itself lives
# in Bitwarden Secrets Manager (see [[isconl-fleet-layout]] for the existing
# BWS_ACCESS_TOKEN / EU-region pattern already used for MSGraph).
gmail:
  connected: false
  account: null              # must equal the org's identity.work_email once connected
  scopes: []
  connected_at: null
microsoft_365:
  connected: false           # tracks the MSGraph wiring vault/lib/graph.js already has,
                              # scoped per-engagement instead of assumed global
  account: null
jira:
  connected: false
  project_key: null
```

**Superseded by `PC26081816` (20 Aug 2026):** the paragraph above assumes
orgs come from a hand-maintained `orgs:` list in `career/_active.yaml`.
`PC26081816` (backlog `plan.md`) resolves this differently — orgs are
instead **auto-discovered** by scanning the OneDrive
`Sconl/Core/Axial/Visionary/Corporate/` folder for engagement folders
(`YYYY-org-slug`, e.g. `2026-viva-valentia`), with `_active.yaml` and each
org's `career/orgs/<id>/*.yaml` auto-stubbed from that scan rather than
requiring hand-authored seed data. This is not a replacement for the
schema in this section — `org.yaml`/`doctrine.yaml`/etc. and this
`connections.yaml` addition still hold the same fields — it changes only
**how `_active.yaml`'s `orgs:` registry gets populated**: by the folder
scan first, then enriched by hand over time, instead of being
hand-maintained from the start. `PC26081816` is still mid-scoping (its
folder-scan mechanism, auto-stub YAML shape, and a few schema additions —
see that row) as of this revision.

---

## 2. What "toggle off" means — the cascade, made concrete

The existing doctrine (`career/_active.yaml`'s own comment, and
[[viva-is-one-org-instance-not-the-whole-career]]) already says: never
delete, archive with a terminal date, only ARCHITECT marks work done. This plan
makes that concrete per engine, since "cascade across the whole agent" was
vague until now:

| Engine | What "Viva off" changes |
|---|---|
| `circle` | People tagged to the org (Alex, Sam, Casey, Taylor, Ragnar...) stop surfacing in default/active views; still queryable by explicit org filter. Nothing deleted. |
| `scope` | Document-generation naming *profile* falls back to the personal convention ([[viva-document-naming]]); Viva-specific archetypes (`page-truth-brief`) hidden from the default picker, not removed. Open tasks tagged to the org stay open — status changes are ARCHITECT's call only, never automatic. |
| `pulse` | Calendar/notification feeds scoped to the org's connections (see §4) stop polling; finance rows tagged to the org stop feeding "current" projections but stay in history. |
| `vault` | Per-engagement connections (Gmail, M365) are suspended (token kept, polling stopped), not revoked — re-enabling doesn't require re-auth. |
| `hub` dashboard | The engagement moves from the active list to a "past engagements" list — same detail view, read-only framing, terminal date shown. |

Toggling is **one field write** (`status: active -> past`, `ended: <date>`)
in `career/_active.yaml` / the org's `org.yaml`; every engine above reads
that same field rather than keeping its own copy of "is Viva on," so there
is exactly one switch, not six.

---

## 3. The UI — hub's Flutter web console, not a new stack

`hub/lib/static.js` already serves a compiled Flutter web console (built
from `hub/app`) — the same codebase as the mobile APK
([[isconl-fleet-layout]]/`hub/app/BUILDLOG-APK.md`). The Corporate
Engagements dashboard is a new screen inside that existing Flutter app, not
a separate React/HTML stack — one UI codebase for web and mobile stays
consistent with how the rest of the console already works.

### 3.1 Structure

- **Corporate Engagements** (top-level nav item)
  - **Engagement list** — cards, one per entry in `career/_active.yaml`'s
    `orgs:` list, status badge (active/past/prospective), quick-toggle.
  - **Engagement detail** (generic template, parameterized by org id —
    this is the actual "corporate engagement template" screen the request
    asked for; Viva Valentia is the first org id it renders, nothing about
    the screen itself names Viva):
    - **Header** — org name, parent entity, role, status, started/ended,
      horizon note (all straight from `org.yaml`).
    - **Stats row** — live, pulled from the other engines at render time,
      not cached in YAML:
      - Open tasks / overdue count (`scope`)
      - Last touch + upcoming follow-ups across the org's people (`circle`)
      - Jira gate status, issue counts by state (`scope/lib/jira-gate.js`,
        already exists)
      - Finance signal (e.g. salary-timing watch already logged in
        `org.yaml`'s `reading_for_peter` — `pulse`)
      - Documents generated this engagement (`scope`'s doc-gen output
        count, once built)
    - **Connections panel** — per §4: Gmail, M365, Jira, each with a
      connect/disconnect control and last-sync time.
    - **Controls** — status toggle (active/past/prospective) with a
      confirmation step describing the cascade in §2 before it commits;
      edit-in-place for the `org.yaml` fields that change often (role,
      status, horizon note) rather than requiring a raw YAML edit.
    - **Doctrine/decision log tabs** — read `doctrine.yaml`,
      `decision_log.yaml`, `power_map.yaml`, `risk_register.yaml` as
      structured read-only views instead of raw YAML dumps.

### 3.2 Elegance requirement

Match the existing console's visual language rather than inventing a new
one — reuse whatever Material theme/typography the Flutter app already
uses elsewhere (check `hub/app`'s theme file when building, don't guess a
new palette). The "actual dashboard stats" requirement means every number
on the page is a live read from an engine's API, never a static count
someone has to remember to update.

---

## 4. Gmail / Google Workspace connection

No Google OAuth exists anywhere in the fleet today — only Gemini API-key
usage in legacy (an AI provider call, unrelated to account access) and the
MSGraph device-code pattern in `vault/lib/graph.js` for Microsoft 365. Gmail
connection is new, built to mirror that MSGraph pattern structurally (same
file shape, same secret-storage approach) so `vault` gains a second
provider client rather than a one-off:

- **New file**: `vault/lib/google.js`, same shape as `graph.js` —
  `createGoogleClient({ getConfig, auditLog })`, refresh-token persistence,
  timeout-guarded HTTPS calls, no framework dependency.
- **OAuth flow**: Google's OAuth 2.0 **device authorization flow**
  (`oauth2.googleapis.com/device/code` → poll `oauth2.googleapis.com/token`)
  — chosen because it needs no local redirect server or browser-embedded
  callback, matching how MSGraph is already wired here and keeping this
  headless-server-friendly (this runs on engines, not just the browser
  session).
- **Scopes**: start minimal —
  `gmail.readonly` + `gmail.send` (or `gmail.modify` only if drafting/label
  work is actually needed) — never a broader scope than the task in front
  of us needs.
- **Identity guardrail, baked into the connect flow itself, not left to
  memory**: per `D:\CLAUDE.md` §1, the work account is `sconl.vv@gmail.com`
  and mixing this up already cost real rework once (Jira attribution
  incident). The connect screen must show the authenticated email back
  before confirming, and refuse to save a connection whose account doesn't
  match the engagement's `identity.work_email` (from `org.yaml`) — turning
  a documented past mistake into a structural check instead of a rule
  someone has to remember.
- **Secret storage**: Bitwarden Secrets Manager, same EU-region
  (`api.bitwarden.eu`) setup already configured for the fleet
  ([[isconl-fleet-layout]]) — one more secret in the same store, not a new
  credential system.
- **Per-engagement, not global**: the connection is recorded in that org's
  `connections.yaml` (§1) — a second engagement gets its own Gmail
  connection if it ever needs one; disconnecting/toggling Viva off
  suspends this one specifically (§2).

---

## 5. How this plan interacts with the document-generation canon

`scope/docs/document-generation-canon.md` (written same session, before
this request) already anticipated exactly this: its §6 says output paths
live under `career/orgs/<org>/deliverables/...` and its §6/§5 flag naming
profile and archetype visibility as "pluggable by org... never hardcode
'viva'." This plan's `active_org` / per-org `status` field is precisely the
parameter that was left as an open pointer there. No rework needed between
the two plans — this one fills in the toggle mechanism the other assumed
would exist.

---

## 6. Build phases — revised 14 Aug 2026, grounded in code that already exists

A closer look at the fleet turned up far more standing infrastructure than
§1 assumed. This section supersedes the original sketch with the actual
files to touch, in order, and — per the request that named it — where
"Corporate" sits in the nav: **the `Projects & Spaces` sidebar group,
beside `Projects`** (which already exists and lists ventures/products —
`hub/app/lib/ui/views/projects.dart`'s own doc comment: *"Ventures /
products / platforms with live health checks"*).

### 6.0 What already exists — read before writing anything new

- **`circle/lib/career.js`** is already the org-agnostic reader this whole
  plan needs: `load()` returns `{activeOrg, orgs, orgName, role, people,
  decisions, risks, playbooks, doctrine, available}`, parsed from
  `career/_active.yaml` + the active org's `org.yaml` / `doctrine.yaml` /
  `power_map.yaml` / `decision_log.yaml` / `risk_register.yaml` /
  `playbooks.yaml`. It also exports `orient(tasks)` — a deterministic
  zoom-out/zoom-in dashboard summary (pending decisions, overdue tasks,
  standing pressure from the power map) that is *already* most of what a
  "dashboard stats" requirement asks for. **Do not build a second reader
  of `career/`** — everything here is a consumer of this module.
- **`scope/lib/decisions.js`** is the existing, working example of a
  cross-engine consumer: `createDecisionsClient({ getCareerContext,
  getActiveOrgId, readCareerFile, writeCareerFile, ... })` — injected
  fetchers that reach into `circle`'s data, plus a working example of a
  **write path** (`updateDecision`, surgical YAML line-editing that
  preserves comments/formatting rather than reserializing the file).
  `/api/decisions` (`capability: 'decisions.list'`) is wired in
  `hub/lib/api-compat.js` and already renders in
  `hub/app/lib/ui/views/decisions.dart`. This triad (engine module → hub
  capability route → Flutter view reading a `Snapshot`) is the exact
  pattern the new Corporate space follows.
- **The sidebar/nav pattern**, both copies (kept in sync by hand — see
  `sidebar_rail.dart`'s own comment on why they're duplicated rather than
  shared): `hub/app/lib/ui/widgets/sidebar_rail.dart`'s `navGroups` list
  and `hub/app/lib/ui/shell.dart`'s `MenuSheet` (~line 436 in both,
  `'Projects & Spaces'` section). Adding "Corporate" is one `NavItem`/
  `_item` line in each, next to the existing `Projects` line.
- **The data-fetch pattern**: `hub/app/lib/data/store.dart` exposes one
  `Snapshot get <name> => of('<key>', '/api/<path>');` line per view (see
  `decisions` at line 122, `projects` at line 114) — views read it via
  `SnapshotView(snapshot: services.store.X, builder: ...)`.

### 6.1 Phase 1 — `scope/lib/corporate.js` (new engine module)

New, not a duplicate of `career.js` — this is the **aggregator**, the same
role `decisions.js` plays for the decision log specifically:

```
createCorporateClient({ getCareerContext, getActiveOrgId, readCareerFile,
                         writeCareerFile, readTSV, ... })
```

Returns, per engagement: everything `career.js`'s `load()` already gives
(org facts, doctrine, people, decisions, risks, playbooks) **plus** live
cross-engine counts the way `decisions.js` cross-references `scope/
tasks.tsv` — open/overdue task counts (`scope`), last-touch/upcoming
follow-ups across the org's people (already partly in `career.js`'s
`people[].lastContact`, cross-check against `circle`'s own touch data),
Jira gate status (`scope/lib/jira-gate.js`, already exists), and — once
Phase 5 of the document-generation build plan lands — documents-generated
count. Also exposes the **write path**: `setEngagementStatus(orgId,
status, endedDate)`, doing surgical edits to both `career/_active.yaml`
(the `orgs:` entry) and that org's `org.yaml`, on the same
`writeCareerFile`/`keepPreviousVersion` pattern `decisions.js` already
uses — never delete, never invent a second write mechanism.

### 6.2 Phase 2 — `connections.yaml` schema + `vault/lib/google.js`

As originally planned (§1's schema addition, §4's Gmail design) —
unchanged by this discovery, since nothing in the fleet touches Google
OAuth yet. Scripted connect-and-verify pass first, confirming the
identity guardrail blocks a mismatched account, before any UI depends on
it.

### 6.3 Phase 3 — hub API wiring

Add to `hub/lib/api-compat.js`, in the `-- scope: tasks, jira gate,
decisions --` block (Corporate belongs beside decisions, same engine,
same pattern):

```js
{ method: 'GET',  path: '/api/corporate',        capability: 'corporate.overview' },
{ method: 'GET',  path: '/api/corporate/detail',  capability: 'corporate.detail', paramFromQuery: { id: 'orgId' } },
{ method: 'POST', path: '/api/corporate/status',  capability: 'corporate.status.update' },
{ method: 'POST', path: '/api/corporate/connect', capability: 'corporate.connections.update' },
```

Read-only (`corporate`, `corporate/detail`) before any write path is
exposed, matching how `decisions.list` shipped before `decisions.update`.

### 6.4 Phase 4 — Flutter UI

- `hub/app/lib/data/store.dart`: add `Snapshot get corporate => of
  ('corporate', '/api/corporate');` next to `decisions`/`projects`.
- `hub/app/lib/ui/views/corporate.dart` (new): `CorporateView`, built the
  same shape as `DecisionsView` — a `SnapshotView` over
  `services.store.corporate`, a list of engagement cards (status badge,
  quick facts), each opening a detail screen (`CorporateDetailView`,
  parameterized by org id — the actual "corporate engagement template"
  the request asked for; Viva Valentia is the first org id it renders,
  nothing in the widget itself names Viva).
- **Nav wiring — the literal ask**: in `sidebar_rail.dart`'s
  `'Projects & Spaces'` group, add
  `NavItem('corporate', Icons.apartment_rounded, 'Corporate', () => const CorporateView())`
  immediately after the existing `projects` line (so it reads "Projects,
  Corporate, Spaces, Files, ..." — beside Projects, inside the same
  group, per the request). Mirror the identical line in `shell.dart`'s
  `MenuSheet` at the matching spot (~line 438, right after the `Projects`
  `_item(...)` call). Icon choice: `Icons.apartment_rounded` — distinct
  from `Projects`' rocket icon and `Decisions & Risks`' gavel icon,
  reads as "an organization," matches Material's existing icon set (no
  new asset needed).
- Detail screen's **stats row** and **controls** are exactly §3.1 of this
  plan's original design (header from `org.yaml`, live stats from
  `corporate.js`, connections panel, status toggle with cascade
  confirmation copy) — unchanged, now backed by a real data source instead
  of a sketch.

### 6.5 Phase 5 — Write paths + cascade wiring

Status toggle (`corporate/status`) and connections panel
(`corporate/connect`), then the cascade table in §2 gets implemented
per-engine: `scope`'s naming-profile/archetype-namespace selection reads
`career.js`'s `activeOrg` (already exactly how `document-generation-
build-plan.md`'s Phase 6 describes it — same mechanism, same source of
truth, built by two different plans converging on one field).

### 6.6 Verify, end to end

Toggle Viva Valentia to `status: past` via the new UI control, confirm:
`/api/decisions` still returns its history (nothing deleted), a
`page-truth-brief` generation attempt against the now-inactive org fails
cleanly (Phase 6 of the doc-gen plan), and the engagement card moves to a
"past engagements" list in `CorporateView` with its terminal date shown.
Toggle it back to `active` and confirm everything resumes without
re-authenticating any connection.

## 7. Open questions

1. Confirm `gmail.readonly` + `gmail.send` is the right starting scope set,
   or whether label/draft management (`gmail.modify`) is needed from day one.
2. Confirm the Flutter console's existing theme file/location so the new
   screens match rather than drift stylistically (needs pointing at once
   `hub/app`'s structure is opened for this work).
3. Should "prospective" engagements (not yet started) get a lighter-weight
   card in the list, or the full detail template with mostly-empty stats?
4. Any other per-engagement connections beyond Gmail/M365/Jira worth
   modeling in `connections.yaml` now, versus adding later as they come up?
