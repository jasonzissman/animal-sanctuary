import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGame } from './helpers/vm.js';

// Fallen logs (AS-0302): seeded pure layout across the forest paths, low solids for the player (blocked, jump over, stand on top) and obstacles for animals.
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/map.js', 'game/peaks.js', 'game/save.js',
  'game/station.js', 'game/player.js', 'game/jump.js', 'game/forest-paths.js', 'game/forest-streams.js'];
const SA = loadGame([...BASE, 'game/fallen-logs.js', 'game/wander.js', 'game/decor-plan.js', 'game/ground-cover-plan.js']);
const FL = SA.fallenLogs, FP = SA.forestPaths, M = SA.map;

test('layout: a few logs, deterministic per seed, most lying across a forest path', () => {
  const list = FL.layout();
  assert.ok(list.length >= 3 && list.length <= 8, `logs: ${list.length}`);
  assert.deepEqual(list, FL.layout());
  assert.deepEqual(list, FL.logs());
  assert.notDeepEqual(FL.layout(FL.SEED + 1), list);
  const across = list.filter((l) => l.onPath);
  assert.ok(across.length >= 2, 'logs across the paths');
  assert.ok(list.some((l) => !l.onPath), 'one or two lie off the paths');
  for (const l of across) {
    assert.ok(FP.onPath(l.x, l.z, 0.1), `${l.id} centre is on a path`);
    assert.ok(l.length >= FP.WIDTH + 1, `${l.id} spans the dirt strip`);
    assert.ok(!FP.onPath(l.ax, l.az, -0.1) && !FP.onPath(l.bx, l.bz, -0.1) || l.length > FP.WIDTH, `${l.id} ends`);
  }
});

test('each log has a footprint and a standing height, on dry ground clear of the spawn, station and streams', () => {
  for (const l of FL.logs()) {
    assert.ok(l.r >= 0.3 && l.r <= 0.4 && l.h > 0.4 && l.h < 0.9, `${l.id} size ${l.r}/${l.h}`);
    assert.ok(Math.abs(Math.hypot(l.dx, l.dz) - 1) < 1e-9);
    assert.ok(Math.abs(Math.hypot(l.bx - l.ax, l.bz - l.az) - l.length) < 1e-9);
    for (const [x, z] of [[l.ax, l.az], [l.x, l.z], [l.bx, l.bz]]) {
      assert.ok(M.groundHeight(x, z) > M.WATER_LEVEL + 0.3 && !M.isWater(x, z), `${l.id} in water`);
      assert.ok(!SA.player.inSpawnZone(x, z) && !SA.station.inFootprint(x, z), `${l.id} on the spawn/station`);
      assert.ok(!SA.forestStreams.inWater(x, z, 0.5), `${l.id} in a stream`);
    }
  }
  const all = FL.logs();
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) >= 7);
});

test('solids: [x, z, r, h] circles along every trunk, ends included, no gaps', () => {
  const s = FL.solids();
  assert.equal(s, FL.solids(), 'cached');
  for (const l of FL.logs()) {
    const mine = s.filter(([x, z]) => FL.distance(x, z) === 0 && Math.hypot(x - l.x, z - l.z) <= l.length / 2 + 1e-6);
    assert.ok(mine.length >= 8, `${l.id} circles: ${mine.length}`);
    assert.ok(mine.some(([x, z]) => Math.hypot(x - l.ax, z - l.az) < 1e-6) && mine.some(([x, z]) => Math.hypot(x - l.bx, z - l.bz) < 1e-6));
    assert.ok(mine.every((o) => o[2] === l.r && o[3] === l.h));
  }
  assert.ok(FL.near(FL.logs()[0].x, FL.logs()[0].z));
  assert.ok(!FL.near(FL.logs()[0].x, FL.logs()[0].z + 40) && FL.distance(-9999, 0) === Infinity);
  const l0 = FL.logs()[0];
  assert.ok(FL.distance(l0.x - l0.dz * (l0.r + 1), l0.z + l0.dx * (l0.r + 1)) > 0.9 && FL.near(l0.x - l0.dz * (l0.r + 1), l0.z + l0.dx * (l0.r + 1), 1.1));
});

