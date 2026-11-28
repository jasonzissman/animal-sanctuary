import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/map.js', 'game/animal-plan.js'];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test('plan: part counts follow the data (4 patas, 2 orejas, 1 cola)', () => {
  const SA = loadGame(DATA);
  const rabbit = SA.animalPlan.plan(SA.data.get('animals', 'conejo'));
  const count = (k) => rabbit.filter((s) => s.part === k).length;
  assert.equal(rabbit.filter((s) => s.part === 'patas' && !s.extra).length, 4);
  assert.equal(count('patas'), 8, '4 legs + 4 paws (AS-0406)');
  assert.equal(count('orejas'), 2);
  assert.equal(count('ojos'), 2);
  assert.equal(count('cola'), 1);
  assert.deepEqual(Array.from(rabbit.filter((s) => s.part === 'patas'), (s) => s.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  const duck = SA.animalPlan.plan(SA.data.get('animals', 'pato'));
  assert.equal(duck.filter((s) => s.part === 'patas' && !s.extra).length, 2);
});

test('plan: every real animal expands from data alone, with sane numbers', () => {
  const SA = loadGame(DATA);
  for (const a of SA.data.all('animals')) {
    const specs = SA.animalPlan.plan(a);
    const meshes = (p) => p.count + (p.also || []).reduce((n, x) => n + x.count, 0) + (p.part === 'patas' && a.feet && a.feet !== 'none' ? p.count : 0);   // + one foot per leg
    assert.equal(specs.length, a.parts.reduce((n, p) => n + meshes(p), 0), a.id);
    for (const s of specs) {
      assert.equal(s.animalId, a.id);
      assert.ok(s.foot ? s.builder === s.foot : SA.parts.BUILDERS.includes(s.builder));   // a generated foot has its own builder (AS-0406)
      for (const n of [...s.size, ...s.position, ...s.rotation, ...s.pickSize]) assert.ok(Number.isFinite(n));
    }
  }
});

test('plan: colours and scale overrides come from the animal data', () => {
  const SA = loadGame(DATA);
  const animal = {
    id: 'bicho', parts: [
      { part: 'cuerpo', color: '#112233', scale: 2, count: 1, offset: [0, 1, 0] },
      { part: 'patas', color: '#445566', scale: [0.1, 0.4, 0.2], count: 2, offset: [0.3, 0.2, 0] },
    ],
  };
  const [body, l, r] = SA.animalPlan.plan(animal);
  assert.equal(body.color, '#112233');
  assert.deepEqual(Array.from(body.size), [2, 2, 2]);
  assert.equal(l.color, '#445566');
  assert.deepEqual(Array.from(l.size), [0.1, 0.4, 0.2]);
  assert.deepEqual([l.side, r.side], ['right', 'left']);
  assert.deepEqual([l.position[0], r.position[0]], [-0.3, 0.3]);
});

test('plan: pick volumes are 1.6x the part', () => {
  const SA = loadGame(DATA);
  const eye = SA.animalPlan.plan(SA.data.get('animals', 'conejo')).find((s) => s.part === 'ojos');
  assert.equal(SA.animalPlan.PICK_SCALE, 1.6);
  near(eye.pickSize[0], 0.16 * 1.6);
  near(eye.pickSize[2], 0.16 * 1.6);
});

test('plan: beaks and tails point along z while keeping their world size', () => {
  const SA = loadGame(DATA);
  const beak = SA.animalPlan.plan(SA.data.get('animals', 'tucan')).find((s) => s.part === 'pico');
  near(beak.rotation[0], Math.PI / 2);
  assert.deepEqual(Array.from(beak.worldSize), [0.35, 0.3, 1.1]);
  assert.deepEqual(Array.from(beak.size), [0.35, 1.1, 0.3]);
  const ears = SA.animalPlan.plan(SA.data.get('animals', 'conejo')).filter((s) => s.part === 'orejas');
  assert.ok(ears[0].rotation[2] > 0 && ears[1].rotation[2] < 0, 'ears tilt outward');
});

