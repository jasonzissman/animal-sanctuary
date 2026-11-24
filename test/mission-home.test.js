// AS-0350: Mission 9 core (Construir un hogar): the data row and the new `home` field's validation, the build spot with the rabbit family beside it,
// the goTo + photo step flow with the mission sticker, the compass target, the spoken lines and "nothing exists unless the mission runs". Pure logic
// in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-home.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [], photos = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const log = SA.rescueLog.create({});
  const home = SA.missionHome.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), photo: { record: (id) => photos.push(id) }, rescueLog: log });
  rt = SA.missionRuntime.create({ missions, thing: home, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  const out = { SA, missions, home, rt, said, tracked, cheers, photos, log };
  home.onSticker = (e) => (out.sticker = e);
  return out;
}

function startHogar(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones']) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); }
  const r = ctx.missions.start('hogar');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.home.sync();
  // AS-0351: the three collect steps come first (their pickups are tested in mission-gather.test.js); pass them here so these tests start at the goTo.
  while (step(ctx).kind === 'collect') ctx.rt.report({ type: 'collected', item: step(ctx).item });
  return ctx;
}
const step = (ctx) => ctx.missions.active().stepData;
// AS-0352: the three place steps come between the goTo and the photo (tested in mission-home-build.test.js); pass them here.
const buildAll = (ctx) => { while (step(ctx).kind === 'place') ctx.rt.report({ type: 'placed', item: step(ctx).item, place: step(ctx).place }); };
const frame = (ctx, p) => { ctx.home.update(p); return ctx.rt.update(p); };
const json = (v) => JSON.parse(JSON.stringify(v));

test('data: mission 9 follows mission 8, one intro line of <= 4 words, steps collect x3 -> goTo -> place x3 -> photo; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[8];
  assert.equal(m.n, 9);
  assert.equal(m.id, 'hogar');
  assert.equal(typeof m.intro, 'object');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.equal(m.intro.es, 'Construye una casa');
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['collect', 'collect', 'collect', 'goTo', 'place', 'place', 'place', 'photo']);
  assert.equal(m.steps[3].place, m.home.place);
  assert.equal(m.steps[7].target, m.home.place, 'a place, so a photo of some wild rabbit never completes it');
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon));
  SA.missionRun.validate(m.steps);
  const f = m.home.family;
  assert.equal(f.babies, 3);
  assert.equal(SA.data.get('animals', f.adult).story, undefined, 'the adult is an ordinary animal from the data');
  assert.equal(SA.data.get('animals', f.baby).story, true, 'the kits are a story animal');
  assert.equal(SA.data.get('animals', f.baby).baby.of, f.adult, 'the kits are the adult made small (babyParts)');
  assert.ok(SA.data.get('animals', f.baby).parts.length >= 8, 'built from the existing part system');
  for (const k of ['thing:casa', 'thing:familia', m.home.say.arrive, m.home.say.photo, 'animal:conejito']) assert.ok(SA.vocab.get(k), k);
  assert.ok(SA.data.get('badges', 'hogar-nuevo'));
});

test('vocab: el palo, la hoja, la hierba, la casa, abajo, encima, construir with their articles', () => {
  const { SA } = setup();
  const want = { 'thing:palo': 'el palo', 'thing:hoja': 'la hoja', 'thing:hierba': 'la hierba', 'thing:casa': 'la casa', 'phrase:abajo': 'abajo', 'phrase:encima': 'encima',
    'phrase:construir': 'construir', 'animal:conejito': 'el conejito' };
  for (const [k, es] of Object.entries(want)) assert.equal(SA.vocab.get(k).es, es, k);
});

test('data: the home field is validated with clear errors', () => {
  const { SA } = setup();
  const good = { place: 'hogar', biome: 'bosque', family: { adult: 'conejo', baby: 'conejito', babies: 3 } };
  let n = 0;
  const row = (home) => ({ id: 'x9' + (n++), n: 99, es: 'X', en: 'X', icon: '🏡', intro: { es: 'Hola', icon: '🏡' }, home,
    steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, say: { arrive: 'thing:casa', photo: 'thing:familia' } })]));
  assert.doesNotThrow(() => SA.data.register('missions', [row({ place: 'hogar', family: good.family })]), 'biome and say are optional');
  assert.throws(() => SA.data.register('missions', [row({ ...good, place: 'Hogar' })]), /home\.place/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, place: undefined })]), /home\.place/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, biome: 3 })]), /home\.biome/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: undefined })]), /home\.family/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, babies: 0 } })]), /babies/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, babies: 6 } })]), /babies/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, adult: 3 } })]), /home\.family\.adult/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, baby: 'Bebé' } })]), /home\.family\.baby/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: { bad: 'x' } })]), /home\.say/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: 'x' })]), /home\.say/);
  assert.throws(() => SA.data.register('missions', [row('x')]), /home/);
});

