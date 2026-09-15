'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBacklog, parseRows } = require('../lib/backlog');

test('parseRows extracts id/title/status from a 5-cell row (has Status column)', () => {
  const text = [
    '| # | Title | Task | Status | Notes |',
    '|---|-------|------|--------|-------|',
    '| BB26091401 (new) | **Do the thing** | some task text | ⬜ Queued | a note |',
  ].join('\n');
  const rows = parseRows(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'BB26091401');
  assert.equal(rows[0].title, 'Do the thing');
  assert.equal(rows[0].status, '⬜ Queued');
});

test('parseRows extracts id/title with no status for a 4-cell plan.md-shaped row', () => {
  const text = [
    '| # | Title | Task | Notes |',
    '|---|-------|------|--------|',
    '| PB26091401 | **Decide something** | the decision | a note |',
  ].join('\n');
  const rows = parseRows(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'PB26091401');
  assert.equal(rows[0].title, 'Decide something');
  assert.equal(rows[0].status, null);
});

test('parseRows skips header/separator lines and comment-only pipe lines with no real id', () => {
  const text = [
    '| # | Title | Task | Status | Notes |',
    '|---|-------|------|--------|-------|',
    '<!-- a comment starting with | is not a row -->',
    '| BB26091401 | **Real row** | task | Queued | note |',
  ].join('\n');
  const rows = parseRows(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'BB26091401');
});

function fakeRequest(tree, files) {
  return async (pathAndQuery) => {
    if (pathAndQuery.includes('/git/trees/')) {
      return { status: 200, data: JSON.stringify({ tree }) };
    }
    const m = pathAndQuery.match(/\/contents\/(.+?)\?ref=/);
    const filePath = decodeURIComponent(m[1]);
    return { status: 200, data: files[filePath] || '' };
  };
}

test('buildBacklog sums new-scheme and legacy-scheme files, labelling the legacy source', async () => {
  const tree = [
    { path: 'work/dev/migrated-proj/_next/backlog/build.md', type: 'blob' },
    { path: 'work/dev/old-proj/_next/backlog/build.md', type: 'blob' },
    { path: 'work/dev/old-proj/_next/backlog/fix.md', type: 'blob' },
  ];
  const files = {
    'work/dev/migrated-proj/_next/backlog/build.md':
      '| # | Title | Task | Status | Notes |\n|---|---|---|---|---|\n| BB26091401 | **New scheme row** | t | Queued | n |\n',
    'work/dev/old-proj/_next/backlog/build.md':
      '| # | Title | Task | Status | Notes |\n|---|---|---|---|---|\n| BB26091402 | **Old proj build row** | t | Queued | n |\n',
    'work/dev/old-proj/_next/backlog/fix.md':
      '| # | Title | Task | Status | Notes |\n|---|---|---|---|---|\n| FI26091401 | **Old proj fix row** | t | Queued | n |\n',
  };
  const result = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });

  const migrated = result.find(p => p.project === 'migrated-proj');
  assert.equal(migrated.rows.length, 1);
  assert.equal(migrated.rows[0].legacySource, null);

  const old = result.find(p => p.project === 'old-proj');
  assert.equal(old.rows.length, 2);
  const buildRow = old.rows.find(r => r.id === 'BB26091402');
  const fixRow = old.rows.find(r => r.id === 'FI26091401');
  assert.equal(buildRow.legacySource, null, 'build.md is the primary/new-scheme name for the build category');
  assert.equal(fixRow.legacySource, 'fix.md', 'fix.md is the legacy source, labelled distinctly');
  assert.equal(fixRow.category, 'build', 'fix.md rows fold into the build category');
});

test('buildBacklog surfaces a non-backlog _next/*.md document without trying to parse it into rows', async () => {
  const tree = [
    { path: 'work/dev/wellspring/_next/backlog/plan.md', type: 'blob' },
    { path: 'work/dev/wellspring/_next/20260915_open_questions.md', type: 'blob' },
  ];
  const files = {
    'work/dev/wellspring/_next/backlog/plan.md': '',
  };
  const result = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });
  const proj = result.find(p => p.project === 'wellspring');
  assert.equal(proj.rows.length, 0);
  assert.equal(proj.documents.length, 1);
  assert.equal(proj.documents[0].name, '20260915_open_questions.md');
  assert.match(proj.documents[0].url, /github\.com\/Sconl\/_kit\/blob\/main\//);
});

test('buildBacklog skips a project with neither live rows nor documents', async () => {
  const tree = [
    { path: 'work/dev/empty-proj/_next/backlog/build.md', type: 'blob' },
  ];
  const files = { 'work/dev/empty-proj/_next/backlog/build.md': '' };
  const result = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });
  assert.equal(result.find(p => p.project === 'empty-proj'), undefined);
});