test('plan: a missing part definition fails with a clear error; custom defs are accepted', () => {
  const SA = loadGame(DATA);
  const a = { id: 'x', parts: [{ part: 'zzz', color: '#000000', scale: 1, count: 1, offset: [0, 0, 0] }] };
  assert.throws(() => SA.animalPlan.plan(a), /no part definition/);
  const def = { key: 'zzz', builder: 'box', anchor: 'center' };
  assert.equal(SA.animalPlan.plan(a, [def])[0].builder, 'box');
  assert.equal(SA.animalPlan.plan(a, { zzz: def })[0].builder, 'box');
  const five = { id: 'y', parts: [{ part: 'zzz', color: '#000000', scale: 1, count: 3, offset: [0.5, 0, 0] }] };
  assert.deepEqual(Array.from(SA.animalPlan.plan(five, [def]), (s) => s.position[0]), [-0.5, 0, 0.5]);
});

test('plan: `rot` replaces the auto turn, `row` spreads count-4 rows, `also` pieces share the part key with unique indexes', () => {
  const SA = loadGame(DATA);
  const a = {
    id: 'x', parts: [
      { part: 'patas', color: '#445566', scale: [0.2, 1, 0.2], count: 4, offset: [0.3, 0.5, 0], row: 0.9,
        also: [{ scale: [0.3, 0.1, 0.4], count: 4, offset: [0.3, 0.05, 0], row: 0.9, color: '#112233', builder: 'box' }] },
      { part: 'cola', color: '#778899', scale: [0.1, 0.8, 0.1], count: 1, offset: [0, 1, -1], rot: [0.3, 0, 0] },
      { part: 'cabeza', color: '#aabbcc', scale: 0.5, count: 1, offset: [0, 2, 1], also: [{ scale: 0.3, count: 1, offset: [0, 1.5, 0.8] }] },
    ],
  };
  const specs = SA.animalPlan.plan(a);
  const legs = specs.filter((s) => s.part === 'patas');
  assert.equal(legs.length, 8);
  assert.deepEqual(Array.from(legs, (s) => s.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...new Set(legs.slice(0, 4).map((s) => Math.abs(s.position[2])))], [0.9]);
  assert.equal(legs[4].builder, 'box');
  assert.equal(legs[4].color, '#112233');
  assert.equal(legs[0].color, '#445566');
  const tail = specs.find((s) => s.part === 'cola');
  assert.deepEqual(Array.from(tail.rotation), [0.3, 0, 0]);
  assert.deepEqual(Array.from(tail.size), [0.1, 0.8, 0.1], 'rot keeps the size as given (no axis swap)');
  const neck = specs.filter((s) => s.part === 'cabeza')[1];
  assert.equal(neck.builder, 'sphere', 'an extra inherits the part builder');
  assert.equal(neck.color, '#aabbcc', 'and the part colour');
});

test('camello: long forward neck, head held high, hump on the back, thin legs with knees and flat feet', () => {
  const SA = loadGame(DATA);
  const specs = SA.animalPlan.plan(SA.data.get('animals', 'camello'));
  const of = (k) => specs.filter((s) => s.part === k);
  const body = of('cuerpo')[0], hump = of('joroba')[0], head = of('cabeza')[0];
  const top = (s) => s.position[1] + s.size[1] / 2, bottom = (s) => s.position[1] - s.size[1] / 2;
  assert.ok(of('cabeza').length >= 4, 'head plus 2-3 neck segments');
  assert.ok(head.position[1] > body.position[1] + 1.1 && head.position[2] > body.position[2] + 1.1, 'head high and forward');
  assert.ok(bottom(hump) < top(body) && top(hump) > top(body), 'hump sits on the back, overlapping the body (no gap)');
  const legs = of('patas').filter((s) => s.builder === 'cylinder');
  assert.equal(legs.length, 4);
  for (const l of legs) assert.ok(l.size[0] <= 0.2 && l.size[1] > 1.2, 'thin and long');
  assert.equal(of('patas').filter((s) => s.builder === 'sphere').length, 4, 'knee bumps');
  const feet = of('patas').filter((s) => s.builder === 'box');
  assert.equal(feet.length, 4);
  for (const f of feet) assert.ok(f.size[0] > legs[0].size[0] && f.size[1] < 0.2, 'wide flat feet');
  const belly = of('barriga')[0];
  assert.equal(belly.color, body.color, 'barriga is not a separate pale blob');
  for (const k of ['cuerpo', 'joroba', 'cabeza', 'hocico', 'orejas', 'cola', 'patas', 'pelo', 'barriga', 'ojos']) assert.ok(of(k).length, k);
});

