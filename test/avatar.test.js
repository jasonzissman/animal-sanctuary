import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Minimal stub THREE: just enough scene-graph to build and animate the kid avatar (no WebGL).
function node() {
  return { children: [], position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
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

test('the kid has a face, hair, hands, shoes and a backpack (AS-0138)', () => {
  const a = SA.render.createAvatar(THREE);
  const body = a.group.children[0];
  const colours = new Set(body.children.filter((c) => c.material).map((c) => c.material.color));
  for (const c of [0x222222 /* eyes */, 0x5a3a22 /* hair + brows */, 0xb4423a /* smile */, 0x3fa56b /* backpack */]) assert.ok(colours.has(c), c.toString(16));
  assert.ok(a.parts.eyes[0].position.z > 0.2 && a.parts.eyes[0].position.x < 0 && a.parts.eyes[1].position.x > 0, 'eyes on the front of the head');
  assert.ok(a.parts.hands.every((h) => h.position.y < -0.35 && h.position.y > -0.5), 'hands at the end of the arm');
  assert.ok(a.parts.armR.children.includes(a.parts.hands[1]), 'hand rides on the swinging arm');
  assert.ok(a.parts.shoes.every((s) => s.scale.z > s.scale.y), 'shoes are longer than tall');
  assert.ok(body.children.some((c) => c.position.z < -0.15 && c.geometry.w > 0.25), 'a backpack behind the shoulders');
});

test('the avatar keeps its old height and its soles touch the ground', () => {
  const a = SA.render.createAvatar(THREE);
  let top = 0, bottom = 1;
  const walk = (n, y0) => {
    for (const c of n.children) {
      const y = y0 + c.position.y;
      if (c.geometry) {
        const h = c.geometry.h !== undefined ? c.geometry.h * c.scale.y / 2 : (c.geometry.r || 1) * c.scale.y;
        top = Math.max(top, y + h); bottom = Math.min(bottom, y - h);
      }
      walk(c, y);
    }
  };
  walk(a.group.children[0], 0);
  assert.ok(top > 1.55 && top < 1.7, 'head top ' + top);
  assert.ok(bottom > -0.03 && bottom < 0.05, 'soles near y=0: ' + bottom);
});

test('climbing and hopping poses still read: arms reach up, body leans, squash on takeoff', () => {
  const a = SA.render.createAvatar(THREE);
  for (let i = 0; i < 60; i++) a.update(0.05, { x: 0, z: 0, heading: 0, moving: false, climb: 'up' });
  assert.ok(a.parts.armL.rotation.x < -1.4 && a.parts.armR.rotation.x < -1.4, 'both arms reach up (they alternate)');
  assert.ok(a.parts.body.rotation.x > 0.2, 'leans into the trunk');
  const b = SA.render.createAvatar(THREE);
  b.update(0.016, { x: 0, z: 0, heading: 0, moving: false, lift: 0 });
  b.update(0.016, { x: 0, z: 0, heading: 0, moving: false, lift: 0.1 });
  assert.ok(b.parts.body.scale.y !== 1 && b.group.position.y === 0.1, 'airborne: lifted and squashed');
});

test('running leans the body forward; walking does not', () => {
  const lean = (running) => {
    const a = SA.render.createAvatar(THREE);
    for (let i = 0; i < 40; i++) a.update(0.05, { x: 0, z: 0, heading: 0, moving: true, running });
    return a.parts.body.rotation.x;
  };
  assert.ok(lean(true) > 0.08 && lean(false) === 0);
});
