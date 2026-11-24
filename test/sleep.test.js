import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

// AS-0171: animals sleep on their schedule (pure SA.sleep), the owl and bat, clues/missions/encounters pick only awake animals,
// using a sleeper says "¡Shh! Está durmiendo", the ambient layer lies sleepers down, and the Zzz renderer.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/daynight.js', 'game/sleep.js'];
const NIGHT = ['buho', 'murcielago'];

function load(extra = []) {
  const SA = loadGame(DATA.concat(extra));
  SA.save.reset();
  return SA;
}

test('animal data: an active time (day by default); búho and murciélago are the night animals, perched, with vocab', () => {
  const SA = load();
  const all = SA.data.all('animals');
  assert.deepEqual([...all.filter((a) => a.active === 'night').map((a) => a.id)], NIGHT);
  for (const a of all) assert.ok(a.active === undefined || a.active === 'night', a.id);
  const buho = SA.data.get('animals', 'buho'), bat = SA.data.get('animals', 'murcielago');
  assert.deepEqual([buho.biome, buho.perch, buho.herd, buho.name.es, buho.name.gender], ['bosque', 'tree', 3, 'búho', 'm']);
  assert.deepEqual([bat.biome, bat.perch, bat.sleepPose, bat.name.es, bat.name.gender], ['selva', 'tree', 'hang', 'murciélago', 'm']);
  assert.equal(SA.vocab.get('animal:buho').es, 'el búho');
  assert.equal(SA.vocab.get('animal:murcielago').es, 'el murciélago');
  assert.equal(SA.vocab.get('phrase:shh').es, '¡Shh! Está durmiendo');
  const good = { ...buho, id: 'buhob' };
  assert.throws(() => SA.data.register('animals', [{ ...good, active: 'tarde' }]), /active/);
  assert.throws(() => SA.data.register('animals', [{ ...good, id: 'buhoc', sleepPose: 'flat' }]), /sleepPose/);
  assert.doesNotThrow(() => SA.data.register('animals', [{ ...good, id: 'buhod', active: 'day', sleepPose: 'curl' }]));
});

test('schedule: day animals sleep at dusk and night, night animals sleep by day and wake at dusk', () => {
  const SA = load();
  const rabbit = SA.data.get('animals', 'conejo'), owl = SA.data.get('animals', 'buho');
  assert.equal(SA.sleep.activeOf(rabbit), 'day');
  assert.equal(SA.sleep.activeOf(owl), 'night');
  for (const [phase, rabbitSleeps] of [['day', false], ['dusk', true], ['night', true], ['dawn', false]]) {
    assert.equal(SA.sleep.isAsleep(rabbit, phase), rabbitSleeps, 'rabbit ' + phase);
    assert.equal(SA.sleep.isAsleep(owl, phase), !rabbitSleeps, 'owl ' + phase);
  }
  // Story animals and easter eggs never sleep (a mission must never find its piglet snoring).
  assert.equal(SA.sleep.isAsleep(SA.data.get('animals', 'cerdito'), 'night'), false);
  assert.equal(SA.sleep.isAsleep(SA.data.get('animals', 'raton'), 'night'), false);
  assert.equal(SA.sleep.isAsleep(null, 'night'), false);
});

test('schedule follows the shared day/night clock', () => {
  const SA = load();
  const rabbit = SA.data.get('animals', 'conejo');
  const clock = SA.daynight.instance();
  assert.equal(clock.phase(), 'day');
  assert.equal(SA.sleep.isAsleep(rabbit), false);
  for (let i = 0; i < 60 && clock.phase() !== 'dusk'; i++) clock.update(10);
  assert.equal(clock.phase(), 'dusk');
  assert.equal(SA.sleep.isAsleep(rabbit), true, 'dozes off at dusk');
  assert.equal(SA.sleep.isAsleep(SA.data.get('animals', 'buho')), false, 'the owl wakes at dusk');
});

