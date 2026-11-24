// AS-0328: the party renderer (balloons + confetti) and the friends' dance on the real (vendored) three.js with a scripted SA.missionParty. No WebGL.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/mission-friends.js', 'game/render/mission-party.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

test('draws balloons and confetti only while the party view exists; the party is ticked each frame', () => {
  const { SA, THREE } = world();
  let v = null, ticks = 0;
  const thing = { tick: () => ticks++, view: () => v, snap: () => ({ status: 'none' }) };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionParty(THREE, { scene, thing });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(ticks, 1);
  assert.equal(r.group.visible, false);
  assert.equal(r.group.children.length, 0);
  v = { key: 'fiesta:1', phase: 'party', t: 0, tree: { x: 40, z: 10, y: 1 }, monkey: 'mono', animals: ['conejo', 'ciervo'] };
  r.update(0.1);
  assert.equal(r.group.visible, true);
  assert.equal(r.group.children.length, 70 + 8 * 2, 'confetti, then a balloon and a string each');
  const conf = r.group.children[0], ball = r.group.children[70];
  for (let i = 0; i < 20; i++) r.update(0.1);
  [conf, ball].forEach((m) => assert.ok(Math.hypot(m.position.x - 40, m.position.z - 10) < 7, 'around the tree'));
  assert.ok(conf.position.y <= 1 + 9 && conf.position.y > -1, 'confetti falls inside its column');
  assert.ok(ball.position.y > 1 + 2.5, 'balloons float above the ground');
  v = null;
  r.update(0.1);
  assert.equal(r.group.visible, false);
});

test('the friends and the monkey dance (bob and spin) while a view says dancing, and the party animals are the tap targets', () => {
  const { SA, THREE } = world();
  const cur = { key: 'fiesta:1', friends: [{ id: 'conejo', x: 10, z: 4, y: 1, rotY: 0 }], tree: { id: 'arbol-mono', x: 40, z: 10, y: 1, monkey: 'mono' } };
  let dancing = false;
  const thing = { current: () => cur, step: () => [{ id: 'conejo', x: 10, z: 4, heading: 0, lift: 0, moving: false, following: true, pop: null, dancing }] };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionFriends(THREE, { scene, thing, getPlayer: () => ({ x: 0, z: 0 }) });
  r.update(0.1);
  const monkey = r.group.children[1], rabbit = r.group.children[2];
  assert.deepEqual(Array.from(r.partyNodes()).map((n) => n.userData.animalId), ['mono', 'conejo']);
  const calm = [monkey.position.y, rabbit.position.y, monkey.rotation.y];
  dancing = true;
  let maxMonkey = 0, maxRabbit = 0, spin = 0;
  for (let i = 0; i < 60; i++) {
    r.update(0.05);
    maxMonkey = Math.max(maxMonkey, monkey.position.y - calm[0]);
    maxRabbit = Math.max(maxRabbit, rabbit.position.y - calm[1]);
    spin = Math.max(spin, Math.abs(monkey.rotation.y - calm[2]));
  }
  assert.ok(maxMonkey > 0.2 && maxRabbit > 0.2, 'they bounce');
  assert.ok(spin > 0.5, 'and swing around');
  dancing = false;
  r.update(0.05);
  assert.equal(monkey.position.y, calm[0], 'the monkey settles when the party ends');
});

test('a tap on a party animal during the photo step takes the photo (la cámara is equipped on the first tap)', () => {
  const { SA, THREE } = world();
  const scene = new THREE.Scene();
  const target = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1), new THREE.MeshBasicMaterial());
  target.position.set(0, 0, -10);
  target.updateMatrixWorld(true);
  const node = { userData: { pickVolumes: [target] } };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.updateMatrixWorld(true);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const calls = [];
  let res = { status: 'nocamera' }, view = { key: 'k', phase: 'photo', t: 0, tree: { x: 0, z: 0, y: 0 }, monkey: 'mono', animals: [] };
  const thing = { tick() {}, view: () => view, snap: (p) => (calls.push(p), res) };
  SA.inventory = { equip: (id) => (calls.push('equip:' + id), true) };
  SA.photo = { CAMERA: 'camara' };
  SA.audio = { say: (k) => calls.push('say:' + k) };
  const r = SA.render.createMissionParty(THREE, { scene, thing, canvas, camera, getPlayer: () => ({ x: 1, z: 2 }), getTargets: () => [node] });
  assert.equal(r.tapAt(50, 50), false, 'no camera yet: it is equipped');
  assert.deepEqual(calls.map((c) => (typeof c === 'string' ? c : 'snap')), ['snap', 'equip:camara', 'say:item:camara']);
  res = { status: 'complete' };
  assert.equal(r.tapAt(50, 50), true);
  view = { key: 'k', phase: 'party', t: 0, tree: { x: 0, z: 0, y: 0 }, monkey: 'mono', animals: [] };
  const n = calls.length;
  assert.equal(r.tapAt(50, 50), false, 'not during the dance');
  assert.equal(calls.length, n);
});
