import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/inventory.js', 'game/data/missions.js', 'game/missions.js',
  'game/greeting.js', 'game/scientist-talk.js', 'game/ui/greeting-view.js'];

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}
function setup(storage = fakeStorage(), globals = {}) {
  const SA = loadGame(FILES, { localStorage: storage, ...globals });
  SA.save.load();
  return SA;
}

// --- pure logic -----------------------------------------------------------------------------------------------------------

const ICON = /\p{Extended_Pictographic}/u;
const plain = (lines) => Array.from(lines, (l) => l.es);
const keysOf = (lines) => Array.from(lines, (l) => l.key);

test('the greeting lines ARE the scientist\'s reminder: no mission, an active mission, and everything done', () => {
  const SA = setup();
  const same = () => {
    const g = SA.greeting.lines(), r = SA.scientistTalk.reminder().lines;
    assert.deepEqual(plain(g), plain(r));
    assert.deepEqual(keysOf(g), keysOf(r));
    g.forEach((l) => assert.equal(l.icon, undefined, 'no icon in the greeting data'));
    return plain(g);
  };
  assert.deepEqual(same(), ['Ayuda a los animales: busca, ayuda, foto', 'Elige una misión en la estación']);
  SA.missions.start('mama');
  assert.deepEqual(same(), ['Ayuda a los animales: busca, ayuda, foto', '¿Dónde está mamá?', '¡Busca!']);
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
  SA.missions.start('carrera');
  SA.missions.complete();
  SA.missions.start('mensaje');
  SA.missions.complete();
  SA.missions.start('estrellas');
  SA.missions.complete();
  assert.deepEqual(same(), ['Ayuda a los animales: busca, ayuda, foto', '¡Muy bien! Pronto, más misiones.']);
  SA.greeting.lines().forEach((l) => { if (/^phrase:/.test(l.key)) assert.equal(SA.vocab.get(l.key).es, l.es); });
});

test('the retired saludo vocab entries are gone and the lines carry English scaffold text', () => {
  const SA = setup();
  assert.ok(!SA.vocab.get('phrase:saludo1'));
  assert.ok(!SA.vocab.get('phrase:saludo2'));
  SA.missions.start('mama');
  assert.deepEqual(Array.from(SA.greeting.lines(), (l) => l.en), ['Help the animals: find, help, photo', 'Where is mama?', 'Find it!']);
});

test('open once; close on the ✕, Enter, E, a tap or walking (each reason is tracked); closing twice is a no-op', () => {
  const SA = setup();
  const seen = [];
  const mk = () => SA.greeting.create({ track: (t, f) => seen.push([t, f.reason]) });
  const reasons = {
    x: (g) => g.close('x'),
    enter: (g) => g.onKey({ key: 'Enter' }) === 'closed',
    e: (g) => g.onKey({ key: 'E' }) === 'closed',
    code: (g) => g.onKey({ key: 'x', code: 'KeyE' }) === 'closed',
    tap: (g) => g.onTap(),
    wasd: (g) => g.onKey({ key: 'w' }) === 'moved',
    arrow: (g) => g.onKey({ key: 'ArrowLeft' }) === 'moved'
  };
  for (const [name, act] of Object.entries(reasons)) {
    const g = mk();
    assert.equal(g.isOpen(), false);
    assert.equal(g.open({ x: 0, z: 0 }), true, name);
    assert.equal(g.open({ x: 0, z: 0 }), false, 'already open');
    assert.equal(g.isOpen(), true);
    assert.equal(act(g), true, name);
    assert.equal(g.isOpen(), false, name);
    assert.equal(g.close('x'), false);
    assert.equal(g.onTap(), false);
  }
  assert.deepEqual(seen.filter((s) => s[0] === 'greeting.closed').map((s) => s[1]), ['x', 'key', 'key', 'key', 'tap', 'move', 'move']);
});

