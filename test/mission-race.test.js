// AS-0354: Mission 10 core (La carrera): the data row and the new `race` field's validation, the start line / flag path / big tree placement, the goal check,
// the talk -> goTo -> photo step flow with the mission sticker, the compass target, the spoken words and "nothing exists unless the mission runs". Pure logic in node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-race.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [], photos = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const log = SA.rescueLog.create({});
  const race = SA.missionRace.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), photo: { record: (id) => photos.push(id) }, rescueLog: log });
  rt = SA.missionRuntime.create({ missions, thing: race, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  const out = { SA, missions, race, rt, said, tracked, cheers, photos, log };
  race.onSticker = (e) => (out.sticker = e);
  return out;
}

function startCarrera(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones', 'hogar']) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); }
  const r = ctx.missions.start('carrera');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.race.sync();
  return ctx;
}
const step = (ctx) => ctx.missions.active().stepData;
const frame = (ctx, p) => { ctx.race.update(p); return ctx.rt.update(p); };
const json = (v) => JSON.parse(JSON.stringify(v));

test('data: mission 10 follows mission 9, one intro line of <= 4 words, steps talk -> goTo -> photo; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[9];
  assert.equal(m.n, 10);
  assert.equal(m.id, 'carrera');
  assert.equal(typeof m.intro, 'object');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.equal(m.intro.es, '¡Una carrera!');
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['talk', 'goTo', 'photo']);
  assert.equal(m.steps[0].who, m.race.rabbit);
  assert.equal(m.steps[1].place, m.race.place);
  assert.equal(m.steps[2].target, m.race.place, 'a place, so a photo of a wild rabbit never completes it');
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon));
  SA.missionRun.validate(m.steps);
  for (const k of ['thing:carrera', 'thing:bandera', 'thing:arbol', ...Object.values(m.race.say)]) assert.ok(SA.vocab.get(k), k);
  assert.equal(SA.vocab.get('thing:carrera').es, 'la carrera');
  assert.equal(SA.vocab.get('thing:arbol').es, 'el árbol');
  assert.ok(SA.data.get('badges', 'buen-corredor'));
  assert.ok(SA.data.get('animals', m.race.rabbit));
});

test('data: the race field is validated with clear errors', () => {
  const { SA } = setup();
  const good = { place: 'arbol-grande', rabbit: 'conejo' };
  let n = 0;
  const row = (race) => ({ id: 'x10' + (n++), n: 99, es: 'X', en: 'X', icon: '🏁', intro: { es: 'Hola', icon: '🏁' }, race,
    steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, biome: 'bosque', flags: 4, say: { talk: 'thing:carrera', flag: 'thing:bandera', arrive: 'thing:arbol', photo: 'thing:carrera' } })]));
  assert.doesNotThrow(() => SA.data.register('missions', [row(good)]), 'biome, flags and say are optional');
  assert.throws(() => SA.data.register('missions', [row({ ...good, place: 'Arbol' })]), /race\.place/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, rabbit: undefined })]), /race\.rabbit/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, biome: 3 })]), /race\.biome/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, flags: 2 })]), /race\.flags/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, flags: 11 })]), /race\.flags/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, flags: 4.5 })]), /race\.flags/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: { bad: 'x' } })]), /race\.say/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: 'x' })]), /race\.say/);
  assert.throws(() => SA.data.register('missions', [row('x')]), /race/);
});

test('mission 10 appears on the board after mission 9 (locked until it is done), starts from the board and can be replayed', () => {
  const { missions } = setup();
  assert.equal(missions.start('carrera').ok, false);
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('carrera').ok, false, 'still locked: mission 9 is not done');
  assert.equal(missions.status('carrera'), 'locked');
  missions.start('hogar'); missions.complete();
  assert.equal(missions.status('carrera'), 'available');
  assert.equal(missions.next().id, 'carrera');
  assert.equal(missions.start('carrera').ok, true);
  missions.complete();
  assert.equal(missions.status('carrera'), 'done');
  const re = missions.start('carrera');
  assert.deepEqual([re.ok, re.replay], [true, true]);
});

