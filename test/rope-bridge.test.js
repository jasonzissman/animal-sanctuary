// AS-0159: the montaña's rope bridge between two peaks: a walkable deck (height test), rails that block, a visual-only sway, a soft creak, and a trail route to both ends.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/vocab.js', 'game/mountain-trail.js', 'game/map.js',
  'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/jump.js', 'game/perch.js', 'game/reach.js', 'game/climb.js', 'game/surfaces.js', 'game/rope-bridge.js',
  'game/rocks.js', 'game/mountain-plan.js'];
const SA = loadGame(BASE);
const S = SA.surfaces, M = SA.map, P = SA.player, RB = SA.ropeBridge;
const D = RB.get();
const DT = 1 / 30;
const local = (x, z) => ({ u: (x - D.x) * D.dx + (z - D.z) * D.dz, v: -(x - D.x) * D.dz + (z - D.z) * D.dx });
const at = (u, v = 0) => [D.x + D.dx * u - D.dz * v, D.z + D.dz * u + D.dx * v];
const half = D.halfLen - 0.9;

test('the bridge joins the two northern peaks at their summit heights and is registered as a deck', () => {
  assert.ok(D && D.rope && D.id === 'puente-cuerda');
  const [a, b] = RB.ends();
  assert.deepEqual([a.peak, b.peak], ['pico-n1', 'pico-n2']);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 2 * half) < 1e-9);
  assert.ok(Math.abs(Math.hypot(D.dx, D.dz) - 1) < 1e-9);
  for (const e of [a, b]) {
    assert.ok(Math.abs(S.heightAt(e.x, e.z) - e.y) < 1e-9, 'the planks start level with the summit ' + e.peak);
    assert.ok(Math.abs(M.groundHeight(e.x, e.z) - e.y) < 1e-9);
  }
  assert.ok(S.onDeck(...at(0)) && !S.onDeck(...at(0, D.halfWid + 0.3)) && !S.onDeck(...at(D.halfLen + 0.3)));
  assert.ok(S.near(...at(0, D.halfWid + 0.5), 1) && !S.near(...at(0, D.halfWid + 3), 1), 'trees, plants and animals keep off it');
  assert.ok(!S.walkable(...at(0)), 'animals do not path onto the rope bridge');
  assert.ok(RB.near(...at(0)) && !RB.near(...at(0, 20)));
  assert.equal(S.decks().includes(D), false, 'a fixed deck is not in decks()');
});

test('height test: walking end to end the player stands exactly on the planks, high above the ground', () => {
  const [a, b] = RB.ends();
  const rise = (b.y - a.y) / (2 * half - 3.2);
  let worst = 0, minAbove = Infinity;
  for (let u = -D.halfLen; u <= D.halfLen; u += 0.25) {
    const [x, z] = at(u), h = S.heightAt(x, z);
    assert.ok(h !== null, 'a plank at u=' + u);
    assert.ok(Math.abs(P.heightAt(x, z, h) - h) < 1e-9, 'the player stands on it');
    assert.ok(Math.abs(h - S.topAt(D, u)) < 1e-9);
    const next = S.heightAt(...at(u + 0.25));
    if (next !== null) worst = Math.max(worst, Math.abs(next - h));
    if (Math.abs(u) < half - 3) minAbove = Math.min(minAbove, h - M.groundHeight(x, z));
  }
  assert.ok(worst <= Math.abs(rise) * 0.25 + 1e-9, 'no steps: ' + worst);
  assert.ok(Math.abs(rise) < 0.2, 'gentle rise ' + rise);
  assert.ok(minAbove > 1, 'it spans the gap, ' + minAbove.toFixed(2) + ' m above the ground');
  // an actual walk
  const rails = S.ropeSolidsAt(...at(0));
  assert.ok(rails && rails.length > 20);
  let s = { x: a.x, z: a.z, heading: Math.atan2(D.dx, D.dz), y: a.y, climb: null }, sawMiddle = false;
  for (let t = 0; t < 12 && local(s.x, s.z).u < half + 0.5; t += DT) {
    s = SA.climb.step(s, { forward: 1 }, DT, S.ropeSolidsAt(s.x, s.z, s.y) || []);
    const l = local(s.x, s.z), h = S.heightAt(s.x, s.z, s.y);
    assert.ok(Math.abs(l.v) < D.halfWid, 'stays on the planks');
    if (h !== null && Math.abs(l.u) < half) assert.ok(Math.abs(s.y - h) < 0.35, `follows the deck at u=${l.u.toFixed(1)} (${s.y.toFixed(2)} vs ${h.toFixed(2)})`);
    if (Math.abs(l.u) < 1) sawMiddle = true;
  }
  assert.ok(sawMiddle && local(s.x, s.z).u > half, 'crossed to the far summit: u=' + local(s.x, s.z).u);
  assert.ok(Math.abs(s.y - b.y) < 0.35, 'and ends level with it');
  // and back the other way
  s = { x: b.x, z: b.z, heading: Math.atan2(-D.dx, -D.dz), y: b.y, climb: null };
  for (let t = 0; t < 12 && local(s.x, s.z).u > -half - 0.5; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, S.ropeSolidsAt(s.x, s.z, s.y) || []);
  assert.ok(local(s.x, s.z).u < -half, 'walkable both ways');
});

