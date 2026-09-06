'use strict';
/**
 * The `/api/*` compatibility layer for the real, already-signed, already-
 * installed Flutter app (isconl-agent's `app` branch -- see the refactor
 * canvas's Client App section). The app's lib/api/client.dart calls a flat
 * `/api/...` surface inherited from the old monolith; the new engines use
 * their own unprefixed paths. Rather than forcing a new APK build before
 * the app can talk to anything new, hub bridges the two:
 *
 *   - A path this app calls that a new engine now genuinely serves ->
 *     routed there via the capability router (PROVES the migration real).
 *   - Everything else -> proxied to the legacy monolith UNCHANGED, so the
 *     app already on Architect's phone keeps working exactly as it does today
 *     the moment its Settings screen points at hub instead of
 *     isconl-agent.onrender.com. Zero app rebuild required for that step.
 *
 * This table was built from a real inventory (grep across every .dart file
 * in the app branch, 2026-08-09), not guessed -- but it originally marked
 * five paths (`/api/teams`, `/api/ingest/sms`, `/api/finance/messages/commit`,
 * `/api/learning/manifest`, `/api/learning/narrate`) as dead ends by diffing
 * the app branch against legacy's *main* server.js only. All five turned out
 * to be real: each is implemented on legacy's *dev* branch (confirmed
 * 2026-08-14 by grepping dev's server.js directly -- see
 * `_handoff/migration-log.md`), just missed because this table was never
 * rechecked against dev. All five now proxy to legacy (`legacy: true`)
 * rather than 501ing. There is currently no confirmed `gap: true` entry in
 * this table; if one is added, verify it against legacy's dev branch, not
 * main, before marking it dead.
 */

