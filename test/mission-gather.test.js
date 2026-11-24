// AS-0351: Mission 9, slice 2: the three collect steps (sticks, leaves, soft grass) and their mission-only pickups around the build spot.
// Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-home.js', 'game/mission-bananas.js', 'game/mission-gather.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const audio = { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) };
  const home = SA.missionHome.create({ missions, audio, track: () => {}, report: (e) => rt.report(e) });
  const gather = SA.missionGather.create({ missions, audio, track: (t, f) => tracked.push([t, f]), report: (e) => rt.report(e), home });
  const thing = { update: (p) => { gather.update(p); home.update(p); }, locate: (id) => gather.locate(id) || home.locate(id),
    target: (s) => gather.target(s) || home.target(s) };
  rt = SA.missionRuntime.create({ missions, thing, spawn: null, celebrate: () => {}, track: () => {} });
  return { SA, missions, home, gather, rt, said, tracked };
}

function startHogar(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones']) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); }
  assert.equal(ctx.missions.start('hogar').ok, true);
  ctx.gather.sync();
  return ctx;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const step = (ctx) => ctx.missions.active().stepData;
const on = (p) => ({ x: p.x, z: p.z, y: p.y });
const standing = (ctx) => ctx.gather.things().map((t) => ({ item: t.current() && t.current().spec.item, shown: t.shown(), n: t.visible().length }));
const ofItem = (ctx, item) => ctx.gather.things().find((t) => t.current() && t.current().spec.item === item);

test('data: Mission 9 starts with three collect steps (palos, hojas, hierba) before the goTo, each a short line with an icon; the row validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[8];
  assert.equal(m.id, 'hogar');
  const kinds = Array.from(m.steps.map((s) => s.kind));
  assert.deepEqual(kinds, ['collect', 'collect', 'collect', 'goTo', 'photo'], 'the collects come before the goTo; the photo still ends it');
  assert.deepEqual(plain(m.steps.slice(0, 3).map((s) => [s.item, s.n, s.line.es, s.line.icon])),
    [['palo', 3, 'Recoge 3 palos', '🪵'], ['hoja', 3, 'Recoge 3 hojas', '🍃'], ['hierba', 1, 'Recoge la hierba', '🌾']]);
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon));
  SA.missionRun.validate(m.steps);
  assert.deepEqual(Array.from(m.home.gather.map((g) => [g.item, g.n])), [['palo', 3], ['hoja', 3], ['hierba', 1]]);
});

test('data: the items are stackable finds with a hand model and the right article; their spoken word is item:<id>', () => {
  const { SA } = setup();
  const want = { palo: 'el palo', hoja: 'la hoja', hierba: 'la hierba' };
  for (const [id, es] of Object.entries(want)) {
    const it = SA.data.get('items', id);
    assert.equal(it.name.es, es);
    assert.deepEqual([it.kind, it.stackable], ['find', true]);
    assert.ok(SA.data.get('handmodels', id), 'a procedural low-poly model');
    assert.equal(SA.vocab.get('item:' + id).es, es);
  }
});

