// AS-0336: Mission 6 core (El nido del águila): the data row and its validation, the feather near the trail that goes into the inventory, the summit
// climb and the rope-bridge crossing that advance the steps, the spoken vocab and the compass targets. Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/jump.js', 'game/perch.js', 'game/reach.js', 'game/climb.js', 'game/surfaces.js', 'game/rope-bridge.js', 'game/npc.js',
  'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js',
  'game/mission-pill.js', 'game/carry.js', 'game/flight.js', 'game/mission-nest.js', 'game/mission-runtime.js'];

function setup(now) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const nest = SA.missionNest.create({ missions, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), report: (e) => rt.report(e), now });
  rt = SA.missionRuntime.create({ missions, thing: nest, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  return { SA, missions, nest, rt, said, tracked, cheers };
}

function startAguila(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  const r = ctx.missions.start('aguila');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.nest.sync();
  return ctx;
}
const kind = (ctx) => ctx.missions.active().stepData;
// One frame: the nest module sees the player, then the runtime checks the goTo places (exactly the order of SA.missionRuntime.update).
const frame = (ctx, p) => { ctx.nest.update(p); return ctx.rt.update(p); };

test('data: mission 6 follows mission 5, a one-line intro of <= 4 words, steps feather -> summit -> nest; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[5];
  assert.equal(m.n, 6);
  assert.equal(m.id, 'aguila');
  assert.equal(m.intro.es, '¡Busca la pluma!');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.equal(typeof m.intro, 'object');
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind + ':' + (s.item || s.place))), ['collect:pluma', 'goTo:cima', 'goTo:nido-aguila', 'give:pluma', 'photo:undefined']);
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4));
  SA.missionRun.validate(m.steps);
  assert.ok(SA.peaks.LIST.some((p) => p.id === m.nest.summit) && SA.peaks.LIST.some((p) => p.id === m.nest.peak));
  assert.ok(SA.data.get('animals', m.nest.chick) && SA.data.get('animals', m.nest.mama));
  assert.equal(SA.data.get('items', 'pluma').name.es, 'la pluma');
  for (const k of ['item:pluma', 'phrase:arriba', 'biome:montana', 'thing:puente', 'thing:nido']) assert.ok(SA.vocab.get(k), k);
  [m.nest.say.feather, ...m.nest.say.summit, m.nest.say.bridge, m.nest.say.nest].forEach((k) => assert.ok(SA.vocab.get(k), k));
});

test('data: validation rejects a bad nest spec', () => {
  const { SA } = setup();
  const good = { item: 'pluma', summit: 'pico-n1', peak: 'pico-n2', summitPlace: 'cima', nestPlace: 'nido-aguila', chick: 'aguila', mama: 'aguila' };
  let n = 0;
  const row = (nest) => ({ id: 'x6' + (n++), n: 99, es: 'X', en: 'X', icon: '🦅', intro: { es: 'Hola', icon: '🦅' }, nest,
    steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, say: { feather: 'item:pluma', summit: ['phrase:arriba'] } })]));
  assert.throws(() => SA.data.register('missions', [row({ ...good, item: 'Pluma' })]), /nest\.item/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, peak: 'pico-n1' })]), /nest\.peak/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, mama: undefined })]), /nest\.mama/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: { bad: 'x' } })]), /nest\.say/);
  assert.throws(() => SA.data.register('missions', [row('aguila')]), /nest/);
});

test('mission 6 is locked until mission 5 is done, then starts like any other', () => {
  const { missions } = setup();
  assert.equal(missions.start('aguila').ok, false);
  for (const id of ['mama', 'huevo', 'rio', 'fiesta']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('aguila').ok, false, 'still locked: mission 5 is not done');
  missions.start('doctor'); missions.complete();
  assert.equal(missions.next().id, 'aguila');
  assert.equal(missions.start('aguila').ok, true);
});

test('place: the feather lies beside the trail on dry ground; deterministic; nothing exists without the mission', () => {
  const ctx = setup();
  const { SA, nest } = ctx;
  assert.equal(nest.sync(), null);
  assert.equal(nest.view(), null);
  startAguila(ctx);
  const cur = nest.current();
  const f = cur.feather, T = SA.mountainTrail;
  assert.ok(T.distance(f.x, f.z) < 4 && T.distance(f.x, f.z) > 1, 'beside the trail, not in the middle of it');
  assert.equal(SA.map.isWater(f.x, f.z), false);
  const again = SA.missionNest.place(cur.spec, ctx.missions.active().seed);
  assert.deepEqual([again.feather.x, again.feather.z], [f.x, f.z]);
  assert.ok(cur.summit.r > 1 && cur.nest.r > 1);
  assert.ok(cur.summit.y > 5 && cur.nest.y > 5, 'both are tall peaks');
  assert.ok(cur.bridge, 'the rope bridge joins them');
  assert.deepEqual([nest.view().feather.id, nest.view().crossed], ['pluma-1', false]);
  ctx.missions.abandon && ctx.missions.abandon();
  nest.sync();
  assert.equal(nest.current(), null);
  assert.equal(nest.view(), null);
});

