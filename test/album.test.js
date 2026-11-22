import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/save.js', 'game/album.js', 'game/photo.js', 'game/ui/album-view.js'];

const plain = (o) => JSON.parse(JSON.stringify(o));

function setup(store) {
  const SA = loadGame(FILES, store ? { localStorage: store } : {});
  SA.save.reset();
  return SA;
}
const real = (SA) => SA.data.all('animals').filter((a) => !a.easterEgg && !a.story);

test('a fresh album shows a silhouette for every real animal and hides easter eggs', () => {
  const SA = setup();
  const es = plain(SA.album.entries());
  assert.equal(es.length, real(SA).length);
  for (const e of es) {
    assert.equal(e.seen, false);
    assert.equal(e.es, '?');
    assert.deepEqual(e.parts, []);
    assert.ok(e.silhouette);
    assert.equal(SA.album.speakKey(e), null);
  }
  assert.deepEqual(plain(SA.album.progress()), { found: 0, total: real(SA).length });
});

test('add() records the first-photo date once and unknown ids are ignored', () => {
  const SA = setup();
  assert.equal(SA.album.add('conejo', new Date('2026-11-22T10:00:00Z')), true);
  assert.equal(SA.album.add('conejo', new Date('2027-01-01T10:00:00Z')), false);
  assert.equal(SA.album.add('dragon'), false);
  assert.equal(SA.album.add(null), false);
  assert.deepEqual(plain(SA.save.get().album), { conejo: { date: '2026-11-22', pics: [] } });
  assert.equal(SA.album.has('conejo'), true);
  assert.equal(SA.album.has('pato'), false);
});

test('a photographed animal shows its icon, Spanish name with article, date and parts with icons', () => {
  const SA = setup();
  SA.album.add('conejo', new Date('2026-11-22T10:00:00Z'));
  const e = plain(SA.album.entries().find((x) => x.id === 'conejo'));
  const a = SA.data.get('animals', 'conejo');
  assert.equal(e.seen, true);
  assert.equal(e.icon, a.icon);
  assert.equal(e.es, 'el conejo');
  assert.equal(e.date, '2026-11-22');
  assert.equal(SA.album.speakKey(e), 'animal:conejo');
  assert.deepEqual(e.parts.map((p) => p.key), [...new Set(a.parts.map((p) => p.part))]);
  for (const p of e.parts) {
    assert.equal(p.es, SA.data.get('parts', p.key).label.es);
    assert.equal(p.speak, 'part:' + p.key);
    assert.ok(p.icon);
  }
  assert.deepEqual(plain(SA.album.progress()), { found: 1, total: real(SA).length });
  assert.equal(SA.album.entries().filter((x) => !x.seen).length, real(SA).length - 1);
});

test('every speakable album key exists in the vocab manifest and every part has an icon', () => {
  const SA = setup();
  for (const a of SA.data.all('animals')) SA.album.add(a.id);
  for (const e of SA.album.entries()) {
    assert.ok(SA.vocab.get(e.key), e.key);
    for (const p of e.parts) { assert.ok(SA.vocab.get(p.speak), p.speak); assert.notEqual(p.icon, '•', p.key); }
  }
});

test('easter-egg creatures appear only after you photograph them', () => {
  const SA = setup();
  const egg = SA.data.all('animals').find((a) => a.easterEgg);
  assert.ok(egg);
  assert.equal(SA.album.entries().some((e) => e.id === egg.id), false);
  SA.album.add(egg.id);
  assert.equal(SA.album.entries().some((e) => e.id === egg.id && e.seen), true);
  assert.equal(SA.album.progress().found, 0, 'eggs are a bonus, not part of the total');
});

test('taking a photo with SA.photo.record adds the animal to the album', () => {
  const SA = setup();
  SA.photo.record('pato');
  SA.photo.record('pato');
  assert.equal(SA.album.has('pato'), true);
  assert.match(SA.save.get().album.pato.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(SA.album.entries().filter((e) => e.seen).length, 1);
});

test('photos from before the album (no date) still count as found', () => {
  const SA = setup();
  SA.save.update({ photos: { rana: 2 } });
  const e = plain(SA.album.entries().find((x) => x.id === 'rana'));
  assert.equal(e.seen, true);
  assert.equal(e.date, null);
});

test('album state persists through the save and bad data is dropped on load', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const SA = setup(store);
  SA.album.add('tortuga', new Date('2026-11-22T00:00:00Z'));
  SA.save.flush();
  const raw = JSON.parse(mem.get(SA.save.KEY));
  assert.deepEqual(raw.album, { tortuga: { date: '2026-11-22', pics: [] } });
  raw.album.mono = 'yesterday';
  raw.album['Bad Id'] = '2026-01-01';
  mem.set(SA.save.KEY, JSON.stringify(raw));
  const SA2 = loadGame(FILES, { localStorage: store });
  assert.deepEqual(plain(SA2.save.get().album), { tortuga: { date: '2026-11-22', pics: [] } });
  assert.equal(SA2.album.has('tortuga'), true);
});

test('a save with no album (or a junk one) still loads and shows silhouettes', () => {
  const SA = setup();
  assert.equal(SA.save.get().album, undefined);
  assert.equal(SA.album.progress().found, 0);
  assert.deepEqual(plain(SA.save.migrate({ ...SA.save.defaults(), album: 'junk' }).album), {});
});

