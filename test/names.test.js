import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0169: naming a rescued animal ('Luna la rápida'): pure compose/offers/session, the save, the name card, the floating label, the album list.
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/save.js', 'game/data/names.js', 'game/names.js', 'game/ui/name-card.js', 'game/render/instances.js', 'game/render/name-labels.js'];

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function setup(storage = fakeStorage(), extra = {}) {
  const events = [];
  const SA = loadGame(FILES, { localStorage: storage, SAT: { track: (t, f) => events.push([t, f]) }, ...extra });
  SA.save.reset();
  return { SA, events, storage };
}
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('compose agrees the article and the ending with the animal gender', () => {
  const { SA } = setup();
  assert.equal(SA.names.compose('luna', 'rapido', 'f'), 'Luna la rápida');
  assert.equal(SA.names.compose('coco', 'rapido', 'm'), 'Coco el rápido');
  assert.equal(SA.names.compose('pipo', 'dormilon', 'f'), 'Pipo la dormilona');
  assert.equal(SA.names.compose('sol', 'jugueton', 'm'), 'Sol el juguetón');
  assert.equal(SA.names.compose('nube', 'pequeno', 'f'), 'Nube la pequeña');
  assert.equal(SA.names.compose('tito', 'lento', 'm'), 'Tito el lento');
});

test('invariant adjectives keep one form for both genders', () => {
  const { SA } = setup();
  assert.equal(SA.names.compose('luna', 'valiente', 'f'), 'Luna la valiente');
  assert.equal(SA.names.compose('coco', 'valiente', 'm'), 'Coco el valiente');
  assert.equal(SA.names.compose('luna', 'grande', 'f'), 'Luna la grande');
  assert.equal(SA.names.compose('coco', 'grande', 'm'), 'Coco el grande');
});

test('compose without an adjective is the name alone; unknown input is safe', () => {
  const { SA } = setup();
  assert.equal(SA.names.compose('luna', null, 'f'), 'Luna');
  assert.equal(SA.names.compose('', 'rapido', 'f'), '');
  assert.equal(SA.names.compose('Mora', 'rapido', 'f'), 'Mora la rápida');   // text that is not a data id still works
  assert.equal(SA.names.article('f'), 'la');
  assert.equal(SA.names.article('m'), 'el');
});

test('every adjective has both forms and every shipped animal gender gives a clean phrase', () => {
  const { SA } = setup();
  assert.ok(SA.data.all('names').length >= 12);
  SA.data.all('nameAdjectives').forEach((a) => {
    ['m', 'f'].forEach((g) => assert.match(SA.names.compose('luna', a, g), /^Luna (el|la) \S+$/));
  });
});

test('the data validators reject bad rows', () => {
  const { SA } = setup();
  assert.throws(() => SA.data.register('names', [{ id: 'x1', es: 'X', g: 'q' }]), /g/);
  assert.throws(() => SA.data.register('nameAdjectives', [{ id: 'bad', icon: '❓', m: 'malo' }]), /m\/f/);
  assert.throws(() => SA.data.register('nameAdjectives', [{ id: 'bad', icon: '❓', m: 'a', f: 'b', traits: { size: [] } }]), /traits/);
});

test('offers give 3 distinct names and 3 adjectives, trait words first', () => {
  const { SA } = setup();
  const names = SA.names.offerNames('conejo', seq(0.1, 0.9, 0.5));
  assert.equal(names.length, 3);
  assert.equal(new Set(names.map((n) => n.id)).size, 3);
  const adjs = SA.names.offerAdjectives('conejo');        // el conejo: pequeño, salta
  assert.equal(adjs.length, 3);
  assert.equal(new Set(adjs.map((a) => a.id)).size, 3);
  assert.ok(adjs.some((a) => a.id === 'rapido' || a.id === 'pequeno'), 'a word that fits its traits');
  assert.ok(adjs.some((a) => !a.traits), 'and a fun extra');
  assert.ok(SA.names.offerAdjectives('tortuga').some((a) => a.id === 'lento'), 'the turtle walks slowly');
  assert.equal(SA.names.offerAdjectives('nope').length, 3, 'an unknown animal still gets three');
});