test('other keys and modified keys leave it open; walking away (and only walking away) closes it', () => {
  const SA = setup();
  const g = SA.greeting.create({ track() {} });
  assert.equal(g.onKey({ key: 'Enter' }), 'none', 'closed: nothing to do');
  g.open({ x: 10, z: 20 });
  assert.equal(g.onKey({ key: 'q' }), 'none');
  assert.equal(g.onKey({ key: 'Enter', ctrlKey: true }), 'none');
  assert.equal(g.onKey(null), 'none');
  assert.equal(g.update({ x: 10.2, z: 20.1 }), false, 'a tiny nudge is not walking');
  assert.equal(g.update({ x: NaN, z: 0 }), false);
  assert.equal(g.update(null), false);
  assert.equal(g.isOpen(), true);
  assert.equal(g.update({ x: 10, z: 21 }), true);
  assert.equal(g.isOpen(), false);
  const blind = SA.greeting.create({ track() {} });   // opened without a position: only keys / taps close it
  blind.open();
  assert.equal(blind.update({ x: 99, z: 99 }), false);
  assert.equal(blind.isOpen(), true);
});

test('a throwing telemetry hook never breaks it; the default instance uses SAT when present', () => {
  const SA = setup();
  const g = SA.greeting.create({ track: () => { throw new Error('x'); } });
  assert.equal(g.open(), true);
  assert.equal(g.close('tap'), true);
  const tracked = [];
  const SA2 = setup(fakeStorage(), { SAT: { track: (t, f) => tracked.push([t, f]) } });
  const d = SA2.greeting.create();
  d.open();
  d.close('x');
  assert.deepEqual(JSON.parse(JSON.stringify(tracked)), [['greeting.shown', {}], ['greeting.closed', { reason: 'x' }]]);
});

test('it starts no mission and a fresh save still has la cámara', () => {
  const SA = setup();
  const g = SA.greeting.create({ track() {} });
  g.open();
  g.close('x');
  assert.equal(SA.missions.active(), null);
  assert.equal(SA.missions.status('mama'), 'available');
  assert.equal(SA.inventory.has('camara'), true);
});

