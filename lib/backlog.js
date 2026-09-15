'use strict';
/**
 * BI26091301: drive-wide Backlog view, reading live from GitHub (Sconl/_kit)
 * rather than local disk -- works identically whether hub runs locally or
 * on the OCI VM, where local-disk access to ~/_/.relay isn't possible.
 *
 * Dual-scheme aware (BO26091401's staged migration, 15 Sep 2026): a project
 * may be on the new 5-list scheme (plan/build/work/light/content, with
 * fix/refine/organize/opsec folded in as labelled subsets) or still on the
 * pre-migration scheme (separate fix.md/refine.md/organize.md/opsec.md).
 * Every category reads every filename that could hold its rows -- new name
 * first, then legacy name(s) -- and sums them, labelling legacy sources
 * distinctly, so a half-migrated drive is visible rather than silently
 * merged or silently dropped. Same approach `_kit/bin/sync-master-backlog.sh`
 * and `_kit/bin/session-purpose.js` already use -- reused here rather than
 * re-derived a third time, per Sconl's standing "no duplicate
 * implementations" preference. Drop the legacy filenames once every
 * project is confirmed migrated (step 4 of BO26091401's sequence).
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

// New-scheme-first, then legacy fallback(s) -- both read and summed.
// Matches sync-master-backlog.sh's SOURCES map exactly.
const CATEGORY_FILES = {
  plan: ['plan.md'],
  build: ['build.md', 'fix.md'],
  work: ['work.md'],
  light: ['light.md', 'refine.md', 'organize.md'],
  content: ['content.md'],
  hands: ['hands.md', 'opsec.md'],
  shelved: ['shelved.md'],
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, data }

/** Pull each markdown table row's id/title/status out of one category
 *  file's raw text. Table rows look like `| ID | **Title** | Task | [Status |] Notes |`
 *  -- plan.md has no Status column, every other category file does. */
function parseRows(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*#?\s*\|?\s*-{2,}/.test(line) || /^\|\s*-+\s*\|/.test(line)) continue; // header separator
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (!cells.length) continue;
    const idMatch = cells[0].match(/^([A-Za-z]{1,2}\d{6,})/);
    if (!idMatch) continue; // not a real row (header row, or a comment line starting with |)
    const titleMatch = line.match(/\*\*(.+?)\*\*/);
    // 5 cells (#, Title, Task, Status, Notes) -> status is cells[3].
    // 4 cells (#, Title, Task, Notes) -> plan.md shape, no status.
    const status = cells.length >= 5 ? cells[3] : null;
    rows.push({ id: idMatch[1], title: titleMatch ? titleMatch[1].trim() : cells[0], status });
  }
  return rows;
}

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

/** Bounded-concurrency map -- GitHub's API is fine with this volume, but
 *  firing 100+ requests fully in parallel is needlessly bursty. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
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

async function buildBacklog({ force = false, request = githubApiRequest, token: tokenOverride } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const token = tokenOverride !== undefined ? tokenOverride : defaultGithubToken();
  const entries = await fetchTree(token, request);
  const projects = discoverProjects(entries);

  // Every (project, category, filename-in-that-category) combination that
  // actually exists in the tree, fetched with bounded concurrency.
  const fetchJobs = [];
  for (const [project, p] of projects) {
    for (const [category, files] of Object.entries(CATEGORY_FILES)) {
      for (const filename of files) {
        const path = p.backlogFiles.get(filename);
        if (path) fetchJobs.push({ project, category, filename, path, isPrimary: filename === files[0] });
      }
    }
  }

  const fetched = await mapLimit(fetchJobs, 8, async (job) => ({
    ...job,
    text: await fetchRaw(job.path, token, request),
  }));

  const rowsByProject = new Map();
  for (const job of fetched) {
    const rows = parseRows(job.text);
    if (!rows.length) continue;
    if (!rowsByProject.has(job.project)) rowsByProject.set(job.project, []);
    const legacySource = job.isPrimary ? null : job.filename;
    for (const row of rows) {
      rowsByProject.get(job.project).push({ ...row, project: job.project, category: job.category, legacySource });
    }
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
  const data = {
    projects: result,
    discoveredProjectCount: projects.size,
    shownProjectCount: result.length,
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { buildBacklog, discoverProjects, parseRows, CATEGORY_FILES };