test('the whole mission in order: pick up la pluma -> arriba on the summit -> cross el puente -> the nest', () => {
  const ctx = startAguila(setup());
  const { nest, said, SA, cheers } = ctx, cur = nest.current();
  const m = ctx.missions.active().mission;
  // 1: far from the feather nothing happens; the compass points at it.
  frame(ctx, { x: cur.feather.x + 20, z: cur.feather.z, y: 0 });
  assert.equal(kind(ctx).kind, 'collect');
  assert.deepEqual(JSON.parse(JSON.stringify(nest.target(kind(ctx)))), { x: cur.feather.x, z: cur.feather.z, role: 'item', id: 'pluma-1' });
  assert.equal(SA.inventory.has('pluma'), false);
  // The summit and the nest do not count yet (wrong step).
  frame(ctx, { x: cur.summit.x, z: cur.summit.z, y: cur.summit.y });
  assert.equal(kind(ctx).kind, 'collect');
  frame(ctx, { x: cur.feather.x, z: cur.feather.z, y: cur.feather.y });
  assert.equal(SA.inventory.has('pluma'), true, 'the feather goes into the inventory');
  assert.ok(said.includes('item:pluma'), 'la pluma is spoken');
  assert.equal(kind(ctx).place, 'cima');
  assert.equal(nest.view().feather, null, 'picked up: it no longer lies there');
  // 2: the summit of the grey peak, with the compass on it.
  assert.deepEqual(JSON.parse(JSON.stringify(nest.target(kind(ctx)))), { x: cur.summit.x, z: cur.summit.z, role: 'place', id: 'cima' });
  frame(ctx, { x: cur.summit.x + 12, z: cur.summit.z, y: SA.map.groundHeight(cur.summit.x + 12, cur.summit.z) });
  assert.equal(kind(ctx).place, 'cima', 'at the foot of the peak is not the top');
  frame(ctx, { x: cur.summit.x, z: cur.summit.z, y: cur.summit.y });
  assert.deepEqual(Array.from(said.slice(-2)), Array.from(m.nest.say.summit), 'arriba and la montaña');
  assert.equal(kind(ctx).place, 'nido-aguila');
  // 3: the nest peak only counts after crossing the bridge; the compass points at the bridge first.
  assert.equal(nest.locate('nido-aguila'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(nest.target(kind(ctx)))), { x: cur.bridge.x, z: cur.bridge.z, role: 'place', id: 'nido-aguila' });
  frame(ctx, { x: cur.nest.x, z: cur.nest.z, y: cur.nest.y });
  assert.equal(kind(ctx).place, 'nido-aguila', 'standing on the far peak without the bridge does not count');
  frame(ctx, { x: cur.bridge.x, z: cur.bridge.z, y: SA.map.groundHeight(cur.bridge.x, cur.bridge.z) });
  assert.equal(nest.current().crossed, false, 'walking under the bridge is not crossing it');
  frame(ctx, { x: cur.bridge.x, z: cur.bridge.z, y: cur.bridge.y });
  assert.equal(nest.current().crossed, true);
  assert.equal(said.at(-1), 'thing:puente', 'el puente is spoken');
  assert.deepEqual(JSON.parse(JSON.stringify(nest.target(kind(ctx)))), { x: cur.nest.x, z: cur.nest.z, role: 'place', id: 'nido-aguila' });
  frame(ctx, { x: cur.nest.x, z: cur.nest.z, y: cur.nest.y });
  assert.equal(cheers.length, 0, 'the nest is not the last step any more: the feather goes to the chick next');
  assert.equal(kind(ctx).kind, 'give');
  assert.equal(said.at(-1), 'thing:nido');
  assert.ok(ctx.tracked.some((t) => t[0] === 'nest.feather') && ctx.tracked.some((t) => t[0] === 'nest.bridge'));
});

test('a reload past the feather leaves none lying; small tasks pause while the mission runs', () => {
  const ctx = startAguila(setup());
  ctx.missions.advance();
  ctx.nest.sync();
  ctx.nest.update({ x: 0, z: 0, y: 0 });
  assert.equal(ctx.nest.view().feather, null);
  assert.equal(ctx.nest.target({ kind: 'find', target: 'x' }), null);
  const focus = ctx.SA.focus.create({ missions: ctx.missions });
  assert.equal(focus.active(), 'mission');
  assert.equal(focus.allowsSmall(), false);
});

// Plays the mission up to the give step (feather in the bag, standing on the nest peak).
function toGive(ctx) {
  const cur = ctx.nest.current();
  frame(ctx, { x: cur.feather.x, z: cur.feather.z, y: cur.feather.y });
  frame(ctx, { x: cur.summit.x, z: cur.summit.z, y: cur.summit.y });
  frame(ctx, { x: cur.bridge.x, z: cur.bridge.z, y: cur.bridge.y });
  const at = { x: cur.nest.x, z: cur.nest.z, y: cur.nest.y };
  frame(ctx, at);
  assert.equal(kind(ctx).kind, 'give');
  return at;
}