test('place: start line, a rabbit beside it, evenly spread flags leading to the big tree on dry ground; deterministic; nothing without the mission', () => {
  const ctx = setup();
  const { SA, race } = ctx;
  assert.equal(race.sync(), null);
  assert.equal(race.view(), null);
  assert.equal(race.locate('arbol-grande'), null);
  assert.equal(race.target({ kind: 'goTo', place: 'arbol-grande' }), null);
  startCarrera(ctx);
  const cur = race.current(), { start, goal, flags, rabbit } = cur;
  assert.equal(SA.map.biomeAt(start.x), 'bosque');
  assert.equal(SA.map.isWater(start.x, start.z), false);
  assert.equal(SA.map.isWater(goal.x, goal.z), false);
  const sp = SA.station.spawn();
  assert.ok(Math.hypot(start.x - sp.x, start.z - sp.z) >= 16, 'a walk away from the station');
  const len = Math.hypot(goal.x - start.x, goal.z - start.z);
  assert.ok(len >= 40 && len <= 57, 'a real run: ' + len);
  assert.equal(flags.length, 6);
  let prev = start;
  for (const f of flags) {
    const d = Math.hypot(f.x - prev.x, f.z - prev.z);
    assert.ok(d > 3 && d < 14, 'flags a short run apart: ' + d);
    assert.ok(Math.hypot(f.x - goal.x, f.z - goal.z) < len, 'each flag is nearer the tree than the start');
    assert.ok(Math.abs(f.y - SA.map.groundHeight(f.x, f.z)) < 1e-9, 'standing on the ground');
    assert.equal(SA.map.isWater(f.x, f.z), false);
    prev = f;
  }
  assert.equal(rabbit.animal, 'conejo');
  assert.ok(Math.hypot(rabbit.x - start.x, rabbit.z - start.z) < 4, 'the rabbit waits beside the start line');
  assert.ok(Math.abs(rabbit.rotY - Math.atan2(goal.x - start.x, goal.z - start.z)) < 1e-9, 'facing the tree');
  const again = SA.missionRace.place(cur.spec, ctx.missions.active().seed);
  assert.deepEqual([again.start.x, again.start.z, again.goal.x, again.goal.z], [start.x, start.z, goal.x, goal.z]);
  assert.equal(SA.missionRace.place({ place: 'x' }, 1), null);
  assert.equal(SA.missionRace.place({ ...cur.spec, flags: 3 }, 1).flags.length, 3);
  const avoided = SA.missionRace.place(cur.spec, ctx.missions.active().seed, { solids: [[start.x, start.z, 3]] });
  assert.ok(Math.hypot(avoided.start.x - start.x, avoided.start.z - start.z) >= 9, 'a solid at the first start line pushes the course elsewhere');
  ctx.missions.abandon && ctx.missions.abandon();
  race.sync();
  assert.equal(race.current(), null, 'no course and no rabbit once the mission is not running');
});

test('goal check: inside the goal circle only; flags you pass are remembered in any order', () => {
  const { SA } = setup();
  const R = SA.missionRace, goal = { x: 10, z: 20, r: 4.5 };
  assert.equal(R.reached(goal, { x: 10, z: 20 }), true);
  assert.equal(R.reached(goal, { x: 14, z: 20 }), true);
  assert.equal(R.reached(goal, { x: 15, z: 20 }), false);
  assert.equal(R.reached(null, { x: 0, z: 0 }), false);
  assert.equal(R.reached(goal, null), false);
  assert.equal(R.reached({ x: 0, z: 0 }, { x: 4.4, z: 0 }), true, 'the default radius');
  const flags = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
  assert.deepEqual(Array.from(R.passedFlags(flags, { x: 20, z: 1 })), [2]);
  assert.deepEqual(Array.from(R.passedFlags(flags, { x: 1, z: 1 }, [2])), [0, 2]);
  assert.deepEqual(Array.from(R.passedFlags(flags, { x: 100, z: 0 }, [1])), [1]);
  assert.deepEqual(Array.from(R.passedFlags(flags, null)), []);
});

