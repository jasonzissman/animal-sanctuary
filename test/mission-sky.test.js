// AS-0371: Mission 12 core (Noche de estrellas): the data row and its `night` / `sky` validation, the night-only start (and the gentle waiting card by day), the
// roof telescope's layout, the look -> photo steps with the spoken vocab, the compass target, the aim limits, and the sky photo that goes into the album and
// completes the mission with the sticker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js',
  'game/station.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/missions-board.js',
  'game/data/badges.js', 'game/album.js', 'game/badges.js', 'game/rescue-log.js', 'game/data/constellations.js', 'game/constellations.js', 'game/mission-sky.js', 'game/mission-runtime.js'];

const ALL = ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones', 'hogar', 'carrera', 'mensaje'];

function setup(night = true) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const state = { night };
  const said = [], tracked = [], cheers = [], shots = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]), isNight: () => state.night });
  let rt = null;
  const sky = SA.missionSky.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), rescueLog: SA.rescueLog.create({}), albumPics: { shot: (id) => shots.push(id) } });
  rt = SA.missionRuntime.create({ missions, thing: sky, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  const out = { SA, missions, sky, rt, said, tracked, cheers, shots, state };
  sky.onSticker = (e) => (out.sticker = e);
  return out;
}
const json = (v) => JSON.parse(JSON.stringify(v));
const step = (ctx) => ctx.missions.active().stepData;
function unlock(ctx) { for (const id of ALL) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); } }
function startEstrellas(ctx) { unlock(ctx); const r = ctx.missions.start('estrellas'); assert.equal(r.ok, true, JSON.stringify(r)); ctx.sky.sync(); return ctx; }
// AS-0372: aim the open view straight at every constellation (the 3rd one moves the mission on to the photo step).
function findAll(ctx) { for (const c of ctx.SA.data.all('constellations')) ctx.sky.aim(c.center.yaw - ctx.sky.view().yaw, c.center.pitch - ctx.sky.view().pitch); }
function roofPlayer(ctx) { const t = ctx.SA.station.layout().telescope; return { x: t.x + 1.2, z: t.z, y: t.y }; }

test('data: mission 12 follows mission 11, night only, one intro line of <= 4 words, look then photo steps; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[11];
  assert.equal(m.n, 12);
  assert.equal(m.id, 'estrellas');
  assert.equal(m.night, true);
  assert.ok(m.intro.es.split(/\s+/).length <= 4 && m.intro.icon && !Array.isArray(m.intro));
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['look', 'stargaze', 'photo']);
  assert.equal(m.steps[1].n, SA.data.all('constellations').length, 'one star picture per count');
  m.steps.forEach((s) => { assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon, s.line.es); assert.equal(s.target, m.sky.place); });
  SA.missionRun.validate(m.steps);
  assert.ok(SA.data.get('badges', 'noche-de-estrellas'));
  assert.equal(SA.data.get('badges', 'noche-de-estrellas').rule.kind, 'sky');
  const words = { noche: 'la noche', cielo: 'el cielo', luna: 'la luna', estrellas: 'las estrellas' };
  for (const [k, es] of Object.entries(words)) assert.equal(SA.vocab.get('thing:' + k).es, es);
  assert.deepEqual(json(m.sky.say), { night: 'thing:noche', sky: 'thing:cielo', moon: 'thing:luna', stars: 'thing:estrellas' });
});

test('data: the night flag and the sky field are validated with clear errors', () => {
  const { SA } = setup();
  let n = 0;
  const steps = [{ kind: 'look', target: 'cielo', line: { es: 'Mira', icon: '🔭' } }, { kind: 'photo', target: 'cielo', line: { es: 'Foto', icon: '📷' } }];
  const row = (extra) => ({ id: 'x12' + (n++), n: 98, es: 'X', en: 'X', icon: '🔭', intro: { es: 'Hola', icon: '🔭' }, steps, reward: { stars: 1 }, ...extra });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ night: true, sky: { place: 'cielo', say: { night: 'thing:noche', stars: ['thing:luna', 'thing:estrellas'] } } })]));
  assert.throws(() => SA.data.register('missions', [row({ night: 'yes' })]), /night/);
  assert.throws(() => SA.data.register('missions', [row({ sky: { place: 'Cielo' } })]), /sky\.place/);
  assert.throws(() => SA.data.register('missions', [row({ sky: { place: 'otro' } })]), /look step/);
  assert.throws(() => SA.data.register('missions', [row({ sky: { place: 'cielo', say: { sun: 'thing:sol' } } })]), /sky\.say\.sun/);
  assert.throws(() => SA.data.register('missions', [row({ sky: { place: 'cielo', say: { night: 5 } } })]), /sky\.say\.night/);
  assert.throws(() => SA.data.register('missions', [row({ sky: { place: 'cielo' }, steps: [steps[0], { ...steps[1], target: 'otro' }] })]), /photo step/);
});

