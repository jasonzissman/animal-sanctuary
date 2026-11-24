// AS-0371: the roof telescope, the night-sky view and its controls on the real (vendored) three.js, with a scripted SA.missionSky. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/constellations.js', 'game/constellations.js', 'game/picking.js', 'game/mission-sky.js', 'game/render/telescope.js', 'game/render/sky-view.js', 'game/ui/sky-view-ui.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE, ctx };
}

function fakeCanvas() {
  const handlers = {};
  return { handlers, addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    clientWidth: 100, clientHeight: 100, width: 100, height: 100 };
}

test('telescope: low-poly primitives with one generous invisible pick volume, at the given roof spot', () => {
  const { SA, THREE } = world();
  const g = SA.render.buildTelescope(THREE, { x: 1, y: 4, z: 2 });
  assert.deepEqual([g.position.x, g.position.y, g.position.z], [1, 4, 2]);
  const picks = [];
  g.traverse((o) => { if (o.userData && o.userData.telescopePick) picks.push(o); });
  assert.equal(picks.length, 1);
  assert.equal(picks[0].material.visible, false);
  assert.ok(picks[0].geometry.parameters.width >= 1.4 && picks[0].geometry.parameters.height >= 1.5, 'generous');
  let meshes = 0, textures = 0;
  g.traverse((o) => { if (o.isMesh) { meshes++; if (o.material.map) textures++; } });
  assert.ok(meshes >= 8);
  assert.equal(textures, 0, 'flat materials, no textures');
});

test('sky view: renders only while open, aims the camera from yaw / pitch, draws stars and the moon; a tap on the telescope opens it', () => {
  const { SA, THREE } = world();
  const opened = [];
  let open = false, yaw = 0.4, pitch = 0.6;
  const M = { MOON: { yaw: 0.9, pitch: 0.65 }, stars: SA.missionSky.stars, view: () => ({ open, yaw, pitch }), open: (p) => { opened.push(p); return { status: 'open' }; } };
  const drawn = [];
  const renderer = { domElement: fakeCanvas(), render: (s, c) => drawn.push([s, c]) };
  const station = new THREE.Group();
  const scope = SA.render.buildTelescope(THREE, { x: 0, y: 0, z: -3 });
  station.add(scope); station.userData.telescope = scope;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1, 2); camera.lookAt(0, 1, -3); camera.updateMatrixWorld(true); scope.updateMatrixWorld(true);
  const canvas = fakeCanvas();
  const v = SA.render.createSkyView(THREE, { renderer, canvas, camera, station, getPlayer: () => ({ x: 1, z: 2 }), mission: M });
  assert.equal(v.active(), false);
  open = true;
  assert.equal(v.active(), true);
  v.render();
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0][0], v.scene);
  assert.ok(Math.abs(v.camera.rotation.x - 0.6) < 1e-9 && Math.abs(v.camera.rotation.y + 0.4) < 1e-9, 'pitch up, yaw turns the other way round the y axis');
  const kinds = {};
  v.scene.traverse((o) => { kinds[o.type] = (kinds[o.type] || 0) + 1; });
  assert.equal(kinds.Points, 2 + 3, 'small and big stars, plus the brighter stars of each of the 3 constellations');
  assert.equal(kinds.LineSegments, 3, 'one line set per constellation (hidden until found)');
  assert.ok(kinds.Mesh > 30, 'dome, moon and horizon hills');
  const moon = v.scene.children.find((c) => c.type === 'Group' && c.children[0].type === 'Mesh');
  assert.ok(moon && Math.hypot(moon.position.x, moon.position.y, moon.position.z) > 40, 'the moon sits far out on the dome');
  assert.equal(v.tapAt(50, 50), false, 'taps are ignored while the view is open');
  open = false;
  assert.equal(opened.length, 0);
  assert.equal(v.tapAt(50, 50), true, 'the telescope is in the middle of the screen');
  assert.deepEqual(opened, [{ x: 1, z: 2 }]);
  assert.equal(v.tapAt(2, 2), false, 'a tap on the sky or the wall does nothing');
  assert.equal(v.capture(), null, 'no document: no picture, and no throw');
});

function fakeDoc() {
  const mk = () => ({ style: {}, children: [], listeners: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, addEventListener(t, f) { this.listeners[t] = f; } });
  const doc = { body: mk(), createElement: () => mk() };
  return doc;
}

test('controls: opening shows the layer, the exit button closes, drag and keys aim, the camera button takes the photo and closes after a moment', () => {
  const { SA, ctx } = world();
  const calls = [];
  const toggles = [];
  let photo = true, view = { open: true, photo };
  const M = { onView: null, view: () => view, aim: (dy, dp) => calls.push(['aim', dy, dp]), close: () => calls.push(['close']), snap: () => { calls.push(['snap']); return { status: 'complete' }; } };
  const doc = fakeDoc();
  const timers = [];
  ctx.setTimeout = (f) => timers.push(f);
  const keyHandlers = {};
  ctx.addEventListener = (t, f) => { keyHandlers[t] = f; };
  const ui = SA.skyViewUi.create(doc, { mission: M, onToggle: (on) => toggles.push(on), raf: () => 1 });
  const [layer] = doc.body.children, [flash, prog, pop, exit, cam] = layer.children;
  assert.ok(flash && prog && pop && exit && cam);
  assert.match(layer.style.cssText, /display:none/);
  M.onView(true);
  assert.equal(ui.isOpen(), true);
  assert.equal(layer.style.display, 'block');
  assert.equal(cam.style.display, 'flex', 'the camera button shows on the photo step');
  assert.deepEqual(toggles, [true], 'the world pauses its taps');
  // a drag aims (the sky follows the pointer)
  layer.listeners.pointerdown({ target: layer, pointerId: 1, clientX: 10, clientY: 10 });
  layer.listeners.pointermove({ pointerId: 1, clientX: 30, clientY: 0 });
  assert.equal(calls[0][0], 'aim');
  assert.ok(calls[0][1] < 0 && calls[0][2] < 0, 'dragging right/up turns the view left/down');
  layer.listeners.pointerup({});
  // keys never reach the walking rig
  let stopped = 0, prevented = 0;
  keyHandlers.keydown({ key: 'ArrowLeft', stopPropagation: () => stopped++, preventDefault: () => prevented++ });
  keyHandlers.keydown({ key: 'q', stopPropagation: () => stopped++, preventDefault: () => prevented++ });
  assert.deepEqual([stopped, prevented], [1, 1], 'only the aim keys are taken');
  // the camera button: shutter, flash, then the view closes by itself
  cam.listeners.click({});
  assert.deepEqual(calls.filter((c) => c[0] === 'snap').length, 1);
  assert.equal(cam.style.display, 'none');
  assert.equal(timers.length, 2);
  timers.forEach((f) => f());
  assert.equal(ui.isOpen(), false);
  assert.deepEqual(toggles, [true, false]);
  assert.ok(calls.some((c) => c[0] === 'close'));
  // the exit button and Escape
  M.onView(true);
  exit.listeners.click({});
  assert.equal(ui.isOpen(), false);
  M.onView(true);
  keyHandlers.keydown({ key: 'Escape', stopPropagation() {}, preventDefault() {} });
  assert.equal(ui.isOpen(), false);
  // no DOM: a harmless no-op
  assert.equal(SA.skyViewUi.create(null, { mission: M }).element, null);
});
