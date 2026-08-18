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
  { method: 'GET', path: '/api/learning/notes', capability: 'learning.note.get' },
  { method: 'POST', path: '/api/learning/notes', capability: 'learning.note.save' },
  { method: 'POST', path: '/api/learning/resume', capability: 'learning.resume' },
  { method: 'POST', path: '/api/learning/progress', capability: 'learning.progress' },
  { method: 'GET', path: '/api/learning/campus', capability: 'learning.campus' },
  { method: 'GET', path: '/api/learning/prime', capability: 'learning.prime' },
  { method: 'GET', path: '/api/articles/list', capability: 'articles.list' },
  { method: 'GET', path: '/api/learning/manifest', legacy: true },
  { method: 'GET', path: '/api/learning/audio', capability: 'learning.audio.get' },
  { method: 'POST', path: '/api/learning/narrate', capability: 'learning.audio.generate' },

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
  // Writer space (SPACES > Visionary > Career Copilot > Writer), added 17
  // Aug: scope's document-generation engine had real HTTP routes and no
  // caller anywhere -- this is that caller, same capability-router pattern
  // as everything else in this table, nothing engine-specific about it.
  { method: 'GET', path: '/api/generate/archetypes', capability: 'generate.archetypes' },
  { method: 'POST', path: '/api/generate/preview', capability: 'generate.preview' },
  { method: 'POST', path: '/api/generate', capability: 'generate.generate' },
  { method: 'POST', path: '/api/tasks/brief', legacy: true },   // AI-dependent, not yet in scope -- proxy for now
  { method: 'POST', path: '/api/tasks/draft', legacy: true },
  { method: 'GET', path: '/api/jira/issues', legacy: true },     // scope has preview/push, not a bare issue list yet
  { method: 'POST', path: '/api/jira/transition', legacy: true },
  { method: 'GET', path: '/api/jira/assignable', legacy: true },
  { method: 'POST', path: '/api/jira/assign', legacy: true },
  { method: 'POST', path: '/api/jira/delete', legacy: true },
  { method: 'POST', path: '/api/jira/clear', legacy: true },
  { method: 'GET', path: '/api/jira/permissions', legacy: true },
  // Fixed 2026-08-16: scope/plans.tsv had 21 real rows synced from OneDrive
  // the whole time (including the standing net-worth target) -- these two
  // routes were the only thing missing, so the Planning view's goal board
  // was permanently empty.
  { method: 'GET', path: '/api/theme-day', capability: 'theme.day' },
  { method: 'GET', path: '/api/plans', capability: 'plans.list' },
  { method: 'POST', path: '/api/plans/add', capability: 'plans.add' },
  { method: 'POST', path: '/api/plans/update', capability: 'plans.update' },

  // -- circle: people, touch, dia, inbox, journal --
  { method: 'GET', path: '/api/circle', capability: 'circle.people.list' },
  { method: 'POST', path: '/api/circle/touch', capability: 'circle.touch' },
  { method: 'GET', path: '/api/circle/dia', capability: 'circle.dia.get' },
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
  { method: 'GET', path: '/api/notifications', capability: 'notifications.list' },
  { method: 'POST', path: '/api/notifications/seen', capability: 'notifications.seen' },
  { method: 'GET', path: '/api/health/data', capability: 'health.data' },
  { method: 'GET', path: '/api/personal/rhythm', capability: 'rhythm.get' },
  { method: 'POST', path: '/api/personal/rhythm', capability: 'rhythm.update' },
  { method: 'GET', path: '/api/insights', legacy: true },
  { method: 'GET', path: '/api/projects', capability: 'projects.list' },
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
  { method: 'POST', path: '/api/vault/sync', legacy: true },
  // /api/vault/sync/status: rebuilt natively in server.js (reshapes vault's
  // real onedrive.sync.status into the shape app.js's checkVaultLink()
  // expects) -- checked before this table is ever consulted, same pattern
  // as /api/state above, so it's not listed here even though the route exists.
  { method: 'POST', path: '/api/auth/logout', legacy: true },
  { method: 'GET', path: '/api/audit', legacy: true },   // audit-log viewing has no owner engine yet
  // Day-scheduling engine, ported into vault from isconl-agent's dev branch
  // (lib/blocks.js) -- genuinely owned by vault now, not proxied.
  { method: 'GET', path: '/api/time', capability: 'time.now' },
  { method: 'GET', path: '/api/blocks', capability: 'blocks.plan' },
  { method: 'POST', path: '/api/blocks', capability: 'blocks.save' },

  // -- not yet owned by any engine (tags, refs, orientation, chat, OneDrive browse, Buffer desk, Teams) --
  { method: 'GET', path: '/api/state', legacy: true },
  { method: 'POST', path: '/api/settings', legacy: true },
  { method: 'POST', path: '/api/m365/auth/start', capability: 'msgraph.auth.start' },
  { method: 'POST', path: '/api/m365/auth/poll', capability: 'msgraph.auth.poll' },
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
  { method: 'POST', path: '/api/chat', legacy: true },
  { method: 'GET', path: '/api/chat/stream', legacy: true },
  { method: 'POST', path: '/api/chat/thread/new', legacy: true },
  { method: 'POST', path: '/api/chat/thread/open', legacy: true },
  { method: 'GET', path: '/api/chat/threads', legacy: true },
  // File manager, rebuilt in full (2026-08-16) against vault's new
  // lib/onedrive-browse.js -- webconsole/static/app.js's frontend
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
  // NOT actually a gap -- the header comment above was built against legacy's
  // main branch. Teams (the team OS + standing narrator) shipped on legacy's
  // dev branch 8 Aug (a81a245) and is real. Proxying for now; circle is the
  // likely eventual owner (people-shaped) per MIGRATION-BRIEF.md section 7 --
  // that's a judgement call for ARCHITECT, not decided here.
  { method: 'GET', path: '/api/teams', legacy: true },
  // The rest of the Teams CRUD surface -- all JSON in/out, so the generic
  // legacy-JSON proxy above handles them unmodified. NOT included:
  // /api/teams/onepage (returns an HTML page, for an <iframe src>) and
  // /api/teams/export (returns an xlsx/csv file) -- both need a raw
  // byte passthrough this proxy doesn't have yet (engine-client.js's
  // raw() always calls res.json()), so the Report tab and the
  // sheet/csv/one-pager links are deliberately left off hub's Teams view
  // rather than proxied into something broken.
  { method: 'POST', path: '/api/teams/save', legacy: true },
  { method: 'POST', path: '/api/teams/member', legacy: true },
  { method: 'POST', path: '/api/teams/member/remove', legacy: true },
  { method: 'POST', path: '/api/teams/work', legacy: true },
  { method: 'POST', path: '/api/teams/work/move', legacy: true },
  { method: 'GET', path: '/api/apk/latest', legacy: true },   // real release history lives on the legacy monolith until hub gets its own APK distribution
];

function findRoute(method, pathname) {
  return ROUTES.find(r => r.method === method && r.path === pathname) || null;
}

module.exports = { ROUTES, findRoute };
