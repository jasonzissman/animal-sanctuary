import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/picking.js', 'game/data/props.js', 'game/habitat.js', 'game/sandbox.js',
  'game/ui/sandbox-view.js'];

function setup(stars = 10) {
  const SA = loadGame(LOGIC);
  SA.save.reset();
  SA.save.update({ stars });
  return SA;
}

// First grid cell (stepping by GRID) inside `biome` where the prop is allowed.
function spot(SA, propId, biome, skip = 0) {
  const G = SA.habitat.GRID;
  let n = 0;
  for (let x = -38; x <= 38; x += G) {
    for (let z = -22; z <= 22; z += G) {
      if (SA.map.biomeAt(x) !== biome) continue;
      const c = SA.habitat.check(propId, x, z);
      if (c.ok || c.reason === 'stars' || c.reason === 'full') { if (n++ === skip) return { x, z }; }
    }
  }
  throw new Error('no spot');
}

test('props data: five props with Spanish article names, costs, builders, biomes and vocab entries', () => {
  const SA = setup();
  const props = SA.data.all('props');
  assert.deepEqual([...props.map((p) => p.id)].sort(), ['arbol', 'charca', 'flores', 'puente', 'roca']);
  assert.equal(SA.data.get('props', 'arbol').name.es, 'el árbol');
  for (const p of props) {
    assert.ok(p.cost >= 1 && p.builder && p.biomes.length);
    assert.equal(SA.vocab.get('prop:' + p.id).es, p.name.es);
  }
});

test('props validation rejects bad data with a clear error', () => {
  const SA = setup();
  const good = SA.data.get('props', 'roca');
  const bad = (patch, field) => assert.throws(() => SA.data.register('props', [{ ...good, id: 'x' + Math.random().toString(36).slice(2).replace(/[0-9]/g, 'q'), ...patch }]), new RegExp(field));
  bad({ cost: 0 }, 'cost');
  bad({ cost: 1.5 }, 'cost');
  bad({ name: { es: 'roca', en: 'rock' } }, 'name.es');
  bad({ biomes: ['luna'] }, 'biomes\\[0\\]');
  bad({ where: 'sky' }, 'where');
  bad({ builder: '' }, 'builder');
  bad({ icon: '' }, 'icon');
});

test('check: snaps to the grid and reports stars, biome, terrain, bounds, occupied and unknown', () => {
  const SA = setup(10);
  const s = spot(SA, 'roca', 'bosque');
  assert.equal(SA.habitat.snap(s.x + 0.4), s.x);
  const c = SA.habitat.check('roca', s.x + 0.4, s.z - 0.3);
  assert.deepEqual([c.ok, c.x, c.z], [true, s.x, s.z]);
  assert.equal(SA.habitat.check('nope', s.x, s.z).reason, 'unknown');
  assert.equal(SA.habitat.check('roca', -100, 0).reason, 'bounds');
  assert.equal(SA.habitat.check('roca', NaN, 0).reason, 'bounds');
  // the river centre is water: land props cannot go there, a bridge can
  const wet = { x: SA.map.riverX(0), z: 0 };
  assert.equal(SA.habitat.check('roca', wet.x, wet.z).reason, 'terrain');
  assert.equal(SA.habitat.check('puente', wet.x, wet.z).ok, true);
  // the bridge is bosque-only, and needs water
  const sel = spot(SA, 'roca', 'selva');
  assert.equal(SA.habitat.check('puente', sel.x, sel.z).reason, 'biome');
  assert.equal(SA.habitat.check('puente', s.x, s.z).reason, 'terrain');
  SA.save.update({ stars: 0 });
  assert.equal(SA.habitat.check('roca', s.x, s.z).reason, 'stars');
});

test('place spends stars, saves the record, and refuses an occupied cell', () => {
  const SA = setup(5);
  const s = spot(SA, 'arbol', 'selva');
  const r = SA.habitat.place('arbol', s.x, s.z);
  assert.equal(r.status, 'placed');
  assert.equal(r.stars, 3);
  assert.deepEqual({ ...r.prop }, { id: 'p1', prop: 'arbol', x: s.x, z: s.z });
  assert.equal(SA.save.get().stars, 3);
  assert.equal(SA.save.get().placedProps.length, 1);
  assert.deepEqual({ ...SA.habitat.place('roca', s.x + 0.2, s.z) }, { status: 'rejected', reason: 'occupied' });
  assert.equal(SA.save.get().stars, 3, 'a rejected placement costs nothing');
});

