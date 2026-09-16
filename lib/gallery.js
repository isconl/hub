'use strict';
/**
 * BM26091507: Circle Gallery -- composes circle's people/tags data with
 * vault's general-purpose OneDrive browser (onedrive.browse.*, routed
 * through hub's capability router same as every other cross-engine call --
 * see lib/router.js) into one filtered photo/video view, plus upload and
 * move/reclassify actions. This module owns no storage of its own; every
 * write ultimately lands through vault's onedrive-browse.js.
 *
 * REAL PATHS (confirmed by a prior audit, BM26091507's own row text):
 *  - Events live at `Sconl/Circle/Social/Events/` (top-level Sconl/Circle,
 *    NOT nested under Core/Apex/Circle -- that path holds unrelated
 *    chat-archives/ only).
 *  - Per-person media lives under that person's own OneDrive folder
 *    (circle's FOLDER column, e.g. `Circle/Social/<id>`, already returned
 *    by circle.people.list) at `<FOLDER>/Gallery/{photos,videos,captures}-<id>`
 *    (OM26090502's migrated convention). The `<name>` slot in that
 *    convention is taken as the person's ID (already a filesystem-safe
 *    slug), not their display NAME, since NAME can contain spaces/
 *    punctuation a path segment shouldn't carry -- a judgment call, see
 *    the BM26091507 closure report for the reasoning.
 */

const MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tiff', 'tif',
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm',
]);

const GALLERY_KINDS = ['photos', 'videos', 'captures'];
const EVENTS_PATH = 'Sconl/Circle/Social/Events';

// Graph's simple (non-resumable) PUT ceiling is 4MB of decoded bytes; base64
// inflates ~1.37x, but we check the DECODED size so the limit means what it
// says regardless of encoding overhead. uploadLarge()'s resumable session
// exists in vault/lib/onedrive-browse.js for exactly the case above this,
// but isn't reachable through the JSON capability router (engine-client.js's
// raw() always JSON-encodes the body/response -- see api-compat.js's own
// comment on the Teams onepage/export gap for the same limitation). Large-
// file gallery upload is deferred, not silently broken: this throws a clear,
// actionable error instead of a truncated/failed upload.
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

