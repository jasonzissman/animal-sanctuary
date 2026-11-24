// AS-0364: the mailbox renderer for Mission 11 on the real (vendored) three.js with a scripted SA.missionLetter state. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/render/mission-letter.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

test('draws one mailbox on the platform with a glow ring only on the handover / photo steps; gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = null, view = null;
  const scene = new THREE.Scene();
  const r = SA.render.createMissionLetter(THREE, { scene, thing: { current: () => cur, view: () => view } });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 0, 'nothing before the mission');
  cur = { key: 'mensaje:1' };
  view = { box: { x: 3, y: 5, z: 4 }, give: false, photo: false, given: false };
  r.update(0.1);
  assert.equal(r.group.children.length, 1);
  const box = r.group.children[0];
  assert.deepEqual([box.position.x, box.position.y, box.position.z], [3, 5, 4]);
  const ring = box.children.find((c) => c.geometry && c.geometry.type === 'TorusGeometry');
  assert.equal(ring.visible, false, 'no glow while the legs are being followed');
  view = { ...view, give: true };
  r.update(0.1);
  assert.equal(ring.visible, true);
  cur = null; view = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});

test('tapAt only counts on the photo step, with a canvas and a camera', () => {
  const { SA, THREE } = world();
  const scene = new THREE.Scene();
  let snaps = 0;
  const thing = { current: () => ({ key: 'k' }), view: () => ({ box: { x: 0, y: 0, z: 0 }, give: false, photo: false }), snap: () => { snaps++; return { status: 'complete' }; } };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1, 5); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const r = SA.render.createMissionLetter(THREE, { scene, thing, canvas, camera });
  r.update(0.1);
  assert.equal(r.tapAt(50, 50), false, 'not the photo step');
  thing.view = () => ({ box: { x: 0, y: 0, z: 0 }, give: false, photo: true });
  assert.equal(r.tapAt(50, 50), true, 'the mailbox is in the middle of the screen');
  assert.equal(snaps, 1);
  assert.equal(r.tapAt(2, 2), false, 'a tap on the sky does nothing');
  assert.equal(snaps, 1);
});