test('awake() filters, awakeOr() never runs dry', () => {
  const SA = load();
  const real = SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
  const day = SA.sleep.awake(real, 'day').map((a) => a.id), night = SA.sleep.awake(real, 'night').map((a) => a.id);
  assert.ok(!day.includes('buho') && !day.includes('murcielago') && day.length === real.length - 2);
  assert.deepEqual([...night], NIGHT);
  assert.deepEqual([...SA.sleep.awake(['buho', 'conejo'], 'night')], ['buho'], 'ids work too (the ids come back)');
  const onlyDay = real.filter((a) => a.active !== 'night');
  assert.equal(SA.sleep.awake(onlyDay, 'night').length, 0);
  assert.equal(SA.sleep.awakeOr(onlyDay, 'night').length, onlyDay.length, 'nobody awake: keep the list');
});

test('clues and rescue missions only choose awake animals', () => {
  const SA = load(['game/data/foods.js', 'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/round.js', 'game/mission.js']);
  const clock = SA.daynight.instance();
  const answers = (make) => { const out = new Set(); for (let s = 1; s <= 25; s++) { const r = make(s); if (r) r.answerIds.forEach((id) => out.add(id)); } return out; };
  const round = (s) => SA.round.create({ rng: SA.clues.makeRng(s), now: () => 0, track: () => {}, level: 1 }).start();
  const mission = (s) => SA.mission.create({ rng: SA.clues.makeRng(s), now: () => 0, track: () => {}, level: 1 }).start();
  for (const make of [round, mission]) {
    const byDay = answers(make);
    assert.ok(byDay.size > 5 && !byDay.has('buho') && !byDay.has('murcielago'), 'by day the owl and bat are asleep');
  }
  for (let i = 0; i < 60 && clock.phase() !== 'night'; i++) clock.update(10);
  assert.equal(clock.phase(), 'night');
  for (const make of [round, mission]) {
    const byNight = answers(make);
    assert.ok(byNight.size > 0);
    for (const id of byNight) assert.ok(NIGHT.includes(id), id + ' is asleep at night');
  }
});

test('encounters and the census skip sleepers', () => {
  const SA = load(['game/data/foods.js', 'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/data/missions.js', 'game/missions.js',
    'game/focus.js', 'game/nearby-task.js', 'game/data/needs.js', 'game/encounters.js', 'game/census.js']);
  const clock = SA.daynight.instance();
  const enc = SA.encounters.create({ rng: SA.clues.makeRng(3), now: () => 1000, focus: { allowsSmall: () => true } });
  const animals = SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
  enc.sync({ animals, excludeIds: [] });
  const needy = () => enc.tasks().map((t) => t.animalId);
  assert.ok(needy().length > 0);
  assert.ok(!needy().some((id) => NIGHT.includes(id)), 'a sleeping owl has no needs by day');
  for (let i = 0; i < 60 && clock.phase() !== 'night'; i++) clock.update(10);
  enc.sync({ animals, excludeIds: [] });
  for (const id of needy()) assert.ok(NIGHT.includes(id), id + ' sleeps at night');
  const list = SA.census.generate(4);
  if (list) list.entries.forEach((e) => assert.ok(animals.some((a) => NIGHT.includes(a.id) && SA.census.matches(a, e)), 'only night animals can fit: ' + e.es));
});

test('SA.sleep: the cue, the yawn and speech (throttled), listeners, telemetry; the sleeper stays asleep', () => {
  const SA = load();
  const said = [], sfx = [];
  SA.audio = { say: (k) => said.push(k), sfx: (n) => sfx.push(n) };
  assert.deepEqual({ ...SA.sleep.cue() }, { icon: '😴', es: '¡Shh! Está durmiendo', key: 'phrase:shh' });
  SA.sleep.set('conejo#2', true);
  assert.equal(SA.sleep.asleep('conejo#2'), true);
  assert.equal(SA.sleep.asleep('conejo#3'), false);
  const heard = [];
  const off = SA.sleep.onDisturb((id, cue) => heard.push([id, cue.es]));
  assert.equal(SA.sleep.disturb('conejo#2', 10000).es, '¡Shh! Está durmiendo');
  SA.sleep.disturb('conejo#2', 10500);   // inside the throttle: no second yawn
  assert.deepEqual([...said], ['phrase:shh']);
  assert.deepEqual([...sfx], ['yawn']);
  assert.equal(heard.length, 2);
  assert.equal(SA.sleep.asleep('conejo#2'), true, 'using it does not wake it');
  SA.sleep.disturb('conejo#2', 20000);
  assert.equal(said.length, 2, 'speaks again once the bubble is gone');
  off();
  SA.sleep.disturb('conejo#2', 40000);
  assert.equal(heard.length, 3);
  SA.sleep.set('conejo#2', false);
  assert.equal(SA.sleep.asleep('conejo#2'), false);
});