test('mission 9 is locked until mission 8 is done, then starts from the board like any other and can be replayed', () => {
  const { missions } = setup();
  assert.equal(missions.start('hogar').ok, false);
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('hogar').ok, false, 'still locked: mission 8 is not done');
  assert.equal(missions.status('hogar'), 'locked');
  missions.start('ladrones'); missions.complete();
  assert.equal(missions.status('hogar'), 'available');
  assert.equal(missions.next().id, 'hogar');
  assert.equal(missions.start('hogar').ok, true);
  missions.complete();
  assert.equal(missions.status('hogar'), 'done');
  const re = missions.start('hogar');
  assert.deepEqual([re.ok, re.replay], [true, true]);
});

test('place: a marked spot on flat dry bosque ground with an adult and 3 kits beside it, facing it; deterministic; nothing without the mission', () => {
  const ctx = setup();
  const { SA, home } = ctx;
  assert.equal(home.sync(), null);
  assert.equal(home.view(), null);
  assert.equal(home.locate('hogar'), null);
  assert.equal(home.target({ kind: 'goTo', place: 'hogar' }), null);
  startHogar(ctx);
  const cur = home.current(), s = cur.spot;
  assert.equal(SA.map.biomeAt(s.x), 'bosque');
  assert.equal(SA.map.isWater(s.x, s.z), false);
  const sp = SA.station.spawn();
  assert.ok(Math.hypot(s.x - sp.x, s.z - sp.z) >= 16, 'a walk away from the station');
  assert.equal(cur.family.length, 4);
  assert.deepEqual(Array.from(cur.family.map((f) => f.role)), ['adult', 'baby', 'baby', 'baby']);
  assert.deepEqual(Array.from(new Set(cur.family.map((f) => f.animal))).sort(), ['conejito', 'conejo']);
  for (const f of cur.family) {
    const d = Math.hypot(f.x - s.x, f.z - s.z);
    assert.ok(d > s.r * 0.6 && d < 7, 'beside the spot, not on top of it: ' + d);
    assert.ok(Math.abs(f.rotY - Math.atan2(s.x - f.x, s.z - f.z)) < 1e-9, 'facing the spot');
    assert.ok(Math.abs(f.y - SA.map.groundHeight(f.x, f.z)) < 1e-9, 'standing on the ground');
  }
  const again = SA.missionHome.place(cur.spec, ctx.missions.active().seed);
  assert.deepEqual([again.spot.x, again.spot.z], [s.x, s.z]);
  assert.equal(SA.missionHome.place({ ...cur.spec, family: { ...cur.spec.family, babies: 9 } }, 1), null);
  const avoided = SA.missionHome.place(cur.spec, ctx.missions.active().seed, { solids: [[s.x, s.z, 3]] });
  assert.ok(Math.hypot(avoided.spot.x - s.x, avoided.spot.z - s.z) >= 9, 'a solid at the first spot pushes the build spot elsewhere (r + gap)');
  ctx.missions.abandon && ctx.missions.abandon();
  home.sync();
  assert.equal(home.current(), null, 'no spot and no family once the mission is not running');
});

