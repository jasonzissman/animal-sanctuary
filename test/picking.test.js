import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGIC = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/picking.js'];

test('tap tracker: a still press is a tap, a drag beyond the threshold is not', () => {
  const SA = loadGame(LOGIC);
  const t = SA.picking.createTapTracker({ threshold: 10 });
  t.down(1, 100, 100);
  assert.deepEqual({ ...t.up(1, 103, 104) }, { x: 103, y: 104 });
  t.down(1, 100, 100);
  t.move(1, 120, 100);
  t.move(1, 100, 100);                       // dragging out and back is still a drag
  assert.equal(t.up(1, 100, 100), null);
  t.down(1, 0, 0);                           // the next press starts clean
  assert.ok(t.up(1, 0, 0));
});

test('tap tracker: pinch (second pointer) and cancel never tap; unknown pointers are ignored', () => {
  const SA = loadGame(LOGIC);
  const t = SA.picking.createTapTracker();
  t.down(1, 5, 5);
  t.down(2, 50, 50);
  assert.equal(t.up(1, 5, 5), null);
  assert.equal(t.up(2, 50, 50), null);
  t.down(3, 5, 5);
  t.cancel();
  assert.equal(t.up(3, 5, 5), null);
  assert.equal(t.up(99, 1, 1), null);
});

test('onPick delivers { animalId, part }, can unsubscribe, and survives a throwing listener', () => {
  const SA = loadGame(LOGIC);
  const seen = [];
  SA.picking.onPick(() => { throw new Error('boom'); });
  const off = SA.picking.onPick((p) => seen.push(p));
  SA.picking.emit({ animalId: 'conejo', part: 'cola', extra: 1 });
  assert.deepEqual(seen.map((p) => ({ ...p })), [{ animalId: 'conejo', part: 'cola' }]);
  off();
  SA.picking.emit({ animalId: 'conejo', part: 'orejas' });
  assert.equal(seen.length, 1);
  assert.throws(() => SA.picking.onPick('nope'));
});

test('labelFor gives the Spanish label + icon, English only when asked', () => {
  const SA = loadGame(LOGIC);
  const es = SA.picking.labelFor('conejo', 'cola', false);
  assert.equal(es.es, 'la cola');
  assert.equal(es.en, null);
  assert.ok(es.icon);
  assert.equal(SA.picking.labelFor('conejo', 'cola', true).en, 'tail');
  assert.equal(SA.picking.labelFor('conejo', 'nope', false), null);
  SA.data.all('parts').forEach((p) => assert.ok(SA.picking.ICONS[p.key], 'icon for ' + p.key));
});

test('every reaction starts and ends at rest and moves in between', () => {
  const SA = loadGame(LOGIC);
  SA.parts.REACTIONS.forEach((r) => {
    const a = SA.picking.reactionPose(r, 0), b = SA.picking.reactionPose(r, SA.picking.DURATION);
    [a, b].forEach((p) => {
      const rest = { rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, py: 0 };
      Object.keys(rest).forEach((k) => assert.ok(Math.abs(p[k] - rest[k]) < 1e-9, r + ' ' + k));
    });
    let moved = false;
    for (let t = 0.05; t < SA.picking.DURATION; t += 0.05) {
      const p = SA.picking.reactionPose(r, t);
      if (p.rx || p.ry || p.rz || p.sx !== 1 || p.sy !== 1 || p.sz !== 1 || p.py) moved = true;
    }
    assert.ok(moved, r + ' moves');
  });
});

// --- THREE glue, with the real vendored three.js and a stub canvas/DOM ---------------------------------------

function makeEl() {
  return {
    style: {}, children: [], textContent: '', innerHTML: '',
    setAttribute() {}, appendChild(c) { this.children.push(c); },
  };
}