test('cannot place when unaffordable; exactly affordable works and leaves 0', () => {
  const SA = setup(2);
  const s = spot(SA, 'charca', 'bosque');
  assert.equal(SA.habitat.place('charca', s.x, s.z).reason, 'stars');
  assert.equal(SA.habitat.place('arbol', s.x, s.z).status, 'placed');
  assert.equal(SA.save.get().stars, 0);
  assert.equal(SA.habitat.list().length, 1);
});

test('remove refunds the stars; a second removal is "missing"; ids stay unique', () => {
  const SA = setup(5);
  const a = spot(SA, 'arbol', 'bosque', 0), b = spot(SA, 'arbol', 'bosque', 1);
  SA.habitat.place('arbol', a.x, a.z);
  SA.habitat.place('roca', b.x, b.z);
  const r = SA.habitat.remove('p2');
  assert.deepEqual([r.status, r.refund, r.stars], ['removed', 1, 3]);
  assert.equal(SA.habitat.remove('p2').status, 'missing');
  assert.equal(SA.habitat.place('roca', b.x, b.z).prop.id, 'p2');
  SA.habitat.remove('p1');
  assert.equal(SA.habitat.place('roca', a.x, a.z).prop.id, 'p3');
});

test('placed props persist across a reload of the save (and survive a corrupt entry)', () => {
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const a = loadGame(LOGIC, { localStorage });
  a.save.reset();
  a.save.update({ stars: 3 });
  const s = spot(a, 'arbol', 'selva');
  assert.equal(a.habitat.place('arbol', s.x, s.z).status, 'placed');
  a.save.flush();
  const b = loadGame(LOGIC, { localStorage });
  b.save.load();
  assert.deepEqual(JSON.parse(JSON.stringify(b.habitat.list().map((r) => [r.prop, r.x, r.z]))), [['arbol', s.x, s.z]]);
  assert.equal(b.save.get().stars, 1);
  b.save.update({ placedProps: [...b.save.get().placedProps, { id: 'bad', prop: 'dragon', x: 0, z: 0 }, null, { id: 'p9' }] });
  assert.equal(b.habitat.list().length, 1, 'invalid entries are skipped');
});

test('limits the number of props', () => {
  const SA = setup(1000);
  const rec = [];
  for (let i = 0; i < SA.habitat.MAX_PROPS; i++) rec.push({ id: 'p' + (i + 1), prop: 'roca', x: -2000 - i, z: 0 });
  SA.save.update({ placedProps: rec });
  const s = spot(SA, 'roca', 'bosque');
  assert.equal(SA.habitat.check('roca', s.x, s.z).reason, 'full');
});

test('rayToGround finds the terrain point under a camera ray', () => {
  const SA = setup();
  const target = { x: 10, z: -4 };
  const y = SA.map.groundHeight(target.x, target.z);
  const origin = { x: 10, y: 30, z: 20 };
  const len = Math.hypot(target.x - origin.x, y - origin.y, target.z - origin.z);
  const dir = { x: (target.x - origin.x) / len, y: (y - origin.y) / len, z: (target.z - origin.z) / len };
  const hit = SA.habitat.rayToGround(origin, dir);
  assert.ok(Math.hypot(hit.x - target.x, hit.z - target.z) < 0.05);
  assert.equal(SA.habitat.rayToGround(origin, { x: 0, y: 1, z: 0 }), null);
  assert.equal(SA.habitat.rayToGround(null, dir), null);
});

function controller(SA) {
  const log = [];
  const spoken = [];
  const sfx = [];
  const box = SA.sandbox.create({
    scene: { add: (r) => log.push(['add', r.id]), remove: (id) => log.push(['remove', id]) },
    view: {
      setActive: (on) => log.push(['active', on]), select: (id) => log.push(['select', id]),
      setStars: (n) => log.push(['stars', n]), toast: (m) => log.push(['toast', m]),
    },
    audio: { say: (k) => spoken.push(k), sfx: (n) => sfx.push(n) },
    onMode: (on) => log.push(['mode', on]),
  });
  return { box, log, spoken, sfx };
}

