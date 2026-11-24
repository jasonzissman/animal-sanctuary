import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Walkable surfaces (AS-0158): two seeded river bridges whose decks the player stands ON above the water, rails that block, ends that join the ground.
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/vocab.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/jump.js', 'game/perch.js', 'game/reach.js', 'game/climb.js', 'game/forest-paths.js', 'game/forest-streams.js'];
const SA = loadGame([...BASE, 'game/surfaces.js', 'game/data/props.js', 'game/wander.js']);
const S = SA.surfaces, M = SA.map, P = SA.player;
const DT = 1 / 30;

// Walk the avatar along a deck's axis (SA.climb.step = SA.player.step + height following).
function walk(d, fromU, toU, input = {}, obstacles = S.solids()) {
  const dir = Math.sign(toU - fromU);
  const heading = Math.atan2(d.dx * dir, d.dz * dir);
  let s = { x: d.x + d.dx * fromU, z: d.z + d.dz * fromU, heading, y: P.heightAt(d.x + d.dx * fromU, d.z + d.dz * fromU), climb: null };
  const steps = [];
  for (let t = 0; t < 12 && (s.x - d.x - d.dx * toU) * d.dx * dir + (s.z - d.z - d.dz * toU) * d.dz * dir < 0; t += DT) {
    s = SA.climb.step(s, { forward: 1, ...input }, DT, obstacles);
    steps.push(s);
  }
  return { end: s, steps };
}

test('layout: two river bridges, seeded, across the river and away from the ford', () => {
  const list = S.layout();
  assert.equal(list.length, 2);
  assert.deepEqual(list, S.layout());
  assert.deepEqual(list, S.bridges());
  assert.notDeepEqual(S.layout(S.SEED + 1), list);
  assert.ok(Math.abs(list[0].z - list[1].z) >= 16, 'bridges are far apart');
  for (const d of list) {
    assert.ok(Math.abs(d.z - M.FORD.z) >= 8, `${d.id} is not at the ford`);
    assert.ok(M.isWater(d.x, d.z), `${d.id} crosses real water`);
    assert.ok(Math.abs(Math.hypot(d.dx, d.dz) - 1) < 1e-9);
    // runs across the river: the end points lie on opposite banks
    for (const s of [-1, 1]) {
      const ex = d.x + d.dx * d.halfLen * s, ez = d.z + d.dz * d.halfLen * s;
      assert.ok(!M.isWater(ex, ez) && M.groundHeight(ex, ez) >= M.WATER_LEVEL + 0.05, `${d.id} end on the bank`);
      assert.ok(!SA.station.inFootprint(ex, ez) && !P.inSpawnZone(ex, ez), `${d.id} end clear of the station and spawn`);
    }
    assert.ok(d.y > M.WATER_LEVEL + 0.8, `${d.id} deck above the water`);
  }
});

test('the standing height on the deck is the deck top, above the water (not the river bed)', () => {
  for (const d of S.bridges()) {
    assert.ok(M.groundHeight(d.x, d.z) < M.WATER_LEVEL - 1, 'the bed is well below');
    assert.ok(Math.abs(S.heightAt(d.x, d.z) - d.y) < 1e-9);
    assert.ok(Math.abs(P.heightAt(d.x, d.z) - d.y) < 1e-9);
    assert.ok(S.onDeck(d.x, d.z) && !P.inWater(d.x, d.z), 'on the deck you are not wading');
    assert.ok(P.inWater(d.x + d.dz * 6, d.z - d.dx * 6) === M.isWater(d.x + d.dz * 6, d.z - d.dx * 6), 'beside it the water is water');
  }
  assert.equal(S.heightAt(M.POND.x, M.POND.z), null);
  assert.equal(P.heightAt(M.POND.x, M.POND.z), M.groundHeight(M.POND.x, M.POND.z));
});

test('the ends join the ground smoothly: the height equals the ground at the tip and never jumps', () => {
  for (const d of S.bridges()) {
    for (const s of [-1, 1]) {
      const tip = [d.x + d.dx * (d.halfLen - 1e-6) * s, d.z + d.dz * (d.halfLen - 1e-6) * s];
      assert.ok(Math.abs(S.heightAt(...tip) - M.groundHeight(...tip)) < 1e-3, 'flush with the ground at the tip');
      assert.equal(S.heightAt(d.x + d.dx * (d.halfLen + 0.2) * s, d.z + d.dz * (d.halfLen + 0.2) * s), null);
    }
    let prev = null;
    for (let u = -d.halfLen; u <= d.halfLen; u += 0.05) {
      const h = P.heightAt(d.x + d.dx * u, d.z + d.dz * u);
      if (prev !== null) assert.ok(Math.abs(h - prev) < 0.12, `${d.id} step at u=${u.toFixed(2)}: ${prev} -> ${h}`);
      prev = h;
    }
    assert.ok(S.deckHeight(d, d.x, d.z) >= M.groundHeight(d.x, d.z), 'never below the ground');
  }
});

