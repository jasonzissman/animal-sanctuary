import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/picking.js', 'game/data/props.js', 'game/habitat.js',
  'game/prop-avoid.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];
const HOME = { x: -9, z: 14 };   // bosque

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  SA.save.update({ stars: 50 });
  return SA;
}

function run(w, seconds, dt = 1 / 30) {
  const out = [];
  for (let t = 0; t < seconds; t += dt) out.push(w.update(dt));
  return out;
}

test('props data carries a positive keep-clear radius, and validation rejects a bad one', () => {
  const SA = setup();
  for (const p of SA.data.all('props')) assert.ok(p.radius > 0 && p.radius <= 6, p.id);
  const good = SA.data.get('props', 'roca');
  for (const radius of [0, -1, NaN, '2', undefined, 7]) {
    assert.throws(() => SA.data.register('props', [{ ...good, id: 'zz', radius }]), /radius/);
  }
});

test('points(): one [x, z, radius] per valid record, radius from prop data, junk skipped', () => {
  const SA = setup();
  const pts = SA.propAvoid.points([
    { id: 'p1', prop: 'arbol', x: 2, z: -4 },
    { id: 'p2', prop: 'charca', x: -6, z: 8 },
    { id: 'p3', prop: 'nope', x: 0, z: 0 },
    { id: 'p4', prop: 'roca', x: NaN, z: 0 },
    { id: 'p5', prop: 'roca', x: 'a', z: 0 },
    null,
    { id: 'p6' },
  ]);
  assert.equal(JSON.stringify(pts), JSON.stringify([[2, -4, SA.data.get('props', 'arbol').radius], [-6, 8, SA.data.get('props', 'charca').radius]]));
  assert.equal(SA.propAvoid.points(undefined).length, 0);
  assert.equal(SA.propAvoid.points([]).length, 0);
});

test('points() follows placed and removed props in the save (restored props are included)', () => {
  const SA = setup();
  const res = SA.habitat.place('arbol', HOME.x + 4, HOME.z);
  assert.equal(res.status, 'placed');
  let pts = SA.propAvoid.points(SA.habitat.list());
  assert.equal(pts.length, 1);
  assert.equal(JSON.stringify(pts[0]), JSON.stringify([res.prop.x, res.prop.z, SA.data.get('props', 'arbol').radius]));
  SA.habitat.remove(res.prop.id);
  assert.equal(SA.propAvoid.points(SA.habitat.list()).length, 0);
});

test('wander keeps clear of an avoid point by its own radius', () => {
  const SA = setup();
  const avoid = [[HOME.x + 3, HOME.z, 2.4]];
  let near = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const make = (extra) => SA.wander.create({ movement: 'corre', biome: 'bosque', home: HOME, seed, ...extra });
    near += run(make({}), 120).filter((p) => Math.hypot(p.x - avoid[0][0], p.z - avoid[0][1]) < 2.4).length;
    for (const p of run(make({ avoid }), 120)) assert.ok(Math.hypot(p.x - avoid[0][0], p.z - avoid[0][1]) >= 2.4 - 1e-9);
  }
  assert.ok(near > 0, 'without the avoid point they do walk through that spot');
});

test('setAvoid takes effect immediately, and an animal a prop lands on walks out of it', () => {
  const SA = setup();
  const w = SA.wander.create({ movement: 'corre', biome: 'bosque', home: HOME, seed: 3 });
  run(w, 5);
  const here = w.state();
  const zone = [[here.x + 0.3, here.z, 2.4]];
  w.setAvoid(zone);
  const pts = run(w, 120);
  const d = (p) => Math.hypot(p.x - zone[0][0], p.z - zone[0][1]);
  assert.ok(pts.some((p) => d(p) >= 2.4), 'it leaves the new prop');
  const out = pts.findIndex((p) => d(p) >= 2.4);
  for (const p of pts.slice(out)) assert.ok(d(p) >= 2.4 - 1e-9, 'and never walks back in');
  w.setAvoid(null);   // removing the prop clears the zone again
  assert.ok(run(w, 60).length > 0);
});

test('ambient.setAvoid hands the points to every wanderer', () => {
  const SA = setup();
  SA.picking = { onPick() {} };
  const a = SA.data.all('animals').find((x) => x.biome === 'bosque');
  const spot = SA.animalPlan.placements(SA.data.all('animals'), {})[a.id];
  const g = {
    name: a.id, userData: { animalId: a.id }, position: { x: spot.x, y: spot.y, z: spot.z }, rotation: { y: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, children: [],
  };
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  const zone = [spot.x + 3, spot.z, 2.4];
  amb.setAvoid(SA.propAvoid.points([]).concat([zone]));
  let moved = false;
  for (let i = 0; i < 3000; i++) {
    amb.update(1 / 30);
    moved = moved || Math.hypot(g.position.x - spot.x, g.position.z - spot.z) > 0.5;
    assert.ok(Math.hypot(g.position.x - zone[0], g.position.z - zone[1]) >= 2.4 - 1e-9, 'stays out of the prop');
  }
  assert.ok(moved, 'the animal still wanders');
});
