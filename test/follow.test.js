import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/follow.js']);
const F = SA.follow;
const DT = 1 / 30;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Walk the player (heading +x = PI/2) `seconds` at `speed`; the follower(s) step each frame.
function walk(player, followers, solids, seconds, speed = 4, each) {
  for (let t = 0; t < seconds; t += DT) {
    player.x += Math.sin(player.heading) * speed * DT;
    player.z += Math.cos(player.heading) * speed * DT;
    Array.isArray(followers) ? F.stepAll(followers, player, solids, DT) : F.step(followers, player, solids, DT);
    if (each) each(t);
  }
}
function idle(player, followers, solids, seconds) { walk(player, followers, solids, seconds, 0); }

test('dry test field is really dry', () => {
  for (let x = -12; x <= 14; x += 1) for (const z of [8, 10, 12.5]) assert.ok(!SA.map.isWater(x, z), `water at ${x},${z}`);
});

test('follower trails 1.5-2 units behind along the trail and stops when the player stops', () => {
  const p = { x: -10, z: 10, heading: Math.PI / 2, lift: 0 };
  const f = F.create({ x: -12, z: 10 });
  walk(p, f, [], 1);                                  // settle into the walk
  let worst = 0, lo = Infinity;
  walk(p, f, [], 3, 4, () => { worst = Math.max(worst, d(f, p)); });
  assert.ok(worst < 2.6, `lagged ${worst}`);
  idle(p, f, [], 2);
  assert.ok(d(f, p) >= F.GAP_MIN - 0.05 && d(f, p) <= F.GAP_START + 0.05, `rests ${d(f, p)} away`);
  assert.equal(f.moving, false);
  const at = { x: f.x, z: f.z };
  idle(p, f, [], 1);
  assert.deepEqual({ x: f.x, z: f.z }, at, 'stays put while the player stands still');
  const want = Math.atan2(p.x - f.x, p.z - f.z);
  assert.ok(Math.abs(Math.atan2(Math.sin(f.heading - want), Math.cos(f.heading - want))) < 0.05, 'faces the player');
  assert.equal(f.pop, null);
  lo = d(f, p);
  assert.ok(lo > 0);
});

test('stopping distance never goes below the arm\'s-length floor when the player walks into it', () => {
  const p = { x: 0, z: 10, heading: 0, lift: 0 };
  const f = F.create({ x: 1.6, z: 10 });
  idle(p, f, [], 1);
  assert.ok(d(f, p) >= F.GAP_MIN - 0.01, `${d(f, p)}`);
});

test('it follows the trail around a solid and never ends inside one or in water', () => {
  const tree = [0, 10, 1.2];
  const p = { x: -6, z: 10, heading: Math.PI / 2, lift: 0 };
  const f = F.create({ x: -8, z: 10 });
  // the player walks around the tree (north side), then on east
  const route = [[-3, 12.5], [3, 12.5], [8, 10]];
  for (const [rx, rz] of route) {
    for (let i = 0; i < 400 && Math.hypot(rx - p.x, rz - p.z) > 0.2; i++) {
      p.heading = Math.atan2(rx - p.x, rz - p.z);
      p.x += Math.sin(p.heading) * 4 * DT; p.z += Math.cos(p.heading) * 4 * DT;
      F.step(f, p, [tree], DT);
      assert.ok(Math.hypot(f.x - tree[0], f.z - tree[1]) >= tree[2] + F.BODY - 0.05, `inside the tree at ${f.x},${f.z}`);
      assert.ok(!SA.map.isWater(f.x, f.z));
    }
  }
  idle(p, f, [tree], 2);
  assert.ok(d(f, p) <= F.GAP_START + 0.1);
  assert.equal(f.pop, null, 'never needed to pop');
});

test('it walks around a solid that sits straight between it and the player', () => {
  const tree = [0, 10, 1.2];
  const p = { x: 4, z: 10, heading: 0, lift: 0 };
  const f = F.create({ x: -3, z: 10 });
  let popped = false;
  for (let t = 0; t < 8; t += DT) {
    F.step(f, p, [tree], DT);
    popped = popped || !!f.pop;
    assert.ok(Math.hypot(f.x - tree[0], f.z - tree[1]) >= tree[2] + F.BODY - 0.05);
  }
  assert.ok(!popped);
  assert.ok(d(f, p) <= F.GAP_START + 0.1, `got to ${d(f, p)}`);
});

test('it never walks into water: the leader wades across the river and the follower pops to dry land', () => {
  const p = { x: -10, z: 10, heading: -Math.PI / 2, lift: 0 };   // heads west into the river
  const f = F.create({ x: -8, z: 10 });
  let popped = false;
  walk(p, f, [], 6, 4, () => {
    assert.ok(!SA.map.isWater(f.x, f.z), `follower in water at ${f.x},${f.z}`);
    popped = popped || !!f.pop;
  });
  assert.ok(popped, 'it popped instead of wading');
  if (!SA.map.isWater(p.x, p.z)) assert.ok(d(f, p) <= F.GAP_START + 0.5);
});

