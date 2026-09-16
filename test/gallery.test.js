'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gallery = require('../lib/gallery');

const PERSON = { ID: 'jane-doe', NAME: 'Jane Doe', CIRCLE: 'social', FOLDER: 'Circle/Social/jane-doe', TAGS: 'family, close' };

/** A fake router matching lib/router.js's route(capability, {params,query,body})
 *  shape -- `handlers` maps capability name -> (opts) => {ok,data}. */
function fakeRouter(handlers) {
  return {
    calls: [],
    route(capability, opts) {
      this.calls.push({ capability, opts });
      const h = handlers[capability];
      if (!h) return { ok: false, status: 404, error: `no fake handler for ${capability}` };
      return h(opts);
    },
  };
}

test('personGalleryPath builds <FOLDER>/Gallery/<kind>-<id>', () => {
  assert.equal(gallery.personGalleryPath(PERSON, 'photos'), 'Circle/Social/jane-doe/Gallery/photos-jane-doe');
  assert.equal(gallery.personGalleryPath(PERSON, 'videos'), 'Circle/Social/jane-doe/Gallery/videos-jane-doe');
  assert.throws(() => gallery.personGalleryPath(PERSON, 'bogus'));
  assert.throws(() => gallery.personGalleryPath({ ID: 'x', FOLDER: '-' }, 'photos'));
});

test('eventPath prefixes the confirmed real Events root', () => {
  assert.equal(gallery.eventPath('Family Reunion 2026'), 'Sconl/Circle/Social/Events/Family Reunion 2026');
});

test('isMedia keeps image/video extensions, drops folders and other files', () => {
  assert.equal(gallery.isMedia({ name: 'a.jpg' }), true);
  assert.equal(gallery.isMedia({ name: 'a.MP4' }), true);
  assert.equal(gallery.isMedia({ name: 'a.txt' }), false);
  assert.equal(gallery.isMedia({ name: 'a.jpg', folder: { childCount: 0 } }), false);
});

test('listFilters merges circle people/tags with the Events OneDrive folder listing', async () => {
  const router = fakeRouter({
    'circle.people.list': () => ({ ok: true, data: { people: [PERSON] } }),
    'circle.tags.list': () => ({ ok: true, data: { tags: [{ tag: 'family', count: 3 }, { tag: 'close', count: 1 }] } }),
    'onedrive.browse.list': ({ query }) => {
      assert.equal(query.path, gallery.EVENTS_PATH);
      return { ok: true, data: { ok: true, items: [{ name: 'Wedding', folder: { childCount: 2 } }, { name: 'notes.txt' }] } };
    },
  });
  const filters = await gallery.listFilters(router);
  assert.deepEqual(filters.people, [{ id: 'jane-doe', name: 'Jane Doe', circle: 'social', tags: ['family', 'close'] }]);
  assert.deepEqual(filters.tags, ['family', 'close']);
  assert.deepEqual(filters.events, ['Wedding']); // notes.txt (not a folder) excluded
});

test('listItems(person) merges the three Gallery/{kind}-<id> subfolders, filtered to media', async () => {
  const router = fakeRouter({
    'circle.people.list': () => ({ ok: true, data: { people: [PERSON] } }),
    'onedrive.browse.list': ({ query }) => {
      if (query.path.startsWith('Circle/Social/jane-doe/Gallery/photos-')) {
        return { ok: true, data: { ok: true, items: [{ id: '1', name: 'a.jpg' }, { id: '2', name: 'readme.txt' }] } };
      }
      if (query.path.startsWith('Circle/Social/jane-doe/Gallery/videos-')) {
        return { ok: true, data: { ok: true, items: [{ id: '3', name: 'b.mp4' }] } };
      }
      return { ok: true, data: { ok: true, items: [] } }; // captures-<id>: empty
    },
  });
  const result = await gallery.listItems(router, { scope: 'person', id: 'jane-doe' });
  assert.equal(result.items.length, 2);
  assert.ok(result.items.some(i => i.name === 'a.jpg' && i.kind === 'photos'));
  assert.ok(result.items.some(i => i.name === 'b.mp4' && i.kind === 'videos'));
});

test('listItems(person) throws for an unknown person rather than silently returning nothing', async () => {
  const router = fakeRouter({ 'circle.people.list': () => ({ ok: true, data: { people: [] } }) });
  await assert.rejects(() => gallery.listItems(router, { scope: 'person', id: 'nope' }), /no such person/);
});

