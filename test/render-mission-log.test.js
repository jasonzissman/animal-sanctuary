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
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/mission-log.js'];

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
