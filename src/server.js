#!/usr/bin/env node
'use strict';
/**
 * hub -- the single entry point (Decision 003). Same boot sequence/style as
 * every spoke engine, but hub owns no vault data of its own: it's a
 * registry + router + auth-delegate + deploy-control sitting in front of
 * vault/pulse/scope/circle/spark.
 */

const http = require('http');
const secretStore = require('../lib/secrets');
const { createAuditLog } = require('../lib/audit');
const { createEngineClient } = require('../lib/engine-client');
const { createRegistry } = require('../lib/registry');
const { createRouter } = require('../lib/router');
const { createAuthProxy } = require('../lib/auth-proxy');
const { createRenderClient } = require('../lib/render');
const { createDeployClient } = require('../lib/deploy');
const { findRoute } = require('../lib/api-compat');
const { createStaticServer } = require('../lib/static');
const servicesRegistry = require('../lib/services-registry');
const manifest = require('../lib/manifest');

const PORT = parseInt(process.env.HUB_PORT || process.env.PORT || '8080', 10);
const BIND = process.env.HUB_BIND || '127.0.0.1';
const LOGS_DIR = process.env.HUB_LOGS_DIR || require('path').join(__dirname, '..', 'runtime', 'logs');
// webconsole/ -- the real web frontend, native HTML/CSS/JS ported from the
// legacy dashboard and wired to hub's own API (see lib/static.js). This
// replaced the Flutter-web build as the default: Flutter-compiled-to-web
// carried its own runtime (CanvasKit) and didn't feel like a web page.
// Absent (no HUB_WEB_DIR, no webconsole/) is still a fully supported state
// -- the static server just reports itself unavailable and every request
// behaves exactly as it does today (API only).
const WEB_DIR = process.env.HUB_WEB_DIR || require('path').join(__dirname, '..', 'webconsole');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

/**
 * Presence-based service connectivity for the dashboard/Settings badges --
 * built from vault's secrets.status KEY NAMES only (never values, matching
 * the standing rule: secret values are never read into hub's own output).
 * A key existing in Bitwarden means "configured", not "verified reachable"
 * -- the legacy monolith's getServiceStatus() made real API calls to some
 * of these; this doesn't (yet). host/email/tenantId/model/chatId are left
 * blank rather than fetched, since that needs a NEW vault capability that
 * distinguishes non-sensitive config fields from actual secrets -- real
 * follow-up work, not done here.
 */
function shapeServices(keys) {
  const has = (...names) => names.every(n => keys.includes(n));
  const one = (name) => keys.includes(name);
  const flag = (ok) => (ok ? 'connected' : 'not_connected');
  return {
    anthropic: flag(one('ANTHROPIC_API_KEY')),
    groq: flag(one('ISCONL_GROQ_API_KEY')),
    elevenlabs: flag(one('ELEVENLABS_API_KEY')),
    github: flag(one('ISCONL_GITHUB_TOKEN')),
    jira: flag(has('JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN')),
    whatsapp: flag(one('WA_VERIFY_TOKEN')),
    msgraph: flag(has('MSGRAPH_CLIENT_ID', 'MSGRAPH_REFRESH_TOKEN')),
    buffer: flag(one('BUFFER_API_KEY_SCONL')),
    telegram: flag(has('ISCONL_TELEGRAM_BOT_TOKEN', 'ISCONL_TELEGRAM_CHAT_ID')),
    signal: 'not_connected',
    jiraConfig: { hasToken: one('JIRA_API_TOKEN'), host: '', projectKey: '', email: '' },
    groqConfig: {},
    msConfig: { hasCreds: has('MSGRAPH_CLIENT_ID', 'MSGRAPH_REFRESH_TOKEN'), tenantId: '' },
    bufferConfig: { hasToken: one('BUFFER_API_KEY_SCONL') },
    anthropicConfig: { model: '' },
    telegramConfig: { chatId: '' },
  };
}

/** Flat space/spaces.tsv rows (ID, PARENT_ID, ...) -> the nested tree
 *  webconsole/static/app.js's renderSpaces() walks. A row with no PARENT_ID
 *  or an unresolvable one becomes a root -- degrades gracefully rather than
 *  dropping the row, since a dangling PARENT_ID (a typo, or a parent
 *  deleted without reparenting its children) shouldn't make a whole
 *  sub-tree vanish from the UI silently. */
