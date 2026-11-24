import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/inventory.js', 'game/map.js', 'game/station.js', 'game/npc.js',
  'game/data/missions.js', 'game/missions.js', 'game/scientist-talk.js', 'game/ui/scientist-view.js'];
const KEY = 'santuario_save_v1';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function setup(storage = fakeStorage()) {
  const SA = loadGame(FILES, { localStorage: storage, setTimeout: () => 1, clearTimeout() {} });
  SA.save.load();
  return SA;
}

const roles = (r) => Array.from(r.lines, (l) => l.role);   // plain array: the vm's arrays are from another realm

// --- pure reminder -------------------------------------------------------------------------------------------------------

test('no mission running: the general line, then "pick a mission at the board"; nothing is started', () => {
  const SA = setup();
  const r = SA.scientistTalk.reminder();
  assert.equal(r.state, 'choose');
  assert.equal(r.missionId, null);
  assert.deepEqual(roles(r), ['general', 'board']);
  assert.equal(r.lines[0].es, 'Ayuda a los animales: busca, ayuda, foto');
  assert.match(r.lines[1].es, /misión/);
  assert.equal(SA.missions.active(), null, 'asking for a reminder never starts a mission');
  assert.equal(SA.missions.status('mama'), 'available');
});

test('an active mission: general line, the mission card, and the step it is on', () => {
  const SA = setup();
  assert.equal(SA.missions.start('mama').ok, true);
  const r = SA.scientistTalk.reminder();
  assert.equal(r.state, 'active');
  assert.equal(r.missionId, 'mama');
  assert.deepEqual(roles(r), ['general', 'mission', 'step']);
  assert.equal(r.lines[1].es, '¿Dónde está mamá?');
  assert.equal(r.lines[1].icon, '🐷');
  assert.equal(r.lines[2].key, 'phrase:busca', 'mission 1 begins with the find step');
  SA.missions.advance();
  assert.equal(SA.scientistTalk.reminder().lines[2].icon, '👣', 'the step line follows the mission');
  assert.equal(SA.missions.active().step, 1, 'reading it did not move the mission');
});

test('every mission finished: the general line and a "more soon" line', () => {
  const SA = setup();
  SA.missions.start('mama');
  SA.missions.complete();
  SA.missions.start('huevo');
  SA.missions.complete();
  SA.missions.start('rio');
  SA.missions.complete();
  SA.missions.start('fiesta');
  SA.missions.complete();
  SA.missions.start('doctor');
  SA.missions.complete();
  SA.missions.start('aguila');
  SA.missions.complete();
  SA.missions.start('censo');
  SA.missions.complete();
  SA.missions.start('ladrones');
  SA.missions.complete();
  SA.missions.start('hogar');
  SA.missions.complete();
  const r = SA.scientistTalk.reminder();
  assert.equal(r.state, 'done');
  assert.deepEqual(roles(r), ['general', 'board']);
  assert.match(r.lines[1].es, /Pronto/);
});

test('reminder works with injected missions, unknown step kinds and a throwing source', () => {
  const SA = setup();
  const fake = { active: () => ({ id: 'x', mission: { es: 'Una misión', icon: '⭐' }, stepData: { kind: 'unheard-of' } }), next: () => null };
  assert.deepEqual(roles(SA.scientistTalk.reminder({ missions: fake })), ['general', 'mission'], 'unknown kinds have no step line');
  const boom = { active() { throw new Error('x'); }, next() { throw new Error('y'); } };
  assert.equal(SA.scientistTalk.reminder({ missions: boom }).state, 'done');
});

test('every line is short, has a picture, and its key is a vocab key or the mission title', () => {
  const SA = setup();
  SA.missions.start('mama');
  const lines = [...SA.scientistTalk.reminder().lines, ...Object.values(SA.scientistTalk.STEPS), SA.scientistTalk.GENERAL];
  lines.forEach((l) => {
    assert.ok(l.icon, l.es);
    assert.ok(l.es.split(/\s+/).length <= 7, l.es);
    if (/^phrase:/.test(l.key)) assert.equal(SA.vocab.get(l.key).es, l.es, 'spoken text equals the subtitle: ' + l.key);
  });
  assert.ok(SA.vocab.get('phrase:tomalefoto'));
});