test('SA.sleep maths: lying-down ease, rising Z letters, snore timing and range', () => {
  const SA = load();
  let a = 0;
  for (let i = 0; i < 5; i++) a = SA.sleep.ease(a, true, 0.1);
  assert.ok(a > 0.5 && a < 1);
  for (let i = 0; i < 30; i++) a = SA.sleep.ease(a, true, 0.1);
  assert.equal(a, 1);
  for (let i = 0; i < 30; i++) a = SA.sleep.ease(a, false, 0.1);
  assert.equal(a, 0);
  for (let t = 0; t < 10; t += 0.37) for (let i = 0; i < 3; i++) {
    const p = SA.sleep.zPose(t, i, 3);
    assert.ok(p.y >= 0 && p.y <= 1.3 && p.scale >= 0.6 && p.scale <= 1.1 && p.alpha >= 0 && p.alpha <= 1, JSON.stringify(p));
  }
  assert.notEqual(SA.sleep.zPose(1, 0, 3).y, SA.sleep.zPose(1, 1, 3).y, 'the letters are staggered');
  let s = null, plays = 0, secs = 0;
  for (let i = 0; i < 400; i++) { const r = SA.sleep.snoreStep(s, 3, 0.05); s = r.state; secs += 0.05; if (r.play) { plays++; assert.ok(r.volume > 0 && r.volume <= 0.22); } }
  assert.ok(plays >= 4 && plays <= 6, `a snore about every 4 s: ${plays} in ${secs}s`);
  const far = SA.sleep.snoreStep(null, SA.sleep.SNORE_RANGE + 1, 10);
  assert.deepEqual([far.play, far.volume], [false, 0], 'out of range: silent');
  assert.ok(SA.sleep.snoreStep({ t: 3.99 }, 1, 0.05).volume > SA.sleep.snoreStep({ t: 3.99 }, 6, 0.05).volume, 'closer is louder');
});

const AMBIENT = ['game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/instances.js', 'game/render/ambient.js'];

function fakeAnimal(id, instanceId) {
  const part = (name, y, sy, extra = {}) => ({ userData: { animalId: id, part: name, ...extra }, position: { x: 0, y, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: sy, z: 0.3 } });
  return { name: instanceId, userData: { animalId: id, instanceId }, position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
    children: [part('cuerpo', 0.5, 1), part('ojos', 1.2, 0.2, { side: 'left' })] };
}

test('ambient: a sleeper stops wandering, lies down with eyes shut and a slow breath; it wakes when its time comes; pinned never sleeps', () => {
  const SA = loadGame(DATA.concat(AMBIENT));
  SA.save.reset();
  SA.picking = { onPick() {} };
  const clock = SA.daynight.instance();
  const g = fakeAnimal('conejo', 'conejo#0');
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  const run = (n) => { for (let i = 0; i < n; i++) amb.update(1 / 30); };
  run(120);
  assert.equal(SA.sleep.asleep('conejo#0'), false);
  assert.ok(Math.abs(g.scale.y - 1) < 0.2, 'awake: normal height');
  for (let i = 0; i < 60 && clock.phase() !== 'dusk'; i++) clock.update(10);
  run(40);
  assert.equal(SA.sleep.asleep('conejo#0'), true, 'dusk: the rabbit dozes off');
  const spot = [g.position.x, g.position.z];
  const eyes = g.children[1];
  run(60);
  assert.ok(g.scale.y < 0.8, 'lies down (squashed): ' + g.scale.y);
  assert.ok(eyes.scale.y < 0.05, 'eyes closed: ' + eyes.scale.y);
  const ys = []; for (let i = 0; i < 90; i++) { amb.update(1 / 30); ys.push(g.scale.y); }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.01, 'still breathes, slowly');
  assert.deepEqual([g.position.x, g.position.z], spot, 'does not wander while asleep');
  // A mission pins it: it is awake at once and never put back to bed while pinned.
  amb.pin('conejo#0');
  run(60);
  assert.equal(SA.sleep.asleep('conejo#0'), false, 'pinned animals never sleep');
  assert.ok(g.scale.y > 0.9);
  amb.unpin('conejo#0');
  run(10);
  assert.equal(SA.sleep.asleep('conejo#0'), true);
  // Dawn: it wakes and stands up again.
  for (let i = 0; i < 80 && clock.phase() !== 'dawn'; i++) clock.update(10);
  run(80);
  assert.equal(SA.sleep.asleep('conejo#0'), false);
  assert.ok(g.scale.y > 0.9 && eyes.scale.y > 0.1, 'awake again');
});

