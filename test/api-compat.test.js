'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROUTES, findRoute } = require('../lib/api-compat');

test('every route entry is well-formed: a method, an /api/ path, and exactly one of capability/legacy/gap', () => {
  for (const r of ROUTES) {
    assert.match(r.method, /^(GET|POST|PUT|DELETE)$/, `${r.path}: bad method`);
    assert.match(r.path, /^\/api\//, `${r.method} ${r.path}: must start with /api/`);
    const modes = ['capability', 'legacy', 'gap'].filter(k => r[k]);
    assert.equal(modes.length, 1, `${r.method} ${r.path}: must be exactly one of capability/legacy/gap, got [${modes.join(',')}]`);
  }
});

test('no duplicate method+path entries', () => {
  const seen = new Set();
  for (const r of ROUTES) {
    const key = `${r.method} ${r.path}`;
    assert.equal(seen.has(key), false, `duplicate route: ${key}`);
    seen.add(key);
  }
});

test('findRoute matches on method AND path, returns null for anything unlisted', () => {
  const r = findRoute('GET', '/api/tasks');
  assert.equal(r.capability, 'tasks.list');
  assert.equal(findRoute('POST', '/api/tasks'), null);   // /api/tasks is only ever GET in this table
  assert.equal(findRoute('GET', '/api/not-a-real-route'), null);
});

test('every real inventoried app call has SOME entry -- the exact set found by grepping the app branch\'s .dart files, 2026-08-09', () => {
  const inventoried = [
    'POST /api/act', 'GET /api/apk/latest',
    'GET /api/articles/list', 'GET /api/audit',
    'POST /api/auth/logout', 'GET /api/auth/methods',
    'GET /api/buffer/desk', 'GET /api/calendar/events', 'POST /api/chat',
    'GET /api/chat/stream', 'POST /api/chat/thread/new', 'POST /api/chat/thread/open', 'GET /api/chat/threads',
    'GET /api/circle', 'POST /api/circle/touch', 'GET /api/dates', 'POST /api/dates/add',
    'GET /api/decisions', 'POST /api/decisions/update',
    'POST /api/finance/messages/commit', 'POST /api/finance/receipt', 'GET /api/finance/summary',
    'POST /api/finance/tx', 'GET /api/finance/wishlist', 'GET /api/github/snapshot',
    'GET /api/health/data', 'GET /api/ideas', 'POST /api/ideas/add', 'POST /api/ideas/update',
    'POST /api/inbox/add', 'POST /api/inbox/update', 'POST /api/ingest/sms', 'GET /api/insights',
    'GET /api/jira/issues', 'POST /api/jira/transition', 'GET /api/journal', 'POST /api/journal/add',
    'GET /api/learning', 'GET /api/learning/manifest', 'POST /api/learning/narrate',
    'GET /api/learning/notes', 'POST /api/learning/notes', 'POST /api/learning/progress', 'POST /api/learning/resume',
    'GET /api/notifications', 'POST /api/notifications/seen',
    'GET /api/onedrive/list', 'GET /api/onedrive/preview', 'GET /api/orientation',
    'GET /api/personal/rhythm', 'POST /api/personal/rhythm', 'GET /api/plans', 'POST /api/plans/add',
    'GET /api/projects', 'GET /api/refs', 'GET /api/spaces', 'POST /api/spaces',
    'GET /api/state', 'GET /api/tags', 'GET /api/teams', 'POST /api/vault/sync',
    'GET /api/ventures',
  ];
  for (const key of inventoried) {
    const [method, path] = key.split(' ');
    assert.ok(findRoute(method, path), `no compat entry for ${key}`);
  }
});
