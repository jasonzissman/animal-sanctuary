import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/data/badges.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/inventory.js', 'game/photo.js',
  'game/badges.js', 'game/rescue-log.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js',
  'game/focus.js', 'game/mission-pill.js', 'game/carry.js', 'game/mission-carry.js', 'game/mission-runtime.js', 'game/mission-hatch.js'];

const at = (p, dx = 0, dz = 0) => ({ x: p.x + dx, z: p.z + dz, heading: 0, y: 0 });

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], sfx = [], tracked = [], cheers = [], timers = [];
  const track = (t, f) => tracked.push([t, f]);
  const audio = { say: (k) => said.push(k), sfx: (n) => sfx.push(n) };
  const missions = SA.missions.create({ track });
  const carry = SA.carry.create({ track });
  const thing = SA.missionCarry.create({ missions, carry, audio, track });
  const rt = SA.missionRuntime.create({ missions, carry, thing, spawn: null, celebrate: (r) => cheers.push(r), track });
  const log = SA.rescueLog.create({ track });
  const later = (fn, ms) => timers.push([fn, ms]);
  const hatch = SA.missionHatch.create({ missions, carry: thing, runtime: rt, log, audio, later, track });
  const ctx = { SA, missions, carry, thing, rt, hatch, log, said, sfx, tracked, cheers, timers };
  ctx.hatch.onHatch = (e) => (ctx.hatched = e);
  ctx.hatch.onSticker = (e) => (ctx.sticker = e);
  return ctx;
}

// Mission 2 unlocked and started; the egg is carried to the nest and placed there (the hatch step is now current).
function placed(ctx) {
  assert.equal(ctx.missions.start('mama').ok, true);
  assert.equal(ctx.missions.complete().status, 'complete');
  assert.equal(ctx.missions.start('huevo').ok, true);
  ctx.thing.sync();
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item));
  assert.equal(ctx.rt.update(at(cur.to, 1, 0)).status, 'step');
  ctx.thing.update(at(cur.to));
  assert.equal(ctx.thing.current().phase, 'placed');
  return ctx;
}
const equipCamera = (SA) => { assert.equal(SA.inventory.equip('camara'), true); };

test('data: the hatch row is on mission 2, the duckling is a story baby of the duck, el patito and ¡Pío pío! are speakable', () => {
  const { SA } = setup();
  const m = SA.data.get('missions', 'huevo');
  assert.deepEqual(JSON.parse(JSON.stringify(m.carry.hatch)), { baby: 'patito', mama: 'pato', seconds: 5 });
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4, s.line.es));
  const baby = SA.data.get('animals', 'patito');
  assert.equal(baby.story, true);
  assert.equal(baby.baby.of, 'pato');
  assert.equal(baby.voice, 'phrase:pio');
  assert.ok(baby.parts.some((p) => p.part === 'pico') && baby.parts.some((p) => p.part === 'alas'), 'built from the duck part system');
  assert.equal(SA.vocab.get('animal:patito').es, 'el patito');
  assert.equal(SA.vocab.get('phrase:pio').es, '¡Pío pío!');
  assert.equal(SA.data.get('badges', 'patito-nuevo').rule.kind, 'hatch');
});

test('data: a bad carry.hatch row is rejected with a clear error', () => {
  const { SA } = setup();
  const row = (hatch) => ({ id: 'x', n: 9, es: 'X', en: 'X', icon: '🥚', intro: { es: 'Hola', icon: '🥚' }, carry: { item: 'a', to: 'b', hatch },
    steps: [{ kind: 'find', target: 'pato', line: { es: 'Busca', icon: '🥚' } }], reward: { stars: 1 } });
  assert.throws(() => SA.data.register('missions', [row({ baby: 'patito' })]), /carry\.hatch\.mama/);
  assert.throws(() => SA.data.register('missions', [row({ baby: 'a', mama: 'b', seconds: 99 })]), /carry\.hatch\.seconds/);
});

