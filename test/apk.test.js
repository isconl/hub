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

test('getLatestInfo formats size and extracts version from APK', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-test-'));
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, '20260823_isconl_v0.2.0.apk'), Buffer.alloc(1024 * 1024 * 15));

  const info = apk.getLatestInfo(tmp);
  assert.equal(info.available, true);
  assert.equal(info.version, '0.2.0');
  assert.equal(info.sizeLabel, '15.0 MB');
  assert.equal(info.filename, '20260823_isconl_v0.2.0.apk');

  fs.rmSync(tmp, { recursive: true, force: true });
});
