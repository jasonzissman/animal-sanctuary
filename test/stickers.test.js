import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0168: the sticker book (pure rows + queue), the Pegatinas tab of the album and the earn celebration.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/save.js', 'game/album.js', 'game/photo.js', 'game/data/badges.js', 'game/badges.js', 'game/rescue-log.js', 'game/badges-board.js',
  'game/stickers.js', 'game/ui/stickers-page.js', 'game/ui/sticker-pop.js', 'game/ui/album-view.js'];

function setup() {
  const events = [];
  const SA = loadGame(FILES, { SAT: { track: (t, f) => events.push([t, f]) } });
  SA.save.reset();
  return SA;
}
const plain = (o) => JSON.parse(JSON.stringify(o));

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

const DATA = [
  { id: 'a', es: 'Amigo de las tortugas', en: 'Turtle friend', icon: '🐢', rule: { animalId: 'tortuga', count: 5 } },
  { id: 'b', es: 'Primer rescate', icon: '⭐', rule: { count: 1 } },
  { id: 'c', es: 'Súper ayudante', icon: '🦸', rule: { count: 25 } },
  { id: 'd', es: 'Búho nocturno', icon: '🦉', rule: { night: true, count: 3 } },
];
const PROGRESS = [
  { id: 'a', have: 3, need: 5, earned: false }, { id: 'b', have: 1, need: 1, earned: true },
  { id: 'c', have: 0, need: 25, earned: false }, { id: 'd', have: 0, need: 3, earned: false },
];
function fixed(SA) {
  const board = SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA, lookup: (k, id) => SA.data.get(k, id) });
  return SA.stickers.create({ board });
}

test('rows: earned first, then in progress, then grey; label has have/need and the noun, dots for small goals', () => {
  const SA = setup();
  const rows = fixed(SA).rows();
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a', 'c', 'd']);
  const a = rows.find((r) => r.id === 'a');
  assert.equal(a.label, '3/5 tortugas');
  assert.equal(a.dots, '●●●○○');
  assert.equal(a.state, 'progress');
  assert.equal(a.say, 'Amigo de las tortugas. Rescata 5 tortugas');
  assert.equal(rows[0].label, '✅');
  assert.equal(rows[0].dots, '');
  const c = rows.find((r) => r.id === 'c');
  assert.equal(c.dots, '', 'a big goal has no dot row');
  assert.equal(c.state, 'locked');
  assert.equal(JSON.stringify(fixed(SA).summary()), JSON.stringify({ earned: 1, total: 4 }));
  assert.equal(fixed(SA).lines(a), '¡Amigo de las tortugas!');
  assert.equal(fixed(SA).lines(null), '');
});

test('rows: a broken board gives an empty list, never an error', () => {
  const SA = setup();
  assert.equal(SA.stickers.create({ board: { rows() { throw new Error('x'); } } }).rows().length, 0);
  assert.equal(SA.stickers.create({ board: null }).rows().length, 0);
});

test('notify queues until a listener exists, then delivers once; a throwing listener never breaks play', () => {
  const SA = setup();
  const st = SA.stickers.create({ board: null });
  st.notify([{ id: 'x', es: 'X' }, null, {}]);
  const got = [];
  st.onEarn((r) => got.push(r.id));
  assert.deepEqual(got, ['x']);
  st.notify({ id: 'y' });
  st.onEarn(() => { throw new Error('boom'); });
  st.notify([{ id: 'z' }]);
  assert.deepEqual(got, ['x', 'y', 'z']);
  st.onEarn('not a function');
});

