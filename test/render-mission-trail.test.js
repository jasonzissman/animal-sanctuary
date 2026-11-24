// AS-0347: the footprint trail renderer on the real (vendored) three.js with a scripted SA.missionTrail state. No WebGL: scene-graph only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/render/mission-trail.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}

const state = () => ({ key: 'ladrones:1', from: { x: 5, z: 5 }, points: [0, 1, 2, 3, 4, 5].map((i) => ({ x: 5 + i * 2, z: 5, rot: Math.PI / 2, side: i % 2 ? 1 : -1 })),
  crumbs: [{ x: 8, z: 6, n: 3 }], log: { x: 12, z: 5, rotY: Math.PI / 2, len: 5.5, h: 2.6 } });

test('draws the empty basket, the prints, crumbs and the log; prints show and glow only while the step is active', () => {
  const { SA, THREE } = world();
  let cur = state(), view = { active: false, ahead: [] };
  const scene = new THREE.Scene();
  const r = SA.render.createMissionTrail(THREE, { scene, thing: { current: () => cur, view: () => view } });
  assert.ok(scene.children.includes(r.group));
  r.update(0.1);
  const names = r.group.children.map((c) => c.name);
  assert.ok(names.includes('emptyBasket') && names.includes('trailLog'));
  const tracks = r.group.children.find((c) => !c.name);
  assert.equal(tracks.children.length, 6 + 1, 'six prints and one crumb pile');
  assert.equal(tracks.visible, false, 'hidden while the step is not active');
  view = { active: true, ahead: [2, 3, 4] };
  r.update(0.1);
  assert.equal(tracks.visible, true);
  const glowColor = (g) => g.userData.parts[0].material.emissive.getHex();
  assert.ok(glowColor(tracks.children[2]) > 0 && glowColor(tracks.children[0]) === 0, 'the next prints glow');
  const s0 = tracks.children[2].scale.x;
  r.update(0.2);
  assert.notEqual(tracks.children[2].scale.x, s0, 'and pulse');
  view = { active: true, ahead: [3, 4, 5] };
  r.update(0.1);
  assert.equal(glowColor(tracks.children[2]), 0, 'the glow moves on with the child');
  cur = null;
  r.update(0.1);
  assert.equal(r.group.children.length, 0, 'all gone when the mission ends');
});