test('the ground under the bridge stays ground: walking beneath it neither lifts you onto the planks nor swaps in the rails', () => {
  const [a, b] = RB.ends();
  let checked = 0;
  for (let u = -half + 3; u <= half - 3; u += 1) {   // over the gap, where the planks hang well above the ground
    const [x, z] = at(u), g = M.groundHeight(x, z), h = S.heightAt(x, z);
    if (h - g <= S.ROPE_REACH + 0.2) continue;
    checked++;
    assert.equal(S.heightAt(x, z, g), null, 'the planks do not count for feet on the ground');
    assert.equal(S.ropeSolidsAt(x, z, g), null, 'no rails block the ground below');
    assert.equal(P.heightAt(x, z, g), g, 'the player stays at ground level');
    assert.equal(P.heightAt(x, z), g, 'and so do animals (no y given)');
    assert.ok(!S.onDeck(x, z, g) && S.heightAt(x, z, h) === h && S.onDeck(x, z, h - 0.5));
  }
  assert.ok(checked >= 5, 'enough of the span hangs high: ' + checked);
  // an actual walk across the ground under the bridge's middle, sideways to it: the height follows the terrain and nothing stops the walk
  const [mx, mz] = at(0, -6), obs = SA.mountainPlan.solids();
  let s = { x: mx, z: mz, heading: Math.atan2(-D.dz, D.dx), y: M.groundHeight(mx, mz), climb: null }, crossed = false;
  assert.ok(S.heightAt(...at(0)) - M.groundHeight(...at(0)) > S.ROPE_REACH, 'the middle hangs high');
  for (let t = 0; t < 4 && !crossed; t += DT) {
    const prev = s;
    s = S.confine(prev, SA.climb.step(s, { forward: 1 }, DT, S.ropeSolidsAt(s.x, s.z, s.y) || obs));
    const l = local(s.x, s.z), g = M.groundHeight(s.x, s.z);
    assert.ok(Math.abs(s.y - g) < 0.6, `at ground level under the bridge: ${s.y.toFixed(2)} vs ${g.toFixed(2)}`);
    if (l.v > 0) crossed = true;
  }
  assert.ok(crossed, 'walked right under the span and out the other side (not held by the rails)');
  assert.ok(a.y > 0 && b.y > 0);
});

test('the ropes block: pushing sideways (running, hopping) never gets off the planks', () => {
  for (const u of [-half + 3.5, -2, 0, 2, half - 3.5]) {   // over the gap (a summit end is level ground you may step off)
    for (const side of [-1, 1]) {
      for (const input of [{ forward: 1 }, { forward: 1, run: true }, { forward: 1, lift: 1.2 }]) {
        let s = { x: at(u)[0], z: at(u)[1], heading: Math.atan2(-D.dz * side, D.dx * side), y: S.heightAt(...at(u)), climb: null };
        for (let t = 0; t < 4; t += DT) {
          const prev = s;
          s = S.confine(prev, SA.climb.step(s, input, DT, S.ropeSolidsAt(s.x, s.z, s.y) || []));   // the camera rig does the same after every step
          // (a run into the rope can slide along it; it only ever leaves by the far end, which is the level summit)
          assert.ok(Math.abs(local(s.x, s.z).u) > D.halfLen || Math.abs(local(s.x, s.z).v) < D.halfWid, `fell off at u=${u} side ${side} ${JSON.stringify(input)} v=${local(s.x, s.z).v} t=${t}`);
        }
        assert.ok(Math.abs(local(s.x, s.z).v) > D.halfWid - 1.2, 'it did walk up to the rope');
      }
    }
  }
  assert.equal(S.ropeSolidsAt(...at(0, 6)), null, 'off the bridge nothing changes');
  assert.ok(!S.solids().some((c) => Math.hypot(c[0] - at(0, D.halfWid - D.railR)[0], c[1] - at(0, D.halfWid - D.railR)[1]) < 0.2), 'no invisible wall on the ground below');
});