function stage(english) {
  const files = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js',
    'game/data/biomes.js', 'game/data/animals.js', 'game/map.js', 'game/animal-plan.js', 'game/render/animals.js',
    'game/picking.js', 'game/render/picking.js'];
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  ctx.document = { createElement: makeEl, body: makeEl() };
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const { SA, THREE } = ctx;
  if (english) SA.save = { get: () => ({ settings: { english: true } }) };
  const handlers = {};
  const canvas = {
    addEventListener: (n, f) => { handlers[n] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  };
  const animals = SA.render.buildAnimals(THREE, {});
  animals.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 400);
  const picking = SA.render.createPicking(THREE, { canvas, camera, animals, container: ctx.document.body });
  // Aim the camera at one animal's tail pick volume.
  const g = animals.children[0];
  const vol = g.userData.pickVolumes.find((v) => v.userData.part === 'cola') || g.userData.pickVolumes[0];
  const target = new THREE.Vector3(); vol.getWorldPosition(target);
  camera.position.set(target.x + 4, target.y + 3, target.z + 4);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return { SA, THREE, handlers, picking, animals, g, vol, ctx, camera };
}

function ev(x, y, extra) { return { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, buttons: 0, ...extra }; }

test('tapping the middle of the screen picks the part, glows it, reacts, shows the chip and emits onPick', () => {
  const s = stage(false);
  const picks = [];
  s.SA.picking.onPick((p) => picks.push(p));
  const hit = s.picking.pickAt(400, 300);
  assert.ok(hit && hit.mesh, 'ray hits a pick volume');
  s.handlers.pointerdown(ev(400, 300));
  s.handlers.pointerup(ev(402, 301));
  assert.deepEqual(picks.map((p) => ({ ...p })), [{ animalId: hit.animalId, part: hit.part }]);
  assert.notEqual(hit.mesh.material, hit.mesh.userData.baseMaterial, 'glowing material swapped in');
  assert.ok(hit.mesh.material.emissiveIntensity > 0);
  const chip = s.ctx.document.body.children[0];
  assert.equal(chip.style.display, 'flex');
  assert.equal(chip.children.length, 2, 'icon + Spanish only');
  assert.equal(chip.children[1].textContent, s.SA.data.get('parts', hit.part).label.es);
  const y0 = hit.mesh.scale.y, r0 = hit.mesh.rotation.toArray().slice(0, 3);
  s.picking.update(0.1);
  const moving = hit.mesh.scale.y !== y0 || hit.mesh.rotation.toArray().slice(0, 3).some((v, i) => v !== r0[i]);
  assert.ok(moving, 'reaction animates the mesh');
  s.picking.update(5);                       // everything times out and returns to rest
  assert.equal(hit.mesh.material, hit.mesh.userData.baseMaterial);
  assert.equal(chip.style.display, 'none');
  assert.ok(Math.abs(hit.mesh.scale.y - y0) < 1e-9);
});

test('dragging never picks; tapping empty sky picks nothing; English chip only when enabled', () => {
  const s = stage(true);
  const picks = [];
  s.SA.picking.onPick((p) => picks.push(p));
  s.handlers.pointerdown(ev(400, 300));
  s.handlers.pointermove(ev(440, 300));
  s.handlers.pointerup(ev(440, 300));
  assert.equal(picks.length, 0, 'drag is not a pick');
  s.handlers.pointerdown(ev(2, 2));
  s.handlers.pointerup(ev(2, 2));
  assert.equal(picks.length, 0, 'sky is not a pick');
  s.handlers.pointerdown(ev(400, 300));
  s.handlers.pointerup(ev(400, 300));
  assert.equal(picks.length, 1);
  const chip = s.ctx.document.body.children[0];
  assert.equal(chip.children.length, 3, 'icon + Spanish + English');
  s.handlers.pointercancel(ev(0, 0));
});

test('mouse hover brightens the part under the cursor and clears when it leaves', () => {
  const s = stage(false);
  const hit = s.picking.pickAt(400, 300);
  s.handlers.pointermove(ev(400, 300, { pointerType: 'mouse' }));
  assert.ok(hit.mesh.material.emissiveIntensity > 0, 'hover glow');
  s.handlers.pointerleave(ev(400, 300, { pointerType: 'mouse' }));
  assert.equal(hit.mesh.material, hit.mesh.userData.baseMaterial);
  s.handlers.pointermove(ev(2, 2, { pointerType: 'mouse' }));
});
