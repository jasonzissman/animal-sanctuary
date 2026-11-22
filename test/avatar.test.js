import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Minimal stub THREE: just enough scene-graph to build and animate the kid avatar (no WebGL).
function node() {
  return { children: [], position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 },
    add(c) { this.children.push(c); } };
}
const THREE = {
  Group: function () { return node(); },
  Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
  BoxGeometry: function (w, h, d) { return { w, h, d }; },
  SphereGeometry: function (r) { return { r }; },
  MeshLambertMaterial: function (o) { return o; },
};
const SA = loadGame(['game/sa.js', 'game/render/avatar.js']);

test('the avatar is built from primitives with feet on the ground and a head above', () => {
  const a = SA.render.createAvatar(THREE);
  assert.equal(a.group.name, 'avatar');
  assert.equal(a.parts.head.geometry.r > 0, true);
  assert.ok(a.parts.head.position.y > 1, 'head above the shoulders');
  assert.equal(a.group.position.y, 0);
});

test('update places the avatar and faces it along the player heading', () => {
  const a = SA.render.createAvatar(THREE);
  a.update(0.016, { x: 3, z: -4, heading: 1.5, moving: false });
  assert.deepEqual([a.group.position.x, a.group.position.y, a.group.position.z, a.group.rotation.y], [3, 0, -4, 1.5]);
  a.update(0.016, null);   // no player (e.g. classic mode): nothing happens
  assert.equal(a.group.position.x, 3);
});

test('running plays a faster stride than walking', () => {
  const cycles = (running) => {
    const a = SA.render.createAvatar(THREE);
    let flips = 0, prev = 0;
    for (let i = 0; i < 120; i++) {
      a.update(0.025, { x: 0, z: 0, heading: 0, moving: true, running });
      const s = Math.sign(a.parts.armL.rotation.x);
      if (i > 5 && s !== prev && prev !== 0) flips++;
      prev = s;
    }
    return flips;
  };
  assert.ok(cycles(true) > cycles(false) * 1.3, 'more arm swings per second while running');
});

test('arms and legs swing in opposition while moving, and settle when stopped', () => {
  const a = SA.render.createAvatar(THREE);
  const p = a.parts;
  let max = 0, bob = 0;
  for (let i = 0; i < 60; i++) {
    a.update(0.05, { x: 0, z: 0, heading: 0, moving: true });
    max = Math.max(max, Math.abs(p.armL.rotation.x));
    bob = Math.max(bob, a.group.children[0].position.y);
    assert.ok(Math.abs(p.armL.rotation.x + p.armR.rotation.x) < 1e-9, 'arms opposite');
    assert.ok(Math.abs(p.armL.rotation.x + p.legL.rotation.x) < 1e-9, 'arm opposes same-side leg');
  }
  assert.ok(max > 0.3, 'arms swing: ' + max);
  assert.ok(bob > 0.01, 'body bobs: ' + bob);
  for (let i = 0; i < 100; i++) a.update(0.05, { x: 0, z: 0, heading: 0, moving: false });
  assert.ok(Math.abs(p.armL.rotation.x) < 1e-3 && a.group.children[0].position.y < 1e-3);
  a.update(1e9, { x: 0, z: 0, heading: 0, moving: true });   // a stalled tab must not blow up
  assert.ok(Number.isFinite(p.armL.rotation.x));
});