test('give: the feather leaves the bag, the chick flies (volar is spoken in the air) and the step moves on to the photo', () => {
  let clock = 1000;
  const ctx = startAguila(setup(() => clock));
  const { nest, said, SA, tracked } = ctx;
  const at = toGive(ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(nest.target(kind(ctx)))), { x: nest.spots().chick.x, z: nest.spots().chick.z, role: 'animal', id: 'aguila' });
  assert.deepEqual([nest.view().flight, nest.view().flown], [null, false]);
  assert.equal(SA.inventory.has('pluma'), true);
  const r = nest.give(at);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: true });
  assert.equal(SA.inventory.has('pluma'), false, 'removed from the inventory');
  assert.equal(kind(ctx).kind, 'photo', 'the step advanced to the summit photo');
  assert.ok(said.includes('item:pluma'));
  assert.equal(said.includes('phrase:volar'), false, 'not yet: the chick is still flapping on the spot');
  assert.ok(tracked.some((t) => t[0] === 'nest.give'));
  clock += 500;
  assert.equal(nest.view().flight, 0.5);
  assert.equal(nest.give(at).reason, 'busy', 'a second tap during the flight does nothing');
  clock += 1200;                                   // 1.7 s in: past the flap phase, the loop begins
  nest.update(at);
  assert.equal(said.filter((k) => k === 'phrase:volar').length, 1, 'volar is spoken as it flies');
  assert.equal(SA.vocab.get('phrase:volar').es, 'volar');
  nest.update(at);
  assert.equal(said.filter((k) => k === 'phrase:volar').length, 1, 'only once');
  assert.ok(nest.view().flight > 1.4);
  clock += SA.flight.DURATION * 1000;
  assert.equal(nest.view().flight, null, 'landed again');
  assert.equal(nest.view().flown, true);
  assert.equal(nest.give(at).reason, 'step', 'nothing left to give');
});

test('give: early, far or empty-handed taps are gentle: the chick wobbles, a cue is spoken, nothing is lost', () => {
  let clock = 1000;
  const ctx = startAguila(setup(() => clock));
  const { nest, said, SA } = ctx, cur = nest.current();
  frame(ctx, { x: cur.feather.x, z: cur.feather.z, y: cur.feather.y });
  assert.equal(nest.give({ x: cur.nest.x, z: cur.nest.z, y: cur.nest.y }).reason, 'step', 'too early: still climbing');
  assert.ok(nest.view().nudge !== null, 'it wobbles');
  assert.equal(SA.inventory.has('pluma'), true, 'the feather stays in the bag');
  assert.equal(kind(ctx).place, 'cima');
  clock += 800;
  assert.equal(nest.view().nudge, null, 'the wobble ends');
  frame(ctx, { x: cur.summit.x, z: cur.summit.z, y: cur.summit.y });
  frame(ctx, { x: cur.bridge.x, z: cur.bridge.z, y: cur.bridge.y });
  frame(ctx, { x: cur.nest.x, z: cur.nest.z, y: cur.nest.y });
  assert.equal(nest.give({ x: cur.nest.x - 30, z: cur.nest.z, y: 0 }).reason, 'far');
  assert.equal(said.at(-1), 'phrase:acercate');
  assert.equal(kind(ctx).kind, 'give');
  SA.inventory.remove('pluma');                    // empty-handed: it looks for la pluma
  assert.equal(nest.give({ x: cur.nest.x, z: cur.nest.z, y: cur.nest.y }).reason, 'noitem');
  assert.equal(said.at(-1), 'item:pluma');
  assert.equal(kind(ctx).kind, 'give', 'still waiting, nobody is punished');
  assert.equal(nest.view().flight, null);
});

test('give: the photo after the flight completes the mission; with no mission there is nothing to give', () => {
  const ctx = startAguila(setup(() => 1000));
  const at = toGive(ctx);
  ctx.nest.give(at);
  assert.equal(ctx.rt.report({ type: 'photo', target: 'cualquiera' }).status, 'complete');
  assert.equal(ctx.cheers.length, 1);
  assert.equal(ctx.missions.active(), null);
  assert.equal(setup().nest.give({ x: 0, z: 0 }).reason, 'none');
  assert.equal(setup().nest.spots(), null);
});

test('spots: mamá and the chick sit in the bowl beside the nest peak top', () => {
  const ctx = startAguila(setup());
  const sp = ctx.nest.spots(), cur = ctx.nest.current();
  assert.ok(Math.hypot(sp.chick.x - cur.nest.x, sp.chick.z - cur.nest.z) < 2 && Math.hypot(sp.mama.x - sp.chick.x, sp.mama.z - sp.chick.z) > 0.2);
  assert.ok(Math.abs(sp.chick.y - cur.nest.y) < 0.5);
});