test('camello (AS-0215): about 75% of its old height, a little taller than the player at the hump, not giraffe-tall', () => {
  const SA = loadGame(DATA);
  const specs = SA.animalPlan.plan(SA.data.get('animals', 'camello'));
  const of = (k) => specs.filter((s) => s.part === k);
  const top = (s) => s.position[1] + s.worldSize[1] / 2;
  const PLAYER = 1.6;          // the avatar's head/hair top (game/render/avatar.js)
  const OLD_TOP = 3.9 + 0.065, OLD_HUMP = 2.55 + 0.375;   // pre-AS-0215 ears top (3.9 + half ear) and hump top
  const hump = top(of('joroba')[0]);
  const highest = Math.max(...specs.map(top));
  assert.ok(hump > PLAYER * 1.1 && hump < PLAYER * 1.6, 'hump a little taller than the player: ' + hump);
  assert.ok(highest < PLAYER * 2.0, 'ears/head stay well under giraffe height: ' + highest);
  assert.ok(Math.abs(hump / OLD_HUMP - 0.75) < 0.01, 'hump is 75% of before');
  assert.ok(Math.abs(highest / OLD_TOP - 0.75) < 0.03, 'overall height is about 75% of before');
  // Pick volumes follow the sizes, so they shrank with the animal (no oversized invisible boxes).
  const legs = of('patas').filter((s) => s.builder === 'cylinder');
  for (const l of legs) assert.ok(l.pickSize[1] <= l.worldSize[1] * 1.6 + 1e-9);
  // The tap radius (which placements use to keep animals apart) is exactly 75% of the full-size design's.
  const camel = JSON.parse(JSON.stringify(SA.data.get('animals', 'camello')));
  const grow = (e) => {
    e.scale = Array.isArray(e.scale) ? e.scale.map((n) => n / 0.75) : e.scale / 0.75;
    e.offset = e.offset.map((n) => n / 0.75);
    if (e.row) e.row /= 0.75;
    (e.also || []).forEach(grow);
  };
  const small = SA.animalPlan.pickRadius(camel);
  camel.parts.forEach(grow);
  assert.ok(Math.abs(small / SA.animalPlan.pickRadius(camel) - 0.75) < 1e-6, 'pick radius in step with the smaller body');
});

test('placements: deterministic, in the right biome, dry, spaced and clear of decor', () => {
  const SA = loadGame(DATA);
  const animals = SA.data.all('animals');
  const avoid = [[-8, 4]];
  const a = SA.animalPlan.placements(animals, { avoid });
  const b = SA.animalPlan.placements(animals, { avoid });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  for (const an of animals) {
    const s = a[an.id];
    assert.equal(SA.map.biomeAt(s.x), an.biome, an.id);
    assert.ok(!SA.map.isWater(s.x, s.z), an.id);
    near(s.y, SA.map.groundHeight(s.x, s.z));
  }
});

