import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/save.js', 'game/album.js', 'game/photo-store.js', 'game/album-pics.js', 'game/photo.js',
  'game/data/badges.js', 'game/badges.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));
const JPEG = 'data:image/jpeg;base64,AAAA';

function setup(extra = {}) {
  const SA = loadGame(FILES, extra);
  SA.save.reset();
  return SA;
}
const e = (n) => ({ id: 'p' + n, date: '2026-11-22' });

// --- keep rule ---
test('keep(): the first ever and the newest 3 stay, the rest are reported for deletion', () => {
  const SA = setup();
  let list = [];
  const dropped = [];
  for (let i = 1; i <= 12; i++) {
    const r = plain(SA.albumPics.keep(list, e(i)));
    list = r.keep;
    dropped.push(...r.drop);
  }
  assert.deepEqual(list.map((x) => x.id), ['p1', 'p10', 'p11', 'p12']);
  assert.deepEqual(dropped, ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
});

test('keep(): small lists lose nothing, bad input is tolerated, a repeated id is not doubled', () => {
  const SA = setup();
  assert.deepEqual(plain(SA.albumPics.keep([], e(1))), { keep: [e(1)], drop: [] });
  assert.deepEqual(plain(SA.albumPics.keep([e(1), e(2), e(3)], e(4))), { keep: [e(1), e(2), e(3), e(4)], drop: [] });
  assert.deepEqual(plain(SA.albumPics.keep(null, e(1))).keep, [e(1)]);
  assert.deepEqual(plain(SA.albumPics.keep([e(1), e(2)], e(2))).keep, [e(1), e(2)]);
});

test('cropRect(): frames the box with a margin, keeps the aspect and stays inside the canvas', () => {
  const SA = setup();
  const r = plain(SA.albumPics.cropRect({ x0: 100, y0: 100, x1: 200, y1: 160 }, 800, 600, 4 / 3));
  assert.ok(Math.abs(r.sw / r.sh - 4 / 3) < 1e-9);
  assert.ok(r.sw >= 130 && r.sx <= 100 && r.sx + r.sw >= 200);
  const edge = plain(SA.albumPics.cropRect({ x0: 760, y0: 560, x1: 800, y1: 600 }, 800, 600, 4 / 3));
  assert.ok(edge.sx >= 0 && edge.sy >= 0 && edge.sx + edge.sw <= 800 && edge.sy + edge.sh <= 600);
  const huge = plain(SA.albumPics.cropRect({ x0: -500, y0: -500, x1: 2000, y1: 2000 }, 800, 600, 4 / 3));
  assert.ok(huge.sw <= 800 && huge.sh <= 600);
});

// --- migration ---
test('migration: a v4 date-only album keeps every species and first date; progress is unchanged', () => {
  const SA = setup();
  const real = SA.data.all('animals').filter((a) => !a.easterEgg && !a.story);
  const old = { ...SA.save.defaults(), version: 4, album: {} };
  real.slice(0, 3).forEach((a, i) => { old.album[a.id] = `2026-10-0${i + 1}`; });
  old.album[real[3].id] = 'not a date';   // junk is dropped, as before
  const migrated = plain(SA.save.migrate(old));
  assert.equal(migrated.version, 6);
  real.slice(0, 3).forEach((a, i) => assert.deepEqual(migrated.album[a.id], { date: `2026-10-0${i + 1}`, pics: [] }));
  assert.equal(Object.keys(migrated.album).length, 3);
  SA.save.reset();
  SA.save.update({ album: migrated.album });
  assert.deepEqual(plain(SA.album.progress()), { found: 3, total: real.length });
  assert.equal(SA.album.entries().find((x) => x.id === real[1].id).date, '2026-10-02');
});

test('migration: a stored v4 save loads through localStorage without a wipe and without a corrupt copy', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const SA = setup({ localStorage: store });
  const old = { ...SA.save.defaults(), version: 4, stars: 7, album: { conejo: '2026-09-09' }, photos: { conejo: 2 } };
  mem.set(SA.save.KEY, JSON.stringify(old));
  const SA2 = loadGame(FILES, { localStorage: store });
  const s = plain(SA2.save.get());
  assert.equal(s.stars, 7);
  assert.deepEqual(s.album, { conejo: { date: '2026-09-09', pics: [] } });
  assert.equal(SA2.album.has('conejo'), true);
  assert.equal(mem.has('santuario_save_v1_corrupt'), false);
});

test('save.album drops malformed picture entries, dedupes ids and caps at 4', () => {
  const SA = setup();
  const pics = [e(1), e(2), e(2), { id: 'Bad Id', date: '2026-01-01' }, { id: 'x', date: 'soon' }, e(3), e(4), e(5), e(6)];
  const s = plain(SA.save.migrate({ ...SA.save.defaults(), album: { conejo: { date: '2026-01-02', pics, extra: 'x' } } }));
  assert.deepEqual(s.album, { conejo: { date: '2026-01-02', pics: [e(3), e(4), e(5), e(6)] } });
});

