'use strict';
/**
 * End-to-end smoke tests: start hub's real HTTP server, in front of small
 * FAKE vault/scope/spark HTTP servers (real http.createServer, not
 * function mocks) -- proves hub's registry/router/auth-proxy/deploy are
 * correctly wired together over the wire, same purpose as every other
 * engine's own server.test.js. Fakes, not the real sibling repos: hub's
 * test suite should not need scope/spark installed as dependencies to
 * prove hub's OWN wiring is correct.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function startFakeEngine({ name, manifestCapabilities = [], routes = {} }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { status: 'ok', engine: name });
      if (url.pathname === '/manifest' && req.method === 'GET') return send(200, { engine: name, capabilities: manifestCapabilities });
      const key = `${req.method} ${url.pathname}`;
      const handler = routes[key];
      if (handler) return send(...handler(JSON.parse(body || '{}'), req, url));
      return send(404, { error: 'Not Found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function startHub(fakes, envOverrides = {}) {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-logs-'));
  const savedEnv = { ...process.env };
  // Assigning `undefined` via Object.assign stringifies to "undefined" on
  // process.env (a truthy string!) rather than unsetting it -- delete first.
  delete process.env.SCOPE_URL;
  delete process.env.SPARK_URL;
  Object.assign(process.env, {
    HUB_PORT: '0', HUB_BIND: '127.0.0.1', HUB_TOKEN: 'test-static-token',
    HUB_LOGS_DIR: logsDir, BWS_ACCESS_TOKEN: '',
    // Explicit empty override, not a delete -- lib/secrets.js's get()
    // treats this hasOwnProperty'd '' as authoritative and never falls
    // through to a real RENDER_API_KEY sitting in this machine's own
    // environment (FI26082701: the "GET /services" test's
    // `byName.keyvanos.found === false` assertion assumes no real key is
    // configured, which isn't actually guaranteed without this).
    RENDER_API_KEY: '',
    VAULT_URL: `http://127.0.0.1:${fakes.vault.port}`,
    ...(fakes.scope ? { SCOPE_URL: `http://127.0.0.1:${fakes.scope.port}` } : {}),
    ...(fakes.spark ? { SPARK_URL: `http://127.0.0.1:${fakes.spark.port}` } : {}),
    ...envOverrides,
  });
  delete require.cache[require.resolve('../src/server')];
  const { main } = require('../src/server');
  const handle = await main();
  const cleanup = () => {
    Object.keys(process.env).forEach(k => { if (!(k in savedEnv)) delete process.env[k]; });
    Object.assign(process.env, savedEnv);
  };
  return { ...handle, cleanup };
}

test('GET /health responds without auth', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal((await res.json()).engine, 'hub');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('GET /manifest aggregates hub\'s own capabilities with every configured spoke\'s, and degrades gracefully when a spoke is down', async () => {
  const vault = await startFakeEngine({ name: 'vault', manifestCapabilities: [{ name: 'vault.read', method: 'GET', path: '/vault/:collection' }] });
  const { server, port, cleanup } = await startHub({ vault }, { SCOPE_URL: 'http://127.0.0.1:1' });   // nothing listening there
  try {
    const res = await fetch(`http://127.0.0.1:${port}/manifest`);
    const body = await res.json();
    assert.ok(body.aggregated.capabilities.some(c => c.name === 'vault.read'));
    assert.ok(body.aggregated.capabilities.some(c => c.name === 'hub.call'));
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a protected route with no credential fails closed (silent 404)', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/engines`);
    assert.equal(res.status, 404);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('the static HUB_TOKEN authenticates a request without needing a vault session', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/engines`, { headers: { Authorization: 'Bearer test-static-token' } });
    assert.equal(res.status, 200);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a real vault session token (verified via vault\'s /auth/verify) also authenticates -- not just the static token', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'POST /auth/verify': () => [200, { valid: true, via: 'totp' }],
  } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/engines`, { headers: { Authorization: 'Bearer some-real-session-token' } });
    assert.equal(res.status, 200);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('POST /auth/totp is public and proxies straight through to vault', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'POST /auth/totp': (body) => [200, { success: true, token: 'sess-1', received: body.code }],
  } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/auth/totp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '123456' }) });
    const body = await res.json();
    assert.equal(body.token, 'sess-1');
    assert.equal(body.received, '123456');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('GET /auth/methods is public and reports what vault actually has configured', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'GET /auth/methods': () => [200, { totp: true, pin: false }],
  } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/auth/methods`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { totp: true, pin: false });
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('POST /call routes a capability to its owning engine, deterministically, no model involved', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const scope = await startFakeEngine({ name: 'scope',
    manifestCapabilities: [{ name: 'tasks.create', method: 'POST', path: '/tasks' }],
    routes: { 'POST /tasks': (body) => [201, { task: { ID: 'T1', TITLE: body.title } }] },
  });
  const { server, port, cleanup } = await startHub({ vault, scope });
  const auth = { Authorization: 'Bearer test-static-token', 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/call`, { method: 'POST', headers: auth,
      body: JSON.stringify({ capability: 'tasks.create', body: { title: 'Ship it' } }) });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.task.TITLE, 'Ship it');
    assert.equal(body.engine, 'scope');
    assert.ok(body.traceId);
  } finally { server.close(); vault.server.close(); scope.server.close(); cleanup(); }
});

test('POST /call returns 404 for an unknown capability instead of guessing an engine', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token', 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/call`, { method: 'POST', headers: auth, body: JSON.stringify({ capability: 'not.a.real.capability' }) });
    assert.equal(res.status, 404);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('POST /act proxies straight to spark, and reports a clean error when spark is not configured', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const spark = await startFakeEngine({ name: 'spark', routes: {
    'POST /act': (body) => [200, { understood: true, executed: true, ok: true, message: `did: ${body.text}` }],
  } });
  const { server, port, cleanup } = await startHub({ vault, spark });
  const auth = { Authorization: 'Bearer test-static-token', 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/act`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'log this idea: x' }) });
    const body = await res.json();
    assert.match(body.message, /log this idea: x/);
  } finally { server.close(); vault.server.close(); spark.server.close(); cleanup(); }
});

test('POST /act reports 502 without a crash when spark is not configured at all', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token', 'Content-Type': 'application/json' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/act`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'x' }) });
    assert.equal(res.status, 502);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('/api/tasks/detail?taskId=X (the app\'s literal call) maps taskId onto scope\'s tasks.get :id path param', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const scope = await startFakeEngine({ name: 'scope',
    manifestCapabilities: [{ name: 'tasks.get', method: 'GET', path: '/tasks/:id' }],
    routes: { 'GET /tasks/T1': () => [200, { task: { ID: 'T1', TITLE: 'Ship it' } }] },
  });
  const { server, port, cleanup } = await startHub({ vault, scope });
  const auth = { Authorization: 'Bearer test-static-token' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tasks/detail?taskId=T1`, { headers: auth });
    const body = await res.json();
    assert.equal(body.task.ID, 'T1');
  } finally { server.close(); vault.server.close(); scope.server.close(); cleanup(); }
});

test('an /api/* route marked legacy returns 501 since the legacy monolith is retired', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tags`, { headers: auth });
    assert.equal(res.status, 501);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a gap /api/* route (no working backend anywhere) reports 501, not a silent 404 or a crash', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/refs`, { headers: auth });
    assert.equal(res.status, 501);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('/api/auth/totp (the app\'s literal path) is public and reaches the same handler as /auth/totp', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'POST /auth/totp': (body) => [200, { success: true, token: 'sess-1', received: body.code }],
  } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/totp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '654321' }) });
    const body = await res.json();
    assert.equal(body.received, '654321');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('/api/auth/methods (the app\'s literal path) is public and reaches the same handler as /auth/methods', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'GET /auth/methods': () => [200, { totp: false, pin: true }],
  } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/methods`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { totp: false, pin: true });
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('an unmapped /api/* path 404s cleanly rather than falling through', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token' };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/definitely-not-a-real-route`, { headers: auth });
    assert.equal(res.status, 404);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('the audit log recorded requests made during this test run', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, auditLog, cleanup } = await startHub({ vault });
  const auth = { Authorization: 'Bearer test-static-token', 'Content-Type': 'application/json' };
  try {
    await fetch(`http://127.0.0.1:${port}/call`, { method: 'POST', headers: auth, body: JSON.stringify({ capability: 'nope' }) });
    assert.equal(auditLog.verifyChain().ok, true);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

// -- web console static serving (lib/static.js) --------------------------

function fakeWebBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-web-build-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>fake console</html>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'app.wasm'), Buffer.from([0, 1, 2]));
  return dir;
}

test('GET / serves the built web console when HUB_WEB_DIR is configured, with no auth required', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.equal(await res.text(), '<html>fake console</html>');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a nested static asset is served with the right content-type by extension', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/assets/app.wasm`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/wasm');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('GET / falls back to the JSON status route when no web console is built', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  // Explicit empty dir, not the default: app/build/web is a real build on
  // any machine that has run `flutter build web`, which would otherwise
  // make this test pass for the wrong reason (or fail on a fresh checkout).
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-no-web-build-'));
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: emptyDir });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const body = await res.json();
    assert.equal(body.engine, 'hub');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('existing API routes are unaffected by a configured web console (no shadowing)', async () => {
  const vault = await startFakeEngine({ name: 'vault', routes: {
    'GET /auth/methods': () => [200, { totp: true, pin: true }],
  } });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal((await health.json()).engine, 'hub');
    const methods = await fetch(`http://127.0.0.1:${port}/auth/methods`);
    assert.deepEqual(await methods.json(), { totp: true, pin: true });
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a path-traversal attempt against the web console 404s rather than escaping the build dir', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/../../../../../etc/passwd`, { redirect: 'manual' });
    assert.notEqual(res.status, 200);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('an unknown path under the web console 404s rather than falling back to index.html', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/definitely-not-a-real-asset.js`);
    assert.equal(res.status, 404);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a malformed URL (e.g. a bare "//" path) 400s instead of crashing the process (reproduced in production, 11 Aug 2026)', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    // `new URL('//', base)` throws ERR_INVALID_URL -- this used to be an
    // uncaught throw inside the async request handler, which becomes an
    // unhandled promise rejection and kills the whole process, not just
    // this one request.
    const res = await fetch(`http://127.0.0.1:${port}//`);
    assert.equal(res.status, 400);
    // The process is still alive and serving other requests.
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal((await health.json()).engine, 'hub');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('a matching If-Modified-Since revalidates with 304 instead of re-sending the body', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault }, { HUB_WEB_DIR: fakeWebBuild() });
  try {
    const first = await fetch(`http://127.0.0.1:${port}/`);
    const lastModified = first.headers.get('last-modified');
    assert.ok(lastModified);
    const second = await fetch(`http://127.0.0.1:${port}/`, { headers: { 'If-Modified-Since': lastModified } });
    assert.equal(second.status, 304);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('GET /services returns the full catalogue, enriched with real up/down for configured engines', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const scope = await startFakeEngine({ name: 'scope' });
  const { server, port, cleanup } = await startHub({ vault, scope });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/services`, { headers: { Authorization: 'Bearer test-static-token' } });
    assert.equal(res.status, 200);
    const { services } = await res.json();
    const byName = Object.fromEntries(services.map(s => [s.name, s]));
    assert.equal(byName.vault.configured, true);
    assert.equal(byName.vault.up, true);
    assert.equal(byName.scope.configured, true);
    assert.equal(byName.circle.configured, false);
    assert.equal(byName.circle.up, null);
    // Render-provider entries degrade cleanly with no RENDER_API_KEY configured in tests.
    assert.equal(byName.keyvanos.provider, 'render');
    assert.equal(byName.keyvanos.found, false);
    // Not-yet-hosted services are still listed, just unenriched.
    assert.equal(byName.wellpath.provider, 'planned');
  } finally { server.close(); vault.server.close(); scope.server.close(); cleanup(); }
});

test('GET /services requires auth, same as every other non-public route', async () => {
  const vault = await startFakeEngine({ name: 'vault' });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/services`);
    assert.equal(res.status, 404);
  } finally { server.close(); vault.server.close(); cleanup(); }
});

// api-compat.js used to mark GET /api/spaces `legacy: true` -- a confirmed
// dead 501 (the legacy monolith it pointed at was deleted 2026-08-15) --
// which meant webconsole/static/app.js's fetchSpaces() silently failed on
// every load and the whole Spaces/Axial-tree view (Innovator/Visionary/
// Creator, Decision Log, Risk Register, and now Writer) never rendered.
// Fixed 17 Aug by building the tree natively in server.js instead.
test('GET /api/spaces builds a nested tree from vault\'s flat space/spaces.tsv rows', async () => {
  const rows = [
    { ID: 'AX-VIS', PARENT_ID: '-', NAME: 'Visionary', LABEL: 'Visionary', AXIS: 'visionary' },
    { ID: 'FC-VIS-COPILOT', PARENT_ID: 'AX-VIS', NAME: 'career-copilot', LABEL: 'Career Copilot', AXIS: 'visionary' },
    { ID: 'DM-VIS-COP-DECISIONS', PARENT_ID: 'FC-VIS-COPILOT', NAME: 'decisions', LABEL: 'Decision Log', AXIS: 'visionary', VIEW: 'decisions' },
  ];
  const vault = await startFakeEngine({ name: 'vault',
    manifestCapabilities: [{ name: 'vault.read', method: 'GET', path: '/vault/:collection' }],
    routes: { 'GET /vault/space%2Fspaces.tsv': () => [200, { rows }] } });
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/spaces`, { headers: { Authorization: 'Bearer test-static-token' } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.spaces.length, 3);           // flat list, untouched
    assert.equal(body.tree.length, 1);               // one root: Visionary
    assert.equal(body.tree[0].ID, 'AX-VIS');
    assert.equal(body.tree[0].descendantCount, 2);
    assert.equal(body.tree[0].children[0].children[0].ID, 'DM-VIS-COP-DECISIONS');
  } finally { server.close(); vault.server.close(); cleanup(); }
});

test('GET /api/spaces degrades to empty rather than throwing when vault is unreachable', async () => {
  const vault = await startFakeEngine({ name: 'vault',
    manifestCapabilities: [{ name: 'vault.read', method: 'GET', path: '/vault/:collection' }] });
  // No route registered for GET /vault/space%2Fspaces.tsv -> the fake 404s, same as a real outage.
  const { server, port, cleanup } = await startHub({ vault });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/spaces`, { headers: { Authorization: 'Bearer test-static-token' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { tree: [], spaces: [] });
  } finally { server.close(); vault.server.close(); cleanup(); }
});