test('buildAnimals: groups per animal; every part mesh and pick volume carries userData and is raycastable', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const group = SA.render.buildAnimals(THREE);
  const species = SA.data.all('animals').filter((a) => !a.story);
  assert.equal(group.children.length, species.reduce((n, a) => n + (a.herd || 1), 0), 'one group per herd instance (AS-0255)');
  for (const a of species) {
    const mine = SA.render.instances.of(group, a.id);
    assert.equal(mine.length, a.herd || 1, `${a.id} appears herd-count times`);
    mine.forEach((g, n) => {
      assert.equal(g.name, `${a.id}#${n}`, 'the group name is the instanceId');
      assert.equal(g.userData.instanceId, g.name);
      assert.ok(g.children.every((m) => m.userData.instanceId === g.name && m.userData.animalId === a.id), 'parts and pick volumes name their instance');
    });
  }
  assert.equal(group.children.filter((g) => !g.visible).map((g) => g.name).join(), 'raton#0', 'the easter egg is built but hidden');
  for (const g of group.children) {
    const animal = SA.data.get('animals', g.userData.animalId);
    const parts = g.children.filter((m) => !m.userData.pick);
    const picks = g.children.filter((m) => m.userData.pick);
    const feet = (p) => (p.part === 'patas' && animal.feet && animal.feet !== 'none' ? p.count : 0);   // one foot per leg (AS-0406)
    assert.equal(parts.length, animal.parts.reduce((n, p) => n + p.count + feet(p) + (p.also || []).reduce((m, x) => m + x.count, 0), 0));
    assert.equal(picks.length, parts.length);
    assert.equal(g.userData.pickVolumes.length, picks.length);
    for (const m of g.children) {
      assert.equal(m.userData.animalId, animal.id);
      assert.ok(SA.data.get('parts', m.userData.part));
    }
    for (const p of picks) assert.equal(p.visible, false);
  }
});

function pickerFor(animalId) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const group = SA.render.buildAnimals(THREE);
  const g = group.children.find((c) => c.userData.animalId === animalId);
  group.updateMatrixWorld(true);
  // Cast from outside the animal: origin and direction are given in the animal's own frame (+z = its front).
  return (from, to) => {
    const o = g.localToWorld(new THREE.Vector3(...from));
    const t = g.localToWorld(new THREE.Vector3(...to));
    const ray = new THREE.Raycaster(o, t.sub(o).normalize());
    const hits = ray.intersectObjects(g.userData.pickVolumes, false);
    const naive = hits[0] && hits[0].object.userData.part;
    const hit = SA.animalPlan.choosePick(hits);
    return { naive, part: hit && hit.object.userData.part, id: hit && hit.object.userData.animalId, n: hits.length };
  };
}

test('picking: small parts win over the cabeza/cuerpo boxes around them (conejo)', () => {
  const pick = pickerFor('conejo');
  // From the camera side, straight at each eye, the snout, the tail and the front/back legs.
  assert.equal(pick([0.17, 1.08, 5], [0.17, 1.08, 0.77]).part, 'ojos');
  assert.equal(pick([-0.17, 1.08, 5], [-0.17, 1.08, 0.77]).part, 'ojos');
  assert.equal(pick([0, 0.96, 5], [0, 0.96, 0.84]).part, 'hocico');
  assert.equal(pick([0, 0.5, -5], [0, 0.5, -0.55]).part, 'cola');
  // A ray from the side first crosses the head box (a nearest-hit pick would say cabeza), then meets the eye.
  const oblique = pick([3, 1.08, 0.77], [0.17, 1.08, 0.77]);
  assert.equal(oblique.naive, 'cabeza');
  assert.equal(oblique.part, 'ojos');
  // From the side and from below the legs beat the body.
  const side = pick([5, 0.18, 0.336], [0.28, 0.18, 0.336]);
  assert.equal(side.part, 'patas');
  assert.equal(pick([0.28, -5, 0.336], [0.28, 0.18, 0.336]).part, 'patas');
  // Plain head and body taps still pick the head and body, and carry the animal id.
  assert.equal(pick([0.3, 1.3, 5], [0.3, 1.3, 0.5]).part, 'cabeza');
  const body = pick([0, 0.77, -5], [0, 0.77, 0]);     // between the tail and the fur tuft (el pelo) on the back
  assert.equal(body.part, 'cuerpo');
  assert.equal(body.id, 'conejo');
});

test('picking: eyes behind the first surface cannot be tapped through the back of the head', () => {
  const pick = pickerFor('conejo');
  assert.equal(pick([0.17, 1.08, -5], [0.17, 1.08, 0.2]).part, 'cabeza');
});