test('walking across: the avatar climbs the ramp, stands on the deck over the water and arrives on the far bank', () => {
  for (const d of S.bridges()) {
    const r = walk(d, -d.halfLen - 1.5, d.halfLen + 1.5);
    const mid = r.steps.filter((s) => Math.abs((s.x - d.x) * d.dx + (s.z - d.z) * d.dz) < 3);
    assert.ok(mid.length > 3);
    for (const s of mid) assert.ok(Math.abs(s.y - d.y) < 1e-6 || Math.abs(s.y - d.y) < 0.5, 'standing on the deck');
    assert.ok(Math.max(...mid.map((s) => s.y)) > M.WATER_LEVEL + 0.8, 'well above the water');
    const lateral = Math.max(...r.steps.map((s) => Math.abs(-(s.x - d.x) * d.dz + (s.z - d.z) * d.dx)));
    assert.ok(lateral < 0.1, 'stays on the centre line');
    assert.ok((r.end.x - d.x) * d.dx + (r.end.z - d.z) * d.dz > d.halfLen, 'made it across');
  }
});

test('rails block: walking sideways off the deck is stopped, the avatar never leaves the deck', () => {
  for (const d of S.bridges()) {
    const heading = Math.atan2(-d.dz, d.dx);   // facing across the deck, toward +v
    let s = { x: d.x, z: d.z, heading, y: d.y, climb: null };
    for (let t = 0; t < 4; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, S.solids());
    const v = -(s.x - d.x) * d.dz + (s.z - d.z) * d.dx;
    assert.ok(Math.abs(v) < d.halfWid - 0.1, `stopped by the rail at v=${v.toFixed(2)}`);
    assert.ok(S.onDeck(s.x, s.z) && Math.abs(s.y - d.y) < 0.05);
    // a hop does not clear a rail (rail circles carry no height)
    s = { x: d.x, z: d.z, heading, y: d.y, climb: null };
    for (let t = 0; t < 4; t += DT) s = SA.climb.step(s, { forward: 1, lift: 1.2 }, DT, S.solids());
    assert.ok(Math.abs(-(s.x - d.x) * d.dz + (s.z - d.z) * d.dx) < d.halfWid, 'a jump is blocked too');
  }
});

test('rail solids are plain [x, z, r] circles along both sides of the flat part, none on the ramps', () => {
  const d = S.bridges()[0], rails = S.railCircles(d);
  assert.ok(rails.length > 20 && rails.every((c) => c.length === 3 && c[2] > 0));
  for (const [x, z] of rails) {
    const u = (x - d.x) * d.dx + (z - d.z) * d.dz, v = -(x - d.x) * d.dz + (z - d.z) * d.dx;
    assert.ok(Math.abs(u) <= d.halfLen - d.ramp + 1e-9 && Math.abs(Math.abs(v) - (d.halfWid - d.railR)) < 1e-9);
  }
  assert.ok(S.solids().length >= 2 * rails.length);
  assert.equal(S.solids(), S.solids(), 'cached: no allocation per frame');
});

test('near / walkable: keep-out around the ends, animals use the middle lane only', () => {
  const d = S.bridges()[0];
  assert.ok(S.near(d.x, d.z) && S.near(d.x + d.dx * (d.halfLen + 1), d.z + d.dz * (d.halfLen + 1), 1.5));
  assert.ok(!S.near(d.x + d.dx * (d.halfLen + 3), d.z + d.dz * (d.halfLen + 3), 1));
  assert.ok(S.walkable(d.x, d.z, 0.9));
  assert.ok(!S.walkable(d.x - d.dz * (d.halfWid - 0.3), d.z + d.dx * (d.halfWid - 0.3), 0.9), 'not along the rail');
});

test('the puente prop uses the same support: a deck above the water, rails, no longer a blocking circle', () => {
  const prop = SA.data.get('props', 'puente');
  assert.equal(prop.solid, false);
  const rec = { id: 'p1', prop: 'puente', x: M.riverX(-10), z: -10 };
  const deck = S.propDeck(rec);
  assert.ok(deck && deck.halfLen > 1.8 && deck.halfWid > 1.2 && deck.ramp === 0);
  assert.equal(S.propDeck({ prop: 'roca', x: 0, z: 0 }), null);
  assert.equal(S.propDeck({ prop: 'puente', x: NaN, z: 0 }), null);
  assert.equal(S.heightAt(rec.x, rec.z), null, 'not placed yet');
  const before = S.solids().length;
  S.setPlaced([rec, { id: 'p2', prop: 'arbol', x: 3, z: 3 }]);
  const top = Math.max(M.groundHeight(rec.x, rec.z), M.WATER_LEVEL) + 0.27;
  assert.ok(Math.abs(S.heightAt(rec.x, rec.z) - top) < 1e-9);
  assert.ok(Math.abs(P.heightAt(rec.x, rec.z) - top) < 1e-9 && !P.inWater(rec.x, rec.z));
  assert.equal(S.decks().length, 3);
  assert.ok(S.solids().length > before && S.solids() === S.solids());
  // rails block sideways
  let s = { x: rec.x, z: rec.z, heading: 0, y: top, climb: null };   // heading 0 faces +z: across the deck
  for (let t = 0; t < 4; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, S.solids());
  assert.ok(Math.abs(s.z - rec.z) < deck.halfWid, 'stopped by the rail');
  // and walks along it
  s = { x: rec.x - 1.8, z: rec.z, heading: Math.PI / 2, y: top, climb: null };
  for (let t = 0; t < 1; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, S.solids());
  assert.ok(s.x > rec.x - 1.8 + 2, 'walks along the deck');
  S.setPlaced([]);
  assert.equal(S.heightAt(rec.x, rec.z), null);
  assert.equal(S.solids().length, before);
});

test('decor plan keeps trees off the bridge ends', () => {
  const d = S.bridges()[0];
  assert.ok(S.near(d.x + d.dx * (d.halfLen + 1.2), d.z + d.dz * (d.halfLen + 1.2), 1.6));
});
