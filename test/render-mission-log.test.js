// AS-0319: the river-rescue renderer runs on the real (vendored) three.js with a scripted SA.missionLog view: the rock with the puppy,
// the log that follows the pushed position and the happy hop once it locks. No WebGL: only scene-graph objects are touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/wag.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/mission-log.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

function scripted() {
  const cur = { key: 'rio:1', phase: 'ready', t: 0, pushing: false, spec: { animal: 'perrito', rock: 'roca', log: 'tronco' },
    rock: { id: 'roca', x: -28, z: 5, y: 0.55, r: 1.3 }, log: { id: 'tronco', z: 5, half: 2.7, r: 0.4, x0: -35.7, x1: -31, y: 0.45 },
    pup: { id: 'perrito', x: -28, z: 5, y: 0.55, rotY: 1.5 } };
  const calls = [];
  const log = { update: (p, dt) => calls.push([p, dt]), sync: () => cur, logX: () => cur.log.x0 + (cur.log.x1 - cur.log.x0) * cur.t, setSolids() {} };
  return { cur, log, calls };
}

test('draws the rock, the log and the puppy on the rock; the log follows the pushed position', () => {
  const { SA, THREE } = world();
  const s = scripted();
  const sounds = [];
  SA.audio = { sfx: (n, v) => sounds.push([n, v]) };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionLog(THREE, { scene, log: s.log, getPlayer: () => ({ x: -30, z: 5 }) });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  const [rock, trunk, pup, tear] = r.group.children;
  assert.equal(r.group.children.length, 4);
  assert.equal(rock.position.x, -28);
  assert.equal(pup.position.y, 0.55);
  assert.equal(tear.visible, true);
  assert.ok(Math.abs(trunk.position.x - s.cur.log.x0) < 1e-9);
  assert.equal(s.calls.length, 1, 'the logic is stepped once per frame');
  assert.deepEqual(sounds.map((x) => x[0]), ['whimper'], 'the stranded puppy whimpers (the player is close)');
  s.cur.t = 0.5; s.cur.pushing = true;
  r.update(0.5);
  assert.ok(Math.abs(trunk.position.x - (s.cur.log.x0 + (s.cur.log.x1 - s.cur.log.x0) / 2)) < 1e-9);
  assert.ok(sounds.some((x) => x[0] === 'rustle'), 'a soft scrape while it slides');
});

test('once locked the tear goes away and the puppy hops; clearing the mission removes everything', () => {
  const { SA, THREE } = world();
  const s = scripted();
  const sounds = [];
  SA.audio = { sfx: (n) => sounds.push(n) };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => null });
  r.update(0.1);
  s.cur.t = 1; s.cur.phase = 'locked';
  r.update(0.1);
  const pup = r.group.children[2];
  assert.equal(r.group.children[3].visible, false);
  assert.ok(sounds.includes('sparkle'));
  r.update(0.1);
  assert.ok(pup.position.y > 0.55, 'mid-hop');
  for (let i = 0; i < 20; i++) r.update(0.1);
  assert.equal(pup.position.y, 0.55, 'back on the rock');
  assert.equal(r.group.children[1].position.x, s.cur.log.x1);
  s.log.sync = () => null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
  assert.equal(r.update(0.1), r.group);
});

test('solids are registered with the logic; a logic error never breaks the frame', () => {
  const { SA, THREE } = world();
  const s = scripted();
  let got = null;
  s.log.setSolids = (f) => { got = f; };
  s.log.update = () => { throw new Error('boom'); };
  SA.audio = null;
  const f = () => [];
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, solids: f });
  assert.equal(got, f);
  r.update(0.1);
  assert.equal(r.group.children.length, 4);
});

// AS-0320: the puppy is wet (dark tint, drops, a towel waiting on the bank) until the sponge dries it; it rides in the player's arms.
function scriptedBank() {
  const s = scripted();
  Object.assign(s.cur, { phase: 'locked', t: 1, bank: { id: 'orilla', x: -41, z: 5, y: 0.1, r: 2.5 }, pupState: { phase: 'rock', wet: true, rubs: 0, need: 3 } });
  return s;
}
function bodyBrightness(pup) {
  let sum = 0;
  pup.traverse((o) => { if (o.material && o.material.color && o.material.type !== 'MeshBasicMaterial') sum += o.material.color.r + o.material.color.g + o.material.color.b; });
  return sum;
}

test('a bank adds a towel and drips; the puppy is tinted dark while wet and back to normal once dry', () => {
  const { SA, THREE } = world();
  const s = scriptedBank();
  SA.audio = { sfx() {} };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => ({ x: -30, z: 5 }) });
  r.update(0.1);
  assert.equal(r.group.children.length, 6, 'rock, log, puppy, tear, towel, drips');
  const pup = r.group.children[2], drips = r.group.children[5];
  assert.equal(drips.visible, true);
  const wet = bodyBrightness(pup);
  s.cur.pupState.rubs = 2;
  r.update(0.1);
  assert.ok(bodyBrightness(pup) > wet, 'it dries a little with each rub');
  s.cur.pupState.wet = false;
  r.update(0.1);
  assert.equal(drips.visible, false);
  const dry = bodyBrightness(pup);
  assert.ok(dry > wet);
  // another puppy built from the same species is not tinted by this one (the materials are its own)
  const other = SA.render.animalBuilder(THREE)(SA.data.get('animals', 'perrito'), {});
  assert.ok(Math.abs(bodyBrightness(other) - dry) < 1e-6, 'a fresh puppy matches the dry one');
});