test('picking: tiny parts of mono and tucan are reachable from the front', () => {
  const mono = pickerFor('mono');
  assert.equal(mono([0.15, 1.53, 5], [0.15, 1.53, 0.56]).part, 'ojos');
  assert.equal(mono([0, 1.42, 5], [0, 1.42, 0.6]).part, 'hocico');
  const tucan = pickerFor('tucan');
  assert.equal(tucan([2, 1.7, 4], [0.25, 1.58, 0.47]).part, 'ojos'); // the beak hides the eyes dead-on
  assert.equal(tucan([0, 1.45, 5], [0, 1.45, 0.9]).part, 'pico');
});

test('choosePick: empty hits give null; hits without a pick volume fall back to the nearest', () => {
  const SA = loadGame(DATA);
  assert.equal(SA.animalPlan.choosePick([]), null);
  const h = [{ distance: 1, object: { userData: {} } }];
  assert.equal(SA.animalPlan.choosePick(h), h[0]);
});

test('plan: big masses get a 1.0x pick volume, small parts 1.6x, and pick volumes follow rotation', () => {
  const SA = loadGame(DATA);
  const specs = SA.animalPlan.plan(SA.data.get('animals', 'conejo'));
  const body = specs.find((s) => s.part === 'cuerpo');
  near(body.pickSize[0], 1.0);
  const beak = SA.animalPlan.plan(SA.data.get('animals', 'tucan')).find((s) => s.part === 'pico');
  assert.deepEqual(Array.from(beak.pickSize), Array.from(beak.size, (n) => n * 1.6));
  near(beak.pickVolume, 0.35 * 0.3 * 1.1 * 1.6 ** 3);
});

test('pupils: the plan carries the data pupil colour; the renderer adds it as a non-pickable child of the eye', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  for (const a of SA.data.all('animals')) {
    const specs = SA.animalPlan.plan(a);
    const eyes = specs.filter((s) => s.part === 'ojos');
    assert.ok(eyes.length && eyes.every((s) => s.pupil), `${a.id} eyes have a pupil in the plan`);
    assert.ok(specs.filter((s) => s.part !== 'ojos').every((s) => s.pupil === null), a.id);
  }
  const group = SA.render.buildAnimals(THREE);
  for (const g of group.children) {
    const eyeMeshes = g.children.filter((m) => !m.userData.pick && m.userData.part === 'ojos');
    assert.equal(eyeMeshes.length, 2, g.name);
    for (const e of eyeMeshes) {
      assert.equal(e.children.length, 3, `${g.name} eye has a pupil, a highlight and an eyelid child`);
      assert.equal(e.children[0].userData.pupil, true);
      assert.ok(e.children[0].position.z > 0.25, 'pupil sits in front of the eye');
      assert.ok(e.children[1].userData.glint && e.children[2].userData.eyelid, 'highlight and eyelid');
      assert.ok(e.children.every((c) => c.userData.decor && !c.userData.pick), 'eye children are decor, never pick targets');
    }
    const eyes = group.children.flatMap((g) => g.children.filter((m) => !m.userData.pick && m.userData.part === 'ojos'));
    assert.equal(new Set(eyes.map((e) => e.children[1].geometry)).size, 1, 'highlight geometry is shared');
    assert.equal(new Set(eyes.map((e) => e.children[1].material)).size, 1, 'highlight material is shared');
    assert.equal(new Set(eyes.map((e) => e.children[2].geometry)).size, 1, 'eyelid geometry is shared');
    assert.ok(group.children.every((g) => g.userData.pickVolumes.every((v) => !v.userData.decor && v.children.length === 0)));
    assert.ok(g.userData.pickVolumes.every((v) => v.userData.part && !v.userData.pupil), 'pupils are not pick targets');
  }
});

