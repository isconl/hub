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
const manifest = require('../lib/manifest');

const PORT = parseInt(process.env.HUB_PORT || process.env.PORT || '8080', 10);
const BIND = process.env.HUB_BIND || '127.0.0.1';
const LOGS_DIR = process.env.HUB_LOGS_DIR || require('path').join(__dirname, '..', 'runtime', 'logs');
// `flutter build web`'s output, if it exists -- see lib/static.js. Absent by
// default (no HUB_WEB_DIR, no app/build/web) is a fully supported state:
// the static server just reports itself unavailable and every request
// behaves exactly as it does today.
const WEB_DIR = process.env.HUB_WEB_DIR || require('path').join(__dirname, '..', 'app', 'build', 'web');

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

/** Every non-public route needs EITHER the static HUB_TOKEN (service-to-service/admin) OR a real vault session (an end user, via authProxy.verify). */
async function checkAuth(req, authProxy) {
  const token = bearerToken(req);
  if (!token) return false;
  const staticToken = process.env.HUB_TOKEN || process.env.ISCONL_TOKEN || '';
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

  // The legacy monolith (Sconl/isconl-agent, currently isconl-agent.onrender.com)
  // -- the /api/* compat layer proxies here for anything a new engine doesn't
  // serve yet, so the already-installed Flutter app can point at hub with
  // zero rebuild and nothing breaks mid-migration. Optional: if unset, those
  // routes report a clear 502 instead of silently 404ing.
  const legacy = process.env.LEGACY_API_URL
    ? createEngineClient({ name: 'legacy', baseUrl: process.env.LEGACY_API_URL,
        getToken: () => process.env.LEGACY_TOKEN || secretStore.get('LEGACY_TOKEN') || '' })
    : null;

  const render = createRenderClient({ getApiKey: () => process.env.RENDER_API_KEY || secretStore.get('RENDER_API_KEY') || '', auditLog });
  // Render service name per engine defaults to the engine name itself
  // (matches the single-word-slug naming preference already established,
  // e.g. "scope.onrender.com") -- overridable per engine via env.
  const deploy = createDeployClient({
    render,
    serviceNameFor: (engineName) => process.env[`RENDER_SERVICE_${engineName.toUpperCase()}`] || engineName,
    auditLog,
  });

  const tokenConfigured = !!(process.env.HUB_TOKEN || process.env.ISCONL_TOKEN);
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
    if (pathname === '/auth/verify' && req.method === 'POST') {
      return sendJson(res, 200, await authProxy.verify(bearerToken(req)));
    }

    if (!(await checkAuth(req, authProxy))) return sendJson(res, 404, { error: 'Not Found' });

    try {
      if (pathname === '/engines' && req.method === 'GET') {
        return sendJson(res, 200, { engines: await registry.healthAll() });
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

        if (route.gap) {
          return sendJson(res, 501, { error: 'Not implemented -- this route has no working backend today, on the legacy monolith or any new engine (pre-existing gap, not a migration regression).' });
        }

        const bodyText = await readBody(req);
        const body = bodyText ? JSON.parse(bodyText) : undefined;
        const query = Object.fromEntries(url.searchParams);

        if (route.legacy) {
          if (!legacy) return sendJson(res, 502, { error: 'Legacy backend not configured on this hub (LEGACY_API_URL unset)' });
          const qs = new URLSearchParams(query).toString();
          const r = await legacy.raw(req.method, pathname + (qs ? `?${qs}` : ''), body, { token: bearerToken(req) || undefined });
          return sendJson(res, r.status, r.data);
        }

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
