# iSconl Fleet

`hub` is the single entry point for a fleet of independently-deployed engines.
It discovers each engine's capabilities from that engine's own manifest
(`GET /manifest`) rather than hardcoding a list — a new engine, or a new
capability on an existing one, shows up in `hub`'s aggregated `/manifest`
without an edit here.

This file documents the fleet **as it runs today** — current engine names,
current responsibilities. It does not describe a target architecture or a
planned rename; those live in a private canon doc (`work/_arc/iSconl/` on the
relay drive) that this README is derived from and does not replace. If the
fleet is ever restructured, this file is updated in the same commit as the
rename lands — not before.

## The engines

| Engine | Layer (today) | Responsibility |
|---|---|---|
| `hub` | Surface | Single entry point. Aggregates every engine's capability manifest, routes `/call` deterministically, proxies chat actions, triggers deploys. |
| `vault` | Substrate + Adapters + Domain (see note below) | Auth/session, the TSV/SQLite collection store, Microsoft Graph + Google clients, secrets, AI-provider routing, OneDrive backup, plus some learning-content and day-scheduling logic that landed here historically. |
| `scope` | Domain | Tasks, the Jira integration and write-approval gate, document generation, the decision log, corporate-engagement data, the long-game plans board. |
| `pulse` | Domain | Finance, notifications, dates/calendar, data-health checks, personal rhythm/insights, project status, GitHub, Buffer, Telegram, news tracking. |
| `circle` | Domain | Relationships (people/interactions/capabilities/graph), Teams OS, inbox, journal, chat-archive import, career/org context. |
| `spark` | Domain | Ideas pipeline, chat/NLU + the natural-language action parser, learning course catalogue, articles. |
| `media` | Domain | Local media browsing, signed-ticket streaming, an LRU listing cache. OneDrive playback reuses `vault`'s own browse capabilities rather than duplicating them. |
| `ops` | Surface | Live control surface for every fleet service and the OCI VM — status, VM stats, log tail, per-service restart/start/stop/destroy, deploy status. |

`app` (the Flutter mobile client) and `ispark` (the iSpark tenant learning app)
are separate repositories that consume this fleet's engines over HTTP; they
are not engines themselves and aren't in the table above.

**Note on `vault`:** it is the one engine that doesn't sit cleanly in a single
layer today — it holds the storage/auth substrate, the external-vendor
adapters (Graph, Google, msgraph), and some domain content (learning
metadata, day-blocks) all in one repo. That's a known shape, not an
oversight, and it's the reason a storage-layer defect can end up filed
against a feature rather than against the data layer (see `FI26091501` in
this project's backlog for the concrete incident). Splitting it is a real,
tracked architecture question — not yet decided, not attempted in this file.

## The one rule a contributor actually needs

**A new capability goes in the engine matching its dependencies, not the
engine that feels topically related.** If it talks to an external vendor
(Graph, Google, Jira, GitHub, a news API), it belongs next to the other
vendor integrations. If it's primarily about storing or retrieving a
collection with no other logic, it belongs in the storage layer. If it's a
real product surface a user interacts with, it belongs in the domain engine
that already owns that surface's data. When in doubt, check which engine's
`lib/default-schema.js`-declared collections (see `vault/lib/default-schema.js`)
the capability would actually read or write — that's usually the answer,
regardless of which engine's name sounds closest.

## Where the fleet came from, and where it might go

This engine list and layering reflects the fleet as measured on 15 September
2026 — 229 capabilities counted directly from each engine's own manifest, not
estimated. A private architecture canon (not in this repo, since it also
carries business reasoning that doesn't belong in an open codebase) proposes
a target layering and a rename for several engines. That proposal is **not
confirmed and not scheduled** — nothing in this repo, no branch, container or
compose file, uses the proposed names. Treat this README as the current
state of record until a real migration lands, at which point this file
changes in the same commit.