// A player standing `d` metres from the log's centre line on the side of its middle, facing across it.
function across(l, d) {
  const nx = -l.dz, nz = l.dx;   // across the log
  return { x: l.x - nx * d, z: l.z - nz * d, heading: Math.atan2(nx, nz) };
}

function walk(state, input, secs, obs) {
  for (let i = 0; i < Math.round(secs * 60); i++) state = SA.player.step(state, input, 1 / 60, obs);
  return state;
}

const sideOf = (l, p) => (p.x - l.x) * -l.dz + (p.z - l.z) * l.dx;

test('walking into a log is blocked (walking, running, any spot along it)', () => {
  const obs = FL.solids();
  for (const l of FL.logs()) {
    for (const run of [false, true]) {
      for (const along of [-0.15, 0, 0.15]) {
        const s0 = across(l, 3);
        const start = { x: s0.x + l.dx * along * l.length, z: s0.z + l.dz * along * l.length, heading: s0.heading };
        const end = walk(start, { forward: 1, run }, 1, obs);
        assert.ok(sideOf(l, end) < 0, `${l.id} (${run ? 'run' : 'walk'}, ${along}) crossed: ${sideOf(l, end)}`);
        assert.ok(FL.distance(end.x, end.z) >= 0.55, `${l.id} the walker overlaps the trunk`);
      }
    }
  }
});

test('a jump clears the log and the player can land on top, then walk along it at its height', () => {
  const obs = FL.solids();
  for (const l of FL.logs()) {
    assert.equal(SA.player.floorAt(l.x, l.z, obs, 0), 0, 'a walker is not on the log');
    // Hop over it: lift above the top (+ margin) means the obstacle is ignored.
    const lift = l.h + 0.2;
    const over = walk(across(l, 1.6), { forward: 1, lift }, 0.8, obs);
    assert.ok(sideOf(l, over) > 0.5, `${l.id} the jump did not clear: ${sideOf(l, over)}`);
    // Land on top: floorAt gives the trunk's height anywhere along it...
    for (const t of [-0.4, 0, 0.4]) assert.equal(SA.player.floorAt(l.x + l.dx * t * l.length, l.z + l.dz * t * l.length, obs, l.h), l.h);
    // ...and a player standing at that height walks along the log without being pushed off or blocked.
    const s0 = { x: l.ax + l.dx * 0.5, z: l.az + l.dz * 0.5, heading: Math.atan2(l.dx, l.dz) };
    const along = walk(s0, { forward: 1, lift: l.h }, 0.6, obs);
    assert.ok(Math.hypot(along.x - s0.x, along.z - s0.z) > 2, `${l.id} blocked while standing on top`);
    assert.ok(FL.distance(along.x, along.z) < 0.7, `${l.id} left the log`);
    assert.equal(SA.player.floorAt(along.x, along.z, obs, l.h), l.h);
  }
});

test('with SA.jump: a full hop from the ground gets over a log, a double jump too; landing on top stands at h', () => {
  const obs = FL.solids(), l = FL.logs()[0];
  let p = across(l, 1.9), j = SA.jump.create();
  const frame = (jumpKey) => {
    const floor = SA.player.floorAt(p.x, p.z, obs, j.lift);
    j = SA.jump.step(j, { jump: jumpKey }, 1 / 60, true, floor);
    p = SA.player.step(p, { forward: 1, lift: j.lift }, 1 / 60, obs);
  };
  let peak = 0;
  frame(true);
  for (let i = 0; i < 40; i++) { frame(false); peak = Math.max(peak, j.lift); }
  assert.ok(peak > l.h + 0.1, 'high enough at the top of the hop');
  for (let i = 0; i < 90; i++) frame(false);
  assert.ok(sideOf(l, p) > 0, 'carried over the log');
  // Stand on top: step up from a jump arriving over the trunk.
  const top = { x: l.x, z: l.z, heading: Math.atan2(l.dx, l.dz) };
  let q = SA.jump.create();
  q = { ...q, lift: l.h + 0.3, air: true, vy: -1, jumps: 1, armed: true };
  for (let i = 0; i < 90; i++) q = SA.jump.step(q, {}, 1 / 60, true, SA.player.floorAt(top.x, top.z, obs, q.lift));
  assert.ok(Math.abs(q.lift - l.h) < 1e-6 && !q.air, `lands on top: ${q.lift}`);
});