// --- store (stubbed IndexedDB) ---
function fakeIdb({ failOpen = false, failTx = false } = {}) {
  const data = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = {};
      const finish = () => setTimeout(() => (failTx ? tx.onerror && tx.onerror() : tx.oncomplete && tx.oncomplete()), 0);
      tx.objectStore = () => ({
        put(v, k) { if (!failTx) data.set(k, v); finish(); return {}; },
        get(k) { const r = { result: data.get(k) }; finish(); return r; },
        delete(k) { data.delete(k); finish(); return {} }
      });
      return tx;
    }
  };
  return {
    data,
    open() {
      const req = { result: db };
      setTimeout(() => (failOpen ? req.onerror && req.onerror() : (req.onupgradeneeded && req.onupgradeneeded(), req.onsuccess && req.onsuccess())), 0);
      return req;
    }
  };
}

test('photoStore: put / get / del round-trip through a stub IndexedDB', async () => {
  const SA = setup();
  const idb = fakeIdb();
  const st = SA.photoStore.create(idb);
  assert.equal(await st.available(), true);
  assert.equal(await st.put('conejo-1', JPEG), true);
  assert.equal(await st.get('conejo-1'), JPEG);
  assert.equal(await st.del('conejo-1'), true);
  assert.equal(await st.get('conejo-1'), null);
  assert.equal(await st.put('', JPEG), false);
  assert.equal(await st.get(5), null);
});

test('photoStore: missing, failing or throwing IndexedDB reports unavailable and never throws', async () => {
  const SA = setup();
  for (const idb of [undefined, null, {}, fakeIdb({ failOpen: true }), { open() { throw new Error('blocked'); } }]) {
    const st = SA.photoStore.create(idb);
    assert.equal(await st.available(), false);
    assert.equal(await st.put('a', JPEG), false);
    assert.equal(await st.get('a'), null);
    assert.equal(await st.del('a'), false);
  }
  const bad = SA.photoStore.create(fakeIdb({ failTx: true }));
  assert.equal(await bad.put('a', JPEG), false);
  assert.equal(await SA.photoStore.put('a', JPEG), false, 'the shared store has no indexedDB in node:vm');
});

// --- the flow ---
test('shot(): many photos of one species keep only the first and newest 3, and delete the dropped pictures', async () => {
  const SA = setup();
  const idb = fakeIdb();
  SA.albumPics.setStore(SA.photoStore.create(idb));
  SA.albumPics.setCapture(() => JPEG);
  const ids = [];
  SA.album.add('conejo');
  for (let i = 0; i < 9; i++) ids.push(await SA.albumPics.shot('conejo', new Date('2026-11-22T10:00:00Z')));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(ids.every((x) => typeof x === 'string'));
  const saved = plain(SA.albumPics.list('conejo'));
  assert.deepEqual(saved.map((x) => x.id), [ids[0], ...ids.slice(-3)]);
  assert.deepEqual([...idb.data.keys()].sort(), saved.map((x) => x.id).sort(), 'IndexedDB holds exactly the kept pictures');
  assert.deepEqual(Object.keys(plain(SA.save.get().album.conejo)).sort(), ['date', 'pics']);
  assert.ok(!JSON.stringify(SA.save.get()).includes('base64'), 'no image data in the save');
});

test('shot(): with IndexedDB unavailable or throwing the photo still counts and nothing throws', async () => {
  for (const idb of [undefined, fakeIdb({ failOpen: true }), fakeIdb({ failTx: true }), { open() { throw new Error('nope'); } }]) {
    const SA = setup();
    SA.albumPics.setStore(SA.photoStore.create(idb));
    SA.albumPics.setCapture(() => JPEG);
    assert.equal(SA.photo.record('pato'), 1);
    assert.equal(await SA.albumPics.shot('pato'), null);
    assert.equal(SA.album.has('pato'), true);
    assert.deepEqual(plain(SA.save.get().album.pato.pics), []);
  }
  const SA = setup();
  SA.albumPics.setCapture(() => { throw new Error('canvas tainted'); });
  assert.equal(SA.photo.record('pato'), 1, 'a throwing capture never breaks the photo');
  SA.albumPics.setCapture(() => 'not an image');
  assert.equal(await SA.albumPics.shot('pato'), null);
  SA.albumPics.setCapture(null);
  assert.equal(await SA.albumPics.shot('pato'), null);
  assert.equal(await SA.albumPics.shot('dragon'), null, 'unknown animals are ignored');
});

test('Álbum completo is still earned when every real species is photographed (with pictures on)', async () => {
  const SA = setup();
  SA.albumPics.setStore(SA.photoStore.create(fakeIdb()));
  SA.albumPics.setCapture(() => JPEG);
  const real = SA.data.all('animals').filter((a) => !a.easterEgg && !a.story);
  const badges = SA.badges.create({});
  real.forEach((a) => SA.photo.record(a.id));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(plain(SA.album.progress()), { found: real.length, total: real.length });
  assert.ok(plain(badges.check([])).includes('album-completo'));
});