test('sandbox: inactive mode ignores taps; toggle announces the mode', () => {
  const SA = setup();
  const { box, log } = controller(SA);
  assert.equal(box.select('arbol'), null);
  assert.equal(box.onGround({ x: 0, z: 0 }), null);
  assert.equal(box.toggle(), true);
  assert.ok(log.some((l) => l[0] === 'mode' && l[1] === true));
  assert.equal(box.toggle(), false);
});

test('sandbox: select then tap the ground places the prop and says its Spanish name', () => {
  const SA = setup(5);
  const { box, log, spoken, sfx } = controller(SA);
  const s = spot(SA, 'arbol', 'selva');
  box.toggle();
  assert.equal(box.select('arbol'), 'arbol');
  assert.equal(box.select('arbol'), null, 'tapping again deselects');
  box.select('arbol');
  const res = box.onGround({ x: s.x + 0.3, z: s.z });
  assert.equal(res.status, 'placed');
  assert.deepEqual(spoken, ['prop:arbol']);
  assert.ok(sfx.includes('pop'));
  assert.ok(log.some((l) => l[0] === 'add' && l[1] === 'p1'));
  assert.ok(log.some((l) => l[0] === 'toast' && l[1] === '🌳 el árbol'));
  assert.ok(log.some((l) => l[0] === 'stars' && l[1] === 3));
  assert.equal(box.selected(), null, 'selection clears after placing');
});

test('sandbox: unaffordable or invalid spots get a gentle phrase, no change, no speech', () => {
  const SA = setup(0);
  const { box, log, spoken, sfx } = controller(SA);
  const s = spot(SA, 'arbol', 'selva');
  box.toggle();
  box.select('arbol');
  assert.equal(box.onGround(s).reason, 'stars');
  assert.ok(log.some((l) => l[0] === 'toast' && l[1] === SA.sandbox.MESSAGES.stars));
  assert.deepEqual(spoken, []);
  assert.ok(sfx.includes('boing'));
  assert.equal(box.selected(), 'arbol', 'selection stays so the child can try elsewhere');
  assert.equal(SA.habitat.list().length, 0);
  box.select('arbol');
  assert.equal(box.onGround(s).status, 'idle');
});

test('sandbox: tapping a placed prop removes it and refunds; ignored while a prop is selected', () => {
  const SA = setup(5);
  const { box, log } = controller(SA);
  const s = spot(SA, 'arbol', 'selva');
  box.toggle();
  box.select('arbol');
  box.onGround(s);
  box.select('roca');
  assert.equal(box.onPropTap('p1'), null, 'a selected prop means taps are for placing');
  box.select('roca');
  const r = box.onPropTap('p1');
  assert.deepEqual([r.status, r.refund, r.stars], ['removed', 2, 5]);
  assert.ok(log.some((l) => l[0] === 'remove' && l[1] === 'p1'));
  assert.ok(log.some((l) => l[0] === 'toast' && l[1] === '+2 ⭐'));
  assert.equal(box.onPropTap('p1').status, 'missing');
});

test('sandbox: restore adds every saved prop to the scene', () => {
  const SA = setup(5);
  const s = spot(SA, 'roca', 'bosque');
  SA.habitat.place('roca', s.x, s.z);
  const { box, log } = controller(SA);
  box.restore();
  assert.deepEqual(log.filter((l) => l[0] === 'add'), [['add', 'p1']]);
});

test('picking.setPaused silences emit', () => {
  const SA = setup();
  const seen = [];
  SA.picking.onPick((p) => seen.push(p.part));
  SA.picking.setPaused(true);
  SA.picking.emit({ animalId: 'conejo', part: 'cola' });
  SA.picking.setPaused(false);
  SA.picking.emit({ animalId: 'conejo', part: 'orejas' });
  assert.deepEqual(seen, ['orejas']);
});

