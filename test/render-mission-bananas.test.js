// AS-0326: the banana renderer on the real (vendored) three.js with a scripted SA.missionBananas state. No WebGL: scene-graph objects only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/render/mission-bananas.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

test('draws one bunch per pickup, hides taken ones and removes all when the mission ends', () => {
  const { SA, THREE } = world();
  let cur = { key: 'fiesta:1', spec: { item: 'platano', n: 2 }, items: [{ id: 'platano-1', x: 10, z: 4, y: 1, taken: false }, { id: 'platano-2', x: 20, z: -4, y: 2, taken: false }] };
  const thing = { current: () => cur };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionBananas(THREE, { scene, thing });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  assert.equal(r.group.children.length, 2);
  assert.ok(r.group.children.every((c) => c.visible));
  assert.equal(r.group.children[0].position.x, 10);
  cur.items[0].taken = true;
  r.update(0.1);
  assert.equal(r.group.children[0].visible, false);
  assert.equal(r.group.children[1].visible, true);
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0);
});