test('ambient: a bat (sleepPose hang) turns upside down by day; the owl is the one awake at night', () => {
  const SA = loadGame(DATA.concat(AMBIENT, ['game/perch.js']));
  SA.save.reset();
  SA.picking = { onPick() {} };
  const clock = SA.daynight.instance();
  const g = fakeAnimal('murcielago', 'murcielago#0');
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [], trees: [{ x: 3, z: 3, y: 0, scale: 1, kind: 'jungle' }] });
  const run = (n) => { for (let i = 0; i < n; i++) amb.update(1 / 30); };
  run(60);
  assert.equal(SA.sleep.asleep('murcielago#0'), true, 'asleep by day');
  assert.ok(Math.abs(g.rotation.z - Math.PI) < 0.05, 'hangs upside down: ' + g.rotation.z);
  for (let i = 0; i < 60 && clock.phase() !== 'night'; i++) clock.update(10);
  run(90);
  assert.equal(SA.sleep.asleep('murcielago#0'), false, 'awake at night');
  assert.ok(Math.abs(g.rotation.z) < 0.05, 'right way up again');
});

test('sleep-fx: Zzz float over near sleepers only, face the camera, fade, and a snore plays near one', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/sleep.js', 'game/render/block-text.js', 'game/render/sleep-fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { THREE, SA } = ctx;
  const sounds = [];
  SA.audio = { sfx: (n, v) => sounds.push([n, v]) };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const rig = (x, sleeping) => ({ sleeping, sleepAmt: sleeping ? 1 : 0, top: 1, sy: 1, animal: {}, g: { position: { x, y: 0, z: 0 } } });
  const rigs = { 'a#0': rig(2, true), 'b#0': rig(3, false), 'c#0': rig(60, true) };
  const fx = SA.render.createSleepFx(THREE, { scene, camera, ambient: { rigs }, getPlayer: () => ({ x: 0, z: 0 }) });
  assert.equal(fx.group.children.length, 0, 'nothing built until someone sleeps nearby');
  fx.update(0.05);
  assert.equal(fx.group.children.length, 8 * 3, 'a small pool of 3 letters per slot');
  const visible = () => fx.group.children.filter((c) => c.visible);
  assert.equal(visible().length, 3, 'one sleeper in range (awake and far ones get none)');
  assert.ok(visible().every((z) => z.position.y > 1), 'above the animal');
  for (let i = 0; i < 100; i++) fx.update(0.05);
  assert.ok(sounds.some(([n, v]) => n === 'snore' && v > 0), 'a snore while near');
  rigs['a#0'].sleeping = false; rigs['a#0'].sleepAmt = 0;
  fx.update(0.05);
  assert.equal(visible().length, 0, 'it woke: the Zzz are gone');
});

test('index.html and the manifest load the new scripts, sleep.js before anything that uses it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const pos = (f) => html.indexOf(`src="${f}"`);
  assert.ok(pos('game/sleep.js') > pos('game/daynight.js') && pos('game/sleep.js') < pos('game/round.js'));
  assert.ok(pos('game/render/sleep-fx.js') > 0 && pos('game/render/sleep-fx.js') < pos('game/render/scene.js'));
});
