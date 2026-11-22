import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];
const HOMES = { bosque: { x: -9, z: 14 }, selva: { x: 10, z: 0 } };

function make(SA, movement, biome, seed, extra = {}) {
  return SA.wander.create({ movement, biome, home: HOMES[biome], seed, ...extra });
}

function run(w, seconds, dt = 1 / 30) {
  const out = [];
  for (let t = 0; t < seconds; t += dt) out.push(w.update(dt));
  return out;
}

test('wander is deterministic for a seed and differs between seeds', () => {
  const SA = loadGame(FILES);
  const a = run(make(SA, 'corre', 'bosque', 5), 60).map((p) => [p.x, p.z]);
  const b = run(make(SA, 'corre', 'bosque', 5), 60).map((p) => [p.x, p.z]);
  const c = run(make(SA, 'corre', 'bosque', 6), 60).map((p) => [p.x, p.z]);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
});

test('animals stay in their biome, inside the map, near home and out of the water', () => {
  const SA = loadGame(FILES);
  const M = SA.map;
  for (const movement of Object.keys(SA.wander.STYLES)) {
    for (const biome of ['bosque', 'selva']) {
      for (let seed = 1; seed <= 4; seed++) {
        const w = make(SA, movement, biome, seed);
        for (const p of run(w, 120, 1 / 20)) {
          assert.equal(M.biomeAt(p.x), biome, `${movement}/${biome}/${seed} left its biome at x=${p.x}`);
          assert.ok(p.x > M.BOUNDS.minX && p.x < M.BOUNDS.maxX && p.z > M.BOUNDS.minZ && p.z < M.BOUNDS.maxZ);
          assert.ok(Math.hypot(p.x - HOMES[biome].x, p.z - HOMES[biome].z) <= 3.2, 'strayed from home');
          assert.ok(M.groundHeight(p.x, p.z) >= M.WATER_LEVEL, 'walked into water');
        }
      }
    }
  }
});

test('an animal near a biome border turns back instead of crossing it', () => {
  const SA = loadGame(FILES);
  const w = SA.wander.create({ movement: 'corre', biome: 'bosque', home: { x: -3, z: 14 }, seed: 3, radius: 6 });
  const pts = run(w, 200);
  for (const p of pts) assert.ok(p.x < 0, `crossed to x=${p.x}`);
  assert.ok(pts.some((p) => p.moving), 'it does wander, it is just kept in');
});

test('speed never exceeds the cap, even with big frame gaps', () => {
  const SA = loadGame(FILES);
  for (const movement of Object.keys(SA.wander.STYLES)) {
    const w = make(SA, movement, 'selva', 2);
    let prev = w.update(0);
    for (let i = 0; i < 2000; i++) {
      const dt = i % 50 === 0 ? 5 : 1 / 30;           // a stalled tab gives one huge dt
      const p = w.update(dt);
      const step = Math.hypot(p.x - prev.x, p.z - prev.z);
      assert.ok(step <= SA.wander.MAX_SPEED * Math.min(dt, 0.1) + 1e-9, `${movement} jumped ${step}`);
      prev = p;
    }
  }
});

test('movement trait sets the style: salta hops, vuela floats, camina lento is slow', () => {
  const SA = loadGame(FILES);
  const dist = (movement) => {
    const w = make(SA, movement, 'bosque', 9);
    const pts = run(w, 120);
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return { d, pts };
  };
  const hop = dist('salta').pts;
  assert.ok(Math.max(...hop.map((p) => p.lift)) > 0.3, 'salta leaves the ground');
  assert.ok(hop.some((p) => p.lift === 0), 'salta lands');
  const fly = dist('vuela').pts;
  assert.ok(fly.every((p) => p.lift > 0.8), 'vuela stays above the ground');
  assert.ok(dist('camina lento').d < dist('corre').d / 2, 'camina lento is slower than corre');
  assert.ok(dist('camina lento').pts.every((p) => p.lift === 0));
  assert.ok(dist('corre').pts.some((p) => p.moving), 'animals do move');
});

test('hold stops travel (hops finish landing), release resumes, timed hold expires', () => {
  const SA = loadGame(FILES);
  const w = make(SA, 'salta', 'bosque', 4);
  run(w, 10);
  w.hold();
  const frozen = run(w, 3);                            // lets any hop in progress land
  const at = frozen[frozen.length - 1];
  const after = run(w, 30);
  assert.ok(after.every((p) => p.x === at.x && p.z === at.z && !p.moving && p.lift === 0));
  assert.equal(w.state().held, true);
  w.release();
  assert.ok(run(w, 60).some((p) => p.moving), 'wanders again after release');
  w.hold(2);
  w.hold(0.5);                                          // a shorter hold never shortens a longer one
  const pos = w.update(0.1);
  assert.ok(run(w, 1.5).every((p) => p.x === pos.x && p.z === pos.z));
  assert.equal(w.state().held, true);
  run(w, 1);
  assert.equal(w.state().held, false);
});

