// AS-0327: the party friends renderer on the real (vendored) three.js with a scripted SA.missionFriends state. No WebGL: scene-graph objects only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/mission-friends.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

test('draws the monkey tree, the monkey and one animal per friend; invited friends move, waiting ones stay, all go when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = { key: 'fiesta:1', friends: [{ id: 'conejo', x: 10, z: 4, y: 1, rotY: 0 }, { id: 'ciervo', x: 20, z: -4, y: 1, rotY: 1 }],
    tree: { id: 'arbol-mono', x: 40, z: 10, y: 1, monkey: 'mono' } };
  let views = [{ id: 'conejo', x: 10, z: 4, heading: 0, lift: 0, moving: false, following: false, pop: null },
    { id: 'ciervo', x: 20, z: -4, heading: 1, lift: 0, moving: false, following: false, pop: null }];
  const thing = { current: () => cur, step: () => views };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionFriends(THREE, { scene, thing, getPlayer: () => ({ x: 0, z: 0 }) });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  const kids = r.group.children;
  assert.equal(kids.length, 4);                                   // tree, monkey, two friends
  assert.equal(kids[0].position.x, 40);
  assert.equal(kids[1].userData.animalId, 'mono');
  assert.deepEqual([kids[2].userData.animalId, kids[3].userData.animalId], ['conejo', 'ciervo']);
  assert.equal(kids[2].position.x, 10);
  views = [Object.assign({}, views[0], { x: 14, z: 6, following: true, moving: true }), views[1]];
  r.update(0.1);
  assert.equal(kids[2].position.x, 14);
  assert.equal(kids[2].position.z, 6);
  assert.equal(kids[3].position.x, 20);
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});