test('hatch timer: nothing runs until the egg is placed; then waiting, cracking in the last seconds, hatched at 5 s', () => {
  const ctx = placed(setup());
  assert.equal(ctx.hatch.update(0), 'waiting');
  assert.equal(ctx.hatch.update(2), 'waiting');
  assert.equal(ctx.hatch.view().crack, 0);
  assert.equal(ctx.hatch.update(1.6), 'cracking', 'the last 1.6 s crack');
  const v = ctx.hatch.view();
  assert.ok(v.crack > 0 && v.crack < 1);
  assert.equal(ctx.missions.active().stepData.kind, 'hatch', 'still waiting');
  assert.equal(ctx.hatch.update(1.2), 'cracking', '4.8 s: not yet');
  assert.equal(ctx.hatch.update(0.3), 'hatched');
  assert.equal(ctx.missions.active().stepData.kind, 'photo', 'the hatch moves the mission on to the photo');
  assert.equal(ctx.hatch.view().crack, 1);
  assert.ok(ctx.tracked.some(([t]) => t === 'hatch.start') && ctx.tracked.some(([t]) => t === 'hatch.done'));
});

test('before the egg is in the nest the timer does not run, and mamá and the nest are already placed', () => {
  const ctx = setup();
  ctx.missions.start('mama'); ctx.missions.complete(); ctx.missions.start('huevo');
  ctx.thing.sync();
  assert.equal(ctx.hatch.update(30), 'none', 'the egg is still on the ground');
  const v = ctx.hatch.view();
  assert.equal(v.phase, 'none');
  assert.equal(v.nest, ctx.thing.current().to);
  assert.ok(v.mama && v.baby);
});

test('the hatch: sparkle, the call is spoken (el patito then ¡Pío pío!), and the hatch hook fires once', () => {
  const ctx = placed(setup());
  ctx.hatch.update(0);
  ctx.hatch.update(10);
  assert.ok(ctx.sfx.includes('sparkle'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.hatched)), { baby: 'patito', mama: 'pato' });
  assert.equal(ctx.timers.length, 1);
  ctx.timers[0][0]();                                              // the first spoken word
  assert.deepEqual(ctx.said.slice(-1), ['animal:patito']);
  ctx.timers[1][0]();
  assert.deepEqual(ctx.said.slice(-1), ['phrase:pio']);
  ctx.hatch.update(5);
  assert.equal(ctx.timers.length, 2, 'a later frame never hatches twice');
});

test('family spots: mamá and the hatchling stand beside the nest, close, apart, facing it; the same seed gives the same spots', () => {
  const { SA } = setup();
  const nest = { x: 20, z: 10, y: 0 };
  const a = SA.missionHatch.family(nest, 7), b = SA.missionHatch.family(nest, 7);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  for (const who of [a.mama, a.baby]) {
    const d = Math.hypot(who.x - nest.x, who.z - nest.z);
    assert.ok(d > 0.8 && d < 2.5, 'close to the nest');
    assert.ok(Math.abs(Math.atan2(Math.sin(who.rotY - Math.atan2(nest.x - who.x, nest.z - who.z)), Math.cos(who.rotY - Math.atan2(nest.x - who.x, nest.z - who.z)))) < 1e-9);
  }
  assert.ok(Math.hypot(a.mama.x - a.baby.x, a.mama.z - a.baby.z) > 0.5);
});

test('trail: tracks run from the nest to the egg, evenly spaced, alternating sides, feathers now and then, never on top of either', () => {
  const { SA } = setup();
  const from = { x: 0, z: 0 }, to = { x: 0, z: 8 };
  const t = SA.missionHatch.trail(from, to);
  assert.ok(t.length >= 6);
  assert.ok(t.some((m) => m.kind === 'feather') && t.some((m) => m.kind === 'foot'));
  t.forEach((m) => {
    assert.ok(Math.hypot(m.x - from.x, m.z - from.z) >= 1.2, 'clear of the nest');
    assert.ok(Math.hypot(m.x - to.x, m.z - to.z) >= 1.2, 'clear of the egg');
    assert.ok(Math.abs(m.rot) < 1e-9, 'pointing along the walk (+z)');
  });
  assert.ok(t[0].x * t[1].x < 0 && t[1].x * t[2].x < 0, 'alternating sides');
  assert.equal(SA.missionHatch.trail(from, { x: 1, z: 1 }).length, 0, 'too close for a trail');
});

