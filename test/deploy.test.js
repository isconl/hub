'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeployClient } = require('../lib/deploy');

function fakeRender({ services = [], deployResult = { ok: true, deployId: 'dep-1' } } = {}) {
  return {
    findServiceByName: async (name) => services.find(s => s.name === name) || null,
    triggerDeploy: async () => deployResult,
    getDeploy: async () => ({ id: 'dep-1', status: 'live' }),
  };
}

test('createDeployClient throws without render/serviceNameFor', () => {
  assert.throws(() => createDeployClient({}));
});

test('redeploy reports a clean error when the engine has no configured Render service name', async () => {
  const client = createDeployClient({ render: fakeRender(), serviceNameFor: () => null });
  const r = await client.redeploy('scope');
  assert.equal(r.ok, false);
  assert.match(r.error, /No Render service configured/);
});

test('redeploy reports a clean error when Render has no matching service', async () => {
  const client = createDeployClient({ render: fakeRender({ services: [] }), serviceNameFor: () => 'scope' });
  const r = await client.redeploy('scope');
  assert.equal(r.ok, false);
  assert.match(r.error, /no service named/);
});

test('redeploy resolves the engine name to a Render service and triggers a deploy', async () => {
  const client = createDeployClient({ render: fakeRender({ services: [{ id: 'srv-1', name: 'scope' }] }), serviceNameFor: (e) => e });
  const r = await client.redeploy('scope');
  assert.equal(r.ok, true);
  assert.equal(r.deployId, 'dep-1');
  assert.equal(r.service, 'scope');
});

test('status returns null when the engine has no configured service, without throwing', async () => {
  const client = createDeployClient({ render: fakeRender(), serviceNameFor: () => null });
  assert.equal(await client.status('scope', 'dep-1'), null);
});

test('status resolves the service and returns the deploy record', async () => {
  const client = createDeployClient({ render: fakeRender({ services: [{ id: 'srv-1', name: 'scope' }] }), serviceNameFor: (e) => e });
  const r = await client.status('scope', 'dep-1');
  assert.equal(r.status, 'live');
});
