// AS-0336: the feather and eagle-nest renderer on the real (vendored) three.js with a scripted SA.missionNest state. No WebGL: scene-graph objects only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/animal-plan.js', 'game/render/animals.js', 'game/render/mission-nest.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'aguila:1', spec: { item: 'pluma', chick: 'aguila', mama: 'aguila' }, feather: { id: 'pluma-1', x: -60, z: 10, y: 1, taken: false },
  summit: { x: -98, z: -26, y: 9, r: 1.4 }, nest: { x: -84, z: -22, y: 10, r: 1.4 }, bridge: { x: -91, z: -24, y: 9 }, crossed: false });

test('draws a feather, a nest and two eagles (chick and mamá) on the nest peak; the feather hides when taken; all gone when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = state();
  const scene = new THREE.Scene();
  const r = SA.render.createMissionNest(THREE, { scene, thing: { current: () => cur } });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 4, 'feather, nest bowl, mamá, chick');
  const feather = r.group.children[0];
  assert.equal(feather.visible, true);
  assert.equal(feather.position.x, -60);
  const eagles = r.group.children.filter((c) => c.userData && c.userData.animalId === 'aguila');
  assert.equal(eagles.length, 2);
  assert.ok(eagles.every((e) => Math.abs(e.position.y - 10) < 0.5 && Math.hypot(e.position.x + 84, e.position.z + 22) < 2), 'sitting in the nest on the far peak');
  assert.ok(eagles[1].scale.x < eagles[0].scale.x, 'the chick is smaller than mamá');
  cur.feather.taken = true;
  r.update(0.1);
  assert.equal(r.group.children[0].visible, false);
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});