test('avoid points are kept clear and a crowded animal simply stays put', () => {
  const SA = loadGame(FILES);
  const avoid = [[HOMES.bosque.x + 1.5, HOMES.bosque.z]];
  const w = make(SA, 'corre', 'bosque', 8, { avoid });
  for (const p of run(w, 120)) assert.ok(Math.hypot(p.x - avoid[0][0], p.z - avoid[0][1]) >= 1.29);
  const stuck = SA.wander.create({ movement: 'corre', biome: 'selva', home: { x: 38.5, z: 24.5 }, seed: 1 });
  for (const p of run(stuck, 20)) assert.ok(!p.moving);
});

test('idle: breathing, bursty wiggle and short blinks stay in range', () => {
  const SA = loadGame(FILES);
  let blinks = 0, wiggles = 0;
  for (let t = 0; t < 60; t += 0.02) {
    const i = SA.wander.idle(t, 1.3);
    assert.ok(i.breath > 0.97 && i.breath < 1.03);
    assert.ok(Math.abs(i.wiggle) <= 1 && i.blink >= 0 && i.blink <= 1);
    if (i.blink > 0.5) blinks++;
    if (Math.abs(i.wiggle) > 0.3) wiggles++;
  }
  assert.ok(blinks > 0 && blinks < 200, 'blinks are brief');
  assert.ok(wiggles > 0, 'ears and tails wiggle sometimes');
  assert.equal(SA.wander.idle(0).blink, 0);
});

// ---- renderer glue, with plain objects instead of THREE ----

function fakeGroup(SA) {
  const spots = SA.animalPlan.placements(SA.data.all('animals'), {});
  const mesh = (animalId, part, extra = {}) => ({
    userData: { animalId, part, ...extra }, rotation: { x: 0, y: 0, z: 0.1 }, scale: { x: 1, y: 1, z: 1 },
  });
  const children = SA.data.all('animals').map((a) => {
    const s = spots[a.id];
    return {
      name: a.id, userData: { animalId: a.id }, position: { x: s.x, y: s.y, z: s.z }, rotation: { y: 0 },
      scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      children: [mesh(a.id, 'orejas', { side: 'left' }), mesh(a.id, 'orejas', { side: 'right' }), mesh(a.id, 'cola'),
        mesh(a.id, 'ojos'), { ...mesh(a.id, 'ojos'), userData: { animalId: a.id, part: 'ojos', pick: true } }],
    };
  });
  return { children };
}

test('ambient moves animals by trait, animates idles, and holds an inspected animal', () => {
  const SA = loadGame(FILES);
  const picks = [];
  SA.picking = { onPick: (cb) => picks.push(cb) };
  const animals = fakeGroup(SA);
  const start = Object.fromEntries(animals.children.map((g) => [g.name, { x: g.position.x, z: g.position.z }]));
  const amb = SA.render.createAmbient({ animals, avoid: [] });
  for (let i = 0; i < 600; i++) amb.update(1 / 30);
  const moved = animals.children.filter((g) => g.position.x !== start[g.name].x || g.position.z !== start[g.name].z);
  assert.ok(moved.length >= 4, 'most animals wander');
  const conejo = animals.children.find((g) => g.name === 'conejo');
  const ojos = conejo.children[3], pickEyes = conejo.children[4];
  assert.equal(pickEyes.scale.y, 1, 'pick volumes are never animated');
  assert.ok(conejo.scale.y > 0.97 && conejo.scale.y < 1.03);
  let blinked = false, wiggled = false;
  for (let i = 0; i < 600; i++) {
    amb.update(1 / 30);
    if (ojos.scale.y < 0.5) blinked = true;
    if (Math.abs(conejo.children[0].rotation.z - 0.1) > 0.05) wiggled = true;
  }
  assert.ok(blinked && wiggled);
  const tucan = animals.children.find((g) => g.name === 'tucan');
  assert.ok(tucan.position.y > SA.map.groundHeight(tucan.position.x, tucan.position.z) + 0.8, 'tucan floats');

  // tapping a part holds that animal; a care task holds it until released
  assert.equal(picks.length, 1);
  picks[0]({ animalId: 'conejo', part: 'orejas' });
  for (let i = 0; i < 60; i++) amb.update(1 / 30);       // let any hop land
  const rest = { x: conejo.position.x, z: conejo.position.z };
  for (let i = 0; i < 90; i++) amb.update(1 / 30);
  assert.deepEqual({ x: conejo.position.x, z: conejo.position.z }, rest);
  amb.hold('rana');
  const rana = animals.children.find((g) => g.name === 'rana');
  for (let i = 0; i < 60; i++) amb.update(1 / 30);
  const rr = { x: rana.position.x, z: rana.position.z };
  for (let i = 0; i < 600; i++) amb.update(1 / 30);
  assert.deepEqual({ x: rana.position.x, z: rana.position.z }, rr);
  amb.release('rana');
  amb.hold('nope');
  for (let i = 0; i < 900; i++) amb.update(1 / 30);
  assert.ok(rana.position.x !== rr.x || rana.position.z !== rr.z, 'wanders again once released');
});
