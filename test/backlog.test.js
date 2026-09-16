'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBacklog, discoverProjects, INDEX_PATH } = require('../lib/backlog');

// Backlog v2: rows come from the derived index, not from parsing category
// files. The prose-parsing tests this file used to carry are gone with the
// prose parser -- a row's state is a field now, so there is nothing to infer.

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

/** Build a v2 index payload from shorthand row specs. */
function fakeIndex(rows = []) {
  return JSON.stringify({
    generated: '2026-09-16T00:00:00.000Z',
    fingerprint: 'test',
    projects: [],
    rows: rows.map(r => ({
      id: r.id, p: r.p, t: r.t || 'build', s: r.s || null,
      st: r.st || 'ready', pr: r.pr == null ? 3 : r.pr, ef: r.ef || null,
      ti: r.ti || 'A row', b: r.b || [], d: r.d || [], cb: r.cb || null,
      u: r.u || '2026-09-16', ar: !!r.ar, f: `work/dev/${r.p}/_next/rows/${r.id}.md`,
    })),
  });
}

function fakeRequest(tree, files, indexRows = []) {
  return async (pathAndQuery) => {
    if (pathAndQuery.includes('/git/trees/')) {
      return { status: 200, data: JSON.stringify({ tree }) };
    }
    const m = pathAndQuery.match(/\/contents\/(.+?)\?ref=/);
    const filePath = decodeURIComponent(m[1]);
    if (filePath === INDEX_PATH) return { status: 200, data: fakeIndex(indexRows) };
    return { status: 200, data: files[filePath] || '' };
  };
}

test('buildBacklog reads rows from the derived index, carrying subset as a field', async () => {
  const tree = [{ path: 'work/dev/iSconl/_next/backlog/build.md', type: 'blob' }];
  const rows = [
    { id: 'BB26091401', p: 'iSconl', t: 'build', ti: 'A build row' },
    { id: 'FI26091401', p: 'iSconl', t: 'build', s: 'fix', ti: 'A fix row' },
    { id: 'JV26091501', p: 'iSconl', t: 'work', s: 'jira', ti: 'A jira row' },
  ];
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}, rows) });
  const proj = result.find(p => p.project === 'iSconl');
  assert.equal(proj.rows.length, 3);

  const fix = proj.rows.find(r => r.id === 'FI26091401');
  assert.equal(fix.category, 'build', 'fix is a subset OF build, not its own category');
  assert.equal(fix.subset, 'fix', 'the subset survives as a field rather than as a filename');

  const jira = proj.rows.find(r => r.id === 'JV26091501');
  assert.equal(jira.category, 'work');
  assert.equal(jira.subset, 'jira');
});

test('buildBacklog computes ready, and a blocked row is never ready', async () => {
  const tree = [{ path: 'work/dev/relay/_next/backlog/build.md', type: 'blob' }];
  const rows = [
    { id: 'BB26091401', p: 'relay', st: 'ready' },
    { id: 'BB26091402', p: 'relay', st: 'blocked', b: ['sconl:decision'] },
    { id: 'BB26091403', p: 'relay', st: 'ready', b: ['BB26091402'] },
  ];
  const { projects: result, totals } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}, rows) });
  const proj = result.find(p => p.project === 'relay');
  assert.equal(proj.rows.find(r => r.id === 'BB26091401').ready, true);
  assert.equal(proj.rows.find(r => r.id === 'BB26091402').ready, false, 'blocked is never ready');
  assert.equal(proj.rows.find(r => r.id === 'BB26091403').ready, false, 'a row waiting on another is not ready');
  assert.equal(totals.ready, 1);
  assert.equal(totals.blocked, 1);
});

test('buildBacklog excludes archived rows', async () => {
  const tree = [{ path: 'work/dev/relay/_next/backlog/build.md', type: 'blob' }];
  const rows = [
    { id: 'BB26091401', p: 'relay' },
    { id: 'BB26091400', p: 'relay', st: 'done', ar: true },
  ];
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}, rows) });
  assert.equal(result.find(p => p.project === 'relay').rows.length, 1);
});

test('buildBacklog surfaces a project that is in the index but absent from the tree walk', async () => {
  const rows = [{ id: 'BB26091401', p: 'ghost-proj' }];
  const { projects: result } = await buildBacklog({ force: true, token: '', request: fakeRequest([], {}, rows) });
  assert.ok(result.find(p => p.project === 'ghost-proj'), 'an indexed project is never dropped for having no tree entries');
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
  const rows = [{ id: 'BB26091401', p: 'busy-proj', ti: 'Real row' }];
  const { projects: result, discoveredProjectCount, shownProjectCount } =
    await buildBacklog({ force: true, token: '', request: fakeRequest(tree, {}, rows) });
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
