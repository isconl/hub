'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBacklog, discoverProjects, parseRows } = require('../lib/backlog');

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

// 15 Sep 2026: discoverProjects (the tree-walk) and buildBacklog's own
// has-live-rows filter got conflated in a real report ("only 10 of 20
// projects are tracked" -- wrong; all 20 were discovered, 10 were
// correctly hidden downstream for having zero live rows). Testing
// discovery in isolation, at every real folder depth the drive actually
// uses, is what would have caught that before the report was written.
test('discoverProjects finds a project at every real depth (3/4/5 levels under work/dev/)', () => {
  const tree = [
    { path: 'work/dev/relay/_next/backlog/build.md', type: 'blob' }, // depth 3
    { path: 'work/dev/_core/finance-core/_next/backlog/build.md', type: 'blob' }, // depth 4
    { path: 'work/dev/Systems/QSpace/qspace-press/_next/backlog/build.md', type: 'blob' }, // depth 5
  ];
  const projects = discoverProjects(tree);
  assert.deepEqual([...projects.keys()].sort(), ['finance-core', 'qspace-press', 'relay']);
});

test('discoverProjects finds a project folder even when it has zero live rows -- discovery is independent of the has-live-rows filter', () => {
  const tree = [{ path: 'work/dev/finance-core/_next/backlog/build.md', type: 'blob' }];
  const projects = discoverProjects(tree);
  assert.equal(projects.size, 1);
  assert.ok(projects.has('finance-core'));
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
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });

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
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });
  const proj = result.find(p => p.project === 'wellspring');
  assert.equal(proj.rows.length, 0);
  assert.equal(proj.documents.length, 1);
  assert.equal(proj.documents[0].name, '20260915_open_questions.md');
  assert.match(proj.documents[0].url, /github\.com\/Sconl\/_kit\/blob\/main\//);
});

test('buildBacklog skips a project with neither live rows nor documents from the shown list, but still counts it as discovered', async () => {
  const tree = [
    { path: 'work/dev/empty-proj/_next/backlog/build.md', type: 'blob' },
    { path: 'work/dev/busy-proj/_next/backlog/build.md', type: 'blob' },
  ];
  const files = {
    'work/dev/empty-proj/_next/backlog/build.md': '',
    'work/dev/busy-proj/_next/backlog/build.md':
      '| # | Title | Task | Status | Notes |\n|---|---|---|---|---|\n| BB26091401 | **Real row** | t | Queued | n |\n',
  };
  const { projects: result, discoveredProjectCount, shownProjectCount } =
    await buildBacklog({ force: true, token: '', request: fakeRequest(tree, files) });
  assert.equal(result.find(p => p.project === 'empty-proj'), undefined, 'empty-proj has nothing to show');
  assert.ok(result.find(p => p.project === 'busy-proj'), 'busy-proj has a live row');
  // The acceptance guard: discovery (2 projects found in the tree) must
  // stay visible even though only 1 is shown -- this is exactly the
  // distinction a real report conflated on 15 Sep 2026.
  assert.equal(discoveredProjectCount, 2, 'both projects were discovered in the tree walk');
  assert.equal(shownProjectCount, 1, 'only the project with a live row is shown');
});

test('discoverProjects indexes work/_arc/<project>/canon-canvas/*.md files under the same project key as work/dev/', () => {
  const tree = [
    { path: 'work/dev/relay/_next/backlog/build.md', type: 'blob' },
    { path: 'work/_arc/relay/canon-canvas/20260818_canon_project_development_canvas_relay_v0_0_0.md', type: 'blob' },
  ];
  const projects = discoverProjects(tree);
  assert.equal(projects.size, 1, 'canon-only and backlog paths fold into the same project key');
  assert.equal(projects.get('relay').canonFiles.length, 1);
});

test('buildBacklog exposes canon docs, newest first, with title/version parsed from the filename', async () => {
  const tree = [
    { path: 'work/_arc/relay/canon-canvas/20260801_canon_project_development_canvas_relay_v1_0_0.md', type: 'blob' },
    { path: 'work/_arc/relay/canon-canvas/20260901_canon_project_development_canvas_relay_v2_0_0.md', type: 'blob' },
  ];
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}) });
  const relay = result.find(p => p.project === 'relay');
  assert.equal(relay.canon.length, 2);
  assert.equal(relay.canon[0].version, '2.0.0', 'newest (by date prefix) sorts first');
  assert.equal(relay.canon[1].version, '1.0.0');
  assert.equal(relay.canon[0].title, 'Project Development Canvas Relay');
  assert.match(relay.canon[0].url, /github\.com\/Sconl\/_kit\/blob\/main\/work\/_arc\/relay\/canon-canvas\//);
});

test('buildBacklog shows a project that has canon docs but no live backlog rows', async () => {
  const tree = [
    { path: 'work/_arc/canon-only-proj/canon-canvas/20260801_canon_something_v1_0_0.md', type: 'blob' },
  ];
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}) });
  const proj = result.find(p => p.project === 'canon-only-proj');
  assert.ok(proj, 'a project with only canon docs still appears');
  assert.equal(proj.rows.length, 0);
  assert.equal(proj.canon.length, 1);
});
