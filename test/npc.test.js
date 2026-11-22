import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Stub THREE: just enough scene graph to build and animate the scientist (no WebGL).
function node() {
  return { children: [], position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, add(c) { this.children.push(c); } };
}
const THREE = {
  Group: function () { return node(); },
  Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
  BoxGeometry: function (w, h, d) { return { w, h, d }; },
  SphereGeometry: function (r) { return { r }; },
  MeshLambertMaterial: function (o) { return o; },
  MeshBasicMaterial: function (o) { return o; },
};
const FILES = ['game/sa.js', 'game/map.js', 'game/station.js', 'game/npc.js', 'game/render/avatar.js', 'game/render/scientist.js'];

function count(n) { return 1 + n.children.reduce((s, c) => s + count(c), 0); }

test('the scientist stands on the porch beside the door, facing out, outside the walls', () => {
  const SA = loadGame(FILES), L = SA.station.layout(), s = SA.npc.scientist();
  assert.equal(s.id, 'scientist');
  assert.ok(s.z < L.door.z - L.wallT / 2, 'in front of the front wall');
  assert.ok(Math.abs(s.x - L.cx) > L.door.width / 2 + 0.3 && Math.abs(s.x - L.cx) < L.halfW, 'beside the doorway, not in it');
  assert.equal(s.heading, Math.PI);
  assert.ok(s.nearRadius < s.farRadius);
  assert.equal(SA.npc.scientist(), s, 'one stable post');
  const [ox, oz, r] = SA.npc.obstacle();
  assert.deepEqual([ox, oz], [s.x, s.z]);
  assert.ok(r > 0);
  const sp = SA.station.spawn();
  assert.ok(SA.npc.distance(s, sp) > r + 0.6, 'the kid does not spawn on her');
});

// Angle (degrees) between where the player is looking and the direction to (x, z); forward = (sin h, cos h).
function offAxis(p, x, z) {
  const d = Math.atan2(x - p.x, z - p.z) - p.heading;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 180 / Math.PI;
}

test('at the spawn the scientist is straight ahead and close, with the station door in the view cone (AS-0212)', () => {
  const SA = loadGame(FILES), L = SA.station.layout(), s = SA.npc.scientist(), p = SA.player ? SA.player.spawn() : SA.station.spawn();
  assert.deepEqual(p, SA.station.spawn());
  assert.ok(offAxis(p, s.x, s.z) <= 15, 'scientist within 15 degrees of straight ahead: ' + offAxis(p, s.x, s.z));
  const dist = SA.npc.distance(s, p);
  assert.ok(dist <= 3 && dist > SA.npc.obstacle()[2] + 0.6, 'close, but not on top of her: ' + dist);
  assert.ok(s.z > p.z, 'she is in front (toward the building), not behind');
  assert.ok(offAxis(p, L.door.x, L.door.z) <= 40, 'the door is inside the forward view cone: ' + offAxis(p, L.door.x, L.door.z));
  assert.ok(offAxis(p, L.door.x, L.door.z) > 0, 'the doorway is beside her, not hidden behind her');
});

test('mode: wave inside the near radius, idle beyond the far radius, hysteresis between', () => {
  const SA = loadGame(FILES), { mode, NEAR, FAR } = SA.npc;
  assert.equal(mode('idle', NEAR - 0.1), 'wave');
  assert.equal(mode('idle', NEAR + 0.1), 'idle');
  assert.equal(mode('wave', NEAR + 0.1), 'wave');
  assert.equal(mode('wave', FAR + 0.1), 'idle');
  assert.equal(mode('wave', Infinity), 'idle');
  assert.equal(mode('wave', NaN), 'idle');
  assert.equal(mode('idle', 1, { nearRadius: 0.5, farRadius: 2 }), 'idle');
});

test('distance ignores a missing or non-finite player', () => {
  const SA = loadGame(FILES), s = SA.npc.scientist();
  assert.equal(SA.npc.distance(s, null), Infinity);
  assert.equal(SA.npc.distance(s, { x: NaN, z: 0 }), Infinity);
  assert.ok(Math.abs(SA.npc.distance({ x: 0, z: 0 }, { x: 3, z: 4 }) - 5) < 1e-9);
});

test('the tracker eases into the wave when the player walks up and back to idle when they leave', () => {
  const SA = loadGame(FILES), s = SA.npc.scientist(), t = SA.npc.create();
  const far = { x: s.x, z: s.z - 30 }, near = { x: s.x, z: s.z - 2 };
  assert.equal(t.update(0.016, far).mode, 'idle');
  assert.equal(t.state().wave, 0);
  t.update(0.016, near);
  assert.equal(t.state().mode, 'wave');
  assert.ok(t.state().wave > 0 && t.state().wave < 1, 'eases in');
  for (let i = 0; i < 60; i++) t.update(0.016, near);
  assert.ok(t.state().wave > 0.95);
  for (let i = 0; i < 100; i++) t.update(0.016, far);
  assert.equal(t.state().mode, 'idle');
  assert.ok(t.state().wave < 0.05);
  assert.ok(t.state().t > 1, 'animation time keeps running');
  assert.equal(t.update(0.016, null).mode, 'idle', 'no player: idle');
});

test('the rendered scientist has a lab coat, glasses and clipboard, stays at her post, and waves when near', () => {
  const SA = loadGame(FILES), sci = SA.render.createScientist(THREE), s = SA.npc.scientist();
  const plain = SA.render.createAvatar(THREE);
  assert.equal(sci.group.name, 'scientist');
  assert.ok(count(sci.group) > count(plain.group) + 15, 'extra coat, glasses and clipboard parts');
  const farP = { x: s.x, z: s.z - 40 };
  for (let i = 0; i < 30; i++) sci.update(0.05, farP);
  const idleArm = sci.parts.armR.rotation.x, idleHead = sci.parts.head.rotation.x;
  assert.ok(sci.parts.armL.rotation.x < -0.8, 'clipboard arm raised');
  assert.ok(idleHead > 0.2, 'head bowed over the clipboard');
  assert.deepEqual([sci.group.position.x, sci.group.position.z, sci.group.rotation.y], [s.x, s.z, Math.PI], 'never moves');
  const nearP = { x: s.x, z: s.z - 2 };
  for (let i = 0; i < 30; i++) sci.update(0.05, nearP);
  assert.ok(sci.parts.armR.rotation.x < idleArm - 1.2, 'the free arm goes up for the wave');
  assert.ok(sci.parts.head.rotation.x < idleHead, 'head lifts');
  assert.equal(sci.group.position.x, s.x);
});
