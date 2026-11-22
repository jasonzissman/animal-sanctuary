import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/inventory.js', 'game/data/missions.js', 'game/missions.js', 'game/data/intro.js', 'game/intro-dialogue.js', 'game/ui/intro-view.js'];
const KEY = 'santuario_save_v1';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

function setup(storage = fakeStorage()) {
  const timers = [];
  const SA = loadGame(FILES, { localStorage: storage, setTimeout: (f, ms) => (timers.push({ f, ms, live: true }), timers.length),
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].live = false; } });
  SA.save.load();
  return { SA, storage, timers };
}

test('the shipped intro is 3-4 short lines with a picture and a vocab key that exists', () => {
  const { SA } = setup();
  const lines = SA.data.all('intro');
  assert.ok(lines.length >= 3 && lines.length <= 4);
  lines.forEach((l, i) => {
    assert.equal(l.n, i + 1);
    assert.ok(l.es.split(/\s+/).length <= 6, l.es);
    assert.ok(l.icon);
    assert.equal(SA.vocab.get(l.vocabKey).es, l.es, 'spoken text equals the subtitle');
  });
  assert.match(lines[lines.length - 1].es, /^¡Vamos/);
  assert.match(lines[lines.length - 1].es, /misiones/);
});

test('intro data is validated at load', () => {
  const { SA } = setup();
  const ok = { id: 'x', n: 9, es: 'Hola.', icon: '👋', vocabKey: 'phrase:introhola' };
  assert.throws(() => SA.data.register('intro', [{ ...ok, es: 'uno dos tres cuatro cinco seis siete' }]));
  assert.throws(() => SA.data.register('intro', [{ ...ok, id: 'y', vocabKey: 'nope' }]));
  assert.throws(() => SA.data.register('intro', [{ ...ok, id: 'z', icon: '' }]));
});

test('state machine: next goes line by line and finishes on the last; skip ends it at once', () => {
  const { SA } = setup();
  const D = SA.introDialogue;
  let s = D.begin();
  const total = D.view(s).total;
  assert.deepEqual([D.view(s).index, D.view(s).done, D.view(s).label], [0, false, 'Siguiente']);
  for (let i = 1; i < total; i++) { s = D.next(s); assert.equal(D.view(s).index, i); assert.equal(D.view(s).done, false); }
  assert.equal(D.view(s).last, true);
  assert.equal(D.view(s).label, '¡Vamos!');
  s = D.next(s);
  assert.equal(s.done, true);
  assert.equal(s.skipped, false);
  assert.equal(D.next(s), s, 'done stays done');
  const k = D.skip(D.next(D.begin()));
  assert.deepEqual([k.done, k.skipped, k.index], [true, true, 1]);
  assert.equal(D.skip(null), null);
  assert.equal(D.view(null), null);
});

test('plays only on a new save; finishing sets introSeen, keeps la cámara and starts Mission 1', () => {
  const { SA } = setup();
  const D = SA.introDialogue;
  assert.equal(D.shouldPlay(), true);
  assert.equal(D.finish(D.begin()).ok, false, 'not finished yet');
  const r = D.finish(D.skip(D.begin()));
  assert.deepEqual({ ...r }, { ok: true, skipped: true, camera: true, mission: 'mama' });
  assert.equal(SA.save.get().introSeen, true);
  assert.equal(SA.inventory.has('camara'), true);
  assert.equal(SA.missions.active().id, 'mama');
  assert.equal(D.shouldPlay(), false);
  assert.equal(D.finish(D.skip(D.begin())).ok, false, 'never twice');
});

test('a save missing la cámara gets it back; a busy mission is left alone', () => {
  const { SA } = setup();
  SA.inventory.remove('camara');
  SA.missions.start('mama');
  const r = SA.introDialogue.finish(SA.introDialogue.skip(SA.introDialogue.begin()));
  assert.equal(r.camera, true);
  assert.equal(SA.inventory.has('camara'), true);
  assert.equal(r.mission, null);
  assert.equal(SA.missions.active().id, 'mama');
});

test('custom instances: no lines means nothing plays; track failures never break finish', () => {
  const { SA } = setup();
  const none = SA.introDialogue.create({ lines: [] });
  assert.equal(none.shouldPlay(), false);
  assert.equal(none.begin(), null);
  const d = SA.introDialogue.create({ track: () => { throw new Error('x'); }, inventory: { has: () => { throw new Error('z'); } }, missions: { active: () => { throw new Error('y'); } } });
  const r = d.finish(d.skip(d.begin()));
  assert.deepEqual({ ...r }, { ok: true, skipped: true, camera: false, mission: null });
});

// --- save flag ------------------------------------------------------------------------------------------------------------

