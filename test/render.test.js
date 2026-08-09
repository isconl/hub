'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { createRenderClient } = require('../lib/render');

function withFakeHttps(responder, fn) {
  const original = https.request;
  https.request = (options, cb) => {
    const req = { on: () => req, setTimeout: () => req, write: () => {}, end: () => {}, destroy: () => {} };
    setImmediate(() => {
      const { status, body } = responder(options);
      const res = { statusCode: status, on: (event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(body)));
        if (event === 'end') handler();
        return res;
      } };
      cb(res);
    });
    return req;
  };
  return fn().finally(() => { https.request = original; });
}

test('createRenderClient throws without getApiKey', () => {
  assert.throws(() => createRenderClient({}));
});

test('every call reports a clean error, without a network attempt, when RENDER_API_KEY is not configured', async () => {
  const client = createRenderClient({ getApiKey: () => '' });
  const services = await client.listServices();
  assert.deepEqual(services, []);
});

test('listServices unwraps the {service:{...}} envelope Render\'s API returns', async () => {
  const client = createRenderClient({ getApiKey: () => 'key' });
  await withFakeHttps(() => ({ status: 200, body: [{ service: { id: 'srv-1', name: 'scope' } }, { service: { id: 'srv-2', name: 'circle' } }] }), async () => {
    const services = await client.listServices();
    assert.equal(services.length, 2);
    assert.equal(services[0].name, 'scope');
  });
});

test('findServiceByName returns null (not a throw) when nothing matches', async () => {
  const client = createRenderClient({ getApiKey: () => 'key' });
  await withFakeHttps(() => ({ status: 200, body: [] }), async () => {
    assert.equal(await client.findServiceByName('nope'), null);
  });
});

test('triggerDeploy reports ok:true with the new deploy id on success', async () => {
  const client = createRenderClient({ getApiKey: () => 'key' });
  await withFakeHttps(() => ({ status: 201, body: { id: 'dep-1', status: 'build_in_progress' } }), async () => {
    const r = await client.triggerDeploy('srv-1');
    assert.equal(r.ok, true);
    assert.equal(r.deployId, 'dep-1');
  });
});

test('triggerDeploy reports ok:false with Render\'s message on failure, without throwing', async () => {
  const client = createRenderClient({ getApiKey: () => 'key' });
  await withFakeHttps(() => ({ status: 403, body: { message: 'insufficient permissions' } }), async () => {
    const r = await client.triggerDeploy('srv-1');
    assert.equal(r.ok, false);
    assert.match(r.error, /insufficient permissions/);
  });
});

test('getDeploy returns null on a non-200 rather than throwing', async () => {
  const client = createRenderClient({ getApiKey: () => 'key' });
  await withFakeHttps(() => ({ status: 404, body: {} }), async () => {
    assert.equal(await client.getDeploy('srv-1', 'dep-1'), null);
  });
});