test('night gating: mission 12 only starts at night; by day the answer is gentle and nothing is lost; a running mission is never cut off by dawn', () => {
  const ctx = setup(false);
  for (const id of ALL) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  assert.deepEqual(json(ctx.missions.start('estrellas')), { ok: false, reason: 'night' });
  assert.equal(ctx.missions.active(), null);
  assert.equal(ctx.missions.status('estrellas'), 'available');
  ctx.state.night = true;
  assert.equal(ctx.missions.start('estrellas').ok, true);
  ctx.state.night = false;                                                // dawn comes mid-mission: it carries on
  assert.equal(ctx.missions.active().id, 'estrellas');
  assert.equal(ctx.missions.start('mama').reason, 'busy');
  ctx.missions.abandon();
  assert.equal(ctx.missions.start('estrellas').reason, 'night');
  assert.equal(ctx.missions.start('mama').ok, true, 'other missions are never gated');
});

test('night gating: the default clock is SA.daynight (isNight) and a locked mission still says locked', () => {
  const SA = loadGame([...FILES, 'game/daynight.js']);
  SA.save.reset();
  assert.equal(SA.missions.start('estrellas').reason, 'locked');
  for (const id of ALL) { SA.missions.start(id); SA.missions.complete(); }
  const clock = SA.daynight.instance();
  clock.update(0);
  const night = SA.daynight.DAY_MS + SA.daynight.DUSK_MS + 1000 - clock.time();
  assert.equal(clock.isNight(), false);
  assert.equal(SA.missions.start('estrellas').reason, 'night');
  clock.update(night / 1000);
  assert.equal(clock.isNight(), true);
  assert.equal(SA.missions.start('estrellas').ok, true);
});

test('board: by day the open night card is waiting (🌙, a gentle line); at night it is a normal card; other cards never wait', () => {
  const { SA, missions } = setup();
  for (const id of ALL) { missions.start(id); missions.complete(); }
  const day = SA.missionsBoard.cards(missions.list(), { isNight: false });
  const c = day.find((x) => x.id === 'estrellas');
  assert.equal(c.state, 'next');
  assert.equal(c.waiting, true);
  assert.equal(day.filter((x) => x.waiting).length, 1);
  assert.equal(SA.missionsBoard.ESPERA_NOCHE, 'Espera a la noche');
  assert.equal(SA.missionsBoard.cards(missions.list(), { isNight: true }).find((x) => x.id === 'estrellas').waiting, false);
  assert.equal(SA.missionsBoard.cards(missions.list()).find((x) => x.id === 'estrellas').waiting, false, 'no clock given: never waiting');
});

test('station: the telescope stands on the roof, solid, inside the flat top', () => {
  const { SA } = setup();
  const L = SA.station.layout(), t = L.telescope, top = SA.station.climbTarget();
  assert.equal(t.y, L.roof.y + L.roof.thickness);
  assert.ok(Math.abs(t.x - L.cx) < L.halfW && Math.abs(t.z - L.cz) < L.halfD);
  assert.ok(top.top.solids.some((s) => s[0] === t.x && s[1] === t.z));
  assert.ok(Math.hypot(t.x - L.dish.x, t.z - L.dish.z) > L.dish.radius + 0.5, 'clear of the dish');
  assert.ok(Math.hypot(t.x - L.antenna.x, t.z - L.antenna.z) > 1, 'clear of the antenna');
});

test('flow: look through the telescope, take the sky photo: album page, sticker, reward, spoken words, compass on the telescope', () => {
  const ctx = startEstrellas(setup());
  const { SA, sky, said } = ctx, tele = SA.station.layout().telescope, player = roofPlayer(ctx);
  assert.equal(step(ctx).kind, 'look');
  const tg = ctx.rt.target();
  assert.deepEqual(json({ x: tg.x, z: tg.z, id: tg.id }), { x: tele.x, z: tele.z, id: 'cielo' }, 'the compass points to the telescope');
  sky.update({ x: 0, z: 0, y: 0 });
  assert.deepEqual(said, ['thing:noche'], 'la noche as the mission starts');
  sky.update(player);
  assert.equal(said.length, 1, 'said once');
  assert.equal(sky.open({ x: tele.x + 20, z: tele.z, y: tele.y }).status, 'far', 'too far away: a gentle nothing');
  assert.equal(sky.view().open, false);
  assert.equal(sky.open({ x: tele.x, z: tele.z, y: 0 }).status, 'far', 'on the ground below the roof: not on the roof');
  assert.equal(sky.open(player).status, 'step');
  assert.equal(sky.view().open, true);
  assert.equal(step(ctx).kind, 'stargaze');
  assert.equal(sky.view().photo, false, 'no photo until the constellations are found');
  assert.equal(sky.snap().status, 'none');
  assert.equal(ctx.rt.target(), null, 'no compass arrow once through the telescope');
  assert.deepEqual(said.filter((k) => k.startsWith('thing:')), ['thing:noche', 'thing:cielo', 'thing:luna', 'thing:estrellas']);
  findAll(ctx);
  assert.equal(step(ctx).kind, 'photo');
  assert.equal(sky.view().photo, true);
  assert.equal(SA.album.has('cielo'), false);
  const r = sky.snap();
  assert.equal(r.status, 'complete');
  assert.equal(ctx.missions.status('estrellas'), 'done');
  assert.equal(ctx.missions.active(), null);
  assert.ok(said.includes('sfx:shutter'));
  assert.equal(SA.album.has('cielo'), true, 'the sky page is in the album');
  assert.deepEqual(json(ctx.shots), ['cielo'], 'a picture of the sky was captured for it');
  const e = SA.album.entries().find((x) => x.id === 'cielo');
  assert.ok(e && e.seen && e.es === 'el cielo' && e.key === 'thing:cielo' && e.icon === '🌙');
  assert.equal(SA.album.progress().found, 0, 'the sky is no animal: the animal count does not change');
  assert.ok(json(ctx.sticker.badges.map((b) => b.id)).includes('noche-de-estrellas'));
  assert.equal(ctx.cheers.length, 1);
  assert.equal(ctx.cheers[0].reward.stars, 2);
  assert.equal(sky.snap().status, 'none', 'a second shot does nothing');
  assert.equal(SA.save.get().stars, 2);
});