function buildSpacesTree(rows) {
  const byId = new Map();
  for (const r of rows) byId.set(r.ID, { ...r, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.PARENT_ID && node.PARENT_ID !== '-' ? byId.get(node.PARENT_ID) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  function countDescendants(node) {
    let count = node.children.length;
    for (const child of node.children) count += countDescendants(child);
    node.descendantCount = count;
    return count;
  }
  for (const root of roots) countDescendants(root);
  return roots;
}

/** Every non-public route needs EITHER the static HUB_TOKEN (service-to-service/admin) OR a real vault session (an end user, via authProxy.verify). */
async function checkAuth(req, authProxy) {
  const token = bearerToken(req);
  if (!token) return false;
  const staticToken = process.env.HUB_TOKEN || process.env.ISCONL_TOKEN || secretStore.get('HUB_TOKEN') || '';
  if (staticToken && token.length === staticToken.length && token === staticToken) return true;
  const v = await authProxy.verify(token);
  return !!v.valid;
}

async function main() {
  const secretsResult = await secretStore.init();
  console.log(`  secrets: ${secretsResult.source}, ${secretsResult.count} key(s)`);

  const auditLog = createAuditLog({ logsDir: LOGS_DIR });

  // Each spoke engine's URL/token is configuration -- no hardcoded
  // addresses, so this same code runs against local dev ports, Docker
  // Compose service names, or real Render/Oracle URLs unchanged.
  const engineDefs = {
    vault: { url: process.env.VAULT_URL, token: () => process.env.VAULT_TOKEN || secretStore.get('VAULT_TOKEN') || '' },
    pulse: { url: process.env.PULSE_URL, token: () => process.env.PULSE_TOKEN || secretStore.get('PULSE_TOKEN') || '' },
    scope: { url: process.env.SCOPE_URL, token: () => process.env.SCOPE_TOKEN || secretStore.get('SCOPE_TOKEN') || '' },
    circle: { url: process.env.CIRCLE_URL, token: () => process.env.CIRCLE_TOKEN || secretStore.get('CIRCLE_TOKEN') || '' },
    spark: { url: process.env.SPARK_URL, token: () => process.env.SPARK_TOKEN || secretStore.get('SPARK_TOKEN') || '' },
  };
  const engines = {};
  for (const [name, def] of Object.entries(engineDefs)) {
    if (!def.url) { auditLog.log('engine_not_configured', { engine: name }); continue; }
    engines[name] = createEngineClient({ name, baseUrl: def.url, getToken: def.token });
  }
  if (!engines.vault) {
    console.error('  REFUSING TO START: VAULT_URL is not configured -- hub has no auth authority without vault.');
    process.exit(1);
  }

  const registry = createRegistry({ engines, auditLog });
  const router = createRouter({ registry, engines, auditLog });
  const authProxy = createAuthProxy({ vault: engines.vault });

  // The legacy monolith (Sconl/isconl-agent) is retired -- deleted locally
  // 2026-08-15, no longer deployed anywhere. hub is self-contained now:
  // everything routes to its own engines (vault/pulse/scope/circle/spark)
  // or nothing at all. Routes still marked `legacy: true` in api-compat.js
  // (the already-installed Flutter app's compat surface) fail cleanly below
  // instead of proxying anywhere -- migrate each one to a real engine to
  // bring it back, don't reintroduce a legacy client to paper over the gap.

  const render = createRenderClient({ getApiKey: () => process.env.RENDER_API_KEY || secretStore.get('RENDER_API_KEY') || '', auditLog });
  // Render service name per engine defaults to the engine name itself
  // (matches the single-word-slug naming preference already established,
  // e.g. "scope.onrender.com") -- overridable per engine via env.
  const deploy = createDeployClient({
    render,
    serviceNameFor: (engineName) => process.env[`RENDER_SERVICE_${engineName.toUpperCase()}`] || engineName,
    auditLog,
  });

  const tokenConfigured = !!(process.env.HUB_TOKEN || process.env.ISCONL_TOKEN || secretStore.get('HUB_TOKEN'));
  const isLoopback = ['127.0.0.1', '::1', 'localhost'].includes(BIND);
  if (!isLoopback && !tokenConfigured) {
    console.error('  REFUSING TO BIND: no HUB_TOKEN/ISCONL_TOKEN configured and BIND is not loopback.');
    process.exit(1);
  }

  const staticServer = createStaticServer({ webDir: WEB_DIR });
  console.log(`  web console: ${staticServer.available ? `serving ${WEB_DIR}` : 'not built (no app/build/web) -- API only'}`);

  const server = http.createServer(async (req, res) => {
    // Everything below can throw on malformed input (a bare `//` path makes
    // `new URL` throw ERR_INVALID_URL, for one) -- this handler runs inside
    // an async function passed to http.createServer, so an uncaught throw
    // here becomes an unhandled promise rejection, which crashes the whole
    // process, not just this request (reproduced in production: one scanner
    // probe with a `//` path took the entire service down until Render
    // auto-restarted it). One outer catch is the actual fix; the inner catch
    // around the authenticated routes stays for its own error shape.
    try {
      return await handleRequest(req, res);
    } catch (e) {
      return sendJson(res, 400, { error: 'Bad Request', detail: String(e.message || e) });
    }
  });

  async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (pathname === '/health' && req.method === 'GET') {
      return sendJson(res, 200, { status: 'ok', engine: 'hub', version: manifest.version });
    }
    // The web console's own static assets (index.html, main.dart.js, wasm,
    // fonts...) are public by construction: a browser has to load the page
    // before it can even show a login form to obtain a token. Tried before
    // every other route, including '/' below, which becomes its fallback --
    // see lib/static.js's own header for why this can never shadow the API.
    if (await staticServer.maybeServe(req, pathname, res)) return;
    // The bare root has no API meaning of its own -- it exists so a human
    // opening the URL directly (in a browser, sanity-checking a deploy)
    // sees a real status line instead of a bare {"error":"Not Found"},
    // which reads as "the whole thing is broken" even when every engine is
    // healthy. Not a route the app or any client should ever call. Only
    // reachable when no web console is built (staticServer.available is
    // false), since the branch above already claims '/' otherwise.
    if (pathname === '/' && req.method === 'GET') {
      return sendJson(res, 200, {
        engine: 'hub', status: 'ok', version: manifest.version,
        note: 'This is the isconl hub API, not a web page. See /health, /manifest, or /engines (authenticated).',
      });
    }
    if (pathname === '/manifest' && req.method === 'GET') {
      try {
        const { capabilities, down } = await registry.list();
        return sendJson(res, 200, { ...manifest, aggregated: { capabilities: [...manifest.capabilities, ...capabilities], down } });
      } catch (e) {
        return sendJson(res, 200, manifest);   // hub's own manifest still answers even if every spoke is down
      }
    }
    // Login is public -- it IS the auth, same reasoning as vault's own /auth/* routes.
    // The /api/-prefixed aliases exist ONLY because the already-installed Flutter
    // app calls those literal paths (see lib/api-compat.js's header comment) --
    // same handler either way, not a second login implementation.
    if ((pathname === '/auth/methods' || pathname === '/api/auth/methods') && req.method === 'GET') {
      const r = await authProxy.methods();
      return sendJson(res, r.status, r.data);
    }
    if ((pathname === '/auth/totp' || pathname === '/api/auth/totp') && req.method === 'POST') {
      const r = await authProxy.totp(JSON.parse(await readBody(req) || '{}'));
      return sendJson(res, r.status, r.data);
    }
    if ((pathname === '/auth/pin' || pathname === '/api/auth/pin') && req.method === 'POST') {
      const r = await authProxy.pin(JSON.parse(await readBody(req) || '{}'));
      return sendJson(res, r.status, r.data);
    }
    // Aliased under /api/ too so the console's fetch wrapper (which only
    // auto-attaches the bearer token to /api/* and /health) can call this
    // directly for "is my session valid" without depending on any
    // legacy-proxied, backend-specific route like /api/state -- see
    // ensureAuthenticated() in app.js for why that distinction matters.
    if ((pathname === '/auth/verify' || pathname === '/api/auth/verify') && req.method === 'POST') {
      return sendJson(res, 200, await authProxy.verify(bearerToken(req)));
    }

    if (!(await checkAuth(req, authProxy))) return sendJson(res, 404, { error: 'Not Found' });

    try {
      // Settings: reset/update the quick-PIN. Forwards the CALLER's own
      // bearer token (not hub's own, if it even has one) -- vault's
      // /auth/set-pin re-checks it independently, same trust boundary as
      // /auth/verify above. checkAuth just gated entry to this whole block,
      // so the token is already known-valid, but authorization for THIS
      // specific write still comes from vault, not from hub asserting it.
      if ((pathname === '/auth/set-pin' || pathname === '/api/auth/set-pin') && req.method === 'POST') {
        let newPin = '';
        try { newPin = JSON.parse(await readBody(req) || '{}').pin || ''; } catch {}
        const r = await authProxy.setPin(bearerToken(req), newPin);
        return sendJson(res, r.status, r.data);
      }

      // The main dashboard payload. Used to be a single legacy-monolith
      // route; rebuilt natively by composing capabilities that already
      // exist on today's engines -- inbox has no owning engine yet
      // (circle only exposes add/update/delete, no list), so it's read
      // straight off vault's generic vault.read rather than waiting on a
      // new circle capability. spaces is the same story: no owning engine,
      // read straight from vault's space/spaces.tsv collection. Both are
      // real engine-owned data today, just not wrapped in a dedicated
      // capability yet -- reading them via vault.read is not a workaround,
      // it's the same access path circle itself uses internally.
      // Reshapes vault's real onedrive.sync.status ({running, lastResult:
      // {ok:[...], failed:[...], startedAt, finishedAt}}) into the shape
      // webconsole/static/app.js's checkVaultLink() already expects
      // ({onedrive, status, error}) -- that shape predates this route
      // existing (it was written against the legacy monolith's own
      // /api/vault/sync/status), so the choice is reshape-at-the-edge here
      // vs. rewrite the frontend; reshaping is one function, matches
      // /api/state's own precedent just below, and keeps app.js's contract
      // stable for the real Flutter app which calls this same path.
      if (pathname === '/api/vault/sync/status' && req.method === 'GET') {
        const r = await router.route('onedrive.sync.status', {});
        if (!r.ok) return sendJson(res, 200, { onedrive: false, status: 'offline', error: r.error || 'vault unreachable' });
        const lr = r.data && r.data.lastResult;
        if (!lr) return sendJson(res, 200, { onedrive: true, status: r.data.running ? 'syncing' : 'idle' });
        const failed = lr.failed || [];
        if (failed.length > 0) {
          return sendJson(res, 200, { onedrive: true, status: 'offline', error: `${failed.length} collection(s) failed: ${failed[0].collection} (${failed[0].error || 'unknown error'})` });
        }
        return sendJson(res, 200, { onedrive: true, status: 'ok', lastSyncedAt: lr.finishedAt, collectionsSynced: lr.ok.length });
      }

      // File manager delete/move: reshape vault's {ok, error} into the
      // {success, error} shape the frontend's fmDeleteItem/fmRenameItem/
      // fmMoveItem already check (webconsole/static/app.js) -- inherited
      // from the legacy monolith's own contract, kept rather than editing
      // three already-built frontend functions.
      if (pathname === '/api/onedrive/delete' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const r = await router.route('onedrive.browse.delete', { body: { itemId: body.itemId } });
        return sendJson(res, r.status || (r.ok ? 200 : 502), { success: !!(r.ok && r.data && r.data.ok), error: r.ok ? (r.data && r.data.error) : r.error });
      }
      if (pathname === '/api/onedrive/move' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        const r = await router.route('onedrive.browse.move', { body });
        return sendJson(res, r.status || (r.ok ? 200 : 502), { success: !!(r.ok && r.data && r.data.ok), error: r.ok ? (r.data && r.data.error) : r.error });
      }

      // Download/raw: not JSON -- a 302 to Graph's own pre-signed
      // downloadUrl (item.@microsoft.graph.downloadUrl, promoted by
      // onedrive-browse.js to plain `downloadUrl`). Sidesteps needing a
      // raw-byte-passthrough path through hub (engine-client.js's raw()
      // always calls res.json() -- the same gap that left Teams'
      // onepage/export routes unbuilt, per api-compat.js's own comment).
      // The signed URL is time-limited (~1hr) and needs no Authorization
      // header of ours, so a redirect is both simpler and correct here.
      if ((pathname === '/api/onedrive/download' || pathname === '/api/onedrive/raw') && req.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!id) return sendJson(res, 400, { error: 'id query param required' });
        const r = await router.route('onedrive.browse.item', { query: { id } });
        if (!r.ok || !r.data || !r.data.ok || !r.data.item || !r.data.item.downloadUrl) {
          return sendJson(res, 502, { error: (r.data && r.data.error) || r.error || 'no download URL available for this item' });
        }
        res.writeHead(302, { Location: r.data.item.downloadUrl });
        return res.end();
      }

      // Reshapes vault's onThisDay ({date, entries, world, card}) into the
      // {insights:{calendar:{title,category,text,tone}}} shape
      // webconsole/static/app.js's SPACE_INSIGHTS/fetchInsights() already
      // expects -- replaces pulse's hardcoded 1971 placeholder with the
      // real thing (personal record first, world history fallback).
      // title maps to c.event (the bold headline, "what actually happened")
      // and text to c.explain (the description below it) -- vault's card
      // deliberately carries these as two separate fields for exactly this
      // reason ("the bold line is the event itself, the line under it is a
      // brief explanation" -- legacy's own onThisDay comment); the static
      // c.title ("On this day") belongs in neither slot.
      if (pathname === '/api/insights' && req.method === 'GET') {
        const r = await router.route('onthisday', {});
        if (!r.ok || !r.data || !r.data.card) return sendJson(res, 200, { insights: {} });
        const c = r.data.card;
        // The bold headline is a title, not the whole sentence -- a
        // Wikipedia-length EVENT read as a run-on. Capped to 10 words; the
        // full event text isn't lost, just moved into the description
        // alongside the explanation, so nothing the corpus said disappears.
        const eventFull = String(c.event || '').trim();
        const words = eventFull.split(/\s+/);
        const title = words.length > 10 ? words.slice(0, 10).join(' ') + '…' : eventFull;
        const text = words.length > 10 ? [eventFull, c.explain].filter(Boolean).join(' ') : c.explain;
        return sendJson(res, 200, { insights: { calendar: { title, category: c.category, text, tone: c.tone } } });
      }

      // Spaces (axial tree): api-compat.js used to mark this `legacy: true`,
      // meaning it always 501'd -- the legacy monolith it pointed at was
      // deleted 2026-08-15, so webconsole/static/app.js's fetchSpaces() has
      // been failing silently (caught in its own try/catch) ever since,
      // leaving renderSpaces() stuck on "Loading spaces…" forever. Found
      // and fixed 17 Aug while wiring the Writer space in under it. Same
      // data source /api/state already reads (vault's flat space/spaces.tsv
      // collection, PARENT_ID-linked rows) -- this route is the missing
      // piece that turns those flat rows into the nested tree
      // STATE.spacesTree/renderSpaces() actually expects.
      if (pathname === '/api/spaces' && req.method === 'GET') {
        const r = await router.route('vault.read', { params: { collection: 'space/spaces.tsv' } });
        const rows = r.ok ? (r.data.rows || []) : [];
        return sendJson(res, 200, { tree: buildSpacesTree(rows), spaces: rows });
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const [timeR, tasksR, inboxR, ideasR, spacesR, secretsR] = await Promise.all([
          router.route('time.now', {}),
          router.route('tasks.list', {}),
          router.route('vault.read', { params: { collection: 'scope/inbox.tsv' } }),
          router.route('ideas.list', {}),
          router.route('vault.read', { params: { collection: 'space/spaces.tsv' } }),
          router.route('secrets.status', {}),
        ]);
        const inboxRows = inboxR.ok ? (inboxR.data.rows || []) : [];
        return sendJson(res, 200, {
          time: timeR.ok ? timeR.data : null,
          tasks: tasksR.ok ? (tasksR.data.tasks || []) : [],
          inbox_count: inboxRows.filter(i => i.STATUS === 'new').length,
          ideas_count: ideasR.ok ? (ideasR.data.ideas || []).length : 0,
          spaces: spacesR.ok ? (spacesR.data.rows || []) : [],
          services: shapeServices(secretsR.ok ? (secretsR.data.keys || []) : []),
          feed: inboxRows.slice().reverse(),
        });
      }

      if (pathname === '/engines' && req.method === 'GET') {
        return sendJson(res, 200, { engines: await registry.healthAll() });
      }

      // Every named service the owner runs, isconl and otherwise -- the
      // future "Services" panel's data source. Read-only: enriches the
      // static catalogue with live status where it's cheap to get (engine
      // health already computed for /engines, Render suspension state from
      // the same render client /deploy/:engine already uses), degrades to
      // the bare catalogue entry if a lookup fails rather than 500ing.
      if (pathname === '/services' && req.method === 'GET') {
        const base = servicesRegistry.list();
        const [engineHealth, renderServices] = await Promise.all([
          registry.healthAll().catch(() => []),
          render.listServices().catch(() => []),
        ]);
        const engineUp = Object.fromEntries((engineHealth || []).map(e => [e.engine, e.up]));
        const renderByName = Object.fromEntries((renderServices || []).map(s => [s.name, s]));
        const enriched = base.map(s => {
          if (s.kind === 'engine') {
            return { ...s, configured: !!engines[s.name], up: engineUp[s.name] ?? null };
          }
          if (s.provider === 'render' && s.renderService) {
            const r = renderByName[s.renderService];
            return { ...s, found: !!r, suspended: r ? r.suspended : null, suspenders: r ? r.suspenders : null };
          }
          return s;
        });
        return sendJson(res, 200, { services: enriched });
      }

      if (pathname === '/call' && req.method === 'POST') {
        const p = JSON.parse(await readBody(req) || '{}');
        if (!p.capability) return sendJson(res, 400, { ok: false, error: 'capability required' });
        const r = await router.route(p.capability, { params: p.params, query: p.query, body: p.body });
        return sendJson(res, r.status || (r.ok ? 200 : 502), r);
      }

      // -- /api/* compatibility layer for the real, already-signed Flutter app --
      if (pathname.startsWith('/api/')) {
        const route = findRoute(req.method, pathname);
        if (!route) return sendJson(res, 404, { error: 'Not Found' });

        // route.gap: pre-existing, never had a backend anywhere.
        // route.rawProxy / route.legacy: USED to proxy to the retired legacy
        // monolith (deleted 2026-08-15) -- hub is self-contained now, so
        // these fail the same clean way rather than reaching for a client
        // that no longer exists. Migrate the route to a real engine to
        // bring the feature back; don't reintroduce a legacy proxy here.
        if (route.gap || route.rawProxy || route.legacy) {
          return sendJson(res, 501, { error: 'Not implemented -- no engine serves this route yet (legacy monolith retired 2026-08-15).' });
        }

        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : undefined;
        const query = Object.fromEntries(url.searchParams);

        // route.capability: reshape query -> params per paramFromQuery, then route deterministically.
        let params;
        if (route.paramFromQuery) {
          params = {};
          for (const [paramKey, queryKey] of Object.entries(route.paramFromQuery)) {
            params[paramKey] = query[queryKey];
            delete query[queryKey];
          }
        }
        const r = await router.route(route.capability, { params, query, body });
        return sendJson(res, r.status || (r.ok ? 200 : 502), r.data !== undefined ? r.data : r);
      }

      if (pathname === '/act' && req.method === 'POST') {
        if (!engines.spark) return sendJson(res, 502, { understood: false, error: 'spark is not configured on this hub' });
        const p = JSON.parse(await readBody(req) || '{}');
        const r = await engines.spark.call('POST', '/act', { body: p });
        return sendJson(res, r.status, r.data);
      }

      if (pathname.startsWith('/deploy/') && req.method === 'POST') {
        const engineName = decodeURIComponent(pathname.slice('/deploy/'.length));
        const p = JSON.parse(await readBody(req) || '{}');
        const r = await deploy.redeploy(engineName, { clearCache: !!p.clearCache });
        return sendJson(res, r.ok ? 200 : 502, r);
      }
    } catch (e) {
      return sendJson(res, 400, { success: false, error: String(e.message || e) });
    }

    return sendJson(res, 404, { error: 'Not Found' });
  }

  return new Promise((resolve) => {
    server.listen(PORT, BIND, () => {
      const actualPort = server.address().port;
      console.log(`  hub listening on ${BIND}:${actualPort}, engines: ${Object.keys(engines).join(', ') || 'none'}`);
      resolve({ server, engines, registry, router, authProxy, deploy, render, auditLog, secretStore, port: actualPort });
    });
  });
}

if (require.main === module) {
  main().catch(e => { console.error('hub failed to start:', e); process.exit(1); });
}

module.exports = { main };