test('give saves a name that survives a reload and the greeting uses the animal gender', () => {
  const storage = fakeStorage();
  const a = setup(storage);
  assert.equal(a.SA.names.give('tortuga#1', 'luna', 'rapido'), true);
  assert.equal(a.SA.names.give('conejo#2', 'coco', 'valiente'), true);
  assert.ok(a.SA.save.flush());
  assert.deepEqual(a.events.filter((e) => e[0] === 'names.given').map((e) => e[1].name), ['luna', 'coco']);
  const b = loadGame(FILES, { localStorage: storage });      // a reload: no reset
  assert.equal(b.names.has('tortuga#1'), true);
  assert.equal(b.names.text('tortuga#1'), 'Luna la rápida');
  assert.equal(b.names.greeting('tortuga#1'), '¡Hola, Luna la rápida!');
  assert.equal(b.names.text('conejo#2'), 'Coco el valiente');
  assert.equal(b.names.get('conejo#2').animalId, 'conejo');
  assert.equal(b.names.get('conejo#3'), null, 'another conejo keeps no name');
  assert.equal(b.names.friends().map((f) => f.id).sort().join(), 'conejo#2,tortuga#1');
});

test('give refuses unknown ids and bad keys', () => {
  const { SA } = setup();
  assert.equal(SA.names.give('conejo#1', 'zzz'), false);
  assert.equal(SA.names.give('conejo#1', 'luna', 'zzz'), false);
  assert.equal(SA.names.give('Bad Key', 'luna'), false);
  assert.equal(SA.names.give(7, 'luna'), false);
  assert.equal(SA.names.greeting('conejo#1'), '');
  assert.equal(SA.names.has('__proto__'), false);
});

test('save.names drops junk rows when read back', () => {
  const storage = fakeStorage({ santuario_save_v1: JSON.stringify({ version: 6, names: {
    'conejo#2': { animalId: 'conejo', name: 'luna', adj: 'rapido' }, 'Bad Key': { name: 'luna' }, 'pato#1': { name: 'Not Ok' },
    'gato#1': 'x', 'oso': { name: 'sol', adj: 'No' } } }) });
  const SA = loadGame(FILES, { localStorage: storage });
  assert.deepEqual(JSON.parse(JSON.stringify(SA.save.get().names)),
    { 'conejo#2': { animalId: 'conejo', name: 'luna', adj: 'rapido' }, oso: { animalId: 'oso', name: 'sol' } });
  const s2 = loadGame(FILES, { localStorage: fakeStorage({ santuario_save_v1: JSON.stringify({ version: 6, names: 5 }) }) });
  assert.deepEqual(JSON.parse(JSON.stringify(s2.save.get().names)), {});
});

test('session: pick a name, pick an adjective, saved; the options speak the agreeing phrase', () => {
  const { SA, events } = setup();
  const s = SA.names.session('tortuga#0', seq(0.3));
  assert.equal(s.step, 'name');
  assert.equal(s.options().length, 3);
  const name = s.options()[1];
  assert.equal(s.choose(1), 'adj');
  assert.match(s.text(), new RegExp('^' + name.es + '$'));
  const opts = s.options();
  assert.equal(opts.length, 3);
  opts.forEach((o) => assert.match(o.speak, new RegExp('^' + name.es + ' la ')));
  assert.equal(s.choose(0), 'done');
  assert.equal(s.result.text, opts[0].speak);
  assert.equal(SA.names.text('tortuga#0'), opts[0].speak);
  assert.equal(events.filter((e) => e[0] === 'names.given').length, 1);
});

test('session: skipping saves nothing; skipping after a name keeps the name alone', () => {
  const { SA, events } = setup();
  const a = SA.names.session('conejo#0');
  assert.equal(a.skip(), 'done');
  assert.equal(a.result, null);
  assert.equal(SA.names.has('conejo#0'), false);
  assert.equal(events.filter((e) => e[0] === 'names.skipped').length, 1);
  const b = SA.names.session('conejo#1');
  b.choose(0);
  b.skip();
  assert.equal(b.step, 'done');
  assert.equal(SA.names.has('conejo#1'), true);
  assert.equal(SA.names.get('conejo#1').adj, '');
  assert.equal(b.choose(0), 'done', 'a finished session ignores more taps');
  assert.equal(b.options().length, 0);
});

test('rescued() tells every listener and a throwing one never breaks the rest', () => {
  const { SA } = setup();
  const got = [];
  SA.names.onRescued(() => { throw new Error('x'); });
  SA.names.onRescued((id) => got.push(id));
  SA.names.onRescued('not a function');
  SA.names.rescued('conejo');
  assert.deepEqual(got, ['conejo']);
});

// ---- the card (fake DOM) ----