test('the family photo: needs la cámara in hand and being near the nest; it completes the mission once, with the sticker', () => {
  const ctx = placed(setup());
  ctx.hatch.update(0);
  assert.equal(ctx.hatch.snap(at(ctx.thing.current().to)).status, 'none', 'nothing to photograph before the hatch');
  ctx.hatch.update(10);
  const nest = ctx.thing.current().to;
  ctx.SA.inventory.unequip();
  assert.equal(ctx.hatch.snap(at(nest)).status, 'nocamera');
  equipCamera(ctx.SA);
  assert.equal(ctx.hatch.snap(at(nest, 30, 0)).status, 'far');
  assert.equal(ctx.missions.active().stepData.kind, 'photo');
  const stars = ctx.SA.save.get().stars || 0;
  const res = ctx.hatch.snap(at(nest, 3, 0));
  assert.equal(res.status, 'complete');
  assert.equal(ctx.missions.active(), null);
  assert.equal(ctx.SA.save.get().stars, stars + 2, 'the mission reward');
  assert.ok(ctx.sfx.includes('shutter'));
  assert.ok(Array.from(ctx.sticker.badges.map((b) => b.id)).includes('patito-nuevo'), 'the mission sticker (with the first-rescue one, newly earned)');
  assert.ok(ctx.SA.save.get().badges.includes('patito-nuevo'));
  assert.equal(ctx.cheers.length, 1);
  assert.equal(ctx.hatch.snap(at(nest)).status, 'none', 'a second shot does nothing');
  assert.equal(ctx.hatch.update(1), 'done');
  assert.equal(ctx.hatch.view().phase, 'done', 'the family stays by the nest');
});

test('the mission is replayable from the board, and a replay never gives the sticker or the stars twice', () => {
  const ctx = placed(setup());
  ctx.hatch.update(0); ctx.hatch.update(10);
  equipCamera(ctx.SA);
  const nest = ctx.thing.current().to;
  assert.equal(ctx.hatch.snap(at(nest)).status, 'complete');
  const stars = ctx.SA.save.get().stars;
  assert.equal(ctx.missions.start('huevo').ok, true, 'a finished mission is replayable');
  ctx.thing.sync();
  assert.equal(ctx.hatch.update(0), 'none', 'a fresh run starts over');
  const cur = ctx.thing.current();
  assert.equal(ctx.hatch.view().phase, 'none');
  ctx.rt.update(at(cur.item));
  ctx.rt.update(at(cur.to, 1, 0));
  ctx.thing.update(at(cur.to));
  ctx.hatch.update(0); ctx.hatch.update(10);
  const again = ctx.hatch.snap(at(cur.to));
  assert.equal(again.status, 'complete');
  assert.equal(again.firstTime, false);
  assert.equal(ctx.SA.save.get().stars, stars, 'no second reward');
  assert.equal(ctx.log.list().filter((e) => e.kind === 'hatch').length, 1, 'one sticker row per mission');
});

test('a reload on the photo step brings the family back without the show, and on the hatch step restarts the timer', () => {
  const ctx = placed(setup());
  ctx.hatch.update(0); ctx.hatch.update(10);                       // now on the photo step
  const track = () => {};
  const carry = ctx.SA.carry.create({ track });
  const thing = ctx.SA.missionCarry.create({ missions: ctx.missions, carry, audio: { say() {} }, track });
  const rt = ctx.SA.missionRuntime.create({ missions: ctx.missions, carry, thing, spawn: null, celebrate() {}, track });
  const hatch = ctx.SA.missionHatch.create({ missions: ctx.missions, carry: thing, runtime: rt, log: ctx.log, audio: { say() {}, sfx() {} }, later() {}, track });
  thing.sync();
  thing.update(at(thing.current().to, 40, 0));                       // the egg is back in the nest (a step past the delivery)
  assert.equal(thing.current().phase, 'placed');
  assert.equal(hatch.update(0), 'hatched', 'straight to the family, no new timer');
  assert.equal(hatch.view().phase, 'hatched');
  // the compass points at the nest for the hatch and photo steps
  assert.equal(thing.target(ctx.missions.active().stepData).role, 'to');
});

test('a mission with no hatch row (or none running) is ignored', () => {
  const ctx = setup();
  assert.equal(ctx.hatch.update(1), 'none');
  assert.equal(ctx.hatch.view(), null);
  assert.equal(ctx.hatch.snap({ x: 0, z: 0 }).status, 'none');
});