test('animals never walk through a log', () => {
  let moved = 0;
  for (const l of FL.logs()) {
    const home = { x: l.x - l.dz * 2.6, z: l.z + l.dx * 2.6 };
    if (!M.biomeAt(home.x) || M.biomeAt(home.x) !== 'bosque') continue;
    const w = SA.wander.create({ biome: 'bosque', movement: 'camina', home, seed: 4, radius: 6 });
    for (let i = 0; i < 6000; i++) {
      const s = w.update(1 / 30);
      assert.ok(FL.distance(s.x, s.z) > 0.3, `${l.id}: an animal stands in the log at ${s.x},${s.z}`);
      if (Math.hypot(s.x - home.x, s.z - home.z) > 1) moved++;
    }
  }
  assert.ok(moved > 100, 'the animals did wander');
});

test('scenery and animals are planned off the logs', () => {
  for (const d of SA.decorPlan.plan()) assert.ok(!FL.near(d.x, d.z, 0.4), `decor on a log at ${d.x},${d.z}`);
  for (const g of SA.groundCoverPlan.plan()) assert.ok(!FL.near(g.x, g.z), `plant on a log at ${g.x},${g.z}`);
});

test('scripts load in order and the renderer is wired in', () => {
  const html = fs.readFileSync('index.html', 'utf8'), man = fs.readFileSync('game/manifest.js', 'utf8');
  const at = (t, f) => t.indexOf(f);
  for (const t of [html, man]) {
    assert.ok(at(t, 'game/forest-streams.js') < at(t, 'game/fallen-logs.js') && at(t, 'game/fallen-logs.js') < at(t, 'game/decor-plan.js'));
    assert.ok(at(t, 'game/fallen-logs.js') < at(t, 'game/wander.js') && at(t, 'game/render/world.js') < at(t, 'game/render/fallen-logs.js'));
    assert.ok(at(t, 'game/render/fallen-logs.js') < at(t, 'game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.ok(scene.includes('createFallenLogs') && scene.includes('fallenLogs.solids()'));
  for (const f of ['wander', 'animal-plan', 'decor-plan', 'ground-cover-plan']) assert.ok(fs.readFileSync(`game/${f}.js`, 'utf8').includes('fallenLogs'), f);
});

test('with the real three.js: one merged bark mesh with end-cap colours, every trunk top h above the ground', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...BASE, 'game/fallen-logs.js', 'game/render/fallen-logs.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  const { THREE } = ctx, scene = new THREE.Scene(), r = ctx.SA.render.createFallenLogs(THREE, { scene });
  const logs = ctx.SA.fallenLogs.logs(), st = r.stats();
  assert.equal(st.logs, logs.length);
  assert.equal(r.mesh.name, 'fallen-logs');
  assert.ok(r.mesh.castShadow && scene.children.includes(r.group));
  assert.equal(r.group.children.length, 1, 'merged into one mesh');
  const p = r.mesh.geometry.attributes.position, c = r.mesh.geometry.attributes.color;
  assert.equal(c.count, p.count);
  let caps = 0;
  for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.7) caps++;
  assert.ok(caps >= logs.length * 8, `end-cap vertices: ${caps}`);
  // The highest vertex of each trunk (above its centre) is about h over the ground there.
  for (const l of logs) {
    let top = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i) - l.ax, p.getZ(i) - l.az) < 0.3) top = Math.max(top, p.getY(i));
    const rel = top - ctx.SA.map.groundHeight(l.ax, l.az);
    assert.ok(Math.abs(rel - l.h) < 0.1, `${l.id} top ${rel} vs h ${l.h}`);
  }
});
