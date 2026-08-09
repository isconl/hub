'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngineClient } = require('../lib/engine-client');

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const { status, body } = responder(url, opts);
    return { status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test('createEngineClient throws without name/baseUrl', () => {
  assert.throws(() => createEngineClient({}));
  assert.throws(() => createEngineClient({ name: 'scope' }));
});

test('health() returns true only on a real 200 {status:"ok"} response', async () => {
  const ok = createEngineClient({ name: 'scope', baseUrl: 'http://x', fetchFn: fakeFetch(() => ({ status: 200, body: { status: 'ok' } })) });
  assert.equal(await ok.health(), true);
  const down = createEngineClient({ name: 'scope', baseUrl: 'http://x', fetchFn: fakeFetch(() => ({ status: 500, body: {} })) });
  assert.equal(await down.health(), false);
});

test('health() returns false (not a throw) when the fetch itself fails', async () => {
  const client = createEngineClient({ name: 'scope', baseUrl: 'http://x', fetchFn: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(await client.health(), false);
});

test('manifest() throws with a named error on a non-200', async () => {
  const client = createEngineClient({ name: 'scope', baseUrl: 'http://x', fetchFn: fakeFetch(() => ({ status: 503, body: {} })) });
  await assert.rejects(() => client.manifest(), /scope.*manifest fetch failed/);
});

test('call() sends the bearer token and Content-Type only when a body is present', async () => {
  const fetchFn = fakeFetch(() => ({ status: 200, body: { ok: true } }));
  const client = createEngineClient({ name: 'scope', baseUrl: 'http://x', getToken: () => 'tok', fetchFn });
  await client.call('GET', '/tasks');
  assert.equal(fetchFn.calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal('Content-Type' in fetchFn.calls[0].opts.headers, false);

  await client.call('POST', '/tasks', { body: { title: 'x' } });
  assert.equal(fetchFn.calls[1].opts.headers['Content-Type'], 'application/json');
  assert.equal(fetchFn.calls[1].opts.body, JSON.stringify({ title: 'x' }));
});

test('call() fills :param path placeholders and throws when a required param is missing', async () => {
  const fetchFn = fakeFetch((url) => ({ status: 200, body: { url } }));
  const client = createEngineClient({ name: 'vault', baseUrl: 'http://x', fetchFn });
  const r = await client.call('GET', '/vault/:collection', { params: { collection: 'scope/tasks.tsv' } });
  assert.equal(fetchFn.calls[0].url, 'http://x/vault/scope%2Ftasks.tsv');
  await assert.rejects(() => client.call('GET', '/vault/:collection'), /missing path param "collection"/);
});

test('call() appends a query string, dropping undefined/null values', async () => {
  const fetchFn = fakeFetch((url) => ({ status: 200, body: { url } }));
  const client = createEngineClient({ name: 'circle', baseUrl: 'http://x', fetchFn });
  await client.call('GET', '/whocan', { query: { q: 'kubernetes', unused: undefined } });
  assert.equal(fetchFn.calls[0].url, 'http://x/whocan?q=kubernetes');
});