test('AS-0405: eyelid colour is the eye entry\'s own, else the head colour, else the body colour; non-eyes have none', () => {
  const SA = loadGame(DATA);
  for (const a of SA.data.all('animals')) {
    const head = a.parts.find((x) => x.part === 'cabeza') || a.parts.find((x) => x.part === 'cuerpo');
    const eyeEntry = a.parts.find((x) => x.part === 'ojos');
    for (const s of SA.animalPlan.plan(a)) {
      if (s.part !== 'ojos') { assert.equal(s.eyelid, null, a.id); continue; }
      assert.match(s.eyelid, /^#[0-9a-f]{6}$/i, a.id);
      assert.equal(s.eyelid, eyeEntry.eyelid || (head && head.color) || eyeEntry.color, a.id);
    }
  }
  const custom = JSON.parse(JSON.stringify(SA.data.get('animals', 'conejo')));
  custom.parts.find((x) => x.part === 'ojos').eyelid = '#123456';
  assert.ok(SA.animalPlan.plan(custom).filter((s) => s.part === 'ojos').every((s) => s.eyelid === '#123456'));
});

test('placements keep every animal out of the spawn circle (and its 1-unit margin)', () => {
  const SA = loadGame([...DATA, 'game/player.js']);
  const s = SA.player.spawn();
  const spots = SA.animalPlan.placements(SA.data.all('animals'), {});
  for (const [id, p] of Object.entries(spots)) {
    assert.ok(Math.hypot(p.x - s.x, p.z - s.z) >= SA.player.SPAWN_CLEAR + 1, `${id} starts too close to the spawn`);
  }
});

test('AS-0404: legs plan as tapered and necks as capsules; geometry is shared, materials are smooth, picks unchanged', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  let legs = 0, necks = 0;
  for (const a of SA.data.all('animals')) {
    for (const s of SA.animalPlan.plan(a)) {
      const want = s.builder !== 'cylinder' ? null : s.part === 'patas' ? 'tapered' : s.part === 'cuello' ? 'capsule' : null;
      assert.equal(s.shape, want, `${a.id} ${s.part}/${s.builder}`);
      if (want === 'tapered') legs++;
      if (want === 'capsule') necks++;
    }
  }
  assert.ok(legs > 0 && necks > 0, 'the data has tapered legs and capsule necks');

  // Profiles: tapered is narrower at the bottom, a capsule is symmetric; both close on the axis at both ends, inside the unit box.
  const tap = SA.render.limbProfile('tapered'), cap = SA.render.limbProfile('capsule');
  for (const prof of [tap, cap]) {
    assert.equal(prof[0][0], 0);
    assert.equal(prof[prof.length - 1][0], 0);
    assert.ok(prof.every((p) => p[1] >= -0.5 - 1e-9 && p[1] <= 0.5 + 1e-9 && p[0] <= 0.5 + 1e-9));
  }
  const maxR = (prof, lo, hi) => Math.max(...prof.filter((p) => p[1] >= lo && p[1] <= hi).map((p) => p[0]));
  assert.ok(maxR(tap, -0.5, 0) < maxR(tap, 0, 0.5), 'tapered: bottom narrower than top');
  assert.ok(Math.abs(maxR(cap, -0.5, 0) - maxR(cap, 0, 0.5)) < 1e-9, 'capsule: symmetric');
  assert.ok(SA.render.unitGeometry(THREE, 'cylinder', 'tapered') instanceof THREE.LatheGeometry);
  assert.ok(SA.render.unitGeometry(THREE, 'cylinder') instanceof THREE.CylinderGeometry, 'no shape: the plain cylinder');

  const group = SA.render.buildAnimals(THREE);
  const isLimb = (m) => !m.userData.pick && m.geometry instanceof THREE.LatheGeometry;
  const leg = (g, i) => g.children.find((m) => !m.userData.pick && m.userData.part === 'patas' && m.userData.index === i);
  const conejo = group.children.find((g) => g.userData.animalId === 'conejo');
  assert.ok(isLimb(leg(conejo, 0)));
  assert.equal(leg(conejo, 0).geometry, leg(conejo, 3).geometry, 'legs share one geometry');
  const legGeos = new Set(group.children.flatMap((g) => g.children.filter((m) => m.userData.part === 'patas' && isLimb(m)).map((m) => m.geometry)));
  assert.equal(legGeos.size, 1, 'every animal shares the same tapered geometry');
  for (const g of group.children) {
    for (const m of g.children) {
      if (m.userData.pick) assert.ok(m.geometry instanceof THREE.BoxGeometry, 'pick volumes stay boxes');
      else assert.equal(m.material.flatShading, false, `${g.name} ${m.userData.part} is smooth shaded`);
    }
  }
});