function ext(name) {
  const m = /\.([^.]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function isMedia(item) {
  return !item.folder && MEDIA_EXTENSIONS.has(ext(item.name));
}

function clean(s) {
  return String(s || '').replace(/^\/+|\/+$/g, '');
}

/** `<FOLDER>/Gallery/<kind>-<id>` for one person/kind, per OM26090502. */
function personGalleryPath(person, kind) {
  if (!GALLERY_KINDS.includes(kind)) throw new Error(`unknown gallery kind "${kind}"`);
  const folder = clean(person.FOLDER);
  if (!folder || folder === '-') throw new Error(`${person.NAME || person.ID} has no OneDrive folder on record`);
  return `${folder}/Gallery/${kind}-${person.ID}`;
}

function eventPath(eventName) {
  return `${EVENTS_PATH}/${clean(eventName)}`;
}

async function onedriveList(router, path) {
  const r = await router.route('onedrive.browse.list', { query: { path } });
  if (!r.ok || !r.data || !r.data.ok) return { ok: false, items: [] };
  return { ok: true, items: r.data.items || [] };
}

/** True if `path` exists as a real folder right now (list, not create) --
 *  the check every ensurePath() step needs before it's safe to mkdir, since
 *  vault's mkdir() unconditionally passes conflictBehavior:'rename' and
 *  would silently create a sibling "Gallery 1" duplicate rather than
 *  reusing an existing folder. */
async function pathExists(router, path) {
  const r = await router.route('onedrive.browse.list', { query: { path } });
  return !!(r.ok && r.data && r.data.ok);
}

/** Create every missing segment of `fullPath`, leaf-first-safe (walks root
 *  to leaf), skipping any segment that already exists. */
async function ensurePath(router, fullPath) {
  const segments = clean(fullPath).split('/').filter(Boolean);
  let cur = '';
  for (const seg of segments) {
    const parent = cur;
    cur = cur ? `${cur}/${seg}` : seg;
    if (await pathExists(router, cur)) continue;
    const mkr = await router.route('onedrive.browse.mkdir', { body: { parentPath: parent, folderName: seg } });
    if (!mkr.ok || !mkr.data || !mkr.data.ok) {
      throw new Error(`could not create OneDrive folder "${cur}": ${(mkr.data && mkr.data.error) || mkr.error || 'unknown error'}`);
    }
  }
}

/** Every distinct person/tag/event value the filter bar can offer, read
 *  live -- never cached beyond the router's own registry TTL. */
async function listFilters(router) {
  const [peopleR, tagsR, eventsR] = await Promise.all([
    router.route('circle.people.list', {}),
    router.route('circle.tags.list', {}),
    onedriveList(router, EVENTS_PATH),
  ]);
  const people = (peopleR.ok && peopleR.data && Array.isArray(peopleR.data.people)) ? peopleR.data.people : [];
  const tags = (tagsR.ok && tagsR.data && Array.isArray(tagsR.data.tags)) ? tagsR.data.tags : [];
  const events = eventsR.items.filter(i => i.folder).map(i => i.name).sort((a, b) => a.localeCompare(b));
  return {
    people: people.map(p => ({ id: p.ID, name: p.NAME, circle: p.CIRCLE, tags: String(p.TAGS || '').split(',').map(t => t.trim()).filter(t => t && t !== '-') })),
    tags: tags.map(t => t.tag),
    events,
  };
}

/**
 * Gallery items for one filter selection.
 *  - scope 'person': merges the three Gallery/{kind}-<id> subfolders for
 *    one person, tagging each item with which kind it came from.
 *  - scope 'event': the event's own folder, plus one level of subfolders
 *    (an event routinely has per-date/per-contributor subfolders) --
 *    bounded to depth 1 so a large Events tree can't recurse unbounded.
 */
async function listItems(router, { scope, id }) {
  if (!id) throw new Error('id is required');
  if (scope === 'person') {
    const peopleR = await router.route('circle.people.list', {});
    const people = (peopleR.ok && peopleR.data && Array.isArray(peopleR.data.people)) ? peopleR.data.people : [];
    const person = people.find(p => p.ID === id);
    if (!person) throw new Error(`no such person "${id}"`);
    const perKind = await Promise.all(GALLERY_KINDS.map(async (kind) => {
      const path = personGalleryPath(person, kind);
      const { items } = await onedriveList(router, path);
      return items.filter(isMedia).map(it => ({ ...it, kind, path }));
    }));
    return { ok: true, person: { id: person.ID, name: person.NAME }, items: perKind.flat() };
  }
  if (scope === 'event') {
    const base = eventPath(id);
    const top = await onedriveList(router, base);
    const files = top.items.filter(isMedia).map(it => ({ ...it, kind: 'event', path: base }));
    const subfolders = top.items.filter(i => i.folder);
    const nested = await Promise.all(subfolders.map(async (f) => {
      const subPath = `${base}/${f.name}`;
      const { items } = await onedriveList(router, subPath);
      return items.filter(isMedia).map(it => ({ ...it, kind: 'event', path: subPath, subfolder: f.name }));
    }));
    return { ok: true, event: id, items: [...files, ...nested.flat()] };
  }
  throw new Error(`unknown scope "${scope}" -- expected "person" or "event"`);
}

/** Upload one file into a person's or event's Gallery folder, creating any
 *  missing folder segment first. `contentBase64` is the raw file, base64-
 *  encoded (matches onedrive.browse.upload's existing contract). */
async function uploadItem(router, { scope, id, kind, fileName, contentBase64, contentType }) {
  if (!fileName) throw new Error('fileName is required');
  if (!contentBase64) throw new Error('contentBase64 is required');
  const bytes = Buffer.byteLength(contentBase64, 'base64');
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(`${fileName} is ${(bytes / (1024 * 1024)).toFixed(1)}MB -- gallery uploads are capped at ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(1)}MB for now (resize/compress, or use the OneDrive app directly for large originals).`);
  }

  let targetFolder;
  if (scope === 'person') {
    const peopleR = await router.route('circle.people.list', {});
    const people = (peopleR.ok && peopleR.data && Array.isArray(peopleR.data.people)) ? peopleR.data.people : [];
    const person = people.find(p => p.ID === id);
    if (!person) throw new Error(`no such person "${id}"`);
    targetFolder = personGalleryPath(person, kind || 'photos');
  } else if (scope === 'event') {
    targetFolder = eventPath(id);
  } else {
    throw new Error(`unknown scope "${scope}" -- expected "person" or "event"`);
  }

  await ensurePath(router, targetFolder);
  const r = await router.route('onedrive.browse.upload', { body: { folderPath: targetFolder, fileName, contentBase64, contentType } });
  if (!r.ok || !r.data || !r.data.ok) throw new Error((r.data && r.data.error) || r.error || 'upload failed');
  return { ok: true, item: r.data.item, folderPath: targetFolder };
}

module.exports = {
  MEDIA_EXTENSIONS, GALLERY_KINDS, EVENTS_PATH, MAX_UPLOAD_BYTES,
  isMedia, personGalleryPath, eventPath, ensurePath, pathExists,
  listFilters, listItems, uploadItem,
};