test('confine: a step that would end beside the rope bridge is clamped inside the rails; ends and other places are untouched', () => {
  const [mx, mz] = at(0), py = S.heightAt(mx, mz), prev = { x: mx, z: mz, heading: 1, y: py, climb: null, extra: 7 };
  const out = S.confine(prev, { x: at(0, 3)[0], z: at(0, 3)[1], heading: 1, y: py, climb: null, extra: 7 });
  assert.ok(Math.abs(local(out.x, out.z).v) < D.halfWid - D.railR && Math.abs(local(out.x, out.z).u) < 1e-9 && out.extra === 7, 'back inside, same place along the deck');
  const same = { x: at(1, 0.4)[0], z: at(1, 0.4)[1], heading: 1, y: py, climb: null };
  assert.equal(S.confine(prev, same), same);
  const end = { x: at(D.halfLen + 1, 0)[0], z: at(D.halfLen + 1, 0)[1], heading: 1, y: py, climb: null };
  const below = { ...prev, y: M.groundHeight(mx, mz) };   // standing on the ground under the middle: no rails for you
  assert.equal(S.confine(below, { ...below, x: at(0, 3)[0], z: at(0, 3)[1] }).x, at(0, 3)[0], 'ground under the planks is not confined');
  assert.equal(S.confine(prev, end), end, 'walking off the end onto the summit is free');
  const ground = { x: at(0, 5)[0], z: at(0, 5)[1], heading: 1, y: 5, climb: null };
  assert.equal(S.confine({ x: ground.x, z: ground.z, y: 5 }, { ...ground, x: ground.x + 1 }).x, ground.x + 1, 'someone on the ground below is not confined');
  const climbing = { ...ground, climb: { mode: 'up' } };
  assert.equal(S.confine(prev, climbing), climbing);
  assert.equal(S.confine(null, same), same);
});

test('the visual sway is tiny, bounded and never touches the walking surface', () => {
  const before = [-6, 0, 6].map((u) => S.heightAt(...at(u)));
  let maxRoll = 0, maxLift = 0;
  for (let t = 0; t < 60; t += 0.1) for (const w of [0, 1]) {
    const sw = RB.sway(t, w);
    maxRoll = Math.max(maxRoll, Math.abs(sw.roll)); maxLift = Math.max(maxLift, Math.abs(sw.lift));
  }
  assert.ok(maxRoll > 0.005 && maxRoll < 0.05 && maxLift > 0.005 && maxLift < 0.06, `${maxRoll} ${maxLift}`);
  assert.ok(Math.abs(RB.sway(3, 1).roll) !== Math.abs(RB.sway(3, 0).roll) || RB.sway(3, 1).lift !== RB.sway(3, 0).lift, 'a bit more with someone on it');
  assert.deepEqual([-6, 0, 6].map((u) => S.heightAt(...at(u))), before);
});

test('it creaks softly while walking on the planks, rate-limited, silent otherwise', () => {
  let st = RB.create(), n = 0, rates = new Set();
  for (let t = 0; t < 10; t += DT) {
    const r = RB.creak(st, { onDeck: true, moving: true }, DT);
    st = r.state;
    if (r.event) { n++; rates.add(r.event.rate); assert.equal(r.event.sfx, 'creak'); assert.ok(r.event.volume > 0 && r.event.volume <= 0.6); }
  }
  assert.ok(n >= 9 && n <= 12, 'about one per ' + RB.CREAK_GAP + ' s: ' + n);
  assert.ok(rates.size > 1, 'pitch varies');
  for (const input of [{ onDeck: false, moving: true }, { onDeck: true, moving: false }, null]) {
    st = RB.create();
    for (let t = 0; t < 3; t += DT) { const r = RB.creak(st, input, DT); st = r.state; assert.equal(r.event, null); }
  }
  assert.equal(RB.creak(RB.create(), { onDeck: true, moving: false }, 1).event, null);
  assert.ok(RB.creak(undefined, { onDeck: true, moving: true }, 0.05).event, 'the first step on creaks at once');
  const A = loadGame(['game/sa.js', 'game/audio.js']);
  assert.ok(A.audio.RECIPES.creak.length >= 2 && A.audio.RECIPES.creak.every((v) => v.g <= 0.12), 'a soft recipe exists');
});

