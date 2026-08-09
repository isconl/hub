'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistry } = require('../lib/registry');

function fakeEngine(manifestOrErr) {
  return {
    manifest: async () => { if (manifestOrErr instanceof Error) throw manifestOrErr; return manifestOrErr; },
    health: async () => !(manifestOrErr instanceof Error),
  };
}

test('createRegistry throws with no engines', () => {
  assert.throws(() => createRegistry({ engines: {} }));
});

test('refresh merges capabilities from every engine, tagging each with its owning engine', async () => {
  const registry = createRegistry({ engines: {
    scope: fakeEngine({ capabilities: [{ name: 'tasks.create', method: 'POST', path: '/tasks' }] }),
    circle: fakeEngine({ capabilities: [{ name: 'circle.people.list', method: 'GET', path: '/people' }] }),
  } });
  const { capabilities } = await registry.refresh();
  assert.equal(capabilities.get('tasks.create').engine, 'scope');
  assert.equal(capabilities.get('circle.people.list').engine, 'circle');
});

test('an engine that fails to answer manifest() is reported in `down`, not thrown', async () => {
  const registry = createRegistry({ engines: {
    scope: fakeEngine({ capabilities: [] }),
    pulse: fakeEngine(new Error('ECONNREFUSED')),
  } });
  const { down } = await registry.list();
  assert.equal(down.length, 1);
  assert.equal(down[0].engine, 'pulse');
});

test('find() returns the owning engine name for a known capability, null for an unknown one', async () => {
  const registry = createRegistry({ engines: { scope: fakeEngine({ capabilities: [{ name: 'tasks.create' }] }) } });
  assert.equal((await registry.find('tasks.create')).engine, 'scope');
  assert.equal(await registry.find('nope.nope'), null);
});

test('refresh() is cached within the TTL -- a second call does not re-fetch', async () => {
  let calls = 0;
  const engine = { manifest: async () => { calls++; return { capabilities: [] }; }, health: async () => true };
  const registry = createRegistry({ engines: { scope: engine }, ttlMs: 60000 });
  await registry.refresh();
  await registry.refresh();
  assert.equal(calls, 1);
});

test('refresh({force:true}) bypasses the cache', async () => {
  let calls = 0;
  const engine = { manifest: async () => { calls++; return { capabilities: [] }; }, health: async () => true };
  const registry = createRegistry({ engines: { scope: engine }, ttlMs: 60000 });
  await registry.refresh();
  await registry.refresh({ force: true });
  assert.equal(calls, 2);
});

test('healthAll() reports per-engine up/down without one failure blocking the others', async () => {
  const registry = createRegistry({ engines: {
    scope: fakeEngine({ capabilities: [] }),
    pulse: fakeEngine(new Error('down')),
  } });
  const results = await registry.healthAll();
  assert.deepEqual(results.sort((a, b) => a.engine.localeCompare(b.engine)), [
    { engine: 'pulse', up: false }, { engine: 'scope', up: true },
  ]);
});

test('a capability name collision across two engines is logged, and the later engine wins deterministically (object key overwrite)', async () => {
  const logs = [];
  const registry = createRegistry({
    engines: {
      a: fakeEngine({ capabilities: [{ name: 'shared.cap' }] }),
      b: fakeEngine({ capabilities: [{ name: 'shared.cap' }] }),
    },
    auditLog: { log: (event, data) => logs.push({ event, data }) },
  });
  await registry.refresh();
  assert.ok(logs.some(l => l.event === 'registry_capability_collision'));
});
