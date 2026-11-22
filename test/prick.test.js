import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0156: touching a cactus bounces the player ~1.5 units straight back over ~0.25 s, with one ouch per 2 s.
const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/data/props.js', 'game/habitat.js', 'game/prop-avoid.js',
  'game/data/decor.js', 'game/player.js', 'game/prick.js', 'game/blocking.js']);
const R = SA.player.RADIUS;
const CACTUS = [0, 5, 0.8];
const TOUCH = CACTUS[2] + R;   // where a walking step leaves a player pressed against the cactus
const DT = 1 / 60;

function run(state, pos, cacti, solids, seconds) {
  let last = state, n = Math.round(seconds / DT), trail = [];
  for (let i = 0; i < n; i++) { last = SA.prick.step(last, pos, cacti, solids, DT); trail.push(last); }
  return { last, trail };
}
// The caller's loop for one bounce: while a prick is active the player is where it says; then they stay at the end spot.
function bounce(pos, cacti, solids, seconds = 0.4) {
  let s = SA.prick.step(SA.prick.create(), pos, cacti, solids, DT), at = pos;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (s.active) at = { x: s.x, z: s.z };
    s = SA.prick.step(s, at, [], solids, DT);   // no cactus in reach once knocked back: just let the state play out
  }
  return { x: s.tx, z: s.tz, last: s };
}

test('running into a cactus knocks the player ~1.5 units straight back over ~0.25 s', () => {
  const pos = { x: 0, z: 5 - TOUCH };   // south of the cactus, pressed against it
  let s = SA.prick.step(SA.prick.create(), pos, [CACTUS], [CACTUS], DT);
  assert.equal(s.hit, true);
  assert.equal(s.active, true);
  const early = run(s, pos, [CACTUS], [CACTUS], SA.prick.DURATION - 0.05);
  assert.equal(early.last.active, true, 'still bouncing just before 0.25 s');
  const { last } = run(s, { x: 9, z: 9 }, [CACTUS], [CACTUS], SA.prick.DURATION + 0.05);
  assert.equal(last.active, false, 'control returns after ~0.25 s');
  assert.ok(Math.abs(last.x - pos.x) < 1e-6);
  assert.ok(Math.abs(Math.hypot(last.x - pos.x, last.z - pos.z) - SA.prick.DISTANCE) < 0.02, 'about 1.5 units');
  assert.ok(last.z < pos.z, 'pushed away from the cactus');
});

test('the knockback is eased (fast first), hops a little and flashes then fades', () => {
  const pos = { x: 0, z: 5 - TOUCH };
  const first = SA.prick.step(SA.prick.create(), pos, [CACTUS], [CACTUS], DT);
  const mid = SA.prick.step(first, pos, [CACTUS], [CACTUS], 0.1);
  const moved = (s) => Math.hypot(s.x - pos.x, s.z - pos.z);
  assert.ok(moved(mid) > SA.prick.DISTANCE * 0.5, 'more than half way after 40% of the time');
  assert.ok(mid.lift > 0 && mid.lift <= SA.prick.HOP + 1e-9);
  assert.ok(mid.hurt > 0.5);
  const end = run(mid, { x: 9, z: 9 }, [CACTUS], [CACTUS], 1).last;
  assert.equal(end.hurt, 0);
  assert.equal(end.lift, 0);
});

test('it works from any side and from dead centre', () => {
  [[TOUCH, 5], [0, 5 + TOUCH], [-TOUCH, 5], [0.01, 5]].forEach(([x, z]) => {
    const pos = { x, z };
    const s = SA.prick.step(SA.prick.create(), pos, [CACTUS], [CACTUS], DT);
    assert.equal(s.hit, true);
    const end = bounce(pos, [CACTUS], [CACTUS]);
    assert.ok(Math.hypot(end.x - CACTUS[0], end.z - CACTUS[1]) > Math.hypot(x - CACTUS[0], z - CACTUS[1]), 'farther from the cactus');
  });
});

test('not touching = nothing happens', () => {
  const s = SA.prick.step(SA.prick.create(), { x: 0, z: 5 - TOUCH - 0.5 }, [CACTUS], [CACTUS], DT);
  assert.deepEqual([s.hit, s.active, s.ouch], [false, false, false]);
});

test('the knockback never ends inside another solid (it is shortened)', () => {
  const rock = [0, 5 - TOUCH - 2.0, 1];   // behind the player: only ~0.4 of the 1.5 knockback is free
  const pos = { x: 0, z: 5 - TOUCH };
  const solids = [CACTUS, rock];
  const end = bounce(pos, [CACTUS], solids);
  solids.forEach((o) => assert.ok(Math.hypot(end.x - o[0], end.z - o[1]) >= o[2] + R - 0.06, 'clear of ' + o));
  assert.ok(Math.hypot(end.x - pos.x, end.z - pos.z) < SA.prick.DISTANCE);
});