test('both ends are reachable on foot from the trail: a walkable route to each peak foot, then up the climb and across', () => {
  const T = SA.mountainTrail, solids = M && SA.mountainPlan.solids(), R = 0.6, CELL = 0.5;
  const peaks = RB.ends().map((e) => SA.peaks.LIST.find((p) => p.id === e.peak));
  const range = M.biomeRange('montana'), x0 = range.lo + 1, z0 = M.BOUNDS.minZ + 1, nx = Math.ceil((range.hi - x0) / CELL), nz = Math.ceil((M.BOUNDS.maxZ - 1 - z0) / CELL);
  const circles = [...solids.map(([x, z, r]) => [x, z, r + R]), ...SA.peaks.LIST.map((p) => [p.x, p.z, SA.peaks.SOLID_R + R])];
  const free = (x, z) => !circles.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);
  const start = [Math.round((T.END[0] - x0) / CELL), Math.round((T.END[1] - z0) / CELL)];
  const seen = new Uint8Array(nx * nz), queue = [start];
  seen[start[1] * nx + start[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const [cx, cz] = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || seen[iz * nx + ix]) continue;
      const x = x0 + ix * CELL, z = z0 + iz * CELL;
      if (!free(x, z) || M.isWater(x, z)) continue;
      seen[iz * nx + ix] = 1; queue.push([ix, iz]);
    }
  }
  for (const p of peaks) {
    let found = false;
    for (let a = 0; a < 24 && !found; a++) {
      const x = p.x + Math.cos(a * Math.PI / 12) * (SA.peaks.SOLID_R + R + 0.3), z = p.z + Math.sin(a * Math.PI / 12) * (SA.peaks.SOLID_R + R + 0.3);
      const ix = Math.round((x - x0) / CELL), iz = Math.round((z - z0) / CELL);
      if (ix >= 0 && iz >= 0 && ix < nx && iz < nz && seen[iz * nx + ix]) found = true;
    }
    assert.ok(found, `the trail's end connects on foot to the foot of ${p.id}`);
  }
  // From the foot of the first peak: climb it, then walk off the summit straight onto the planks and over to the other peak.
  const targets = SA.peaks.targets(), ta = targets.find((t) => t.id === peaks[0].id), tb = targets.find((t) => t.id === peaks[1].id);
  const dirx = D.dx, dirz = D.dz;
  let s = { x: ta.x - dirx * 2.4, z: ta.z - dirz * 2.4, heading: Math.atan2(dirx, dirz), y: M.groundHeight(ta.x - dirx * 2.4, ta.z - dirz * 2.4), climb: null };
  s = SA.climb.start(s, ta);
  assert.ok(s.climb, 'the climb starts at the foot');
  for (let t = 0; t < 6 && s.climb && s.climb.mode === 'up'; t += DT) s = SA.climb.step(s, {}, DT, [], targets);
  assert.equal(s.climb && s.climb.mode, 'top');
  let onPlanks = false;
  for (let t = 0; t < 10 && s.climb; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, [], targets);
  onPlanks = !s.climb;
  assert.ok(onPlanks, 'walking off the summit toward the other peak steps onto the planks (no fall)');
  assert.ok(Math.abs(s.y - S.heightAt(s.x, s.z, s.y)) < 0.5);
  for (let t = 0; t < 12 && local(s.x, s.z).u < half + 0.3; t += DT) s = SA.climb.step(s, { forward: 1 }, DT, S.ropeSolidsAt(s.x, s.z, s.y) || [], targets);
  assert.ok(local(s.x, s.z).u >= half, 'across to the second summit');
  assert.ok(Math.hypot(s.x - tb.x, s.z - tb.z) < 1.2 && Math.abs(s.y - tb.topY) < 0.5);
  // a different way off a summit is still the normal fall
  const sx = ta.x + dirz * 2.4, sz = ta.z - dirx * 2.4;
  let w = SA.climb.start({ x: sx, z: sz, heading: Math.atan2(-dirz, dirx), y: M.groundHeight(sx, sz), climb: null }, ta);
  for (let t = 0; t < 6 && w.climb && w.climb.mode === 'up'; t += DT) w = SA.climb.step(w, {}, DT, [], targets);
  assert.equal(w.climb && w.climb.mode, 'top');
  w = { ...w, heading: Math.atan2(dirz, -dirx) };   // face away from the bridge, off the side of the summit
  for (let t = 0; t < 6 && w.climb && w.climb.mode === 'top'; t += DT) w = SA.climb.step(w, { forward: 1 }, DT, [], targets);
  assert.ok(w.climb && w.climb.mode === 'down' && w.climb.fall, 'a different way off the summit is still the normal fall');
  assert.ok(S.heightAt(w.x, w.z, w.y) === null || local(w.x, w.z).u < -half, 'and not onto the planks');
});

