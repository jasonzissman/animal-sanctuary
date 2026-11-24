// AS-0352: Mission 9 slice 3: the 'place' step kind. Sticks below, leaves on top, soft grass inside: the spoken directions, the right item taken from the bag,
// a gentle wrong-item reaction that loses nothing, the finished home and the family moving in. Pure logic in node:vm, no THREE.
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
  const said = [], tracked = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const home = SA.missionHome.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), photo: { record: () => {} }, rescueLog: SA.rescueLog.create({}) });
  rt = SA.missionRuntime.create({ missions, thing: home, spawn: null, celebrate: () => {}, track: () => {} });
  return { SA, missions, home, rt, said, tracked };
}

const step = (c) => c.missions.active().stepData;
const json = (v) => JSON.parse(JSON.stringify(v));

// Starts Mission 9 with the materials already in the bag (the gather steps are tested in mission-gather.test.js) and walks to the spot: the first place step is current.
function atSpot(c) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones']) { c.missions.start(id); c.missions.complete(); }
  assert.equal(c.missions.start('hogar').ok, true);
  c.home.sync();
  while (step(c).kind === 'collect') c.rt.report({ type: 'collected', item: step(c).item });
  c.SA.inventory.add('palo', 3); c.SA.inventory.add('hoja', 3); c.SA.inventory.add('hierba', 1);
  const s = c.home.current().spot;
  c.me = { x: s.x + 1, z: s.z + 1, y: s.y };
  c.home.update(c.me); c.rt.update(c.me);       // the goTo completes ...
  assert.equal(step(c).kind, 'place');
  c.home.update(c.me);                          // ... and the next frame speaks the first direction
  return c;
}

test('data: the place kind is a row; mission 9 has sticks abajo, leaves encima, grass dentro with short Spanish lines; bad rows are rejected', () => {
  const { SA } = setup();
  const m = SA.data.get('missions', 'hogar');
  const places = m.steps.filter((s) => s.kind === 'place');
  assert.deepEqual(Array.from(places.map((s) => [s.item, s.layer, s.n])), [['palo', 'abajo', 3], ['hoja', 'encima', 3], ['hierba', 'dentro', 1]]);
  assert.deepEqual(Array.from(places.map((s) => s.line.es)), ['Pon los palos abajo', 'Pon las hojas encima', 'Pon la hierba dentro']);
  places.forEach((s) => assert.equal(s.place, m.home.place));
  assert.ok(m.steps.indexOf(places[0]) > m.steps.findIndex((s) => s.kind === 'goTo'), 'the place steps follow the goTo');
  for (const k of ['phrase:abajo', 'phrase:encima', 'phrase:dentro', 'phrase:construir', m.home.say.built]) assert.ok(SA.vocab.get(k), k);
  SA.missionRun.validate(m.steps);
  assert.throws(() => SA.missionRun.validate([{ kind: 'place', item: 'palo', place: 'hogar', line: {} }]), /layer/);
  const row = (step, home = { place: m.home.place, family: m.home.family }) =>({ id: 'x' + Math.random().toString(36).slice(2, 7), n: 99, es: 'X', en: 'X', icon: '🏡', intro: { es: 'Hola', icon: '🏡' }, home,
    steps: [step], reward: { stars: 1 } });
  const line = { es: 'Pon', icon: '🪵' };
  assert.doesNotThrow(() => SA.data.register('missions', [row({ kind: 'place', item: 'palo', layer: 'abajo', place: 'hogar', line })]));
  assert.throws(() => SA.data.register('missions', [row({ kind: 'place', item: 'palo', layer: 'arriba', place: 'hogar', line })]), /layer/);
  assert.throws(() => SA.data.register('missions', [row({ kind: 'place', item: 'palo', layer: 'abajo', place: 'otro', line })]), /place/);
  assert.throws(() => SA.data.register('missions', [row({ kind: 'place', item: 'palo', n: 0, layer: 'abajo', place: 'hogar', line })]), /\.n/);
  const noHome = row({ kind: 'place', item: 'palo', layer: 'abajo', place: 'hogar', line });
  delete noHome.home;
  assert.throws(() => SA.data.register('missions', [noHome]), /place/, 'a place step needs the mission to declare a home');
});

test('each place step speaks its direction (construir first) and puts its item in hand; the compass points at the spot', () => {
  const c = atSpot(setup());
  const s = c.home.current().spot;
  assert.ok(c.said.includes('phrase:construir') && c.said.includes('phrase:abajo'));
  assert.equal(c.SA.inventory.equipped(), 'palo', 'the sticks are in hand');
  assert.deepEqual(json(c.rt.target()), { x: s.x, z: s.z, role: 'place', id: 'hogar' });
  const n = c.said.length;
  c.home.update(c.me); c.home.update(c.me);
  assert.equal(c.said.length, n, 'a direction is spoken once per step, not every frame');
  assert.deepEqual(json(c.home.view()), { photo: false, arrived: true, place: true, placed: 0, total: 3, layers: [], built: false, wobbles: 0 });
});