// --- npc hook ------------------------------------------------------------------------------------------------------------

test('the scientist is a Use target near her post, tappable from a generous range, and talk fires listeners', () => {
  const SA = setup(), s = SA.npc.scientist(), t = SA.npc.useTarget();
  assert.deepEqual([t.id, t.kind, t.x, t.z], ['scientist', 'npc', s.x, s.z]);
  assert.ok(t.reach >= 2.5);
  assert.equal(SA.npc.useTargets()[0], t);
  assert.equal(SA.npc.useTargets(), SA.npc.useTargets(), 'stable list');
  assert.equal(SA.npc.canTap({ x: s.x, z: s.z - 5 }), true);
  assert.equal(SA.npc.canTap({ x: s.x, z: s.z - 40 }), false);
  assert.equal(SA.npc.canTap(null), false);
  assert.equal(SA.npc.talk('use'), false, 'no listener: nothing handled it');
  const got = [];
  const off = SA.npc.onTalk((src) => { got.push(src); });
  assert.equal(SA.npc.talk('tap'), true);
  SA.npc.onTalk(() => { throw new Error('bad listener'); });
  assert.equal(SA.npc.talk(), true, 'a broken listener never breaks play');
  off();
  assert.deepEqual(got, ['tap', 'api']);
  assert.equal(SA.npc.onTalk(null)(), undefined);
});

// --- overlay -------------------------------------------------------------------------------------------------------------

function fakeDom() {
  const mk = () => ({ style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
    appendChild(c) { this.children.push(c); }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; } });
  return { createElement: mk, body: mk() };
}
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)];
const find = (n, pred) => (pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean));
const click = (n) => n.listeners.click({ stopPropagation() {}, target: n });

function views(storage) {
  const SA = setup(storage), said = [];
  SA.audio = { say: (k, done) => { said.push({ k, done }); }, stopVoice() {} };
  const toggles = [];
  const v = SA.scientistView.create(fakeDom(), { onToggle: (on) => toggles.push(on) });
  return { SA, v, said, toggles };
}