// method + path (as the Dart client calls it) -> where it goes.
// `capability` entries route through hub's own capability router.
// `legacy` entries proxy verbatim to the configured legacy backend.
// `gap` entries are confirmed dead ends -- verify against legacy's DEV
// branch before adding one, not main (see header comment above).
const ROUTES = [
  // -- spark: act, ideas, learning, articles --
  { method: 'POST', path: '/api/act', capability: 'act' },
  { method: 'GET', path: '/api/ideas', capability: 'ideas.list' },
  { method: 'POST', path: '/api/ideas/add', capability: 'ideas.add' },
  { method: 'POST', path: '/api/ideas/update', capability: 'ideas.update' },
  { method: 'GET', path: '/api/learning', capability: 'learning.courses' },
  { method: 'GET', path: '/api/learning/groups', capability: 'learning.groups.list' },
  { method: 'POST', path: '/api/learning/group', capability: 'learning.group.save' },
  { method: 'POST', path: '/api/learning/group/archive', capability: 'learning.group.archive' },
  { method: 'POST', path: '/api/learning/course/status', capability: 'learning.course.status' },
  { method: 'POST', path: '/api/learning/module/meta', capability: 'learning.module.meta' },
  { method: 'GET', path: '/api/learning/lesson', capability: 'learning.lesson' },
  { method: 'GET', path: '/api/learning/asset', capability: 'learning.asset' },
  { method: 'GET', path: '/api/learning/notes', capability: 'learning.note.get' },
  { method: 'POST', path: '/api/learning/notes', capability: 'learning.note.save' },
  { method: 'POST', path: '/api/learning/resume', capability: 'learning.resume' },
  { method: 'POST', path: '/api/learning/progress', capability: 'learning.progress' },
  { method: 'GET', path: '/api/learning/contributions', capability: 'learning.contributions' },
  { method: 'GET', path: '/api/learning/campus', capability: 'learning.campus' },
  { method: 'GET', path: '/api/learning/prime', capability: 'learning.prime' },
  { method: 'GET', path: '/api/articles/list', capability: 'articles.list' },
  { method: 'GET', path: '/api/learning/manifest', capability: 'learning.manifest' },
  { method: 'GET', path: '/api/learning/audio', capability: 'learning.audio.get' },
  { method: 'POST', path: '/api/learning/narrate', capability: 'learning.audio.generate' },
  { method: 'POST', path: '/api/learning/parse-md', capability: 'learning.parseMd' },

  // -- scope: tasks, jira gate, decisions --
  { method: 'GET', path: '/api/tasks', capability: 'tasks.list' },
  { method: 'GET', path: '/api/tasks/detail', capability: 'tasks.get', paramFromQuery: { id: 'taskId' } },
  { method: 'POST', path: '/api/tasks/update', capability: 'tasks.update' },
  { method: 'POST', path: '/api/tasks/delete', capability: 'tasks.delete' },
  { method: 'POST', path: '/api/tasks/done', capability: 'tasks.complete' },
  { method: 'GET', path: '/api/decisions', capability: 'decisions.list' },
  { method: 'POST', path: '/api/decisions/update', capability: 'decisions.update' },
  { method: 'GET', path: '/api/corporate', capability: 'corporate.overview' },
  { method: 'GET', path: '/api/corporate/detail', capability: 'corporate.detail' },
  // BA26082420: weekly status-brief UI surface.
  { method: 'GET', path: '/api/active-subjects', capability: 'activeSubjects.list' },
  { method: 'GET', path: '/api/status-briefs', capability: 'statusBriefs.list' },
  { method: 'POST', path: '/api/status-briefs/draft', capability: 'statusBriefs.draft' },
  { method: 'POST', path: '/api/status-briefs/send', capability: 'statusBriefs.send' },
  { method: 'GET', path: '/api/planning/adherence', capability: 'planning.adherence' },
  { method: 'GET', path: '/api/identity/persona-split', capability: 'identity.personaSplit' },
  // Writer space (SPACES > Visionary > Career Copilot > Writer), added 17
  // Aug: scope's document-generation engine had real HTTP routes and no
  // caller anywhere -- this is that caller, same capability-router pattern
  // as everything else in this table, nothing engine-specific about it.
  { method: 'GET', path: '/api/generate/archetypes', capability: 'generate.archetypes' },
  { method: 'POST', path: '/api/generate/preview', capability: 'generate.preview' },
  { method: 'POST', path: '/api/generate', capability: 'generate.generate' },
  { method: 'GET', path: '/api/generate/docs', capability: 'generate.docs.list' },
  { method: 'POST', path: '/api/generate/docs/update', capability: 'generate.docs.update' },
  { method: 'GET', path: '/api/generate/docs/download', capability: 'generate.docs.download' },
  { method: 'GET', path: '/api/generate/docs/content', capability: 'generate.docs.content' },
  { method: 'GET', path: '/api/generate/docs/tasks', capability: 'generate.docs.tasks' },
  { method: 'POST', path: '/api/generate/docs/attach', capability: 'generate.docs.attach' },
  { method: 'POST', path: '/api/writer/research-field', capability: 'writer.research_field' },
  { method: 'POST', path: '/api/writer/full-draft', capability: 'writer.full_draft' },
  { method: 'GET', path: '/api/writer/binder/episodes', capability: 'writerBinder.episodes' },
  { method: 'GET', path: '/api/writer/binder/compile', capability: 'writerBinder.compile' },
  { method: 'POST', path: '/api/tasks/brief', legacy: true },   // AI-dependent, not yet in scope -- proxy for now
  { method: 'POST', path: '/api/tasks/draft', legacy: true },
  // BX26082421: one issue's compact status/priority/assignee, for the
  // task-view depth card. Read-only, safe -- query param `key` passes
  // straight through to scope's /jira/issue?key= unchanged.
  { method: 'GET', path: '/api/jira/issue', capability: 'jira.issue' },
  { method: 'GET', path: '/api/jira/issues', capability: 'jira.issues' },
  { method: 'POST', path: '/api/jira/transition', capability: 'jira.transition' },
  { method: 'GET', path: '/api/jira/assignable', capability: 'jira.assignable' },
  { method: 'POST', path: '/api/jira/assign', capability: 'jira.assign' },
  { method: 'POST', path: '/api/jira/delete', capability: 'jira.delete' },
  { method: 'POST', path: '/api/jira/clear', capability: 'jira.clear' },
  // Confirmed against scope/lib/manifest.js -- no jira.permissions
  // capability exists anywhere in the fleet (only `hub/app`'s
  // jira.dart calls this path; nothing serves it). Was mislabeled
  // `legacy: true` (implies "used to reach the retired monolith");
  // relabeled `gap: true` per this file's own header comment ("gap
  // entries are confirmed dead ends") -- same 501 either way, this is
  // a documentation-accuracy fix only, no behavior change.
  { method: 'GET', path: '/api/jira/permissions', gap: true },
  // FN26082702: the web's jiraPanel review-then-push UI (app.js's
  // openJiraReview/pushJira, ~8380-8510) calls these two but neither had
  // a route entry at all -- confirmed both are real, already-shipped scope
  // capabilities (scope/lib/manifest.js, scope/src/server.js POST
  // /jira/preview and /jira/push), just never wired through here, so every
  // preview/push click plain 404'd. jira.preview writes nothing (readiness
  // check only); jira.push is the single reviewed, human-clicked write path
  // (distinct from BX26082801's jira.pending.* autonomous-write-approval
  // gate) -- wiring the route doesn't itself fire a write, it only lets
  // Sconl's own already-authenticated web session reach the gate
  // that already exists.
  { method: 'POST', path: '/api/jira/preview', capability: 'jira.preview' },
  { method: 'POST', path: '/api/jira/push', capability: 'jira.push' },
  // FN26082702: composeJira()/jiraReschedule() (app.js ~8455/8512) call
  // these two, but confirmed via grep across scope/lib/manifest.js and
  // scope/src/server.js: neither /jira/compose nor /jira/schedule has ever
  // existed anywhere in the fleet -- not a proxy-wiring gap like preview/
  // push above, a genuinely unbuilt capability. AI-compose in particular
  // is real new scope (an LLM call that drafts summary/description text
  // feeding straight into the Jira write path above) -- out of bounds for
  // a FIX-session wiring pass, and not something to build unilaterally
  // right next to the write path after WSRU-106. Marked `gap: true` so
  // both buttons fail loud with a clear 501 instead of a bare 404 -- no
  // behavior change for a user (both were already completely broken),
  // just an honest response instead of a silent dead end.
  { method: 'POST', path: '/api/jira/compose', gap: true },
  { method: 'POST', path: '/api/jira/schedule', gap: true },
  // Fixed 2026-08-16: scope/plans.tsv had 21 real rows synced from OneDrive
  // the whole time (including the standing net-worth target) -- these two
  // routes were the only thing missing, so the Planning view's goal board
  // was permanently empty.
  { method: 'GET', path: '/api/theme-day', capability: 'theme.day' },
  { method: 'GET', path: '/api/plans', capability: 'plans.list' },
  { method: 'POST', path: '/api/plans/add', capability: 'plans.add' },
  { method: 'POST', path: '/api/plans/update', capability: 'plans.update' },

  // BI26082419: Microsoft Graph mail send (see ACE_EMAIL secret).
  { method: 'POST', path: '/api/graph/mail/send', capability: 'graph.mail.send' },

  // BG26082401: session-derived "surface this to Architect" items, deliberately
  // separate from scope/inbox.tsv (that file's SOURCE column is already a
  // per-message dedup key, not a message-type field).
  { method: 'GET', path: '/api/surfaced-tasks', capability: 'surfacedTasks.list' },
  { method: 'POST', path: '/api/surfaced-tasks/add', capability: 'surfacedTasks.add' },
  { method: 'POST', path: '/api/surfaced-tasks/update', capability: 'surfacedTasks.update' },

  // -- circle: people, touch, dia, inbox, journal --
  { method: 'GET', path: '/api/circle', capability: 'circle.people.list' },
  { method: 'POST', path: '/api/circle/touch', capability: 'circle.touch' },
  { method: 'GET', path: '/api/circle/dia', capability: 'circle.dia.get' },
  { method: 'POST', path: '/api/circle/import-chat', capability: 'circle.chat.import' },
  { method: 'POST', path: '/api/circle/import-chat/add-sender', capability: 'circle.chat.import.add-sender' },
  { method: 'POST', path: '/api/inbox/add', capability: 'inbox.add' },
  { method: 'POST', path: '/api/inbox/update', capability: 'inbox.update' },
  { method: 'GET', path: '/api/journal', capability: 'journal.list' },
  { method: 'POST', path: '/api/journal/add', capability: 'journal.add' },
  { method: 'POST', path: '/api/journal/update', capability: 'journal.update' },

  // -- pulse: dates, calendar, notifications, health, rhythm, projects, finance --
  { method: 'GET', path: '/api/dates', capability: 'dates.list' },
  { method: 'POST', path: '/api/dates/add', capability: 'dates.add' },
  { method: 'GET', path: '/api/calendar/events', capability: 'calendar.events.list' },
  { method: 'POST', path: '/api/calendar/events', capability: 'calendar.events.add' },
  // calendar.events.delete and calendar.import: found missing while
  // building BT26082004 -- app.js's existing import button (`:1288`,
  // `:1307`) has been calling /api/calendar/import with no route entry
  // for it at all, a silent 404/501 predating this session. Small,
  // contained, fixed inline rather than routed through fix.md (Error
  // capture rule: fix it now if it doesn't derail the session's own work).
  { method: 'POST', path: '/api/calendar/events/delete', capability: 'calendar.events.delete' },
  { method: 'POST', path: '/api/calendar/import', capability: 'calendar.import' },
  { method: 'GET', path: '/api/calendar/export', capability: 'calendar.export' },
  { method: 'GET', path: '/api/notifications', capability: 'notifications.list' },
  { method: 'POST', path: '/api/notifications/seen', capability: 'notifications.seen' },
  { method: 'GET', path: '/api/health/data', capability: 'health.data' },
  { method: 'GET', path: '/api/personal/rhythm', capability: 'rhythm.get' },
  { method: 'POST', path: '/api/personal/rhythm', capability: 'rhythm.update' },
  // BL26082601: iScroll's profile settings (name/photo), vault-owned, not
  // tied to any OAuth identity.
  { method: 'GET', path: '/api/profile', capability: 'profile.get' },
  { method: 'POST', path: '/api/profile', capability: 'profile.update' },
  { method: 'POST', path: '/api/profile/photo', capability: 'profile.photoUpload' },
  // GET /api/profile/photo is NOT routed through here -- it returns a binary
  // image, and the generic router always JSON-decodes an engine's response
  // (see engine-client.js's raw()). It's special-cased in server.js instead,
  // using rawStream() to pipe the bytes straight through.
  { method: 'GET', path: '/api/insights', legacy: true },
  { method: 'GET', path: '/api/projects', capability: 'projects.list' },
  { method: 'GET', path: '/api/portfolio', capability: 'portfolio.get' },
  { method: 'POST', path: '/api/portfolio', capability: 'portfolio.update' },
  // G1 (task-backlog.md): pulse gained a real github.snapshot capability
  // 17 Aug (lib/github.js's getSnapshot(), reusing the same githubApi()
  // wrapper github.contributions already used) -- was `legacy: true`
  // (proxying to the deleted legacy monolith, a confirmed dead 501).
  { method: 'GET', path: '/api/github/snapshot', capability: 'github.snapshot' },
  { method: 'GET', path: '/api/finance/summary', capability: 'finance.summary' },
  { method: 'GET', path: '/api/ventures', legacy: true },          // pulse only exposes ventures via /projects today
  { method: 'POST', path: '/api/finance/tx', legacy: true },
  { method: 'GET', path: '/api/finance/wishlist', legacy: true },
  { method: 'POST', path: '/api/finance/receipt', legacy: true },  // AI extraction, spark's future job
  { method: 'POST', path: '/api/finance/messages/commit', legacy: true },
  { method: 'POST', path: '/api/ingest/sms', legacy: true },

  // -- vault: /api/auth/totp, /api/auth/pin, and /api/auth/methods are handled
  // directly in server.js (public, same handler as hub's own /auth/* routes)
  // -- not routed through this table, since login can't require auth.
  // BI26083005: was `legacy: true` (proxying to the retired/suspended
  // legacy monolith -- effectively dead, per NEXT.md's Render-bypass
  // decision). vault's OneDrive sync is backup-only now; the phone app's
  // "sync now" / reconnect-triggered call (sync.dart's fullSync()) forces
  // an immediate backup pass instead of a pull, the closest equivalent.
  { method: 'POST', path: '/api/vault/sync', capability: 'backup.run' },
  // /api/vault/sync/status: rebuilt natively in server.js (reshapes vault's
  // real backup.status into the shape app.js's checkVaultLink() expects)
  // -- checked before this table is ever consulted, same pattern as
  // /api/state above, so it's not listed here even though the route exists.
  { method: 'POST', path: '/api/auth/logout', legacy: true },
  { method: 'GET', path: '/api/audit', legacy: true },   // audit-log viewing has no owner engine yet
  // Day-scheduling engine, ported into vault from isconl-agent's dev branch
  // (lib/blocks.js) -- genuinely owned by vault now, not proxied.
  { method: 'GET', path: '/api/time', capability: 'time.now' },
  { method: 'GET', path: '/api/blocks', capability: 'blocks.plan' },
  { method: 'POST', path: '/api/blocks', capability: 'blocks.save' },
  // Management-only listing (U8): includes ACTIVE:no rows GET /api/blocks
  // filters out by design, so a deactivated block can be found again to
  // turn back on. Not used for placement/scheduling -- only Settings > Day
  // Schedule reads this.
  { method: 'GET', path: '/api/blocks/all', capability: 'blocks.all' },

  // -- not yet owned by any engine (tags, refs, orientation, chat, OneDrive browse, Buffer desk, Teams) --
  { method: 'GET', path: '/api/state', legacy: true },
  { method: 'POST', path: '/api/settings', legacy: true },
  { method: 'POST', path: '/api/m365/auth/start', capability: 'msgraph.auth.start' },
  { method: 'POST', path: '/api/m365/auth/poll', capability: 'msgraph.auth.poll' },
  { method: 'POST', path: '/api/google/auth/start', capability: 'google.auth.start' },
  { method: 'POST', path: '/api/google/auth/poll', capability: 'google.auth.poll' },
  { method: 'POST', path: '/api/google/send', capability: 'google.send' },
  { method: 'POST', path: '/api/google/sync-all', capability: 'google.sync.all' },
  // GET /api/spaces: rebuilt natively in server.js 17 Aug (buildSpacesTree())
  // -- server.js checks this path BEFORE ever consulting this table, so the
  // entry below is never actually reached; kept only so the well-formedness
  // test and the real-app-inventory test below still account for the path.
  // It WAS `legacy: true` for real (a confirmed dead 501, the legacy
  // monolith it pointed at was deleted 2026-08-15), which meant the whole
  // Spaces/Axial tree silently never loaded -- see server.js's own comment
  // on the native route for the fix. POST /api/spaces has no caller in
  // app.js (checked) -- left as a genuinely dead route rather than built
  // speculatively.
  { method: 'GET', path: '/api/spaces', legacy: true },
  { method: 'POST', path: '/api/spaces', legacy: true },
  { method: 'GET', path: '/api/tags', legacy: true },
  { method: 'GET', path: '/api/refs', legacy: true },
  { method: 'GET', path: '/api/orientation', legacy: true },
  // FI26090501: POST /api/chat and POST /api/chat/stream are rebuilt
  // natively in server.js -- checked BEFORE this table (same bypass
  // pattern as GET /api/spaces above), wired to spark's Groq-backed
  // ai.chat.complete capability. The entries below are never actually
  // reached; kept only so the well-formedness test and the real-app-
  // inventory test still account for the path. `legacy: true` no longer
  // describes reality (it answers now) but is the least-misleading of
  // the three allowed modes for an entry findRoute() never dispatches.
  // Thread persistence (below) is still genuinely unbuilt -- real 501s.
  { method: 'POST', path: '/api/chat', legacy: true },
  // GET /api/chat/stream: the app-inventory grep found the Flutter app
  // calling this verb; the web (server.js's real handler above)
  // calls it as POST instead -- both bypass this table either way, but
  // the GET verb here matches what app.js (Flutter) actually sends, so
  // this entry stays true to the inventory it documents.
  { method: 'GET', path: '/api/chat/stream', legacy: true },
  // BI26090505: /api/chat/thread/new, /api/chat/thread/open,
  // /api/chat/threads, and /api/chat/thread/delete are real now, handled
  // directly in src/server.js (bypasses this table's generic router the
  // same way /api/chat/stream above does -- they need chatThreads'
  // in-memory current-thread state, not a stateless capability call).
  // Entries below are inventory markers only, same convention as
  // /api/chat/stream -- server.js's dispatcher checks its native routes
  // before ever consulting this table.
  { method: 'POST', path: '/api/chat/thread/new', legacy: true },
  { method: 'POST', path: '/api/chat/thread/open', legacy: true },
  { method: 'GET', path: '/api/chat/threads', legacy: true },
  { method: 'POST', path: '/api/chat/thread/delete', legacy: true },
  // File manager, rebuilt in full (2026-08-16) against vault's new
  // lib/onedrive-browse.js -- web/static/app.js's frontend
  // (fmNavigate/fmPreviewItem/fmNewFolder/fmUploadFile/fmRenameItem/
  // fmMoveItem/fmDeleteItem) was fully built already, against a backend
  // that never existed until now (every route here was `legacy: true`,
  // i.e. a 501, since the legacy monolith was deleted 2026-08-15).
  // No paramFromQuery here on purpose: vault's paths (/onedrive/browse,
  // /onedrive/item-preview) have no :placeholder to fill, so a query->params
  // reshape would delete `path`/`id` from the outgoing query and lose them
  // (fillPath only substitutes params that appear as :name in the template).
  // Plain pass-through: query forwards unchanged, vault reads it itself.
  { method: 'GET', path: '/api/onedrive/list', capability: 'onedrive.browse.list' },
  { method: 'GET', path: '/api/onedrive/preview', capability: 'onedrive.browse.preview' },
  // -- media (BE26082009): local-filesystem browsing + streaming tickets.
  // /stream itself is NOT routed through here -- it's reached directly by
  // the browser at media's own URL (a media element's src can't carry an
  // Authorization header), authorized by the signed ticket local.ticket
  // mints, not the fleet's normal bearer proxy. See media's manifest.js.
  { method: 'GET', path: '/api/media/list', capability: 'media.local.list' },
  { method: 'GET', path: '/api/media/ticket', capability: 'media.local.ticket' },
  // BI26090502: Ops nav child (System group). name/service pulled off the
  // query string into the :name/:service path param ops's own manifest
  // declares -- same paramFromQuery reshape tasks.detail already uses.
  { method: 'GET', path: '/api/ops/status', capability: 'ops.status' },
  { method: 'GET', path: '/api/ops/vm-stats', capability: 'ops.vm.stats' },
  { method: 'GET', path: '/api/ops/logs', capability: 'ops.logs.tail', paramFromQuery: { name: 'service' } },
  { method: 'POST', path: '/api/ops/service/restart', capability: 'ops.service.restart', paramFromQuery: { name: 'service' } },
  { method: 'POST', path: '/api/ops/service/start', capability: 'ops.service.start', paramFromQuery: { name: 'service' } },
  { method: 'POST', path: '/api/ops/service/stop', capability: 'ops.service.stop', paramFromQuery: { name: 'service' } },
  { method: 'POST', path: '/api/ops/service/destroy', capability: 'ops.service.destroy', paramFromQuery: { name: 'service' } },
  { method: 'GET', path: '/api/ops/deploy-status', capability: 'ops.deploy.status' },
  { method: 'POST', path: '/api/onedrive/mkdir', capability: 'onedrive.browse.mkdir' },
  { method: 'POST', path: '/api/onedrive/upload', capability: 'onedrive.browse.upload' },
  // /api/onedrive/delete, /api/onedrive/move: rebuilt natively in
  // server.js, not routed through this table -- both need `ok` reshaped to
  // `success` (the frontend's contract, inherited from the legacy monolith)
  // rather than vault's own `ok` convention, same reshape-at-the-edge
  // pattern as /api/vault/sync/status above.
  // /api/onedrive/download, /api/onedrive/raw: also native in server.js --
  // not JSON capabilities, a 302 to Graph's pre-signed downloadUrl instead
  // (hub has no raw-byte-passthrough path yet; see the Teams onepage/export
  // comment near the bottom of this file for the same unbuilt gap).
  { method: 'GET', path: '/api/buffer/desk', legacy: true },
  { method: 'POST', path: '/api/buffer/post', legacy: true },
  { method: 'POST', path: '/api/buffer/post/manage', legacy: true },
  { method: 'POST', path: '/api/buffer/channel/pause', legacy: true },
  // Teams OS (BM26082802): rebuilt natively on circle, stored in vault.
  { method: 'GET', path: '/api/teams', capability: 'teams.snapshot' },
  { method: 'POST', path: '/api/teams/save', capability: 'teams.save' },
  { method: 'POST', path: '/api/teams/member', capability: 'teams.member.save' },
  { method: 'POST', path: '/api/teams/member/remove', capability: 'teams.member.remove' },
  { method: 'POST', path: '/api/teams/work', capability: 'teams.work.save' },
  { method: 'POST', path: '/api/teams/work/move', capability: 'teams.work.move' },
  // Style corpus (BM26082412, BM26082801)
  { method: 'POST', path: '/api/style-corpus/ingest', capability: 'styleCorpus.ingest' },
  { method: 'POST', path: '/api/style-corpus/ingest-turns', capability: 'styleCorpus.ingestTurns' },
  { method: 'GET', path: '/api/style-corpus/profile', capability: 'styleCorpus.profile' },
  // BX26082801: Jira out-of-band write-approval queue
  { method: 'GET', path: '/api/jira/pending', capability: 'jira.pending.list' },
  { method: 'POST', path: '/api/jira/pending/enqueue', capability: 'jira.pending.enqueue' },
  { method: 'POST', path: '/api/jira/pending/approve', capability: 'jira.pending.approve' },
  { method: 'POST', path: '/api/jira/pending/deny', capability: 'jira.pending.deny' },
  { method: 'GET', path: '/api/apk/latest', legacy: true },
];

function findRoute(method, pathname) {
  return ROUTES.find(r => r.method === method && r.path === pathname) || null;
}

module.exports = { ROUTES, findRoute };
