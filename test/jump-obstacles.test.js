import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0176: low solids (rocks) only block a player who is below their top; trees, cacti, peaks and animals always block.
const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/data/props.js', 'game/habitat.js', 'game/prop-avoid.js',
  'game/data/decor.js', 'game/player.js', 'game/jump.js', 'game/blocking.js']);
const DT = 1 / 60;
const R = SA.player.RADIUS;
const SINGLE = SA.jump.HEIGHT;   // one hop's peak lift
const DOUBLE_LIFT = 2.4;         // a double jump (AS-0126) reaches higher than one hop: stand-in lift for the test

function obstaclesFor(decor, scale) { return SA.blocking.obstacles({ decor: [{ x: 0, z: 5, decor, scale }], animals: [], props: [] }); }

/** Walks +z toward an obstacle at z = 5 for `seconds` while hopping once at `jumpAt` seconds (or never); returns the trace. */
function run(obstacles, { jumpAt = null, seconds = 3, input = { forward: true } } = {}) {
  let p = { x: 0, z: 0, heading: 0 }, hop = SA.jump.create(), t = 0;
  const trace = [];
  while (t < seconds) {
    p = SA.player.step(p, { ...input, lift: hop.lift }, DT, obstacles);
    const want = jumpAt !== null && t >= jumpAt && t < jumpAt + 0.1;
    hop = SA.jump.step(hop, { jump: want }, DT, true, SA.player.floorAt(p.x, p.z, obstacles, hop.lift));
    trace.push({ x: p.x, z: p.z, lift: hop.lift, air: hop.air });
    t += DT;
  }
  return { p, hop, trace };
}

test('decor heights come from data x placed scale; trees, cacti and peaks have none', () => {
  const B = SA.blocking;
  assert.ok(Math.abs(B.decorHeight('roca', 1.5) - 1.2) < 1e-9);
  assert.ok(B.decorHeight('rocaarena', 1) > 0);
  for (const id of ['pino', 'jungle', 'cactus', 'pinonieve', 'pico', 'flor', 'nope', undefined]) assert.equal(B.decorHeight(id, 1), 0, String(id));
  assert.equal(obstaclesFor('roca', 1).length, 1);
  assert.equal(obstaclesFor('roca', 1)[0].length, 4);
  assert.equal(obstaclesFor('pino').length, 1);
  assert.equal(obstaclesFor('pino')[0].length, 3, 'a tree has no height');
});

test('rocks at their placed scales: a normal one clears with one hop, the biggest needs more', () => {
  const small = obstaclesFor('roca', 0.8)[0], mid = obstaclesFor('roca', 1.3)[0], big = obstaclesFor('roca', 1.8)[0];
  const clearsAt = (o, lift) => lift + SA.player.CLEAR_MARGIN >= o[3];
  assert.ok(clearsAt(small, SINGLE) && clearsAt(mid, SINGLE));
  assert.ok(!clearsAt(big, SINGLE) && clearsAt(big, DOUBLE_LIFT));
  assert.ok(obstaclesFor('rocaarena', 1.8)[0][3] > SINGLE + SA.player.CLEAR_MARGIN, 'the biggest sandstone also needs more than one hop');
});

test('walking into a rock without jumping still blocks', () => {
  const o = obstaclesFor('roca', 1);
  const { p } = run(o, { seconds: 4 });
  assert.ok(p.z <= 5 - (o[0][2] + R) + 1e-6, 'stopped at the rock, z=' + p.z);
});

test('a single hop clears a normal rock and the player ends up past it, never inside', () => {
  const o = obstaclesFor('roca', 1);   // top 0.8
  const { p, hop, trace } = run(o, { jumpAt: 0.9, seconds: 5 });
  assert.ok(p.z > 5 + o[0][2] + R - 1e-6 || Math.hypot(p.x, p.z - 5) >= o[0][2] + R - 1e-6, 'past the rock: ' + p.z);
  assert.equal(hop.lift, 0);
  trace.forEach((s) => { if (s.lift < 0.7) assert.ok(Math.hypot(s.x, s.z - 5) >= o[0][2] + R - 1e-6, 'never inside while low'); });
});