test('using her speaks the one-line mission then the current mission, with picture cards and a Replay button', () => {
  const { SA, v, said, toggles } = views();
  SA.missions.start('mama');
  assert.equal(SA.npc.talk('use'), true);
  assert.equal(v.isOpen(), true);
  assert.deepEqual(toggles, [true]);
  const t = texts(v.element);
  ['Ayuda a los animales: busca, ayuda, foto', '¿Dónde está mamá?', '¡Busca!'].forEach((x) => assert.ok(t.includes(x), x));
  assert.ok(!t.some((x) => /\p{Extended_Pictographic}/u.test(x) && !['🔊', '✕'].includes(x)), 'no emoji icons next to the message (AS-0227)');
  assert.equal(said.length, 1);
  assert.equal(said[0].k, 'phrase:recuerdo');
  said[0].done();
  assert.equal(said[1].k, '¿Dónde está mamá?');
  said[1].done();
  assert.equal(said[2].k, 'phrase:busca');
  click(find(v.element, (n) => n.attrs['aria-label'] === 'Otra vez'));
  assert.equal(said[3].k, 'phrase:recuerdo', 'Replay starts the reminder over');
  said[2].done();   // the cancelled chain does not speak on
  assert.equal(said.length, 4);
  assert.equal(SA.npc.talk('tap'), false, 'already open');
  click(find(v.element, (n) => n.attrs['aria-label'] === 'Cerrar'));
  assert.equal(v.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
});

test('with no mission running it points to the board and never starts one', () => {
  const { SA, v, said } = views();
  SA.npc.talk('tap');
  assert.ok(texts(v.element).includes('Elige una misión en la estación'));
  assert.ok(!texts(v.element).includes('📋'), 'no icon row');
  assert.equal(said[0].k, 'phrase:recuerdo');
  said[0].done();
  assert.equal(said[1].k, 'phrase:eligemision');
  v.close();
  assert.equal(SA.missions.active(), null);
  assert.equal(SA.missions.status('mama'), 'available');
});

test('talking to her after the greeting still shows the reminder card (🔊 and ✕ only); the retired intro is gone', () => {
  const { SA, v } = views();
  assert.equal(SA.introView, undefined);
  assert.equal(SA.introDialogue, undefined);
  assert.equal(SA.npc.talk('use'), true);
  assert.equal(v.isOpen(), true);
  const labels = [];
  const walk = (n) => { if (n.attrs && n.attrs['aria-label']) labels.push(n.attrs['aria-label']); n.children.forEach(walk); };
  walk(v.element);
  assert.deepEqual(labels, ['Otra vez', 'Cerrar']);
  assert.equal(SA.scientistTalk.reminder().replay, undefined);
  assert.equal(SA.missions.active(), null, 'she never starts a mission');
});

test('the card is a no-op without a DOM and closes on Escape or a tap outside', () => {
  const SA = setup();
  assert.equal(SA.scientistView.create(null, {}).element, null);
  assert.equal(SA.scientistView.create(null, {}).open(), false);
  const { v } = views();
  v.open('api');
  v.element.listeners.click({ target: v.element });
  assert.equal(v.isOpen(), false);
});

// --- render: the invisible pick volume ---------------------------------------------------------------------------------

function node() {
  return { children: [], position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, add(c) { this.children.push(c); }, userData: {} };
}
const THREE = {
  Group: function () { return node(); },
  Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
  BoxGeometry: function (w, h, d) { return { w, h, d }; },
  SphereGeometry: function (r) { return { r }; },
  MeshLambertMaterial: function (o) { return o; },
  MeshBasicMaterial: function (o) { return o; },
};

test('she carries a generous invisible pick volume flagged userData.scientist, and a tap on it talks (when close and not paused)', () => {
  const SA = loadGame([...FILES, 'game/render/avatar.js', 'game/render/scientist.js', 'game/render/scientist-tap.js'], { localStorage: fakeStorage() });
  SA.picking = { isPaused: () => paused, createTapTracker: () => ({ down() {}, move() {}, up: () => null, cancel() {} }) };
  let paused = false;
  const sci = SA.render.createScientist(THREE);
  const all = (n) => [n, ...n.children.flatMap(all)];
  const pick = all(sci.group).find((n) => n.userData && n.userData.scientist);
  assert.ok(pick, 'pick volume exists');
  assert.equal(pick.visible, false, 'never drawn');
  assert.ok(pick.geometry.w >= 1.2 && pick.geometry.h >= 2, 'bigger than a body');
  // Stub raycaster: reports the pick volume as hit.
  let hit = pick, player = { x: SA.npc.scientist().x, z: SA.npc.scientist().z - 3 };
  const rcTHREE = { ...THREE, Raycaster: function () { return { setFromCamera() {}, intersectObject: () => (hit ? [{ object: hit }] : []) }; }, Vector2: function () { return { set() {} }; } };
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), addEventListener() {} };
  const tap = SA.render.createScientistTap(rcTHREE, { canvas, camera: {}, node: sci.group, getPlayer: () => player });
  const heard = [];
  SA.npc.onTalk((s) => { heard.push(s); });
  assert.equal(tap.tapAt(50, 50), true);
  assert.deepEqual(heard, ['tap']);
  assert.equal(tap.hits(50, 50), true);
  paused = true;
  assert.equal(tap.tapAt(50, 50), false, 'paused: ignored');
  paused = false;
  player = { x: 0, z: -90 };
  assert.equal(tap.tapAt(50, 50), false, 'too far');
  player = { x: SA.npc.scientist().x, z: SA.npc.scientist().z - 3 };
  hit = { userData: {} };
  assert.equal(tap.tapAt(50, 50), false, 'something else was hit');
  hit = null;
  assert.equal(tap.tapAt(50, 50), false);
  const blocked = SA.render.createScientistTap(rcTHREE, { canvas, camera: {}, node: sci.group, getPlayer: () => player, hitsAnimal: () => true });
  hit = pick;
  assert.equal(blocked.tapAt(50, 50), false, 'an animal in front wins');
  assert.equal(heard.length, 1);
});
