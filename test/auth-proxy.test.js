'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthProxy } = require('../lib/auth-proxy');

function fakeVault({ verifyByToken = {}, loginResponses = {} } = {}) {
  return {
    call: async (method, path, opts) => loginResponses[path] || { status: 200, data: {} },
    raw: async (method, path, body, opts) => {
      const token = opts?.token;
      return { status: 200, data: verifyByToken[token] ?? { valid: false } };
    },
  };
}

test('createAuthProxy throws without vault', () => {
  assert.throws(() => createAuthProxy({}));
});

test('verify() returns valid:false without calling vault when no token is given', async () => {
  let called = false;
  const proxy = createAuthProxy({ vault: { raw: async () => { called = true; }, call: async () => {} } });
  const r = await proxy.verify('');
  assert.equal(r.valid, false);
  assert.equal(called, false);
});

test('verify() forwards the CALLER\'s token to vault, not any token hub itself might have configured', async () => {
  const proxy = createAuthProxy({ vault: fakeVault({ verifyByToken: { 'good-token': { valid: true, via: 'totp' } } }) });
  const good = await proxy.verify('good-token');
  assert.equal(good.valid, true);
  const bad = await proxy.verify('wrong-token');
  assert.equal(bad.valid, false);
});

test('verify() returns valid:false (not a throw) when vault is unreachable', async () => {
  const proxy = createAuthProxy({ vault: { raw: async () => { throw new Error('ECONNREFUSED'); } } });
  const r = await proxy.verify('some-token');
  assert.equal(r.valid, false);
});

test('totp()/pin() forward the login body to vault and pass its response back verbatim', async () => {
  const proxy = createAuthProxy({ vault: fakeVault({ loginResponses: {
    '/auth/totp': { status: 200, data: { success: true, token: 'sess-1' } },
    '/auth/pin': { status: 401, data: { success: false, error: 'Incorrect PIN' } },
  } }) });
  const t = await proxy.totp({ code: '123456' });
  assert.equal(t.data.token, 'sess-1');
  const p = await proxy.pin({ pin: '0000' });
  assert.equal(p.status, 401);
});