test('AS-0406: feet by data: every animal declares feet; the plan emits one foot per leg with the matching builder', () => {
  const SA = loadGame(DATA);
  for (const a of SA.data.all('animals')) assert.ok(SA.animals.FEET.includes(a.feet), `${a.id} has a feet value`);
  const leg = { part: 'patas', color: '#445566', scale: [0.2, 1, 0.2], count: 4, offset: [0.3, 0.5, 0], row: 0.5 };
  const body = { part: 'cuerpo', color: '#112233', scale: 1, count: 1, offset: [0, 1, 0] };
  const planOf = (feet) => SA.animalPlan.plan({ id: 'bicho', feet, parts: [body, leg] });
  for (const feet of ['paw', 'hoof', 'claw']) {
    const specs = planOf(feet);
    const legs = specs.filter((s) => s.part === 'patas' && !s.extra), foot = specs.filter((s) => s.foot);
    assert.equal(legs.length, 4);
    assert.equal(foot.length, 4, `${feet}: one foot per leg`);
    foot.forEach((f, i) => {
      assert.equal(f.builder, feet);
      assert.equal(f.foot, feet);
      assert.equal(f.part, 'patas', 'taps on a foot answer as the legs');
      assert.equal(f.extra, true, 'extra: it rides with the limb animation');
      assert.equal(f.side, legs[i].side);
      near(f.position[0], legs[i].position[0]);
      near(f.position[1] - f.size[1] / 2, 0);   // the foot's bottom is the leg's bottom (the ground)
      assert.ok(f.size[0] > legs[i].size[0], 'wider than the leg');
      assert.ok(f.pickVolume > 0 && f.pickSize.every(Number.isFinite));
    });
    assert.deepEqual(Array.from(specs.filter((s) => s.part === 'patas'), (s) => s.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  }
  assert.equal(planOf('hoof').find((s) => s.foot).color, '#2e2622', 'hooves are dark');
  assert.equal(planOf('paw').find((s) => s.foot).color, '#445566', 'paws take the leg colour');
  for (const feet of ['none', undefined]) assert.equal(planOf(feet).filter((s) => s.foot).length, 0, `${feet}: no feet`);
});

test('AS-0406: the renderer draws paws, hooves and claws from the plan; claws get three cone children', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const group = SA.render.buildAnimals(THREE);
  const feetOf = (id) => group.children.find((g) => g.userData.animalId === id).children.filter((m) => !m.userData.pick && m.userData.extra && m.userData.part === 'patas');
  const claws = (m) => m.children.filter((c) => c.userData.claw);
  const pato = feetOf('pato');
  assert.equal(pato.length, 2, 'the duck has two claw feet');
  for (const f of pato) {
    assert.equal(claws(f).length, 3, 'each with 3 cones');
    assert.ok(claws(f).every((c) => c.geometry instanceof THREE.ConeGeometry && c.userData.decor && !c.userData.pick));
  }
  const cabra = feetOf('cabra');
  assert.equal(cabra.length, 4, 'the goat has four hooves');
  assert.ok(cabra.every((m) => m.geometry instanceof THREE.CylinderGeometry && m.material.color.getHexString() === '2e2622'));
  const conejo = feetOf('conejo');
  assert.equal(conejo.length, 4, 'the rabbit has four paws');
  assert.ok(conejo.every((m) => m.geometry instanceof THREE.SphereGeometry && claws(m).length === 0));
  assert.equal(feetOf('serpiente').length, 0);
});