function fakeDoc() {
  const mk = (tag) => {
    const n = { tag, style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
      appendChild(c) { n.children.push(c); return c; },
      removeChild(c) { n.children.splice(n.children.indexOf(c), 1); return c; },
      setAttribute(k, v) { n.attrs[k] = v; },
      addEventListener(ev, fn) { (n.listeners[ev] = n.listeners[ev] || []).push(fn); },
      click() { (n.listeners.click || []).forEach((fn) => fn({ stopPropagation() {} })); } };
    Object.defineProperty(n, 'firstChild', { get: () => n.children[0] || null });
    return n;
  };
  return { createElement: mk, body: mk('body') };
}
const walk = (n, out = []) => { out.push(n); n.children.forEach((c) => walk(c, out)); return out; };
const buttons = (doc) => walk(doc.body).filter((n) => n.tag === 'button');

test('name card: name card, adjective card, saved and greeted aloud', () => {
  const said = [], toggles = [];
  const timers = [];
  const { SA } = setup(fakeStorage(), { setTimeout: (f) => { timers.push(f); return timers.length; } });
  const doc = fakeDoc();
  const card = SA.nameCard.create(doc, { onToggle: (on) => toggles.push(on), audio: { say: (t) => said.push(t) }, resolve: (a) => a + '#1' });
  assert.equal(card.isOpen(), false);
  assert.equal(card.offer('tortuga'), true);
  assert.deepEqual(toggles, [true]);
  assert.equal(card.offer('tortuga'), false, 'one card at a time');
  const cards = () => buttons(doc).filter((b) => b.children.length === 2);
  assert.equal(cards().length, 3, 'three name cards');
  cards()[0].click();
  assert.equal(cards().length, 3, 'three adjective cards');
  cards()[0].click();
  const result = SA.names.get('tortuga#1');
  assert.ok(result, 'saved for that individual');
  assert.match(said[said.length - 1], /^¡Hola, \S+ la \S+!$/);
  assert.equal(SA.names.greeting('tortuga#1'), said[said.length - 1]);
  timers.forEach((f) => f());
  assert.equal(card.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
  assert.equal(card.offer('tortuga'), false, 'an animal that already has a name is not asked again');
});

test('name card: the ✕ skips, and an unresolvable animal opens nothing', () => {
  const { SA } = setup();
  const doc = fakeDoc();
  const card = SA.nameCard.create(doc, { audio: { say() {} }, resolve: (a) => (a === 'conejo' ? 'conejo#4' : null) });
  assert.equal(card.offer('lince'), false);
  assert.equal(card.offer(5), false);
  assert.equal(card.offer('conejo'), true);
  const x = buttons(doc).find((b) => b.attrs['aria-label'] === 'Saltar');
  x.click();
  assert.equal(card.isOpen(), false);
  assert.equal(SA.names.has('conejo#4'), false);
  assert.equal(SA.nameCard.create(null).offer('conejo'), false);
});

// ---- the floating label ----

function stubThree() {
  class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
  class Obj {
    constructor() { this.children = []; this.visible = true; this.position = new Vec(); this.scale = new Vec(); this.userData = {}; this.name = ''; }
    add(...o) { o.forEach((c) => this.children.push(c)); }
  }
  return { Group: Obj, Sprite: class extends Obj { constructor(m) { super(); this.material = m; } },
    SpriteMaterial: class { constructor(o) { Object.assign(this, o); } }, CanvasTexture: class {} };
}
const flatDoc = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };

test('name labels: a named animal near the player shows its name; far away or unnamed shows nothing', () => {
  const { SA } = setup();
  const THREE = stubThree();
  const scene = new THREE.Group(), animals = new THREE.Group();
  const mkGroup = (name, x, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, 0, z); animals.add(g); return g; };
  mkGroup('tortuga#1', 3, 0); mkGroup('conejo#2', 40, 0); mkGroup('pato#0', 2, 2);
  SA.names.give('tortuga#1', 'luna', 'rapido');
  SA.names.give('conejo#2', 'coco', 'valiente');
  const labels = SA.render.createNameLabels(THREE, { scene, animals, doc: flatDoc });
  labels.update(0.1, { x: 0, z: 0 });
  assert.equal(labels.count(), 1);
  const s = labels.group.children[0];
  assert.equal(s.visible, true);
  assert.equal(s.position.x, 3);
  assert.ok(s.position.y > 0.6, 'above the animal');
  labels.update(0.1, { x: 100, z: 100 });
  assert.equal(labels.count(), 0);
  assert.equal(s.visible, false);
  labels.update(0.1, null);
  assert.equal(labels.count(), 0);
  assert.equal(SA.render.createNameLabels(THREE, { scene, animals, doc: { createElement: () => ({}) } }).count(), 0, 'no canvas: quietly nothing');
});