// --- the view, against a tiny fake DOM ---
function fakeDoc() {
  const mk = (tag) => {
    const n = { tag, style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
      appendChild(c) { n.children.push(c); return c; },
      removeChild(c) { n.children.splice(n.children.indexOf(c), 1); return c; },
      setAttribute(k, v) { n.attrs[k] = v; },
      addEventListener(ev, fn) { (n.listeners[ev] = n.listeners[ev] || []).push(fn); },
      fire(ev) { (n.listeners[ev] || []).forEach((fn) => fn({ stopPropagation() {}, preventDefault() {} })); } };
    Object.defineProperty(n, 'firstChild', { get: () => n.children[0] || null });
    return n;
  };
  return { createElement: mk, body: mk('body') };
}
const walk = (n, out = []) => { out.push(n); n.children.forEach((c) => walk(c, out)); return out; };

test('view: opens a page of cards, tapping a card or part speaks, silhouettes stay silent', () => {
  const SA = setup();
  const said = [];
  SA.audio = { say: (k) => said.push(k) };
  SA.album.add('conejo');
  const doc = fakeDoc();
  const toggles = [];
  const v = SA.albumView.create(doc, { onToggle: (on) => toggles.push(on) });
  assert.equal(v.isOpen(), false);
  v.element.fire('click');
  assert.equal(v.isOpen(), true);
  const all = walk(doc.body);
  const cards = all.filter((n) => n.attrs.role === 'button');
  assert.equal(cards.length, real(SA).length);
  const found = cards.find((c) => c.attrs['aria-label'] === 'el conejo');
  found.fire('click');
  assert.deepEqual(said, ['animal:conejo']);
  const chips = walk(found).filter((n) => n.tag === 'button' && n.attrs['aria-label'] !== 'Escuchar');
  assert.ok(chips.length >= 3);
  walk(found).find((n) => n.attrs['aria-label'] === 'Escuchar').fire('click');   // the 🔊 next to the name
  assert.deepEqual(said, ['animal:conejo', 'animal:conejo']);
  said.pop();
  chips[0].fire('click');
  assert.match(said[1], /^part:/);
  const silhouette = cards.find((c) => c.attrs['aria-label'] === '?');
  silhouette.fire('click');
  assert.equal(said.length, 2);
  v.close();
  assert.deepEqual(toggles, [true, false]);
});

test('view: no DOM is a harmless no-op', () => {
  const SA = setup();
  const v = SA.albumView.create(null);
  v.open(); v.close(); v.toggle();
  assert.equal(v.isOpen(), false);
});

// --- pictures (AS-0237) ---
const JPEG = 'data:image/jpeg;base64,AAAA';
const tick = () => new Promise((r) => setTimeout(r, 0));
const PIC_FILES = FILES.concat(['game/album-pics.js']);
function picSetup(store) {
  const SA = loadGame(PIC_FILES, {});
  SA.save.reset();
  SA.album.add('conejo');
  SA.save.update({ album: { conejo: { pics: [{ id: 'a', date: '2026-11-22' }, { id: 'b', date: '2026-11-23' }] } } });
  SA.albumPics.setStore(store);
  return SA;
}
const stubStore = (m) => ({ get: async (id) => (id in m ? m[id] : null) });

test('albumPics.load(): reads the saved pictures, skips missing ones, never rejects', async () => {
  const SA = picSetup(stubStore({ a: JPEG, b: 'junk' }));
  assert.deepEqual(plain(await SA.albumPics.load('conejo')), [{ id: 'a', date: '2026-11-22', src: JPEG }]);
  assert.deepEqual(plain(await SA.albumPics.load('pato')), []);
  assert.deepEqual(plain(await SA.albumPics.load('conejo', { get: async () => { throw new Error('x'); } })), []);
  assert.deepEqual(plain(await SA.albumPics.load('conejo', { get: () => { throw new Error('x'); } })), []);
  SA.albumPics.setStore(null);
  assert.deepEqual(plain(await SA.albumPics.load('conejo')), []);   // no store at all
});

test('view: pictures replace the icon, tap opens the big overlay with ✕ and 🔊, tap ✕ closes', async () => {
  const SA = picSetup(stubStore({ a: JPEG, b: JPEG }));
  const said = [];
  SA.audio = { say: (k) => said.push(k) };
  const doc = fakeDoc();
  const v = SA.albumView.create(doc);
  v.open();
  await tick(); await tick();
  const card = walk(doc.body).find((n) => n.attrs['aria-label'] === 'el conejo');
  const imgs = walk(card).filter((n) => n.tag === 'img');
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].src, JPEG);
  const thumb = walk(card).find((n) => n.tag === 'button' && n.children[0] && n.children[0].tag === 'img');
  thumb.fire('click');
  assert.deepEqual(said, ['animal:conejo']);   // opening the big picture says the name
  const bigImg = walk(doc.body).find((n) => n.tag === 'img' && n.attrs.alt === 'el conejo');
  assert.equal(bigImg.src, JPEG);
  const overlay = walk(doc.body).find((n) => n.children.includes(bigImg));
  assert.equal(overlay.style.display, 'flex');
  const bar = overlay.children[1].children;
  assert.equal(bar[0].textContent, '✕');
  assert.equal(bar[1].textContent, '🔊');
  bar[1].fire('click');
  assert.deepEqual(said, ['animal:conejo', 'animal:conejo']);
  bar[0].fire('click');
  assert.equal(overlay.style.display, 'none');
});

test('view: no stored pictures or an unavailable store keeps the icon card', async () => {
  for (const store of [stubStore({}), null, { get: async () => { throw new Error('no storage'); } }]) {
    const SA = picSetup(store);
    SA.audio = { say() {} };
    const doc = fakeDoc();
    SA.albumView.create(doc).open();
    await tick(); await tick();
    const card = walk(doc.body).find((n) => n.attrs['aria-label'] === 'el conejo');
    assert.equal(walk(card).filter((n) => n.tag === 'img').length, 0);
    assert.ok(walk(card).some((n) => n.textContent === SA.data.get('animals', 'conejo').icon));
  }
});