test('a rescue that earns a badge notifies the sticker book once (default log); a custom log stays silent', () => {
  const SA = setup();
  const got = [];
  SA.stickers.onEarn((r) => got.push(r.id));
  SA.rescueLog.record({ animalId: 'tortuga', need: 'thorn', biome: 'bosque', night: false });
  assert.ok(got.includes('primer-rescate') && got.includes('amigo-tortuga-bronce'), got.join());
  const n = got.length;
  SA.rescueLog.record({ animalId: 'tortuga', need: 'thorn', biome: 'bosque', night: false });
  assert.equal(got.length, n, 'each badge pops up once, ever');
  const mem = { data: { rescues: [], badges: [] }, get() { return this.data; }, update(p) { Object.assign(this.data, p); } };
  SA.rescueLog.create({ save: mem }).record({ animalId: 'conejo' });
  assert.equal(got.length, n, 'a separate instance does not notify');
  const seen = [];
  SA.rescueLog.create({ save: { data: { rescues: [], badges: [] }, get() { return this.data; }, update(p) { Object.assign(this.data, p); } },
    onEarned: (rows) => seen.push(rows.map((r) => r.id)) }).record({ animalId: 'conejo' });
  assert.ok(seen[0].includes('primer-rescate'));
  SA.rescueLog.create({ save: mem, onEarned() { throw new Error('boom'); } }).record({ animalId: 'pato' });   // swallowed
});

test('frame: flies in, holds at the centre, slaps onto the corner in about 2.4 s', () => {
  const SA = setup();
  const F = SA.stickerPop.frame, from = { x: 400, y: 700 }, to = { x: 760, y: 30 }, mid = { x: 400, y: 300 };
  const f0 = plain(F(0, from, to, mid)), fh = plain(F(1.2, from, to, mid)), fs = plain(F(2.2, from, to, mid)), fd = plain(F(3, from, to, mid));
  assert.equal(f0.phase, 'in');
  assert.deepEqual([f0.x, f0.y], [400, 700]);
  assert.equal(fh.phase, 'hold');
  assert.deepEqual([fh.x, fh.y], [400, 300]);
  assert.ok(fh.scale > 1.3 && fh.sparkles.length === 8 && fh.sparkles.every((s) => s.opacity === 1));
  assert.equal(fs.phase, 'slap');
  assert.ok(fs.x > 400 && fs.y < 300);
  assert.equal(fd.done, true);
  assert.deepEqual([fd.x, fd.y], [760, 30]);
  assert.ok(SA.stickerPop.DURATION_S >= 2 && SA.stickerPop.DURATION_S <= 3);
  assert.equal(F(-5, from, to, mid).phase, 'in', 'negative time is clamped');
  assert.equal(F(NaN, from, to).phase, 'in');
});