test('carried, the puppy rides in front of the player; set down it stands on the towel', () => {
  const { SA, THREE } = world();
  const s = scriptedBank();
  SA.audio = { sfx() {} };
  const player = { x: -35, z: 5, y: 0.3, heading: Math.PI / 2 };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => player });
  r.update(0.1);
  const pup = r.group.children[2], tear = r.group.children[3];
  s.cur.pupState.phase = 'held';
  r.update(0.1);
  assert.ok(pup.position.x > player.x && pup.position.y > player.y, 'in front of the chest');
  assert.equal(tear.visible, false);
  s.cur.pupState.phase = 'bank';
  r.update(0.1);
  assert.equal(pup.position.x, -41);
  assert.equal(pup.position.z, 5);
  assert.equal(r.group.children[4].position.x, -41, 'the towel lies under it');
});

test('tapping the puppy on the bank rubs it with the sponge; without the sponge in hand it is picked up first', () => {
  const { SA, THREE } = world();
  const s = scriptedBank();
  s.cur.pupState.phase = 'bank';
  SA.audio = { sfx() {}, say() {} };
  const equipped = [];
  SA.inventory = { equip: (id) => { equipped.push(id); return true; } };
  const rubs = [];
  s.log.rub = () => { rubs.push(1); return rubs.length === 1 ? { status: 'noitem', item: 'esponja' } : { status: 'rub' }; };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => ({ x: -40, z: 5 }), canvas, camera });
  r.update(0.1);
  r.group.updateMatrixWorld(true);
  const vol = r.group.children[2].userData.pickVolumes[0];                         // look straight at one of the puppy's pick volumes
  const at = new THREE.Vector3().setFromMatrixPosition(vol.matrixWorld);
  camera.position.set(at.x, at.y + 0.5, at.z + 5);
  camera.lookAt(at);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(2, 2), false, 'a tap on empty ground does nothing');
  assert.equal(rubs.length, 0);
  assert.equal(r.tapAt(50, 50), false, 'the sponge was not in hand: it is now equipped');
  assert.deepEqual(equipped, ['esponja']);
  assert.equal(r.tapAt(50, 50), true);
  assert.equal(rubs.length, 2);
});

// AS-0321: once dry the puppy on the bank wags its tail; a tap on it with la cámara takes the finale photo.
test('the dry puppy wags its tail on the bank; the wet one keeps it still', () => {
  const { SA, THREE } = world();
  const s = scriptedBank();
  s.cur.pupState.phase = 'bank';
  SA.audio = { sfx() {} };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => ({ x: -40, z: 5 }) });
  r.update(0.1);
  const pup = r.group.children[2];
  const tail = pup.children.find((m) => m.userData.part === 'cola' && !m.userData.pick);
  assert.ok(tail, 'the puppy has a tail mesh');
  const x0 = tail.position.x, z0 = tail.position.z;
  r.update(0.1);
  assert.ok(Math.abs(tail.position.x - x0) < 1e-9 && Math.abs(tail.position.z - z0) < 1e-9, 'wet: tail at rest');
  s.cur.pupState.wet = false;
  let moved = 0;
  for (let i = 0; i < 12; i++) { r.update(0.05); if (Math.abs(tail.position.x - x0) > 0.01 || Math.abs(tail.position.z - z0) > 0.01) moved++; }
  assert.ok(moved > 3, 'dry: the tail swings side to side');
  s.cur.pupState.wet = true;
  r.update(0.1);
  assert.ok(Math.abs(tail.position.x - x0) < 1e-9, 'wet again: back at rest');
});

test('tapping the dry puppy takes its photo; without la cámara in hand it is equipped first', () => {
  const { SA, THREE } = world();
  const s = scriptedBank();
  Object.assign(s.cur.pupState, { phase: 'bank', wet: false });
  SA.audio = { sfx() {}, say() {} };
  const equipped = [];
  SA.inventory = { equip: (id) => { equipped.push(id); return true; } };
  const calls = [];
  s.log.rub = () => { calls.push('rub'); return { status: 'none' }; };
  s.log.snap = () => { calls.push('snap'); return calls.filter((c) => c === 'snap').length === 1 ? { status: 'nocamera' } : { status: 'complete' }; };
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const r = SA.render.createMissionLog(THREE, { scene: new THREE.Scene(), log: s.log, getPlayer: () => ({ x: -40, z: 5 }), canvas, camera });
  r.update(0.1);
  r.group.updateMatrixWorld(true);
  const vol = r.group.children[2].userData.pickVolumes[0];
  const at = new THREE.Vector3().setFromMatrixPosition(vol.matrixWorld);
  camera.position.set(at.x, at.y + 0.5, at.z + 5);
  camera.lookAt(at);
  camera.updateMatrixWorld(true);
  assert.equal(r.tapAt(2, 2), false, 'a tap on empty ground does nothing');
  assert.equal(r.tapAt(50, 50), false, 'la cámara was not in hand: it is now equipped');
  assert.deepEqual(equipped, ['camara']);
  assert.equal(r.tapAt(50, 50), true, 'the photo is taken');
  assert.deepEqual(calls, ['snap', 'snap'], 'a dry puppy is never rubbed');
});