test('the whole mission: walk to the spot (goTo), then photograph the family with la cámara: sticker, stars, album, spoken words', () => {
  const ctx = startHogar(setup());
  const { SA, home, said, cheers, photos, missions } = ctx, s = home.current().spot;
  assert.deepEqual(json(home.target(step(ctx))), { x: s.x, z: s.z, role: 'place', id: 'hogar' });
  assert.deepEqual(json(ctx.rt.target()), { x: s.x, z: s.z, role: 'place', id: 'hogar' }, 'the compass points at the spot');
  frame(ctx, { x: s.x + 30, z: s.z, y: 0 });
  assert.equal(step(ctx).kind, 'goTo', 'far away does nothing');
  assert.equal(home.snap({ x: s.x, z: s.z }).status, 'none', 'too early for the photo');
  assert.equal(home.view().photo, false);
  frame(ctx, { x: s.x + 1, z: s.z + 1, y: s.y });
  assert.equal(step(ctx).kind, 'place', 'reaching the spot completes the goTo step');
  assert.ok(said.includes('thing:casa'), 'la casa is spoken at the spot');
  assert.equal(home.view().photo, false);
  buildAll(ctx);
  assert.equal(step(ctx).kind, 'photo');
  assert.equal(home.view().photo, true);
  assert.deepEqual(json(ctx.rt.target()), { x: s.x, z: s.z, role: 'place', id: 'hogar' }, 'the compass keeps pointing at the family');
  assert.equal(home.snap({ x: s.x, z: s.z }).status, 'nocamera');
  assert.equal(SA.inventory.equip('camara'), true);
  assert.equal(home.snap({ x: s.x + 40, z: s.z }).status, 'far');
  assert.equal(missions.active().id, 'hogar', 'a wrong try loses nothing');
  const stars = SA.save.get().stars || 0;
  const r = home.snap({ x: s.x, z: s.z + 3 });
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'hogar');
  assert.equal(r.firstTime, true);
  assert.deepEqual(photos, ['conejo']);
  assert.equal(missions.status('hogar'), 'done');
  assert.equal(missions.active(), null);
  assert.equal(cheers.length, 1);
  assert.ok(said.includes('thing:familia') && said.includes('sfx:shutter'));
  assert.equal(ctx.sticker.mission, 'hogar');
  assert.equal(ctx.sticker.badges[ctx.sticker.badges.length - 1].id, 'hogar-nuevo');
  assert.ok(Array.from(SA.save.get().badges).includes('hogar-nuevo'));
  assert.equal(ctx.log.count('home'), 1);
  assert.ok(ctx.tracked.some(([n]) => n === 'home.arrived') && ctx.tracked.some(([n]) => n === 'home.photo'));
  assert.ok((SA.save.get().stars || 0) >= stars + 2, 'the mission reward');
  assert.equal(home.snap({ x: s.x, z: s.z }).status, 'none', 'no second photo');
  home.sync();
  assert.equal(home.current(), null, 'the spot and the family are gone when the mission ends');
});

test('a photo of some wild rabbit (or any animal) never finishes the photo step; only the family at the spot does', () => {
  const ctx = startHogar(setup());
  const s = ctx.home.current().spot;
  frame(ctx, { x: s.x, z: s.z, y: s.y });
  buildAll(ctx);
  assert.equal(step(ctx).kind, 'photo');
  assert.equal(ctx.rt.report({ type: 'photo', target: 'conejo' }).status, 'ignored');
  assert.equal(ctx.rt.report({ type: 'photo', target: 'conejito' }).status, 'ignored');
  assert.equal(step(ctx).kind, 'photo');
});

test('a replay is a fresh run, pays no second sticker or stars', () => {
  const ctx = startHogar(setup());
  const { SA, home, missions } = ctx;
  const s = home.current().spot;
  frame(ctx, { x: s.x, z: s.z, y: s.y });
  buildAll(ctx);
  SA.inventory.equip('camara');
  assert.equal(home.snap({ x: s.x, z: s.z }).status, 'complete');
  const stars = SA.save.get().stars || 0;
  assert.equal(missions.start('hogar').replay, true);
  home.sync();
  while (step(ctx).kind === 'collect') ctx.rt.report({ type: 'collected', item: step(ctx).item });
  const s2 = home.current().spot;
  assert.equal(s2.r > 0, true);
  frame(ctx, { x: s2.x, z: s2.z, y: s2.y });
  buildAll(ctx);
  SA.inventory.equip('camara');
  const r = home.snap({ x: s2.x, z: s2.z });
  assert.equal(r.status, 'complete');
  assert.equal(r.firstTime, false);
  assert.equal(SA.save.get().stars || 0, stars, 'no second reward');
  assert.equal(ctx.log.count('home'), 1, 'the rescue log keeps one row per mission');
  assert.equal(Array.from(SA.save.get().badges).filter((b) => b === 'hogar-nuevo').length, 1);
});