test('sandbox view: tray has one button per prop with cost, dims unaffordable ones (fake DOM)', () => {
  const SA = setup();
  const made = [];
  const mk = (tag) => {
    const e = { tag, style: {}, children: [], listeners: {}, textContent: '', attrs: {},
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
    made.push(e);
    return e;
  };
  const calls = [];
  const view = SA.sandboxView.create({ createElement: mk, body: { appendChild() {} } }, { toggle: () => calls.push('toggle'), select: (id) => calls.push(id) });
  const big = made.find((e) => e.attrs['aria-label'] === 'Hábitat');
  big.listeners.click();
  const tree = made.find((e) => e.attrs['aria-label'] === 'el árbol');
  tree.listeners.click();
  assert.deepEqual(calls, ['toggle', 'arbol']);
  assert.ok(tree.children.some((c) => c.textContent === '⭐ 2'));
  view.setStars(1);
  assert.equal(tree.style.opacity, '0.5');
  view.setStars(2);
  assert.equal(tree.style.opacity, '1');
  view.setActive(true);
  assert.equal(big.textContent, '🎮');
  view.select('arbol');
  assert.equal(tree.style.background, '#ffe9a8');
  view.toast('hola');
  view.setActive(false);
  assert.deepEqual(Object.keys(SA.sandboxView.create(null, {})).sort(), ['select', 'setActive', 'setStars', 'toast']);
});

// ---- 3D with the real vendored three.js (geometry needs no WebGL) ----
test('render props: builds each prop from data, removes it, and 50 props stay light', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...LOGIC.slice(0, -1), 'game/render/props.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const listeners = {};
  const canvas = { addEventListener: (ev, fn) => { listeners[ev] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 400);
  camera.position.set(0, 40, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const props = SA.render.createProps(THREE, { canvas, camera });
  for (const p of SA.data.all('props')) assert.ok(SA.render.propBuilders[p.builder], 'builder for ' + p.id);
  SA.data.all('props').forEach((p, i) => assert.ok(props.add({ id: 'q' + i, prop: p.id, x: i * 2, z: 0 })));
  assert.equal(props.count(), 5);
  assert.equal(props.add({ id: 'q0', prop: 'roca', x: 0, z: 0 }), null, 'duplicate id ignored');
  assert.equal(props.add({ id: 'zz', prop: 'dragon', x: 0, z: 0 }), null, 'unknown prop ignored');
  assert.equal(props.remove('q0'), true);
  assert.equal(props.remove('q0'), false);
  assert.equal(props.count(), 4);
  for (let i = 0; i < 50; i++) props.add({ id: 'b' + i, prop: SA.data.all('props')[i % 4].id, x: -30 + (i % 10) * 2, z: -10 + Math.floor(i / 10) * 2 });
  assert.equal(props.count(), 54);
  assert.ok(props.group.children.length < 100);

  // taps: dragging never acts; a tap on a placed prop removes it, a tap on empty ground goes to onGround
  const got = [];
  let selected = false;
  props.bind({ active: () => true, selected: () => selected, onGround: (pt) => got.push(['ground', Math.round(pt.x)]), onPropTap: (id) => got.push(['prop', id]) });
  const ev = (x, y) => ({ pointerId: 1, clientX: x, clientY: y });
  listeners.pointerdown(ev(400, 300)); listeners.pointermove(ev(500, 300)); listeners.pointerup(ev(500, 300));
  assert.deepEqual(got, []);
  [...props.group.children].forEach((c) => props.remove(c.userData.placedId));
  assert.equal(props.count(), 0);
  props.add({ id: 'mid', prop: 'arbol', x: 0, z: 0 });
  listeners.pointerdown(ev(400, 300)); listeners.pointerup(ev(400, 300));
  assert.deepEqual(got.pop(), ['prop', 'mid']);
  selected = true;
  listeners.pointerdown(ev(400, 300)); listeners.pointerup(ev(400, 300));
  assert.equal(got.pop()[0], 'ground', 'with a prop selected the tap places instead');
  listeners.pointercancel();
});

// ---- placement preview (ghost) ----
test('habitat.preview: snapped spot with green/red validity, null without a usable point', () => {
  const SA = setup(5);
  const s = spot(SA, 'arbol', 'selva');
  const ok = SA.habitat.preview('arbol', { x: s.x + 0.4, z: s.z - 0.3 });
  assert.deepEqual([ok.x, ok.z, ok.valid], [s.x, s.z, true]);
  assert.ok(!ok.reason);
  const far = SA.habitat.preview('arbol', { x: 500, z: 0 });
  assert.deepEqual([far.valid, far.reason], [false, 'bounds']);
  const other = spot(SA, 'roca', 'bosque');
  assert.equal(SA.habitat.preview('arbol', other).valid, SA.habitat.check('arbol', other.x, other.z).ok);
  SA.habitat.place('arbol', s.x, s.z);
  const taken = SA.habitat.preview('arbol', s);
  assert.deepEqual([taken.valid, taken.reason], [false, 'occupied']);
  SA.save.update({ stars: 0 });
  assert.equal(SA.habitat.preview('arbol', spot(SA, 'arbol', 'selva', 1)).reason, 'stars', 'unaffordable is red');
  assert.equal(SA.habitat.preview('arbol', null), null);
  assert.equal(SA.habitat.preview('arbol', { x: NaN, z: 0 }), null);
  assert.equal(SA.habitat.preview('dragon', s), null);
  assert.equal(SA.habitat.preview(null, s), null);
});

test('sandbox: any selection change hides the ghost (place, put back, mode end)', () => {
  const SA = setup(5);
  let hides = 0;
  const box = SA.sandbox.create({
    scene: { add() {}, remove() {}, hideGhost: () => hides++ },
    view: { setActive() {}, select() {}, setStars() {}, toast() {} },
    audio: { say() {}, sfx() {} },
  });
  const s = spot(SA, 'arbol', 'selva');
  box.toggle();
  hides = 0;
  box.select('arbol');
  assert.equal(hides, 1);
  box.onGround(s);
  assert.equal(hides, 2, 'placing clears it');
  box.select('arbol');
  box.toggle();
  assert.equal(hides, 4, 'leaving placement mode clears it');
});

test('render ghost: green on valid spots, red on invalid, hidden on touch release and when selection ends', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...LOGIC.slice(0, -1), 'game/render/props.js', 'game/render/prop-ghost.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  SA.save.reset();
  SA.save.update({ stars: 10 });
  const listeners = {};
  const canvas = { addEventListener: (ev, fn) => { listeners[ev] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 400);
  camera.position.set(0, 40, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const props = SA.render.createProps(THREE, { canvas, camera });
  assert.ok(props.ghostGroup, 'ghost group is exposed for the scene');
  let selected = 'arbol', active = true;
  props.bind({ active: () => active, selected: () => selected, onGround() {}, onPropTap() {} });
  const colors = () => {
    const meshes = [];
    props.ghostGroup.traverse((o) => { if (o.isMesh && o.name !== 'starCue') meshes.push(o); });
    return [...new Set(meshes.map((m) => m.material.color.getHexString()))];
  };
  const ev = (x, y, type = 'mouse') => ({ pointerId: 1, pointerType: type, clientX: x, clientY: y });

  // find screen points whose ground spot is valid and one that is not
  let good = null, bad = null;
  for (let sx = 20; sx < 800 && !(good && bad); sx += 20) {
    for (let sy = 20; sy < 600 && !(good && bad); sy += 20) {
      listeners.pointermove(ev(sx, sy));
      if (!props.ghostVisible()) continue;
      const c = colors();
      if (c.length === 1 && c[0] === '3ddc57') good = good || [sx, sy];
      else if (c.length === 1 && c[0] === 'ff4a4a') bad = bad || [sx, sy];
    }
  }
  assert.ok(good && bad, 'both a green and a red ghost appear while hovering');
  listeners.pointermove(ev(...good));
  assert.deepEqual(colors(), ['3ddc57']);
  listeners.pointermove(ev(...bad));
  assert.deepEqual(colors(), ['ff4a4a']);

  listeners.pointerleave();
  assert.equal(props.ghostVisible(), false, 'mouse leaving hides it');
  listeners.pointermove(ev(...good));
  props.hideGhost();
  assert.equal(props.ghostVisible(), false);

  listeners.pointerdown(ev(...good, 'touch'));
  assert.equal(props.ghostVisible(), true, 'touch shows it on pointer-down');
  listeners.pointerup(ev(...good, 'touch'));
  assert.equal(props.ghostVisible(), false, 'and hides it on release');

  selected = null;
  listeners.pointermove(ev(...good));
  assert.equal(props.ghostVisible(), false, 'no selection, no ghost');
  selected = 'arbol'; active = false;
  listeners.pointermove(ev(...good));
  assert.equal(props.ghostVisible(), false, 'placement mode off, no ghost');
  active = true;
  listeners.pointermove(ev(...good));
  listeners.pointercancel();
  assert.equal(props.ghostVisible(), false);
});

// ---- ghost shows straight after tray selection (AS-0060) ----
test('ghostRefresh.decide: show only when active, selected and a finite pointer position is known', () => {
  const SA = loadGame(['game/sa.js', 'game/ghost-refresh.js']);
  const d = SA.ghostRefresh.decide;
  assert.deepEqual({ ...d({ active: true, selected: 'arbol', last: { x: 10, y: 20 } }) }, { show: true, propId: 'arbol', x: 10, y: 20 });
  assert.equal(d({ active: true, selected: 'arbol', last: null }).show, false, 'no known pointer (touch)');
  assert.equal(d({ active: true, selected: null, last: { x: 1, y: 1 } }).show, false);
  assert.equal(d({ active: false, selected: 'arbol', last: { x: 1, y: 1 } }).show, false);
  assert.equal(d({ active: true, selected: 'arbol', last: { x: NaN, y: 1 } }).show, false);
  assert.equal(d(null).show, false);
});

test('sandbox: picking a prop asks the scene to refresh its ghost; putting it back does not', () => {
  const SA = setup(5);
  const calls = [];
  const box = SA.sandbox.create({
    scene: { add() {}, remove() {}, hideGhost: () => calls.push('hide'), refreshGhost: () => calls.push('refresh') },
    view: { setActive() {}, select() {}, setStars() {}, toast() {} },
    audio: { say() {}, sfx() {} },
  });
  box.toggle();
  calls.length = 0;
  box.select('arbol');
  assert.deepEqual(calls, ['hide', 'refresh']);
  calls.length = 0;
  box.select('arbol');
  assert.deepEqual(calls, ['hide']);
});

test('render ghost: tray selection shows it at the last mouse position without a move; unknown/touch does nothing', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...LOGIC.slice(0, -1), 'game/ghost-refresh.js', 'game/render/props.js', 'game/render/prop-ghost.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  SA.save.reset();
  SA.save.update({ stars: 10 });
  const listeners = {};
  const canvas = { addEventListener: (ev, fn) => { listeners[ev] = fn; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 400);
  camera.position.set(0, 40, 30);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const props = SA.render.createProps(THREE, { canvas, camera });
  let selected = null;
  props.bind({ active: () => true, selected: () => selected, onGround() {}, onPropTap() {} });
  const ev = (type) => ({ pointerId: 1, pointerType: type, clientX: 400, clientY: 300 });

  selected = 'arbol';
  props.refreshGhost();
  assert.equal(props.ghostVisible(), false, 'no known pointer position: nothing happens, no error');

  selected = null;
  listeners.pointermove(ev('mouse'));
  listeners.pointerleave();            // the mouse moved off the canvas onto the tray
  assert.equal(props.ghostVisible(), false);
  selected = 'arbol';
  props.refreshGhost();
  assert.equal(props.ghostVisible(), true, 'ghost appears straight away at the remembered spot');

  selected = null;
  props.hideGhost();
  props.refreshGhost();
  assert.equal(props.ghostVisible(), false, 'nothing selected, nothing shown');

  listeners.pointerdown(ev('touch'));
  listeners.pointerup(ev('touch'));
  selected = 'arbol';
  props.refreshGhost();
  assert.equal(props.ghostVisible(), false, 'touch forgets the mouse position');
});

// ---- star cue on unaffordable ghost (AS-0061) ----
test('ghostState.of: valid, blocked (not here) and unaffordable (not enough stars)', () => {
  const SA = loadGame(['game/sa.js', 'game/ghost-state.js']);
  assert.equal(SA.ghostState.of({ x: 0, z: 0, valid: true }), 'valid');
  assert.equal(SA.ghostState.of({ x: 0, z: 0, valid: false, reason: 'stars' }), 'unaffordable');
  for (const reason of ['bounds', 'terrain', 'biome', 'occupied', 'full', 'unknown', undefined]) {
    assert.equal(SA.ghostState.of({ x: 0, z: 0, valid: false, reason }), 'blocked', String(reason));
  }
  assert.equal(SA.ghostState.of(null), 'blocked');
});

test('ghostState.of agrees with habitat.preview for real spots', () => {
  const SA = loadGame([...LOGIC.slice(0, -1), 'game/ghost-state.js']);
  SA.save.reset();
  SA.save.update({ stars: 0 });
  const s = spot(SA, 'arbol', SA.data.get('props', 'arbol').biomes[0]);
  assert.equal(SA.ghostState.of(SA.habitat.preview('arbol', s)), 'unaffordable');
  SA.save.update({ stars: 10 });
  assert.equal(SA.ghostState.of(SA.habitat.preview('arbol', s)), 'valid');
  assert.equal(SA.ghostState.of(SA.habitat.preview('arbol', { x: 9999, z: 0 })), 'blocked');
});

test('render ghost: star cue shows only when the prop is unaffordable; missing THREE pieces do not break it', () => {
  const load = (strip) => {
    const ctx = vm.createContext({ console });
    ctx.window = ctx;
    ctx.self = ctx;
    for (const f of ['game/vendor/three.min.js', ...LOGIC.slice(0, -1), 'game/ghost-state.js', 'game/render/props.js', 'game/render/prop-ghost.js']) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    }
    if (strip) ctx.THREE.Shape = undefined;
    ctx.SA.save.reset();
    return ctx;
  };
  const ctx = load(false);
  const { SA, THREE } = ctx;
  const s = spot(SA, 'arbol', SA.data.get('props', 'arbol').biomes[0]);
  const ghost = SA.render.createPropGhost(THREE);
  SA.save.update({ stars: 0 });
  ghost.show('arbol', SA.habitat.preview('arbol', s));
  assert.equal(ghost.visible(), true);
  assert.equal(ghost.starVisible(), true, 'not enough stars: star cue');
  ghost.show('arbol', SA.habitat.preview('arbol', { x: 9999, z: 0 }));
  assert.equal(ghost.starVisible(), false, 'blocked spot: red but no star');
  SA.save.update({ stars: 10 });
  ghost.show('arbol', SA.habitat.preview('arbol', s));
  assert.equal(ghost.starVisible(), false, 'affordable: no star');
  SA.save.update({ stars: 0 });
  ghost.show('arbol', SA.habitat.preview('arbol', s));
  ghost.hide();
  assert.equal(ghost.starVisible(), false, 'hidden ghost shows no star');

  const bare = load(true);
  const g2 = bare.SA.render.createPropGhost(bare.THREE);
  bare.SA.save.update({ stars: 0 });
  g2.show('arbol', bare.SA.habitat.preview('arbol', s));
  assert.equal(g2.visible(), true, 'still shows the red ghost');
  assert.equal(g2.starVisible(), false);
});

test('rayToGround works with a low chase-camera ray: a pointed spot ahead of the player is hit, the sky is not', () => {
  const SA = setup();
  // Chase camera 7 units from the look-at point at pitch 16 (what SA.camera.position gives; inlined: camera.js is not loaded here).
  const t16 = (16 * Math.PI) / 180, h = 7 * Math.cos(t16);
  const cam = { x: -9, y: 7 * Math.sin(t16), z: 8 + h };
  const target = { x: -7, z: -2 };
  const y = SA.map.groundHeight(target.x, target.z);
  const len = Math.hypot(target.x - cam.x, y - cam.y, target.z - cam.z);
  const dir = { x: (target.x - cam.x) / len, y: (y - cam.y) / len, z: (target.z - cam.z) / len };
  const hit = SA.habitat.rayToGround(cam, dir);
  assert.ok(Math.hypot(hit.x - target.x, hit.z - target.z) < 0.05);
  assert.equal(SA.habitat.rayToGround(cam, { x: 0, y: 0.2, z: -1 }), null, 'a tap on the sky places nothing');
});
