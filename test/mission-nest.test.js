// AS-0336: Mission 6 core (El nido del águila): the data row and its validation, the feather near the trail that goes into the inventory, the summit
// climb and the rope-bridge crossing that advance the steps, the spoken vocab and the compass targets. Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/jump.js', 'game/perch.js', 'game/reach.js', 'game/climb.js', 'game/surfaces.js', 'game/rope-bridge.js', 'game/npc.js',
  'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js',
  'game/mission-pill.js', 'game/carry.js', 'game/mission-nest.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const nest = SA.missionNest.create({ missions, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), report: (e) => rt.report(e) });
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
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind + ':' + (s.item || s.place))), ['collect:pluma', 'goTo:cima', 'goTo:nido-aguila']);
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
  assert.equal(cheers.length, 1, 'the last step completes the mission');
  assert.equal(ctx.missions.active(), null);
  assert.equal(said.at(-1), 'thing:nido');
  assert.ok(ctx.tracked.some((t) => t[0] === 'nest.feather') && ctx.tracked.some((t) => t[0] === 'nest.bridge'));
});

test('a reload past the feather leaves none lying; small tasks pause while the mission runs', () => {
  const ctx = startAguila(setup());
  ctx.missions.advance();
  ctx.nest.sync();
  ctx.nest.update({ x: 0, z: 0, y: 0 });
  assert.equal(ctx.nest.view().feather, null);
  assert.equal(ctx.nest.target({ kind: 'photo' }), null);
  const focus = ctx.SA.focus.create({ missions: ctx.missions });
  assert.equal(focus.active(), 'mission');
  assert.equal(focus.allowsSmall(), false);
});