test('no solid is crossed on the way: a thin gap is not tunnelled through', () => {
  const pos = { x: 0, z: 5 - TOUCH };
  const wall = [0, pos.z - 0.9, 0.3];   // a post behind the player
  const solids = [CACTUS, wall];
  const { trail } = run(SA.prick.step(SA.prick.create(), pos, [CACTUS], solids, DT), pos, [CACTUS], solids, 0.4);
  trail.filter((t) => t.active).forEach((t) => assert.ok(Math.hypot(t.x - wall[0], t.z - wall[1]) >= wall[2] + R - 0.06));
});

test('the knockback never leaves the map', () => {
  const B = SA.map.BOUNDS;
  const cactus = [0, B.minZ + 1.2, 0.8];
  const pos = { x: 0, z: B.minZ + 0.6 };   // squeezed between the cactus and the map edge: knocked back toward the edge
  const end = run(SA.prick.step(SA.prick.create(), pos, [cactus], [cactus], DT), pos, [cactus], [cactus], 0.6).last;
  assert.ok(end.z >= B.minZ + 0.5 - 1e-6, 'inside the bounds');
  const east = [B.maxX - 1.5, 0, 0.8];
  const p2 = { x: B.maxX - 0.8, z: 0 };
  const e2 = run(SA.prick.step(SA.prick.create(), p2, [east], [east], DT), p2, [east], [east], 0.6).last;
  assert.ok(e2.x <= B.maxX - 0.5 + 1e-6);
});

test('ouch (SFX + phrase) fires at most once per 2 s, but the bounce always happens', () => {
  const pos = { x: 0, z: 5 - TOUCH };
  let s = SA.prick.create(), ouches = 0, hits = 0;
  for (let i = 0; i < Math.round(1.9 / DT); i++) {   // keep walking back into it for just under 2 s
    s = SA.prick.step(s, s.active ? { x: s.x, z: s.z } : pos, [CACTUS], [CACTUS], DT);
    if (s.ouch) ouches++;
    if (s.hit) hits++;
  }
  assert.equal(ouches, 1);
  assert.ok(hits >= 2, 'bounced again after control returned');
  s = SA.prick.step(s, { x: 9, z: 9 }, [CACTUS], [CACTUS], 0.1);
  for (let i = 0; i < 60; i++) s = SA.prick.step(s, { x: 9, z: 9 }, [CACTUS], [CACTUS], 0.1);   // wait it out
  s = SA.prick.step(s, pos, [CACTUS], [CACTUS], DT);
  assert.equal(s.ouch, true, 'after the gap it speaks again');
});

test('the input state is never mutated and bad input is safe', () => {
  const idle = SA.prick.create(), copy = JSON.stringify(idle);
  SA.prick.step(idle, { x: 0, z: 5 - TOUCH }, [CACTUS], [CACTUS], DT);
  assert.equal(JSON.stringify(idle), copy);
  assert.doesNotThrow(() => SA.prick.step(null, null, null, null, NaN));
  assert.doesNotThrow(() => SA.prick.step(undefined, { x: 0, z: 0 }, [null, [1, 1, 0]], [null], 0.01));
});

test('only cacti are prickly: rocks, trunks and peaks still just block', () => {
  const decor = ['cactus', 'roca', 'pino', 'pico', 'rocaarena', 'flor'].map((id, i) => ({ x: i * 10, z: 0, decor: id }));
  assert.equal(JSON.stringify(SA.blocking.pricklies(decor)), '[[0,0,0.8]]');
  assert.equal(SA.blocking.pricklies(null).length, 0);
  assert.equal(SA.data.get('decor', 'cactus').prick, true);
  ['roca', 'pino', 'pico'].forEach((id) => assert.equal(SA.data.get('decor', id).prick, undefined, id));
  assert.throws(() => SA.data.register('decor', [{ id: 'softy', solid: false, prick: true }]), /prick/);
  assert.throws(() => SA.data.register('decor', [{ id: 'weird', solid: true, radius: 1, prick: false }]), /prick/);
  // a walking step into a rock leaves the player pressed against it and SA.prick does nothing
  const rock = [0, 5, 1];
  const pos = SA.player.step({ x: 0, z: 2, heading: 0 }, { forward: 1, run: true }, 0.1, [rock]);
  assert.equal(SA.prick.step(SA.prick.create(), pos, SA.blocking.pricklies([{ x: 0, z: 5, decor: 'roca' }]), [rock], DT).hit, false);
});

test('walking into a real cactus with SA.player.step triggers the prick', () => {
  let p = { x: 0, z: 0, heading: 0 }, s = SA.prick.create(), hit = false;
  for (let i = 0; i < 120 && !hit; i++) {
    p = SA.player.step(p, { forward: 1, run: true }, DT, [CACTUS]);
    s = SA.prick.step(s, p, [CACTUS], [CACTUS], DT);
    hit = s.hit;
  }
  assert.equal(hit, true);
  assert.equal(SA.prick.OUCH_KEY, 'phrase:ay');
});