test('far behind (> 15 units) it pops just behind the player with a puff record', () => {
  const p = { x: 10, z: 10, heading: Math.PI / 2, lift: 0 };
  const f = F.create({ x: -10, z: 10 });
  F.step(f, p, [], DT);
  assert.ok(f.pop, 'popped');
  assert.deepEqual([f.pop.fromX, f.pop.fromZ], [-10, 10]);
  assert.ok(Math.abs(d(f, p) - F.GAP_STOP) < 0.01);
  assert.ok(f.x < p.x, 'behind the player (heading +x)');
  assert.ok(!SA.map.isWater(f.x, f.z));
  F.step(f, p, [], DT);
  assert.equal(f.pop, null, 'the pop is a one-step event');
});

test('stuck for more than 3 s it pops to just behind the player', () => {
  // the follower is boxed in by a ring of solids; the player is 6 units away
  const ring = [];
  for (let i = 0; i < 12; i++) ring.push([0 + 1.6 * Math.cos(i / 12 * 6.283), 10 + 1.6 * Math.sin(i / 12 * 6.283), 1]);
  const p = { x: 6, z: 10, heading: Math.PI / 2, lift: 0 };
  const f = F.create({ x: 0, z: 10 });
  let at = -1;
  for (let t = 0; t < 6; t += DT) {
    F.step(f, p, ring, DT);
    if (f.pop && at < 0) at = t;
  }
  assert.ok(at >= 2.9 && at < 3.5, `popped at ${at}`);
  assert.ok(d(f, p) <= F.GAP_STOP + 1.6);
  for (const s of ring) assert.ok(Math.hypot(f.x - s[0], f.z - s[1]) >= s[2] + F.BODY - 0.01);
  assert.ok(F.free(f.x, f.z, ring));
});

test('it hops when the player jumps a gap, and lands on dry ground', () => {
  const p = { x: -8, z: 10, heading: Math.PI / 2, lift: 0 };
  const f = F.create({ x: -10, z: 10 });
  walk(p, f, [], 1);
  // a 4-unit jump in 0.6 s
  let maxLift = 0;
  for (let t = 0; t < 0.6; t += DT) {
    p.x += 4 / 0.6 * DT; p.lift = 1.2 * Math.sin(Math.PI * t / 0.6);
    F.step(f, p, [], DT);
  }
  p.lift = 0;
  for (let t = 0; t < 2; t += DT) { F.step(f, p, [], DT); maxLift = Math.max(maxLift, f.lift); }
  assert.ok(maxLift > 0.5, `hopped ${maxLift}`);
  assert.equal(f.lift, 0);
  assert.ok(d(f, p) <= F.GAP_START + 0.1);
  assert.equal(f.pop, null);
});

test('two followers line up in order without overlapping, and a baby can hop with the friend behind it', () => {
  const p = { x: -10, z: 10, heading: Math.PI / 2, lift: 0 };
  const fs = [F.create({ x: -11.8, z: 10 }), F.create({ x: -13.6, z: 10 })];
  let minGap = Infinity;
  const each = () => { minGap = Math.min(minGap, d(fs[0], fs[1])); };
  walk(p, fs, [], 3, 4, each);
  idle(p, fs, [], 2);
  walk(p, fs, [], 2, 4, each);
  idle(p, fs, [], 3);
  assert.ok(minGap >= 2 * F.BODY - 0.01, `overlapped: ${minGap}`);
  assert.ok(d(fs[0], p) <= F.GAP_START + 0.1);
  assert.ok(d(fs[1], fs[0]) >= F.GAP_MIN - 0.1 && d(fs[1], fs[0]) <= F.GAP_START + 0.1, `second ${d(fs[1], fs[0])}`);
  assert.ok(d(fs[1], p) > d(fs[0], p), 'in a line: the second is farther from the player');
});

test('followers that both pop do not stack on one spot', () => {
  const p = { x: 10, z: 10, heading: Math.PI / 2, lift: 0 };
  const fs = [F.create({ x: -10, z: 10 }), F.create({ x: -10, z: 10 })];
  F.stepAll(fs, p, [], DT);
  F.stepAll(fs, p, [], DT);
  assert.ok(fs.every((f) => !SA.map.isWater(f.x, f.z)));
  assert.ok(d(fs[0], fs[1]) >= 2 * F.BODY - 0.01, `stacked ${d(fs[0], fs[1])}`);
});

test('bad input is tolerated: huge dt is clamped, missing solids, a follower inside a solid walks out', () => {
  const p = { x: 3, z: 10, heading: 0 };
  const f = F.create({ x: 0, z: 10 });
  F.step(f, p, undefined, 5);
  assert.ok(Number.isFinite(f.x) && Number.isFinite(f.z));
  const g = F.create({ x: 0, z: 10 });
  const rock = [0.2, 10, 1];
  const q = { x: 6, z: 10, heading: 0 };
  const before = Math.hypot(g.x - rock[0], g.z - rock[1]);
  for (let i = 0; i < 20; i++) F.step(g, q, [rock], DT);
  assert.ok(Math.hypot(g.x - rock[0], g.z - rock[1]) >= before, 'never goes deeper');
  assert.equal(F.create().x, 0);
});