test('the retired intro is gone from the page and the bundle manifest; the new modules are loaded', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const manifest = fs.readFileSync('game/manifest.js', 'utf8');
  for (const src of [html, manifest]) {
    assert.doesNotMatch(src, /intro-dialogue|intro-view|data\/intro\.js/);
    assert.match(src, /game\/greeting\.js/);
    assert.match(src, /game\/ui\/greeting-view\.js/);
  }
  for (const f of ['game/intro-dialogue.js', 'game/ui/intro-view.js', 'game/data/intro.js']) assert.equal(fs.existsSync(f), false, f);
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
const click = (n) => n.listeners.click({ stopPropagation() {} });

function view(opts = {}, storage) {
  const keys = [];
  const SA = setup(storage, { addEventListener: (t, f, cap) => keys.push({ t, f, cap }) });
  const said = [], toggles = [];
  SA.audio = { say: (k, done) => { said.push({ k, done }); }, stopVoice() {} };
  const v = SA.greetingView.create(fakeDom(), { onToggle: (on) => toggles.push(on), ...opts });
  const press = (e) => { const ev = { preventDefault() { ev.pd = true; }, stopImmediatePropagation() { ev.stop = true; }, ...e }; keys.forEach((k) => k.f(ev)); return ev; };
  return { SA, v, said, toggles, press, keys };
}

const noIcons = (t) => !t.some((x) => ICON.test(x) && !['🔊', '✕'].includes(x));

test('it opens at once on every load with the scientist\'s lines on one card, no icons, and speaks them in order', () => {
  const { SA, v, said, toggles } = view();
  assert.equal(v.isOpen(), true);
  assert.deepEqual(toggles, [true]);
  const t = texts(v.element);
  ['Ayuda a los animales: busca, ayuda, foto', 'Elige una misión en la estación'].forEach((x) => assert.ok(t.includes(x), x));
  assert.ok(!t.includes('Help the animals: find, help, photo'), 'English is off by default');
  assert.ok(noIcons(t), 'no emoji next to the message');
  assert.equal(said.length, 1);
  assert.equal(said[0].k, 'phrase:recuerdo');
  said[0].done();
  assert.equal(said[1].k, 'phrase:eligemision');
  assert.equal(SA.missions.active(), null, 'no mission starts');
});

test('with a mission running the greeting shows the mission and step, like talking to her', () => {
  const SA = setup(fakeStorage(), { addEventListener() {} });
  SA.missions.start('mama');
  SA.audio = { say() {}, stopVoice() {} };
  const v = SA.greetingView.create(fakeDom(), {});
  const t = texts(v.element);
  ['Ayuda a los animales: busca, ayuda, foto', '¿Dónde está mamá?', '¡Busca!'].forEach((x) => assert.ok(t.includes(x), x));
  assert.ok(noIcons(t));
});

test('it opens the same way for a save that has the old introSeen flag (existing saves unchanged)', () => {
  const st = fakeStorage({ santuario_save_v1: JSON.stringify({ version: 4, stars: 4, introSeen: true }) });
  const { SA, v } = view({}, st);
  assert.equal(v.isOpen(), true);
  assert.equal(SA.save.get().introSeen, true);
  assert.equal(SA.save.get().stars, 4);
});

test('the English toggle adds the English lines', () => {
  const st = fakeStorage({ santuario_save_v1: JSON.stringify({ version: 4, settings: { english: true } }) });
  const { v } = view({}, st);
  const t = texts(v.element);
  assert.ok(t.includes('Help the animals: find, help, photo'));
  assert.ok(t.includes('Pick a mission at the station'));
});

test('🔊 replays from line 1 and cancels the older chain; ✕ closes and silences', () => {
  const { v, said, toggles } = view();
  said[0].done();
  assert.equal(said.length, 2);
  click(find(v.element, (n) => n.attrs['aria-label'] === 'Otra vez'));
  assert.equal(said[2].k, 'phrase:recuerdo');
  said[1].done();   // the cancelled chain does not speak on
  assert.equal(said.length, 3);
  click(find(v.element, (n) => n.attrs['aria-label'] === 'Cerrar'));
  assert.equal(v.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
  said[2].done();
  assert.equal(said.length, 3, 'closed: nothing more is spoken');
});

test('Enter / E close it and are swallowed (no talking to her); walking keys close it and pass through', () => {
  for (const key of ['Enter', 'e']) {
    const { v, press } = view();
    const ev = press({ key });
    assert.equal(v.isOpen(), false);
    assert.equal(ev.pd, true);
    assert.equal(ev.stop, true);
  }
  const { v, press, keys } = view();
  const ev = press({ key: 'ArrowUp' });
  assert.equal(v.isOpen(), false);
  assert.equal(ev.stop, undefined, 'the rig still sees the walking key');
  const down = keys.filter((k) => k.t === 'keydown');
  assert.equal(down.length, 1);
  assert.equal(down[0].cap, true, 'capture phase, so it runs before the use-key handler');
  assert.equal(press({ key: 'Enter' }).stop, undefined, 'closed: keys are left alone');
});

test('a tap anywhere closes it; walking away (update) closes it; the world stays paused only while it shows', () => {
  const a = view();
  a.v.element.listeners.click({});
  assert.equal(a.v.isOpen(), false);
  assert.deepEqual(a.toggles, [true, false]);
  let at = { x: 1, z: 1 };
  const b = view({ player: () => at });
  b.v.update({ x: 1.1, z: 1 });
  assert.equal(b.v.isOpen(), true);
  b.v.update({ x: 3, z: 1 });
  assert.equal(b.v.isOpen(), false);
  const c = view({ auto: false });
  assert.equal(c.v.isOpen(), false);
  assert.equal(c.v.open({ x: 0, z: 0 }), true);
  c.v.close();
  assert.equal(c.v.isOpen(), false);
});

test('a missing DOM is a no-op', () => {
  const { SA } = view();
  const none = SA.greetingView.create(null, {});
  assert.equal(none.element, null);
  assert.equal(none.open(), false);
  none.close();
  none.update();
});
