import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/map.js', 'game/treetop-tell.js', 'game/render/treetop-tell.js'];

function tellsFor(seed, dist, secs, dt = 1 / 30) {
  const SA = loadGame(FILES);
  const t = SA.treetopTell.create({ seed });
  const calls = [];
  let maxRustle = 0;
  for (let s = 0; s < secs; s += dt) {
    const r = t.update(dt, dist);
    if (r.call > 0) calls.push(+s.toFixed(2));
    maxRustle = Math.max(maxRustle, r.rustle);
  }
  return { calls, maxRustle };
}

test('tell: rustles and calls now and then when the player is near, never when far or unknown', () => {
  const near = tellsFor(1, 5, 60);
  assert.ok(near.calls.length >= 5 && near.calls.length <= 15, `calls: ${near.calls.length}`);
  assert.ok(near.maxRustle > 0.9 && near.maxRustle <= 1);
  for (const d of [30, 16, null, undefined, NaN, -1]) {
    const far = tellsFor(1, d, 60);
    assert.equal(far.calls.length, 0, `dist ${d}`);
    assert.equal(far.maxRustle, 0);
  }
});

test('tell: seeded (same seed, same timing; different seeds differ) and calls are spaced by the gap', () => {
  const a = tellsFor(7, 4, 60), b = tellsFor(7, 4, 60), c = tellsFor(8, 4, 60);
  assert.deepEqual(a.calls, b.calls);
  assert.notDeepEqual(a.calls, c.calls);
  for (let i = 1; i < a.calls.length; i++) assert.ok(a.calls[i] - a.calls[i - 1] >= 4, 'at least the minimum gap apart');
});

test('tell: the call is soft, fades with distance, and a rustle in progress finishes even if the player walks away', () => {
  const SA = loadGame(FILES);
  const T = SA.treetopTell;
  assert.equal(T.volume(0), T.MAX_VOLUME);
  assert.ok(T.MAX_VOLUME <= 0.6);
  assert.ok(T.volume(4) > T.volume(10) && T.volume(10) > 0);
  assert.deepEqual([T.volume(T.NEAR), T.volume(99), T.volume(-1), T.volume(null)], [0, 0, 0, 0]);
  const t = T.create({ seed: 3 });
  let started = false, i = 0;
  while (!started && i++ < 1000) started = t.update(0.1, 2).call > 0;
  assert.ok(started);
  const mid = t.update(0.1, 50);                   // player ran off: the rustle still swells and settles
  assert.ok(mid.rustle > 0 && mid.call === 0);
  for (let k = 0; k < 20; k++) t.update(0.1, 50);
  assert.equal(t.update(0.1, 50).rustle, 0);
});

test('tell: shake is zero when still and bounded; shadow shrinks and fades with height; treeIndex picks the nearest tree', () => {
  const SA = loadGame(FILES);
  const T = SA.treetopTell;
  assert.equal(T.shake(0, 1), 0);
  for (let t = 0; t < 3; t += 0.05) assert.ok(Math.abs(T.shake(1, t)) <= 0.05, 'small lean');
  const low = T.shadow(1), high = T.shadow(5.2), none = T.shadow(-3);
  assert.ok(high.scale < low.scale && high.opacity < low.opacity && high.opacity > 0.1);
  assert.deepEqual(T.shadow(undefined), none);
  const trees = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 10, z: 10 }];
  assert.equal(T.treeIndex(trees, 2.6, 0.5), 1);
  assert.equal(T.treeIndex(trees, 1.2, 0), 0);
  assert.equal(T.treeIndex(trees, 6, 6), -1);
  assert.equal(T.treeIndex(null, 0, 0), -1);
});

// A tiny THREE stub: objects with position/scale/rotation/material that record what the render layer does.
function stubThree() {
  const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  return {
    CircleGeometry: function () {},
    MeshBasicMaterial: function (o) { return { ...o, clone() { return { ...this }; } }; },
    Mesh: function (g, m) { return { position: vec(), scale: vec(), rotation: {}, material: m, visible: true }; },
  };
}

test('render layer: a shadow under each perched animal, and the tree under it leans only while rustling', () => {
  const SA = loadGame(FILES);
  const sounds = [];
  SA.audio = { sfx: (n, v) => sounds.push([n, v]) };
  const bird = { visible: true, userData: { perched: true }, position: { x: 12, y: 6, z: 3 } };
  const dog = { visible: true, userData: {}, position: { x: 0, y: 0, z: 0 } };
  const added = [], node = { rotation: { x: 0, z: 0 } };
  const player = { x: 10, z: 3 };
  const tt = SA.render.createTreetopTell(stubThree(), { animals: { children: [dog, bird] }, trees: [{ x: 12.4, z: 3.1 }],
    treeNodes: [node], getPlayer: () => player, scene: { add: (m) => added.push(m) } });
  assert.equal(added.length, 1, 'only the perched animal gets a shadow');
  assert.equal(tt.entries.length, 1);
  let leaned = false;
  for (let i = 0; i < 600; i++) {
    tt.update(1 / 30);
    if (node.rotation.x !== 0 || node.rotation.z !== 0) leaned = true;
  }
  const sh = added[0];
  assert.equal(sh.position.x, 12);
  assert.equal(sh.position.z, 3);
  assert.ok(Math.abs(sh.position.y - (SA.map.groundHeight(12, 3) + 0.06)) < 1e-9, 'on the ground');
  assert.ok(sh.material.opacity > 0 && sh.visible);
  assert.ok(leaned, 'the tree rustled');
  assert.ok(sounds.length >= 1 && sounds.every(([n, v]) => n === 'chirp' && v > 0 && v <= 0.6));
  // far away: no more sound; hidden animal: shadow hidden
  sounds.length = 0; player.x = 90;
  for (let i = 0; i < 600; i++) tt.update(1 / 30);
  assert.equal(sounds.length, 0);
  bird.visible = false; tt.update(1 / 30);
  assert.equal(sh.visible, false);
});
