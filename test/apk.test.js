'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const apk = require('../lib/apk');

test('issueTicket mints token and isTicketValid checks expiration', () => {
  const token = apk.issueTicket();
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 48);
  assert.equal(apk.isTicketValid(token), true);
  assert.equal(apk.isTicketValid('non-existent'), false);
});

test('getLatestInfo falls back to local scan when GitHub is disabled, formats size and extracts version', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-test-'));
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, '20260823_isconl_v0.2.0.apk'), Buffer.alloc(1024 * 1024 * 15));

  const info = await apk.getLatestInfo(tmp, { disableGithub: true });
  assert.equal(info.available, true);
  assert.equal(info.source, 'local');
  assert.equal(info.version, '0.2.0');
  assert.equal(info.sizeLabel, '15.0 MB');
  assert.equal(info.filename, '20260823_isconl_v0.2.0.apk');

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('getLatestInfo reports unavailable when GitHub is disabled and no local build exists', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-test-'));
  const info = await apk.getLatestInfo(tmp, { disableGithub: true });
  assert.equal(info.available, false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fetchGithubLatestRelease returns null (not a throw) when the repo/token cannot be reached', async () => {
  // Deliberately bogus host-reachable-but-nonexistent repo -- exercises the
  // real network path's error handling without needing a live fixture.
  const result = await apk.fetchGithubLatestRelease('isconl/this-repo-should-not-exist-xyz', '');
  assert.equal(result, null);
});