test('data: home.gather is validated with clear errors and needs a matching collect step', () => {
  const { SA } = setup();
  let n = 0;
  const base = { place: 'hogar', family: { adult: 'conejo', baby: 'conejito', babies: 2 } };
  const row = (gatherList, steps) => ({ id: 'g9' + (n++), n: 99, es: 'X', en: 'X', icon: '🏡', intro: { es: 'Hola', icon: '🏡' }, home: { ...base, gather: gatherList },
    steps: steps || [{ kind: 'collect', item: 'palo', n: 2, line: { es: 'Recoge palos', icon: '🪵' } }, { kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row([{ item: 'palo', n: 2 }])]));
  assert.throws(() => SA.data.register('missions', [row([])]), /home\.gather/);
  assert.throws(() => SA.data.register('missions', [row('x')]), /home\.gather/);
  assert.throws(() => SA.data.register('missions', [row([{ item: 'Palo', n: 2 }])]), /gather\[0\]\.item/);
  assert.throws(() => SA.data.register('missions', [row([{ item: 'palo', n: 0 }])]), /gather\[0\]\.n/);
  assert.throws(() => SA.data.register('missions', [row([{ item: 'palo', n: 2, say: 3 }])]), /gather\[0\]\.say/);
  assert.throws(() => SA.data.register('missions', [row([{ item: 'hoja', n: 2 }])]), /matching collect step/);
  assert.throws(() => SA.data.register('missions', [row([{ item: 'palo', n: 5 }])]), /matching collect step/);
});

test('mission-only: nothing stands before Mission 9, while another mission runs, or after it ends or is abandoned', () => {
  const ctx = setup();
  assert.equal(ctx.gather.visible().length, 0);
  ctx.gather.update({ x: 0, z: 0 });
  assert.deepEqual(plain(standing(ctx).map((t) => t.item)), [null, null, null, null], 'no mission: no pickups');
  ctx.missions.start('mama');
  ctx.gather.update({ x: 0, z: 0 });
  assert.equal(ctx.gather.things().every((t) => t.current() === null), true, 'another mission: no pickups');
  ctx.missions.complete();
  startHogar(ctx);
  assert.deepEqual(plain(standing(ctx).map((t) => t.item)), ['palo', 'hoja', 'hierba', null]);
  ctx.missions.abandon();
  ctx.gather.sync();
  assert.equal(ctx.gather.things().every((t) => t.current() === null), true, 'abandoned: gone');
  assert.equal(ctx.gather.visible().length, 0);
});

test('mission-only: they lie in a ring around the build spot on dry ground, deterministic per run, one kind per step', () => {
  const ctx = startHogar(setup());
  const { SA, home, gather } = ctx, s = home.current().spot;
  for (const t of gather.things().slice(0, 3)) {
    const c = t.current();
    assert.equal(c.items.length, c.spec.n);
    for (const it of c.items) {
      const d = Math.hypot(it.x - s.x, it.z - s.z);
      assert.ok(d >= 7.9 && d <= 16.1, 'near the spot but clear of the family: ' + d);
      assert.equal(SA.map.isWater(it.x, it.z), false);
      assert.equal(SA.map.biomeAt(it.x), 'bosque');
    }
  }
  const [a, b, c] = gather.things().slice(0, 3).map((t) => t.current().items);
  for (const [p, q] of [[a, b], [a, c], [b, c]]) for (const i of p) for (const j of q) assert.ok(Math.hypot(i.x - j.x, i.z - j.z) >= 3.2, 'kinds keep apart: finishing one never auto-picks the next');
  const again = SA.missionBananas.place({ item: 'palo', n: 3, biome: 'bosque' }, ctx.missions.active().seed, { anchor: { x: s.x, z: s.z } });
  assert.deepEqual(plain(again.map((i) => [i.x, i.z])), plain(ofItem(ctx, 'palo').current().items.map((i) => [i.x, i.z])));
});

test('the flow: each kind appears only on its own step; picking up counts, goes into the bag and speaks the word; then goTo and the photo', () => {
  const ctx = startHogar(setup());
  const { SA, gather, said, rt } = ctx, inv = SA.inventory;
  assert.equal(step(ctx).item, 'palo');
  assert.deepEqual(plain(standing(ctx).map((t) => t.shown)), [true, false, false, false], 'only the sticks stand on the sticks step');
  assert.equal(gather.visible().length, 3);
  assert.equal(rt.target().role, 'item', 'the compass points at the next stick');
  // walking over a leaf spot on the sticks step does nothing
  const leaf = ofItem(ctx, 'hoja').current().items[0];
  rt.update(on(leaf));
  assert.equal(inv.count('hoja'), 0);
  assert.equal(step(ctx).item, 'palo');
  // a tap/walk from a little way off still counts (generous reach)
  const sticks = ofItem(ctx, 'palo').current().items;
  rt.update({ x: sticks[0].x + 2.2, z: sticks[0].z });
  assert.equal(inv.count('palo'), 1);
  assert.equal(said[said.length - 1], 'item:palo', 'el palo is spoken');
  rt.update(on(sticks[0]));
  assert.equal(inv.count('palo'), 1, 'the same spot is empty: no double count');
  rt.update(on(sticks[1])); rt.update(on(sticks[2]));
  assert.equal(inv.count('palo'), 3);
  assert.equal(step(ctx).item, 'hoja', 'the sticks step is met');
  assert.deepEqual(plain(standing(ctx).map((t) => [t.item, t.shown, t.n]).slice(0, 3)), [['palo', false, 0], ['hoja', true, 3], ['hierba', false, 1]]);
  // leaves
  const leaves = ofItem(ctx, 'hoja').current().items;
  for (const l of leaves) rt.update(on(l));
  assert.equal(inv.count('hoja'), 3);
  assert.equal(said.filter((k) => k === 'item:hoja').length, 3);
  assert.equal(step(ctx).item, 'hierba');
  // grass: a single one
  rt.update(on(ofItem(ctx, 'hierba').current().items[0]));
  assert.equal(inv.count('hierba'), 1);
  assert.equal(said[said.length - 1], 'item:hierba');
  assert.equal(step(ctx).kind, 'goTo', 'after all three collects the mission moves on to the build spot');
  assert.equal(gather.visible().length, 0, 'nothing is left standing');
  const s = ctx.home.current().spot;
  assert.deepEqual(JSON.parse(JSON.stringify(rt.target())), { x: s.x, z: s.z, role: 'place', id: 'hogar' });
  rt.update({ x: s.x, z: s.z, y: s.y });
  assert.equal(step(ctx).kind, 'photo', 'then the photo, as before');
  assert.ok(ctx.tracked.some(([n, f]) => n === 'collect.pickup' && f.item === 'hierba'));
});

test('never punishing and never stuck: a wrong spot or a far walk loses nothing, and a reload past a step leaves nothing standing', () => {
  const ctx = startHogar(setup());
  const { gather, rt, missions } = ctx;
  rt.update({ x: 0, z: 0 });
  assert.equal(step(ctx).item, 'palo');
  assert.equal(ctx.said.length, 0, 'nothing happens and nothing is said');
  // skip straight to the goTo as a reload would (the run is on a later step): the pickups that are behind us are not left standing
  rt.report({ type: 'collected', item: 'palo' }); rt.report({ type: 'collected', item: 'palo' }); rt.report({ type: 'collected', item: 'palo' });
  rt.report({ type: 'collected', item: 'hoja' }); rt.report({ type: 'collected', item: 'hoja' }); rt.report({ type: 'collected', item: 'hoja' });
  rt.report({ type: 'collected', item: 'hierba' });
  assert.equal(step(ctx).kind, 'goTo');
  rt.update({ x: 0, z: 0 });
  assert.equal(gather.visible().length, 0);
  assert.equal(missions.active().id, 'hogar');
});

test('a replay draws fresh pickups on the first collect step again', () => {
  const ctx = startHogar(setup());
  ctx.missions.complete();
  ctx.gather.sync();
  assert.equal(ctx.gather.things().every((t) => t.current() === null), true);
  assert.equal(ctx.missions.start('hogar').replay, true);
  ctx.gather.sync();
  assert.equal(step(ctx).item, 'palo');
  assert.deepEqual(plain(standing(ctx).map((t) => t.shown)), [true, false, false, false]);
});
