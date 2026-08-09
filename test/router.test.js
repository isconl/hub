'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRouter, newTraceId } = require('../lib/router');

function fakeRegistry(capMap) {
  return { find: async (name) => capMap[name] || null };
}

test('createRouter throws without registry/engines', () => {
  assert.throws(() => createRouter({}));
  assert.throws(() => createRouter({ registry: {} }));
});

test('newTraceId produces distinct ids', () => {
  assert.notEqual(newTraceId(), newTraceId());
});

test('route() returns 404 for an unknown capability without touching any engine', async () => {
  let called = false;
  const router = createRouter({ registry: fakeRegistry({}), engines: { scope: { call: async () => { called = true; } } } });
  const r = await router.route('nope.nope');
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(called, false);
});

test('route() returns 502 when the owning engine has no configured client', async () => {
  const router = createRouter({ registry: fakeRegistry({ 'tasks.create': { engine: 'scope', method: 'POST', path: '/tasks' } }), engines: {} });
  const r = await router.route('tasks.create');
  assert.equal(r.status, 502);
  assert.match(r.error, /scope.*no client/);
});

test('route() forwards to the owning engine\'s declared method+path with params/query/body passed through untouched', async () => {
  let seen = null;
  const router = createRouter({
    registry: fakeRegistry({ 'vault.read': { engine: 'vault', method: 'GET', path: '/vault/:collection' } }),
    engines: { vault: { call: async (method, path, opts) => { seen = { method, path, opts }; return { status: 200, data: { rows: [] } }; } } },
  });
  await router.route('vault.read', { params: { collection: 'scope/tasks.tsv' }, query: { limit: 5 } });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.path, '/vault/:collection');
  assert.deepEqual(seen.opts.params, { collection: 'scope/tasks.tsv' });
  assert.deepEqual(seen.opts.query, { limit: 5 });
});

test('route() reports ok:false with the response status on a non-2xx, without throwing', async () => {
  const router = createRouter({
    registry: fakeRegistry({ 'tasks.create': { engine: 'scope', method: 'POST', path: '/tasks' } }),
    engines: { scope: { call: async () => ({ status: 400, data: { error: 'bad title' } }) } },
  });
  const r = await router.route('tasks.create', { body: {} });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'bad title');
});

test('route() catches a network-level failure and returns a clean 502 rather than throwing', async () => {
  const router = createRouter({
    registry: fakeRegistry({ 'tasks.create': { engine: 'scope', method: 'POST', path: '/tasks' } }),
    engines: { scope: { call: async () => { throw new Error('ECONNREFUSED'); } } },
  });
  const r = await router.route('tasks.create', { body: {} });
  assert.equal(r.status, 502);
  assert.match(r.error, /did not respond/);
});

test('route() reuses a supplied traceId instead of minting a new one, so a caller can thread one trace across several route() calls', async () => {
  const router = createRouter({
    registry: fakeRegistry({ 'a.cap': { engine: 'x', method: 'GET', path: '/a' } }),
    engines: { x: { call: async () => ({ status: 200, data: {} }) } },
  });
  const r = await router.route('a.cap', { traceId: 'trc_fixed' });
  assert.equal(r.traceId, 'trc_fixed');
});
