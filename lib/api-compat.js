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
 * in the app branch, 2026-08-09), not guessed. Five paths the app calls
 * (`/api/teams`, `/api/ingest/sms`, `/api/finance/messages/commit`,
 * `/api/learning/manifest`, `/api/learning/narrate`) exist on NEITHER the
 * legacy monolith NOR any new engine -- confirmed by diffing the app
 * branch's own tree against main's server.js (the app branch carries no
 * server.js at all). These are pre-existing dead client calls, already
 * broken against the live backend today; the migration doesn't regress
 * them, and fixing them is out of scope for this pass.
 */

// method + path (as the Dart client calls it) -> where it goes.
// `capability` entries route through hub's own capability router.
// `legacy` entries proxy verbatim to the configured legacy backend.
// `gap` entries are the 5 confirmed dead-ends above.
const ROUTES = [
  // -- spark: act, ideas, learning, articles --
  { method: 'POST', path: '/api/act', capability: 'act' },
  { method: 'GET', path: '/api/ideas', capability: 'ideas.list' },
  { method: 'POST', path: '/api/ideas/add', capability: 'ideas.add' },
  { method: 'POST', path: '/api/ideas/update', capability: 'ideas.update' },
  { method: 'GET', path: '/api/learning', capability: 'learning.courses' },
  { method: 'GET', path: '/api/learning/lesson', capability: 'learning.lesson' },
  { method: 'GET', path: '/api/learning/notes', capability: 'learning.note.get' },
  { method: 'POST', path: '/api/learning/notes', capability: 'learning.note.save' },
  { method: 'POST', path: '/api/learning/resume', capability: 'learning.resume' },
  { method: 'POST', path: '/api/learning/progress', capability: 'learning.progress' },
  { method: 'GET', path: '/api/articles/list', capability: 'articles.list' },
  { method: 'GET', path: '/api/learning/manifest', gap: true },
  { method: 'POST', path: '/api/learning/narrate', gap: true },

  // -- scope: tasks, jira gate, decisions --
  { method: 'GET', path: '/api/tasks', capability: 'tasks.list' },
  { method: 'GET', path: '/api/tasks/detail', capability: 'tasks.get', paramFromQuery: { id: 'taskId' } },
  { method: 'POST', path: '/api/tasks/update', capability: 'tasks.update' },
  { method: 'POST', path: '/api/tasks/delete', capability: 'tasks.delete' },
  { method: 'POST', path: '/api/tasks/done', capability: 'tasks.complete' },
  { method: 'GET', path: '/api/decisions', capability: 'decisions.list' },
  { method: 'POST', path: '/api/decisions/update', capability: 'decisions.update' },
  { method: 'POST', path: '/api/tasks/brief', legacy: true },   // AI-dependent, not yet in scope -- proxy for now
  { method: 'POST', path: '/api/tasks/draft', legacy: true },
  { method: 'GET', path: '/api/jira/issues', legacy: true },     // scope has preview/push, not a bare issue list yet
  { method: 'POST', path: '/api/jira/transition', legacy: true },
  { method: 'GET', path: '/api/jira/assignable', legacy: true },
  { method: 'POST', path: '/api/jira/assign', legacy: true },
  { method: 'POST', path: '/api/jira/delete', legacy: true },
  { method: 'POST', path: '/api/jira/clear', legacy: true },
  { method: 'GET', path: '/api/jira/permissions', legacy: true },
  { method: 'GET', path: '/api/plans', legacy: true },           // planning/horizon deferred, task #14
  { method: 'POST', path: '/api/plans/add', legacy: true },

  // -- circle: people, touch, dia, inbox, journal --
  { method: 'GET', path: '/api/circle', capability: 'circle.people.list' },
  { method: 'POST', path: '/api/circle/touch', capability: 'circle.touch' },
  { method: 'GET', path: '/api/circle/dia', capability: 'circle.dia.get' },
  { method: 'POST', path: '/api/inbox/add', capability: 'inbox.add' },
  { method: 'POST', path: '/api/inbox/update', capability: 'inbox.update' },
  { method: 'GET', path: '/api/journal', capability: 'journal.list' },
  { method: 'POST', path: '/api/journal/add', capability: 'journal.add' },

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
  { method: 'GET', path: '/api/insights', capability: 'insights.get' },
  { method: 'GET', path: '/api/projects', capability: 'projects.list' },
  { method: 'GET', path: '/api/github/snapshot', legacy: true },   // pulse has github.contributions, "snapshot" is a richer legacy shape -- proxy for now
  { method: 'GET', path: '/api/finance/summary', capability: 'finance.summary' },
  { method: 'GET', path: '/api/ventures', legacy: true },          // pulse only exposes ventures via /projects today
  { method: 'POST', path: '/api/finance/tx', legacy: true },
  { method: 'GET', path: '/api/finance/wishlist', legacy: true },
  { method: 'POST', path: '/api/finance/receipt', legacy: true },  // AI extraction, spark's future job
  { method: 'POST', path: '/api/finance/messages/commit', gap: true },
  { method: 'POST', path: '/api/ingest/sms', gap: true },

  // -- vault: /api/auth/totp, /api/auth/pin, and /api/auth/methods are handled
  // directly in server.js (public, same handler as hub's own /auth/* routes)
  // -- not routed through this table, since login can't require auth.
  { method: 'POST', path: '/api/vault/sync', legacy: true },
  { method: 'GET', path: '/api/vault/sync/status', legacy: true },
  { method: 'POST', path: '/api/auth/logout', legacy: true },
  { method: 'GET', path: '/api/audit', legacy: true },   // audit-log viewing has no owner engine yet
  // Day-scheduling engine, ported into vault from isconl-agent's dev branch
  // (lib/blocks.js) -- genuinely owned by vault now, not proxied.
  { method: 'GET', path: '/api/time', capability: 'time.now' },
  { method: 'GET', path: '/api/blocks', capability: 'blocks.plan' },
  { method: 'POST', path: '/api/blocks', capability: 'blocks.save' },

  // -- not yet owned by any engine (Spaces/Axial-tree, tags, refs, orientation, chat, OneDrive browse, Buffer desk, Teams) --
  { method: 'GET', path: '/api/state', legacy: true },
  { method: 'POST', path: '/api/settings', legacy: true },
  { method: 'POST', path: '/api/m365/auth/start', legacy: true },
  { method: 'POST', path: '/api/m365/auth/poll', legacy: true },
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
  { method: 'GET', path: '/api/onedrive/list', legacy: true },
  { method: 'GET', path: '/api/onedrive/preview', legacy: true },
  { method: 'GET', path: '/api/buffer/desk', legacy: true },
  { method: 'POST', path: '/api/buffer/post', legacy: true },
  { method: 'POST', path: '/api/buffer/post/manage', legacy: true },
  { method: 'POST', path: '/api/buffer/channel/pause', legacy: true },
  { method: 'GET', path: '/api/teams', gap: true },
  { method: 'GET', path: '/api/apk/latest', legacy: true },   // real release history lives on the legacy monolith until hub gets its own APK distribution
];

function findRoute(method, pathname) {
  return ROUTES.find(r => r.method === method && r.path === pathname) || null;
}

module.exports = { ROUTES, findRoute };