test('the whole mission: talk to the rabbit, run to the big tree (goTo, shortcuts count), then photograph it with la cámara: sticker, stars, album, spoken words', () => {
  const ctx = startCarrera(setup());
  const { SA, race, said, cheers, photos, missions } = ctx, c = race.current(), g = c.goal, rb = c.rabbit;
  assert.equal(step(ctx).kind, 'talk');
  assert.deepEqual(json(race.target(step(ctx))), { x: rb.x, z: rb.z, role: 'animal', id: 'conejo' });
  assert.deepEqual(json(ctx.rt.target()), { x: rb.x, z: rb.z, role: 'animal', id: 'conejo' }, 'the compass points at the rabbit');
  assert.equal(race.view().talk, true);
  assert.equal(race.snap({ x: g.x, z: g.z }).status, 'none', 'too early for the photo');
  assert.equal(race.talk({ x: rb.x + 40, z: rb.z }).status, 'far');
  assert.ok(said.includes('phrase:acercate'));
  assert.equal(step(ctx).kind, 'talk', 'a far tap loses nothing');
  assert.equal(race.talk({ x: rb.x + 1, z: rb.z }).status, 'step');
  assert.ok(said.includes('thing:carrera'), 'la carrera is spoken at the rabbit');
  assert.equal(step(ctx).kind, 'goTo');
  assert.equal(race.talk({ x: rb.x, z: rb.z }).status, 'none', 'no second talk');
  assert.deepEqual(json(ctx.rt.target()), { x: g.x, z: g.z, role: 'place', id: 'arbol-grande' }, 'the compass points at the big tree');
  frame(ctx, { x: g.x + 30, z: g.z, y: 0 });
  assert.equal(step(ctx).kind, 'goTo', 'far away does nothing');
  const f0 = c.flags[2];
  frame(ctx, { x: f0.x, z: f0.z, y: f0.y });
  assert.deepEqual(Array.from(race.view().passed), [2], 'a flag you run past lights up');
  assert.ok(said.includes('thing:bandera'));
  assert.equal(step(ctx).kind, 'goTo', 'the flags are a guide, not the goal');
  frame(ctx, { x: g.x + 1, z: g.z + 1, y: g.y });     // straight to the tree: a shortcut that skips the other flags still counts
  assert.equal(step(ctx).kind, 'photo', 'reaching the tree advances to the photo step');
  assert.ok(said.includes('thing:arbol'));
  assert.equal(race.view().photo, true);
  assert.equal(race.snap({ x: g.x, z: g.z }).status, 'nocamera');
  assert.equal(SA.inventory.equip('camara'), true);
  assert.equal(race.snap({ x: g.x + 40, z: g.z }).status, 'far');
  assert.equal(missions.active().id, 'carrera', 'a wrong try loses nothing');
  const stars = SA.save.get().stars || 0;
  const r = race.snap({ x: g.x, z: g.z + 3 });
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'carrera');
  assert.equal(r.firstTime, true);
  assert.deepEqual(photos, ['conejo']);
  assert.equal(missions.status('carrera'), 'done');
  assert.equal(missions.active(), null);
  assert.equal(cheers.length, 1);
  assert.ok(said.includes('sfx:shutter'));
  assert.equal(ctx.sticker.mission, 'carrera');
  assert.equal(ctx.sticker.badges[ctx.sticker.badges.length - 1].id, 'buen-corredor');
  assert.ok(Array.from(SA.save.get().badges).includes('buen-corredor'));
  assert.equal(ctx.log.count('race'), 1);
  assert.ok(ctx.tracked.some(([n]) => n === 'race.talk') && ctx.tracked.some(([n]) => n === 'race.arrived') && ctx.tracked.some(([n]) => n === 'race.photo'));
  assert.ok((SA.save.get().stars || 0) >= stars + 2, 'the mission reward');
  assert.equal(race.snap({ x: g.x, z: g.z }).status, 'none', 'no second photo');
  race.sync();
  assert.equal(race.current(), null, 'the course is gone when the mission ends');
});

