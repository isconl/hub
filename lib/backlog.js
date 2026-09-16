'use strict';
/**
 * BI26091301: drive-wide Backlog view, reading live from GitHub (Sconl/_kit)
 * rather than local disk -- works identically whether hub runs locally or
 * on the OCI VM, where local-disk access to ~/_/.relay isn't possible.
 *
 * BACKLOG v2 (16 Sep 2026). A row is now its own file
 * (`work/dev/<project>/_next/rows/<ID>.md`) carrying its state as
 * frontmatter fields, and `_kit/backlog/index.json` is a single DERIVED
 * index built from them. This module reads that one file.
 *
 * What that replaced, and why it matters here specifically: this view used
 * to fetch ~90 markdown files and infer each row's state by parsing prose
 * and status glyphs, because state was encoded in which file a row sat in.
 * Every counter built that way on this drive undercounted -- the last one
 * missed two thirds of iSconl's content rows because that file puts the
 * status glyph in column 1 and the ID in column 2. Fields do not have that
 * failure mode.
 *
 * The index is derived and regenerable, never hand-edited, and marked
 * `merge=ours` so it cannot cause a conflict. Freshness is maintained by
 * git hooks plus a fingerprint check on every local read.
 *
 * Also surfaces non-backlog project documents (a `_next/*.md` file that
 * isn't one of the category files, e.g. a supervisor open-questions log,
 * or a `*.tsv` artifact living beside the backlog) as a per-project
 * "documents" list -- these don't fit the {id,title,status} row shape and
 * are deliberately not force-parsed into it; they're linked out instead.
 */

const { defaultGithubToken, githubApiRequest } = require('./apk');

const REPO_OWNER = 'Sconl';
const REPO_NAME = '_kit';
const REF = 'main';

// Backlog v2: the one derived file this whole view reads.
const INDEX_PATH = '_kit/backlog/index.json';

/**
 * The same index on local disk, if this hub is running inside the drive.
 *
 * Set SLATE_INDEX to point at it explicitly; otherwise walk up from here
 * looking for `_kit/backlog/index.json`. Returns null when there is none, so
 * a hub on the VM falls through to GitHub unchanged.
 */
function localIndexPath() {
  const fs = require('fs');
  const path = require('path');
  if (process.env.SLATE_INDEX) {
    return fs.existsSync(process.env.SLATE_INDEX) ? process.env.SLATE_INDEX : null;
  }
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, '_kit', 'backlog', 'index.json');
    if (fs.existsSync(candidate)) return candidate;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, data }

/** BI26091304: canon-canvas filenames look like
 *  `20260818_canon_project_development_canvas_animate_core_v0_0_0.md` --
 *  title + version parsed out, newest-first. A file that doesn't match the
 *  expected shape still shows up (its raw filename as the title), rather
 *  than being silently dropped. */
