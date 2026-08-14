# Corporate Engagements — Plan

Status: **plan only, nothing built yet.** Written to survive across Claude
sessions and machines — lives in the `hub` repo (git-backed, pulled fresh on
any machine) rather than any one session's memory. Cross-references:
[[isconl-fleet-layout]] for repo layout, and
`D:\work\dev\iSconl\scope\docs\document-generation-canon.md` for the
document-generation system this plan's toggle also governs.

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

## 6. Build phases

1. **Data**: add `connections.yaml` to `_template/` and to
   `viva-valentia/` (empty/false state — nothing connected yet).
2. **vault**: `lib/google.js` (device-flow client, mirrors `graph.js`),
   wired to Bitwarden the same way MSGraph is. No UI yet — a scripted
   connect-and-verify pass first, confirming the identity guardrail
   actually blocks a mismatched account before any UI is built on top.
3. **hub API**: read-only endpoints first — engagement list, engagement
   detail (merging `org.yaml` + live stats from the other engines' existing
   APIs), before any write path (toggle, connect) is exposed.
4. **hub Flutter UI**: engagement list screen, then the generic detail
   template rendering Viva Valentia's data, styled to match the existing
   console.
5. **Write paths**: status toggle (with the cascade confirmation copy from
   §2), connections panel wired to the vault Gmail client from step 2.
6. **Cascade wiring**: `scope`'s naming-profile selection and archetype
   visibility read `active_org`/org status (closing the loop with the
   document-generation canon); repeat for `circle`/`pulse` per the table
   in §2.

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