test('talking to some other rabbit or photographing a wild rabbit never advances the race', () => {
  const ctx = startCarrera(setup());
  assert.equal(ctx.rt.report({ type: 'talked', who: 'scientist' }).status, 'ignored');
  assert.equal(ctx.rt.report({ type: 'talked', who: 'conejo' }).status, 'step');
  const g = ctx.race.current().goal;
  frame(ctx, { x: g.x, z: g.z, y: g.y });
  assert.equal(step(ctx).kind, 'photo');
  assert.equal(ctx.rt.report({ type: 'photo', target: 'conejo' }).status, 'ignored');
  assert.equal(step(ctx).kind, 'photo');
});

test('a replay is a fresh run, pays no second sticker or stars', () => {
  const ctx = startCarrera(setup());
  const { SA, race, missions } = ctx;
  let g = race.current().goal;
  race.talk({ x: race.current().rabbit.x, z: race.current().rabbit.z });
  frame(ctx, { x: g.x, z: g.z, y: g.y });
  SA.inventory.equip('camara');
  assert.equal(race.snap({ x: g.x, z: g.z }).status, 'complete');
  const stars = SA.save.get().stars || 0;
  assert.equal(missions.start('carrera').replay, true);
  race.sync();
  assert.equal(step(ctx).kind, 'talk', 'starts again at the rabbit');
  g = race.current().goal;
  race.talk({ x: race.current().rabbit.x, z: race.current().rabbit.z });
  frame(ctx, { x: g.x, z: g.z, y: g.y });
  assert.equal(race.snap({ x: g.x, z: g.z }).status, 'complete');
  assert.equal(SA.save.get().stars || 0, stars, 'no stars twice');
  assert.equal(ctx.log.count('race'), 1, 'the rescue log keeps one row per mission, so the sticker is only earned once');
  assert.equal(Array.from(SA.save.get().badges).filter((b) => b === 'buen-corredor').length, 1);
});

test('place: every seed gives a course (a start, a long dry run to the tree, flags a short way apart), never null', () => {
  const { SA } = setup();
  const spec = SA.data.get('missions', 'carrera').race, sp = SA.station.spawn(), bad = [];
  for (let s = 1; s <= 3000; s++) {   // mission seeds are random in play: sweep many, spread out
    const p = SA.missionRace.place(spec, (s * 2654435761) % 2147483647);
    if (!p) { bad.push([s, 'null']); continue; }
    const len = Math.hypot(p.goal.x - p.start.x, p.goal.z - p.start.z);
    if (!(len >= 40 && len <= 57)) bad.push([s, 'len', len]);
    if (Math.hypot(p.start.x - sp.x, p.start.z - sp.z) < 16) bad.push([s, 'near the station']);
    const av = SA.missionRace.place(spec, s * 7919, { solids: [[p.start.x, p.start.z, 3]] });
    if (!av) bad.push([s, 'avoid null']);
    else if (Math.hypot(av.start.x - p.start.x, av.start.z - p.start.z) < 9) bad.push([s, 'avoid', Math.hypot(av.start.x - p.start.x, av.start.z - p.start.z)]);
    if (p.flags.some((f) => !(Math.hypot(f.x - p.goal.x, f.z - p.goal.z) < len))) bad.push([s, 'flag nearer']);
    if (Math.abs(p.rabbit.rotY - Math.atan2(p.goal.x - p.start.x, p.goal.z - p.start.z)) > 1e-9) bad.push([s, 'rot']);
    let prev = p.start;
    for (const f of p.flags) { if (SA.map.isWater(f.x, f.z)) bad.push([s, 'flag in water']); const d = Math.hypot(f.x - prev.x, f.z - prev.z); if (!(d > 3 && d < 14)) bad.push([s, 'flag', d]); prev = f; }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});