test('pop: sparkle + jingle at the start, the Spanish name spoken on landing, a pop on the slap, then it queues the next', () => {
  const SA = setup();
  const log = [], doc = fakeDoc();
  SA.audio = { sfx: (n) => log.push('sfx:' + n), say: (t) => log.push('say:' + t) };
  const rafs = [];
  const pop = SA.stickerPop.create({ doc, viewport: () => ({ w: 800, h: 600 }), raf: (fn) => rafs.push(fn) });
  assert.equal(pop.isShowing(), false);
  SA.stickers.notify([{ id: 'a', es: 'Amigo de las tortugas', icon: '🐢' }, { id: 'b', es: 'Primer rescate', icon: '⭐' }]);
  assert.equal(rafs.length, 1, 'one frame loop is scheduled');
  pop.update(0.1);
  assert.equal(pop.isShowing(), true);
  assert.equal(pop.pending(), 1);
  assert.deepEqual(log, ['sfx:sparkle', 'sfx:fanfare']);
  assert.equal(pop.element.style.display, 'block');
  const badge = pop.element.children[0];
  assert.equal(badge.textContent, '🐢');
  assert.match(badge.style.transform, /translate\(/);
  assert.equal(badge.style.pointerEvents, undefined);
  assert.match(badge.style.cssText, /pointer-events:none/, 'never eats a tap');
  assert.match(pop.element.style.cssText, /pointer-events:none/);
  pop.update(0.7);
  assert.ok(log.includes('say:¡Amigo de las tortugas!'));
  pop.update(1.4);
  assert.ok(log.includes('sfx:pop'));
  assert.equal(log.filter((l) => l.startsWith('say:')).length, 1, 'spoken once');
  pop.update(1);
  assert.equal(pop.isShowing(), true, 'the second sticker starts right away');
  assert.equal(badge.textContent, '⭐');
  for (let i = 0; i < 80; i++) pop.update(0.05);
  assert.equal(pop.isShowing(), false);
  assert.equal(pop.pending(), 0);
  assert.equal(pop.element.style.display, 'none');
  rafs.shift()();   // the scheduled loop ends quietly when idle
  assert.equal(rafs.length, 0);
});

test('pop: the frame loop runs off requestAnimationFrame timestamps and stops when idle; no DOM / no audio is harmless', () => {
  const SA = setup();
  const rafs = [];
  const pop = SA.stickerPop.create({ doc: fakeDoc(), raf: (fn) => rafs.push(fn) });   // no SA.audio at all
  pop.show({ id: 'q', es: 'Q', icon: '🏅' });
  pop.show(null);
  let ts = 1000;
  while (rafs.length && ts < 1000 + 5000) { const fn = rafs.shift(); ts += 100; fn(ts); }
  assert.equal(pop.isShowing(), false);
  assert.equal(SA.stickerPop.create({ doc: null }).element, null);
  assert.equal(SA.stickerPop.create({ doc: fakeDoc(), stickers: {} }).element, null, 'no sticker source to listen to');
});

test('Pegatinas tab: earned and grey locked stickers with progress; tapping speaks name and goal', () => {
  const SA = setup();
  const said = [];
  SA.audio = { say: (t) => said.push(t) };
  SA.rescueLog.record({ animalId: 'tortuga', need: 'thorn', biome: 'bosque', night: false });
  SA.rescueLog.record({ animalId: 'tortuga', need: 'mud', biome: 'bosque', night: false });
  const doc = fakeDoc();
  const v = SA.albumView.create(doc);
  v.open();
  assert.equal(v.tab(), 'animales');
  const buttons = walk(doc.body).filter((n) => n.tag === 'button');
  const tabBtn = buttons.find((b) => b.textContent === '🏅 Pegatinas');
  assert.ok(tabBtn && buttons.some((b) => b.textContent === '🐾 Animales'));
  tabBtn.fire('click');
  assert.equal(v.tab(), 'pegatinas');
  const all = walk(doc.body);
  const total = SA.data.all('badges').length;
  const stickers = all.filter((n) => n.attrs.role === 'button');
  assert.equal(stickers.length, total, 'one per badge');
  const grey = stickers.filter((s) => /#e4e4e4/.test(s.style.cssText));
  const gold = stickers.filter((s) => /#ffe27a/.test(s.style.cssText));
  assert.ok(gold.length >= 2 && grey.length > 10 && gold.length + grey.length === total);
  assert.ok(all.some((n) => n.textContent === '2/5 tortugas'), 'progress shows what to chase');
  assert.ok(all.some((n) => n.textContent === '●●○○○'));
  assert.ok(all.some((n) => /^🏅 Pegatinas \d+\/\d+$/.test(n.textContent)), 'title counts them: ' + all.map((n) => n.textContent).filter((t) => /Pegatinas/.test(t)).join('|'));
  const turtle = stickers.find((s) => s.attrs['aria-label'] === 'Amigo de las tortugas');
  turtle.fire('click');
  assert.deepEqual(said, ['Amigo de las tortugas. Rescata 1 tortuga']);
  grey.find((s) => s.attrs['aria-label'] === 'Amigo de las tortugas').fire('click');
  assert.equal(said[1], 'Amigo de las tortugas. Rescata 5 tortugas');
  // back to the animals; opening straight on the stickers also works
  buttons.find((b) => b.textContent === '🐾 Animales').fire('click');
  assert.equal(v.tab(), 'animales');
  assert.equal(walk(doc.body).filter((n) => n.attrs.role === 'button').length, SA.data.all('animals').filter((a) => !a.easterEgg && !a.story).length);
  v.close();
  v.open('pegatinas');
  assert.equal(v.tab(), 'pegatinas');
  v.open('animales');
  assert.equal(v.tab(), 'animales');
});

test('stickers page: no DOM or no sticker module is a quiet no-op', () => {
  const SA = setup();
  assert.equal(SA.stickersPage.fill(null, {}).count, 0);
  assert.equal(SA.stickersPage.fill(fakeDoc(), null).count, 0);
  const r = SA.stickersPage.fill(fakeDoc(), fakeDoc().createElement('div'), { english: true });
  assert.equal(r.count, SA.data.all('badges').length);
});