test('surfaces: a profile rises linearly and is flat beyond its ends; fixed decks are idempotent', () => {
  const d = { id: 't', x: 0, z: 0, dx: 1, dz: 0, halfLen: 5, halfWid: 1, y: 3, ramp: 0, railR: 0.1, profile: { u0: -4, y0: 2, u1: 4, y1: 6 } };
  assert.equal(S.topAt(d, -4.5), 2); assert.equal(S.topAt(d, 0), 4); assert.equal(S.topAt(d, 5), 6);
  assert.equal(S.topAt({ y: 7 }, 3), 7);
  const n = S.near(0, 0, 0);
  S.addFixed([D]); S.addFixed(null);
  assert.equal(S.near(0, 0, 0), n);
  assert.equal(S.exitTo(...at(0), S.heightAt(...at(0)) + 0.3) !== null, true);
  assert.equal(S.exitTo(...at(0), S.heightAt(...at(0)) + 3), null);
});

test('render: one merged mesh, planks level with the deck, swaying visually only; wired into the page and the scene', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...BASE.slice(0, 18), 'game/render/bridges.js', 'game/render/rope-bridge.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const { THREE, SA: R } = ctx;
  const scene = new THREE.Scene(), sfx = [];
  R.audio = { sfx: (...a) => sfx.push(a) };
  const view = R.render.createRopeBridge(THREE, { scene });
  assert.equal(scene.children.length, 1);
  assert.equal(view.mesh.name, 'rope-bridge');
  assert.ok(view.stats().triangles > 500);
  view.mesh.geometry.computeBoundingBox();
  const bb = view.mesh.geometry.boundingBox, d = R.ropeBridge.get(), py = view.group.position.y;   // the mesh is built round the deck's middle
  assert.ok(py + bb.max.y > TOPS(R, d) + 0.8 && py + bb.min.y < TOPS(R, d), 'planks sit at the deck height, ropes above');
  const y0 = view.group.position.y;
  for (let i = 0; i < 90; i++) view.update(1 / 30, { x: d.x, z: d.z, y: R.surfaces.heightAt(d.x, d.z) });
  assert.notEqual(view.group.position.y, y0, 'the picture sways');
  assert.ok(Math.abs(R.surfaces.heightAt(d.x, d.z) - R.surfaces.topAt(d, 0)) < 1e-9, 'the walking surface does not');
  assert.ok(sfx.length === 0, 'standing still on it is silent');
  for (let i = 0; i < 60; i++) view.update(1 / 30, { x: d.x + i * 0.05 * d.dx, z: d.z + i * 0.05 * d.dz, y: R.surfaces.heightAt(d.x + i * 0.05 * d.dx, d.z + i * 0.05 * d.dz) });
  assert.ok(sfx.length >= 1 && sfx[0][0] === 'creak', 'walking on it creaks');
  view.update(0, null); view.update(1 / 30, null);
  for (const t of [fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'game/manifest.js'), 'utf8')]) {
    assert.ok(t.indexOf('game/surfaces.js') < t.indexOf('game/rope-bridge.js') && t.indexOf('game/rope-bridge.js') < t.indexOf('game/decor-plan.js'));
    assert.ok(t.indexOf('game/render/bridges.js') < t.indexOf('game/render/rope-bridge.js') && t.indexOf('game/render/rope-bridge.js') < t.indexOf('game/render/scene.js'));
  }
  const scn = fs.readFileSync(path.join(ROOT, 'game/render/scene.js'), 'utf8');
  assert.ok(scn.includes('createRopeBridge') && scn.includes('ropeBridge.update(dt') && scn.includes('ropeSolidsAt'));
});

function TOPS(R, d) { return R.surfaces.topAt(d, 0) - 0.05; }