test('landing on a rock stands on its top, then walking off drops back to the ground', () => {
  const o = obstaclesFor('roca', 1);
  // Hop from a spot where the apex lands over the rock, then stop pressing forward and stand there.
  let p = { x: 0, z: 5 - (o[0][2] + R) - 0.9, heading: 0 }, hop = SA.jump.create(), landedOnTop = false;
  for (let i = 0; i < 400; i++) {
    const t = i * DT, fwd = t < 0.35;
    p = SA.player.step(p, { forward: fwd, lift: hop.lift }, DT, o);
    hop = SA.jump.step(hop, { jump: t < 0.05 }, DT, true, SA.player.floorAt(p.x, p.z, o, hop.lift));
    if (hop.event === 'land' && hop.lift > 0) landedOnTop = true;
    if (!hop.air && hop.lift > 0) assert.ok(Math.hypot(p.x - o[0][0], p.z - o[0][1]) < o[0][2] + R, 'only stands on top inside the rock circle');
  }
  assert.ok(landedOnTop, 'landed on the top');
  assert.ok(Math.abs(hop.lift - 0.8) < 1e-9, 'stands at the rock top, lift ' + hop.lift);
  // Walk off the far side: falls to the ground and is not inside the rock.
  for (let i = 0; i < 240; i++) {
    p = SA.player.step(p, { forward: true, lift: hop.lift }, DT, o);
    hop = SA.jump.step(hop, {}, DT, true, SA.player.floorAt(p.x, p.z, o, hop.lift));
  }
  assert.equal(hop.lift, 0);
  assert.ok(Math.hypot(p.x - o[0][0], p.z - o[0][1]) >= o[0][2] + R - 1e-6);
});

test('landing never ends inside a rock even from a hop that comes down on it at any frame rate', () => {
  const o = obstaclesFor('roca', 1.2);   // top 0.96
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.1]) {
    for (let start = 0.2; start < 2.6; start += 0.2) {
      let p = { x: 0, z: 5 - (o[0][2] + R) - start, heading: 0 }, hop = SA.jump.create();
      for (let i = 0; i < 6 / dt; i++) {
        const t = i * dt;
        p = SA.player.step(p, { forward: t < 0.5, lift: hop.lift }, dt, o);
        hop = SA.jump.step(hop, { jump: t < dt * 1.5 }, dt, true, SA.player.floorAt(p.x, p.z, o, hop.lift));
      }
      const inside = Math.hypot(p.x - o[0][0], p.z - o[0][1]) < o[0][2] + R - 1e-6;
      assert.ok(!inside || hop.lift >= 0.96 - 1e-9, `dt ${dt} start ${start}: inside at lift ${hop.lift}`);
    }
  }
});

test('trees, cacti, peaks and animals block however high you are', () => {
  const animal = SA.data.all('animals').find((a) => SA.blocking.animalRadius(a.id) > 0);
  for (const decor of ['pino', 'cactus', 'pico', 'jungle', 'pinonieve']) {
    const o = obstaclesFor(decor, 1);
    let p = { x: 0, z: 0, heading: 0 };
    for (let i = 0; i < 90; i++) p = SA.player.step(p, { forward: true, lift: 50, run: true }, DT, o);
    assert.ok(Math.hypot(p.x, p.z - 5) >= o[0][2] + R - 1e-6, decor + ' still pushes out at lift 50');
    assert.equal(SA.player.floorAt(0, 5, o, 50), 0, decor + ' is never a floor');
  }
  const o = SA.blocking.obstacles({ decor: [], animals: [{ x: 0, z: 5, animalId: animal.id }], props: [] });
  let p = { x: 0, z: 3, heading: 0 };
  for (let i = 0; i < 90; i++) p = SA.player.step(p, { forward: true, lift: 50, run: true }, DT, o);
  assert.ok(Math.hypot(p.x, p.z - 5) >= o[0][2] + R - 1e-6, 'a big animal blocks mid-jump');
});

test('placed rock props are low solids too; ponds and trees are not', () => {
  SA.save.reset(); SA.save.update({ stars: 50 });
  const pts = SA.blocking.solidProps([{ prop: 'roca', x: 1, z: 2 }, { prop: 'arbol', x: 3, z: 4 }, { prop: 'charca', x: 5, z: 6 }]);
  assert.equal(pts[0].length, 4);
  assert.equal(pts[1].length, 3);
  assert.equal(pts[2].length, 3);
});

test('height validation: only solid items, a sane number', () => {
  assert.throws(() => SA.data.register('decor', [{ id: 'x', solid: false, height: 1 }]), /height/);
  assert.throws(() => SA.data.register('decor', [{ id: 'x', solid: true, radius: 1, height: 0 }]), /height/);
  assert.throws(() => SA.data.register('decor', [{ id: 'x', solid: true, radius: 1, height: 9 }]), /height/);
});

test('jump floor: steps up onto, stands on, and falls off a surface; no floor behaves as before', () => {
  const J = SA.jump;
  let s = J.step(J.create(), {}, DT, true, 0.5);
  assert.equal(s.lift, 0.5, 'steps up onto the surface');
  assert.equal(s.air, false);
  s = J.step(s, {}, DT, true, 0.5);
  assert.equal(s.lift, 0.5, 'stands');
  for (let i = 0; i < 60; i++) s = J.step(s, {}, DT, true, 0);
  assert.equal(s.lift, 0, 'floor gone: falls to the ground');
  assert.equal(s.air, false);
  assert.equal(J.step(J.create(), { jump: true }, DT).event, 'takeoff');
});