test('listItems(event) lists the event folder plus one level of subfolders, bounded', async () => {
  const router = fakeRouter({
    'onedrive.browse.list': ({ query }) => {
      if (query.path === 'Sconl/Circle/Social/Events/Wedding') {
        return { ok: true, data: { ok: true, items: [{ id: '1', name: 'cover.jpg' }, { id: 'f1', name: 'Ceremony', folder: { childCount: 1 } }] } };
      }
      if (query.path === 'Sconl/Circle/Social/Events/Wedding/Ceremony') {
        return { ok: true, data: { ok: true, items: [{ id: '2', name: 'vows.png' }] } };
      }
      throw new Error(`unexpected path ${query.path}`);
    },
  });
  const result = await gallery.listItems(router, { scope: 'event', id: 'Wedding' });
  assert.equal(result.items.length, 2);
  assert.ok(result.items.some(i => i.name === 'cover.jpg'));
  assert.ok(result.items.some(i => i.name === 'vows.png' && i.subfolder === 'Ceremony'));
});

test('listItems rejects an unknown scope', async () => {
  const router = fakeRouter({});
  await assert.rejects(() => gallery.listItems(router, { scope: 'bogus', id: 'x' }), /unknown scope/);
});

test('ensurePath only mkdirs segments that do not already exist (never re-creates a real one)', async () => {
  const mkdirCalls = [];
  const router = fakeRouter({
    'onedrive.browse.list': ({ query }) => {
      // Every ancestor up through ".../Gallery" already exists; only the
      // leaf kind folder is missing.
      const existing = new Set(['Circle', 'Circle/Social', 'Circle/Social/jane-doe', 'Circle/Social/jane-doe/Gallery']);
      return { ok: true, data: { ok: existing.has(query.path), items: [] } };
    },
    'onedrive.browse.mkdir': ({ body }) => { mkdirCalls.push(body); return { ok: true, data: { ok: true, item: { name: body.folderName } } }; },
  });
  await gallery.ensurePath(router, 'Circle/Social/jane-doe/Gallery/photos-jane-doe');
  assert.equal(mkdirCalls.length, 1);
  assert.deepEqual(mkdirCalls[0], { parentPath: 'Circle/Social/jane-doe/Gallery', folderName: 'photos-jane-doe' });
});

test('uploadItem refuses a file over the size cap without calling upload at all', async () => {
  const router = fakeRouter({
    'circle.people.list': () => ({ ok: true, data: { people: [PERSON] } }),
    'onedrive.browse.upload': () => { throw new Error('should not be called'); },
  });
  const big = Buffer.alloc(4 * 1024 * 1024).toString('base64');
  await assert.rejects(() => gallery.uploadItem(router, { scope: 'person', id: 'jane-doe', kind: 'photos', fileName: 'big.jpg', contentBase64: big }), /capped at/);
});

test('uploadItem ensures the folder then uploads, for a person', async () => {
  const router = fakeRouter({
    'circle.people.list': () => ({ ok: true, data: { people: [PERSON] } }),
    'onedrive.browse.list': () => ({ ok: true, data: { ok: true, items: [] } }), // pretend nothing exists yet
    'onedrive.browse.mkdir': ({ body }) => ({ ok: true, data: { ok: true, item: { name: body.folderName } } }),
    'onedrive.browse.upload': ({ body }) => {
      assert.equal(body.folderPath, 'Circle/Social/jane-doe/Gallery/photos-jane-doe');
      assert.equal(body.fileName, 'a.jpg');
      return { ok: true, data: { ok: true, item: { id: 'x', name: 'a.jpg' } } };
    },
  });
  const small = Buffer.from('hello').toString('base64');
  const result = await gallery.uploadItem(router, { scope: 'person', id: 'jane-doe', kind: 'photos', fileName: 'a.jpg', contentBase64: small, contentType: 'image/jpeg' });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'a.jpg');
});

test('uploadItem for an event targets the event folder directly', async () => {
  const router = fakeRouter({
    'onedrive.browse.list': () => ({ ok: true, data: { ok: true, items: [] } }),
    'onedrive.browse.mkdir': ({ body }) => ({ ok: true, data: { ok: true, item: { name: body.folderName } } }),
    'onedrive.browse.upload': ({ body }) => {
      assert.equal(body.folderPath, 'Sconl/Circle/Social/Events/Wedding');
      return { ok: true, data: { ok: true, item: { id: 'x', name: body.fileName } } };
    },
  });
  const small = Buffer.from('hello').toString('base64');
  const result = await gallery.uploadItem(router, { scope: 'event', id: 'Wedding', fileName: 'cover.jpg', contentBase64: small });
  assert.equal(result.ok, true);
});

test('uploadItem rejects an unknown scope', async () => {
  const router = fakeRouter({});
  const small = Buffer.from('hello').toString('base64');
  await assert.rejects(() => gallery.uploadItem(router, { scope: 'bogus', id: 'x', fileName: 'a.jpg', contentBase64: small }), /unknown scope/);
});