function parseCanonDocs(files) {
  return files
    .map(f => {
      const m = f.name.match(/^(\d{8})_canon_(.+)_v(\d+)_(\d+)_(\d+)\.md$/i);
      if (!m) return { name: f.name, title: f.name, version: null, date: null, path: f.path };
      const [, date, slug, major, minor, patch] = m;
      const title = slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { name: f.name, title, version: `${major}.${minor}.${patch}`, date, path: f.path };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(d => ({
      title: d.title,
      version: d.version,
      url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/${REF}/${d.path}`,
    }));
}

function isSchemaMd(name) {
  return Object.values(CATEGORY_FILES).some(files => files.includes(name));
}

async function fetchTree(token, request) {
  const r = await request(`/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REF}?recursive=1`, token);
  if (r.status !== 200) throw new Error(`GitHub tree fetch failed: HTTP ${r.status}`);
  const parsed = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  return (parsed.tree || []).filter(e => e.type === 'blob');
}

async function fetchRaw(path, token, request) {
  const r = await request(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${REF}`,
    token, 'application/vnd.github.raw'
  );
  if (r.status !== 200) return '';
  return typeof r.data === 'string' ? r.data : '';
}

/**
 * Group tree entries by project: any path matching work/dev/<...>/_next/backlog/<file>
 * or work/dev/<...>/_next/<file> (a document sitting beside the backlog).
 * The project name is the folder directly containing _next/ -- independent
 * of how deep it sits (Systems/QSpace/qspace-press, _core/finance-core, etc),
 * matching listProjects()'s own walk in session-purpose.js. Deliberately NOT
 * resolved via work/_registry.tsv -- confirmed 15 Sep 2026 that 14 of its 20
 * rows point at paths that don't exist in this checkout.
 *
 * Deliberately separated from buildBacklog() and exported on its own: this
 * is the discovery step, distinct from the has-live-rows filter buildBacklog
 * applies afterward. Conflating the two cost three exchanges to untangle on
 * 15 Sep 2026 -- a real report claimed only 10 of 20 projects were tracked
 * in _kit, when in fact all 20 were discovered here and 10 were correctly
 * hidden downstream for having zero live rows. Testing this function in
 * isolation (see test/backlog.test.js) is what would have caught that
 * before the report was written, not after.
 */
function discoverProjects(entries) {
  const projects = new Map(); // name -> { backlogFiles: Map<filename, path>, docFiles: [{name, path}], canonFiles: [{name, path}] }
  const ensure = (name) => {
    if (!projects.has(name)) projects.set(name, { backlogFiles: new Map(), docFiles: [], canonFiles: [] });
    return projects.get(name);
  };

  for (const e of entries) {
    // work/_arc/<project>/canon-canvas/<file>.md -- BI26091304's Canon tab.
    // Same key namespace as work/dev/'s project folder names (confirmed
    // already organized one folder per project); matched here rather than
    // via a separate fetch, since the tree is already in hand.
    const canonMatch = e.path.match(/^work\/_arc\/([^/]+)\/canon-canvas\/([^/]+\.md)$/);
    if (canonMatch) {
      const [, project, filename] = canonMatch;
      ensure(project).canonFiles.push({ name: filename, path: e.path });
      continue;
    }

    const m = e.path.match(/^work\/dev\/(?:.+\/)?([^/]+)\/_next\/(?:backlog\/)?([^/]+)$/);
    if (!m) continue;
    const inBacklog = /\/_next\/backlog\//.test(e.path);
    const [, project, filename] = m;
    const p = ensure(project);
    if (inBacklog) {
      p.backlogFiles.set(filename, e.path);
    } else if (/\.(md|tsv)$/i.test(filename)) {
      // A file sitting directly under _next/ (not _next/backlog/) that isn't
      // itself a backlog table -- a supervisor open-questions log, a
      // content-qa-matrix.tsv artifact, etc. Linked out, not parsed into rows.
      p.docFiles.push({ name: filename, path: e.path });
    }
  }
  return projects;
}

async function buildBacklog({
  force = false,
  request = githubApiRequest,
  token: tokenOverride,
  // Path to a local index.json. Defaults to auto-detect; pass null to force
  // the GitHub path (which is what the tests do, so their injected `request`
  // is actually exercised rather than silently bypassed).
  localIndex,
} = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const token = tokenOverride !== undefined ? tokenOverride : defaultGithubToken();
  const entries = await fetchTree(token, request);
  const projects = discoverProjects(entries);

  // Backlog v2: the drive-wide index is a single derived JSON file built
  // from the per-row files (`_next/rows/<ID>.md`). One fetch replaces the
  // ~90 raw markdown fetches + prose parsing this used to do, and the row
  // states arrive as fields rather than being inferred from glyphs.
  // Prefer a local index when one is present. `Sconl/_kit` is PRIVATE, so a
  // hub running locally without a GitHub token cannot read it at all -- and
  // the local file is fresher anyway, since `slatex export` writes it on
  // every commit. The VM keeps using GitHub, which is why this is a fallback
  // rather than a replacement.
  const local = localIndex === undefined ? localIndexPath() : localIndex;
  const raw = local
    ? require('fs').readFileSync(local, 'utf8')
    : await fetchRaw(INDEX_PATH, token, request);
  if (!raw) {
    throw new Error(
      `backlog index not found at ${INDEX_PATH} on ${REPO_OWNER}/${REPO_NAME}@${REF}. ` +
      'Run `node _kit/bin/backlog.js index` and push.'
    );
  }
  const index = JSON.parse(raw);

  const rowsByProject = new Map();
  for (const r of index.rows) {
    if (r.ar) continue; // archived; the done view reads these separately
    if (!rowsByProject.has(r.p)) rowsByProject.set(r.p, []);
    rowsByProject.get(r.p).push({
      id: r.id,
      title: r.ti,
      status: r.st,
      project: r.p,
      category: r.t,          // plan|build|work|light|content|manual
      subset: r.s || null,    // fix|jira|refine|organize|opsec|decision
      priority: r.pr,
      effort: r.ef || null,
      blockedOn: r.b || [],
      dependsOn: r.d || [],
      claimedBy: r.cb || null,
      updated: r.u || null,
      ready: r.st === 'ready' && (r.b || []).length === 0 && (r.d || []).length === 0,
      path: r.f,
      legacySource: null,
    });
  }
  // A project can hold rows without appearing in the tree walk (it may have
  // no _next/*.md documents at all), so make sure every indexed project shows.
  for (const key of rowsByProject.keys()) {
    if (!projects.has(key)) projects.set(key, { backlogFiles: new Map(), docFiles: [], canonFiles: [] });
  }

  const result = [];
  for (const [project, p] of projects) {
    const rows = rowsByProject.get(project) || [];
    if (!rows.length && !p.docFiles.length && !p.canonFiles.length) continue; // nothing to show
    result.push({
      project,
      rows,
      documents: p.docFiles.map(d => ({
        name: d.name,
        url: `https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/${REF}/${d.path}`,
      })),
      canon: parseCanonDocs(p.canonFiles),
    });
  }
  result.sort((a, b) => a.project.localeCompare(b.project));

  // Acceptance guard (15 Sep 2026): discoveredProjectCount is the tree-walk
  // step (discoverProjects) before the has-live-rows filter; shownProjectCount
  // is after. Exposing both distinguishes "a project isn't tracked/wasn't
  // found" from "a project was found but has nothing live to show" -- the
  // exact distinction a wrong report conflated the same day this shipped.
  // Consumers checking for a silent discovery drop should compare
  // discoveredProjectCount against a known project count, not shownProjectCount.
  const all = result.flatMap(p => p.rows);
  const countBy = key => all.reduce((acc, r) => {
    const k = r[key] || 'none';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const data = {
    projects: result,
    discoveredProjectCount: projects.size,
    shownProjectCount: result.length,
    // v2 summary -- the console renders these without recomputing.
    generated: index.generated,
    fingerprint: index.fingerprint,
    totals: {
      rows: all.length,
      ready: all.filter(r => r.ready).length,
      blocked: all.filter(r => r.status === 'blocked').length,
      claimed: all.filter(r => r.status === 'claimed').length,
      byType: countBy('category'),
      bySubset: countBy('subset'),
    },
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { buildBacklog, discoverProjects, INDEX_PATH };
