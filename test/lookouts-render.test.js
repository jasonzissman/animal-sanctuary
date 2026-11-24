// AS-0160: the lookout towers' merged mesh builds with the real vendored three.js (no WebGL needed for geometry).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/camera.js',
  'game/player.js', 'game/forest-paths.js', 'game/forest-streams.js', 'game/fallen-logs.js', 'game/surfaces.js', 'game/lookouts.js', 'game/render/lookouts.js'];

test('createLookouts builds one merged mesh with every tower and adds it to the scene', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const { THREE, SA } = ctx;
  const scene = new THREE.Scene();
  const view = SA.render.createLookouts(THREE, { scene });
  assert.equal(scene.children.length, 1);
  assert.equal(view.mesh.name, 'lookouts');
  assert.equal(view.stats().towers, SA.lookouts.towers().length);
  assert.ok(view.stats().triangles > 500);
  // The platform surface is exactly the tower's topY: the highest box top below the railing lies there.
  const t = SA.lookouts.towers()[0];
  view.mesh.geometry.computeBoundingBox();
  assert.ok(view.mesh.geometry.boundingBox.max.y >= t.topY + t.railH - 1e-6, 'railing and ladder reach above the platform');
  assert.equal(view.nodeFor(t.id), view.mesh);
  assert.equal(view.nodeFor('nope'), null);
});