test('the right item: tapping the spot takes it from the bag, adds the next layer in order and speaks the next direction', () => {
  const c = atSpot(setup());
  const inv = c.SA.inventory;
  let r = c.home.put(c.me);
  assert.deepEqual(json(r), { ok: true, layer: 'abajo' });
  assert.equal(inv.count('palo'), 0, 'three sticks consumed');
  assert.equal(inv.count('hoja'), 3, 'nothing else touched');
  assert.deepEqual(json(c.home.view().layers), ['abajo']);
  assert.equal(step(c).item, 'hoja');
  c.home.update(c.me);
  assert.ok(c.said.includes('phrase:encima'));
  assert.equal(inv.equipped(), 'hoja');
  assert.ok(c.said.includes('sfx:pop'));
  r = c.home.put(c.me);
  assert.equal(r.layer, 'encima');
  assert.deepEqual(json(c.home.view().layers), ['abajo', 'encima']);
  c.home.update(c.me);
  assert.ok(c.said.includes('phrase:dentro'));
  assert.equal(c.home.view().built, false);
  assert.ok(!c.said.includes('sfx:sparkle'));
  r = c.home.put(c.me);
  assert.equal(r.layer, 'dentro');
  assert.equal(inv.count('hierba'), 0);
  assert.deepEqual(json(c.home.view()), { photo: true, arrived: true, place: false, placed: 3, total: 3, layers: ['abajo', 'encima', 'dentro'], built: true, wobbles: 0 });
  assert.equal(step(c).kind, 'photo', 'the photo step follows the finished home');
  assert.ok(c.said.includes('sfx:sparkle'), 'cheered');
  assert.equal(c.said.filter((k) => k === 'thing:casa').length, 2, 'la casa at the spot, and again when the home is built');
  assert.ok(c.tracked.some(([n]) => n === 'home.built'));
  assert.equal(c.home.put(c.me).reason, 'step', 'nothing to place any more');
});

test('the wrong item gets a gentle boing and a wobble; nothing is lost and the step stays current', () => {
  const c = atSpot(setup());
  const inv = c.SA.inventory;
  assert.equal(inv.equip('hoja'), true);           // leaves in hand, but the sticks come first
  const r = c.home.put(c.me);
  assert.deepEqual(json(r), { ok: false, reason: 'wrong' });
  assert.ok(c.said.includes('sfx:boing'));
  assert.equal(c.home.view().wobbles, 1);
  assert.deepEqual([inv.count('palo'), inv.count('hoja'), inv.count('hierba')], [3, 3, 1], 'nothing lost');
  assert.equal(step(c).item, 'palo');
  assert.deepEqual(json(c.home.view().layers), []);
  inv.unequip();                                   // empty hands: also just a wobble
  assert.equal(c.home.put(c.me).reason, 'wrong');
  assert.equal(c.home.view().wobbles, 2);
  assert.equal(inv.count('palo'), 3);
  assert.equal(inv.equip('palo'), true);           // then the right one works
  assert.equal(c.home.put(c.me).ok, true);
  assert.equal(inv.count('palo'), 0);
});

test('too far away only asks to come closer; a bag that came up short still builds (never stuck)', () => {
  const c = atSpot(setup());
  const s = c.home.current().spot, inv = c.SA.inventory;
  assert.deepEqual(json(c.home.put({ x: s.x + 40, z: s.z })), { ok: false, reason: 'far' });
  assert.ok(c.said.includes('phrase:acercate'));
  assert.equal(inv.count('palo'), 3);
  inv.remove('palo', 3);                           // a stick was fed away or lost
  assert.equal(c.home.put(c.me).ok, true, 'still counts');
  assert.deepEqual(json(c.home.view().layers), ['abajo']);
});

test('the family has a place inside the finished home, near the spot centre; the layers survive a reload mid-build', () => {
  const c = atSpot(setup());
  const cur = c.home.current();
  for (const f of cur.family) {
    assert.ok(Math.hypot(f.inside.x - cur.spot.x, f.inside.z - cur.spot.z) < 1.3, 'inside the walls, not outside (' + f.role + ')');
    assert.ok(Math.hypot(f.x - cur.spot.x, f.z - cur.spot.z) > Math.hypot(f.inside.x - cur.spot.x, f.inside.z - cur.spot.z), 'they walk inward');
  }
  assert.equal(new Set(cur.family.map((f) => f.inside.x.toFixed(2) + ',' + f.inside.z.toFixed(2))).size, 4, 'four different spots');
  c.home.put(c.me);
  const again = SAfresh(c);        // the same save, a new module instance: the placed layer is derived from the mission step
  assert.deepEqual(json(again.view().layers), ['abajo']);
});

function SAfresh(c) {
  const h = c.SA.missionHome.create({ missions: c.missions, audio: { say() {}, sfx() {} }, report: (e) => c.rt.report(e) });
  h.sync();
  return h;
}