test('flow: the photo needs the open view and the photo step; closing and re-opening keeps progress; a tap with no mission does nothing', () => {
  const ctx = startEstrellas(setup());
  const { sky, said } = ctx, player = roofPlayer(ctx);
  assert.equal(sky.snap().status, 'none', 'no view, no photo');
  sky.open(player);
  findAll(ctx);
  assert.equal(sky.close(), true);
  assert.equal(sky.close(), false);
  assert.equal(step(ctx).kind, 'photo', 'the look and star steps stay done');
  assert.equal(sky.snap().status, 'none', 'closed view: no photo');
  const before = said.filter((k) => k.startsWith('thing:')).length;
  sky.open(player);
  assert.equal(sky.view().open, true);
  assert.equal(said.filter((k) => k.startsWith('thing:')).length, before, 'the words are not repeated on a re-open');
  assert.equal(sky.snap().status, 'complete');
  const idle = setup();
  idle.sky.sync();
  assert.equal(idle.sky.open({ x: 0, z: 0 }).status, 'none');
  assert.equal(idle.sky.view(), null);
});

test('view hook: onView fires when the view opens and closes (the UI shows and hides its controls)', () => {
  const ctx = startEstrellas(setup());
  const seen = [];
  ctx.sky.onView = (on) => seen.push(on);
  ctx.sky.open(roofPlayer(ctx));
  ctx.sky.close();
  ctx.sky.close();
  assert.deepEqual(seen, [true, false]);
  ctx.sky.onView = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => ctx.sky.open(roofPlayer(ctx)));
});

test('aim: yaw wraps, pitch stays between the limits, the moon comes into view when aimed at it', () => {
  const ctx = startEstrellas(setup());
  const { sky } = ctx;
  sky.open(roofPlayer(ctx));
  assert.equal(sky.view().moonInView, false);
  let a = sky.aim(0, 10);
  assert.equal(a.pitch, sky.PITCH_MAX);
  a = sky.aim(0, -10);
  assert.equal(a.pitch, sky.PITCH_MIN);
  a = sky.aim(7, 0);
  assert.ok(a.yaw >= -Math.PI && a.yaw <= Math.PI);
  assert.deepEqual(json(sky.aim('x', null)), json({ yaw: a.yaw, pitch: sky.PITCH_MIN }), 'junk input is ignored');
  sky.aim(sky.MOON.yaw - sky.view().yaw, sky.MOON.pitch - sky.view().pitch);
  assert.equal(sky.view().moonInView, true);
  assert.equal(new (loadGame(['game/sa.js', 'game/mission-sky.js']).missionSky.create)({}).aim(1, 1), null, 'no mission: no aim');
});

test('stars: deterministic, above the horizon, a few bigger ones', () => {
  const { sky } = setup();
  const a = sky.stars(120), b = sky.stars(120);
  assert.equal(a.length, 120);
  assert.deepEqual(json(a), json(b));
  a.forEach((s) => { assert.ok(s.pitch > 0 && s.pitch <= Math.PI / 2); assert.ok(s.yaw >= -Math.PI && s.yaw <= Math.PI); });
  assert.ok(a.some((s) => s.size >= 1.5) && a.some((s) => s.size < 1.5));
  assert.equal(sky.stars().length, 220);
});

test('replay: a finished night mission can be replayed at night and gives no second reward', () => {
  const ctx = startEstrellas(setup());
  ctx.sky.open(roofPlayer(ctx));
  findAll(ctx);
  ctx.sky.snap();
  ctx.state.night = false;
  assert.equal(ctx.missions.start('estrellas').reason, 'night');
  ctx.state.night = true;
  assert.equal(ctx.missions.start('estrellas').replay, true);
  ctx.sky.sync();
  ctx.sky.open(roofPlayer(ctx));
  assert.equal(ctx.sky.view().found, 0, 'a replay starts with the constellations dark again');
  assert.equal(ctx.sky.snap().status, 'none', 'and the photo waits for all three again');
  findAll(ctx);
  const r = ctx.sky.snap();
  assert.equal(r.status, 'complete');
  assert.equal(r.reward, null);
  assert.equal(ctx.SA.save.get().stars, 2);
});