test('save: new saves have introSeen false; a v3 save migrates to true and keeps its data', () => {
  assert.equal(setup().SA.save.get().introSeen, false);
  const old = { version: 3, stars: 6, inventory: { items: [{ id: 'camara', count: 1 }], equipped: null } };
  const { SA } = setup(fakeStorage({ [KEY]: JSON.stringify(old) }));
  const s = SA.save.get();
  assert.equal(s.version, 4);
  assert.equal(s.introSeen, true);
  assert.equal(s.stars, 6);
  assert.equal(SA.introDialogue.shouldPlay(), false, 'an existing save never auto-plays it');
});

test('save: introSeen survives updates and a reload; junk values fall back to false; a bad read is never wiped', () => {
  const st = fakeStorage();
  const a = setup(st);
  a.SA.save.update({ introSeen: true });
  a.SA.save.flush();
  assert.equal(setup(st).SA.save.get().introSeen, true);
  const junk = setup(fakeStorage({ [KEY]: JSON.stringify({ version: 4, introSeen: 'yes', stars: 2 }) }));
  assert.equal(junk.SA.save.get().introSeen, false);
  const bad = fakeStorage({ [KEY]: '{oops' });
  assert.equal(setup(bad).SA.save.get().introSeen, false);
  assert.equal(bad.getItem('santuario_save_v1_corrupt'), '{oops', 'the unreadable save is kept as a backup');
});

// --- overlay ------------------------------------------------------------------------------------------------------------

function fakeDom() {
  const mk = () => ({ style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
    appendChild(c) { this.children.push(c); }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; } });
  return { createElement: mk, body: mk() };
}
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)];
const find = (n, pred) => (pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean));

function view(opts) {
  const ctx = setup();
  const said = [];
  ctx.SA.audio = { say: (k, done) => { said.push({ k, done }); }, stopVoice() {} };
  const toggles = [];
  const v = ctx.SA.introView.create(fakeDom(), { onToggle: (on) => toggles.push(on), ...opts });
  return { ...ctx, v, said, toggles };
}
const click = (n) => n.listeners.click({ stopPropagation() {} });

test('overlay auto-plays on a new save: picture card, subtitle, voice, and a tap advances to the end', () => {
  const { SA, v, said, toggles } = view();
  assert.equal(v.isOpen(), true);
  assert.deepEqual(toggles, [true]);
  const lines = SA.data.all('intro');
  assert.equal(said[0].k, lines[0].vocabKey);
  assert.ok(texts(v.element).includes(lines[0].es));
  assert.ok(texts(v.element).includes(lines[0].icon));
  for (let i = 1; i < lines.length; i++) { click(v.element); assert.equal(said[i].k, lines[i].vocabKey); assert.ok(texts(v.element).includes(lines[i].es)); }
  click(v.element);
  assert.equal(v.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
  assert.equal(SA.save.get().introSeen, true);
  assert.equal(SA.missions.active().id, 'mama');
});

test('overlay: one tap on the skip button ends everything; Replay speaks the line again', () => {
  const { SA, v, said } = view();
  const replay = find(v.element, (n) => n.attrs['aria-label'] === 'Otra vez');
  click(replay);
  assert.equal(said.length, 2);
  assert.equal(said[1].k, said[0].k);
  click(find(v.element, (n) => n.attrs['aria-label'] === 'Saltar'));
  assert.equal(v.isOpen(), false);
  assert.equal(SA.save.get().introSeen, true);
  assert.equal(SA.missions.active().id, 'mama');
});

test('overlay: lines move on by themselves after the voice is done and the minimum time passed', () => {
  const { SA, v, said, timers } = view();
  const total = SA.data.all('intro').length;
  const fire = (i) => { const t = timers.filter((x) => x.live)[i]; t.live = false; t.f(); };
  said[0].done();                                   // voice done but too early: still on line 1
  assert.equal(said.length, 1);
  fire(0);                                          // MIN_MS passed: moves on
  assert.equal(said.length, 2);
  assert.equal(timers.filter((x) => x.live).length, 2, 'line 1 timers were cancelled; line 2 has its own pair');
  fire(1);                                          // the safety cap of line 2 moves on even with no voice callback
  assert.equal(said.length, 3);
  assert.ok(total >= 3);
});

test('overlay does not play on a seen save, and a missing DOM is a no-op', () => {
  const { SA } = setup(fakeStorage({ [KEY]: JSON.stringify({ version: 4, introSeen: true }) }));
  const v = SA.introView.create(fakeDom(), {});
  assert.equal(v.isOpen(), false);
  assert.equal(SA.introView.create(null, {}).element, null);
  const manual = SA.introView.create(fakeDom(), { auto: false });
  manual.close();
  assert.equal(manual.isOpen(), false);
});
