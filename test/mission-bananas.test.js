// AS-0326: Mission 4 core (la fiesta del mono): the data row, the collect step counting, the banana pickups that exist only during the
// mission, the compass targets, and the crown handed over by the scientist. Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js',
  'game/carry.js', 'game/mission-bananas.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [], gives = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const bananas = SA.missionBananas.create({ missions, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e) });
  rt = SA.missionRuntime.create({ missions, thing: bananas, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  rt.onGive = (id) => gives.push(id);
  SA.audio = { say: (k) => said.push(k) };
  return { SA, missions, bananas, rt, said, tracked, cheers, gives };
}

function startFiesta(ctx) {
  for (const id of ['mama', 'huevo', 'rio']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  const r = ctx.missions.start('fiesta');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.bananas.sync();
  return ctx;
}
const on = (b) => ({ x: b.x, z: b.z, y: b.y });

test('data: mission 4 follows mission 3, a one-line intro of <= 4 words, steps collect 3 bananas then ask for the crown', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[3];
  assert.equal(m.n, 4);
  assert.equal(m.id, 'fiesta');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.equal(m.intro.es, '¡Feliz cumpleaños, mono!');
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)).slice(0, 2), ['collect', 'talk']);   // AS-0327 adds the invite steps after the crown
  assert.deepEqual([m.steps[0].item, m.steps[0].n, m.bananas.item, m.bananas.n], ['platano', 3, 'platano', 3]);
  assert.equal(m.steps[0].line.es, 'Recoge 3 plátanos');
  assert.equal(m.steps[1].line.es, 'Pide la corona');
  assert.equal(m.steps[1].gives, 'corona');
  SA.missionRun.validate(m.steps);
});

test('data: validation rejects a bad bananas spec and a bad gives', () => {
  const { SA } = setup();
  const row = (extra, stepExtra) => ({ id: 'x', n: 9, es: 'X', en: 'X', icon: '🍌', intro: { es: 'Hola', icon: '🍌' },
    steps: [Object.assign({ kind: 'collect', item: 'a', n: 1, line: { es: 'Recoge', icon: '🍌' } }, stepExtra)], reward: { stars: 1 }, ...extra });
  assert.throws(() => SA.data.register('missions', [row({ bananas: { item: 'a', n: 0 } })]), /bananas\.n/);
  assert.throws(() => SA.data.register('missions', [row({ bananas: { item: 'A b', n: 2 } })]), /bananas\.item/);
  assert.throws(() => SA.data.register('missions', [row({ bananas: [] })]), /bananas/);
  assert.throws(() => SA.data.register('missions', [row({}, { gives: 'La Corona' })]), /gives/);
});

test('vocab: the party words have the right articles, and uno / dos / tres exist', () => {
  const { SA } = setup();
  const es = (k) => SA.vocab.get(k).es;
  assert.deepEqual(['thing:cumpleanos', 'thing:regalo', 'thing:platanos', 'thing:fiesta', 'thing:corona'].map(es),
    ['el cumpleaños', 'el regalo', 'los plátanos', 'la fiesta', 'la corona']);
  assert.deepEqual(['number:1', 'number:2', 'number:3'].map(es), ['uno', 'dos', 'tres']);
});

test('mission 4 is locked until mission 3 is done, then it is the next card', () => {
  const { missions } = setup();
  assert.equal(missions.status('fiesta'), 'locked');
  for (const id of ['mama', 'huevo']) { missions.start(id); missions.complete(); }
  assert.equal(missions.status('fiesta'), 'locked');
  missions.start('rio'); missions.complete();
  assert.equal(missions.status('fiesta'), 'available');
  assert.equal(missions.next().id, 'fiesta');
});

test('place: 3 dry pickups in the selva, spread apart and deterministic per seed', () => {
  const { SA } = setup();
  const spec = { item: 'platano', n: 3, biome: 'selva' };
  const range = SA.map.biomeRange('selva');
  for (let seed = 1; seed <= 30; seed++) {
    const r = SA.missionBananas.place(spec, seed, { solids: [] });
    assert.ok(r && r.length === 3, `seed ${seed}`);
    for (const p of r) {
      assert.ok(p.x > range.lo && p.x < range.hi, 'inside the selva');
      assert.equal(SA.map.isWater(p.x, p.z), false);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(r[i].x - r[j].x, r[i].z - r[j].z) >= 9);
    assert.equal(JSON.stringify(SA.missionBananas.place(spec, seed, { solids: [] })), JSON.stringify(r));
  }
  assert.equal(SA.missionBananas.place({ item: 'a', n: 2, biome: 'nowhere' }, 1), null);
});

test('place keeps clear of solids', () => {
  const { SA } = setup();
  const spec = { item: 'platano', n: 3, biome: 'selva' };
  const solids = [[20, 0, 4], [30, 10, 4], [25, -15, 4]];
  const r = SA.missionBananas.place(spec, 5, { solids });
  assert.ok(r);
  for (const p of r) for (const s of solids) assert.ok(Math.hypot(p.x - s[0], p.z - s[1]) >= s[2]);
});

test('the pickups exist only while mission 4 runs', () => {
  const ctx = setup();
  assert.equal(ctx.bananas.sync(), null);
  assert.equal(ctx.bananas.visible().length, 0);
  startFiesta(ctx);
  assert.equal(ctx.bananas.visible().length, 3);
  ctx.missions.abandon();
  assert.equal(ctx.bananas.sync(), null);
  assert.equal(ctx.bananas.visible().length, 0);
  assert.equal(ctx.bananas.locate('platano'), null);
  // another mission never has any
  ctx.missions.start('mama');
  assert.equal(ctx.bananas.sync(), null);
});

test('collect: each pickup counts up, speaks uno / dos / tres, and the 3rd advances to the crown step', () => {
  const ctx = startFiesta(setup());
  const items = ctx.bananas.current().items.slice();
  ctx.bananas.update({ x: items[0].x + 6, z: items[0].z });     // too far: nothing
  assert.equal(ctx.bananas.visible().length, 3);
  ctx.bananas.update(on(items[0]));
  assert.deepEqual(ctx.said, ['number:1']);
  assert.equal(ctx.bananas.visible().length, 2);
  assert.equal(ctx.missions.active().step, 0);
  ctx.bananas.update(on(items[0]));                              // the same spot again is empty: no double count
  assert.equal(ctx.said.length, 1);
  ctx.bananas.update(on(items[1]));
  assert.deepEqual(ctx.said, ['number:1', 'number:2']);
  ctx.bananas.update(on(items[2]));
  assert.deepEqual(ctx.said, ['number:1', 'number:2', 'number:3']);
  assert.equal(ctx.missions.active().step, 1);
  assert.equal(ctx.missions.active().stepData.kind, 'talk');
  assert.equal(ctx.bananas.visible().length, 0);
});

test('collect: walking through the runtime update also picks them up', () => {
  const ctx = startFiesta(setup());
  const items = ctx.bananas.current().items.slice();
  ctx.rt.update(on(items[0]));
  assert.equal(ctx.rt.report({ type: 'collected', item: 'platano' }).status, 'progress');   // one more via the event: 2 now
  assert.equal(ctx.missions.active().step, 0);
});

test('a reload on the crown step leaves no bananas standing and does not re-count', () => {
  const ctx = startFiesta(setup());
  ctx.rt.report({ type: 'collected', item: 'platano' }); ctx.rt.report({ type: 'collected', item: 'platano' }); ctx.rt.report({ type: 'collected', item: 'platano' });
  assert.equal(ctx.missions.active().stepData.kind, 'talk');
  ctx.bananas.update({ x: 0, z: 0 });
  assert.equal(ctx.bananas.visible().length, 0);
});

test('compass: the collect step points at the nearest banana, the crown step at the scientist', () => {
  const ctx = startFiesta(setup());
  const items = ctx.bananas.current().items.slice();
  ctx.bananas.update({ x: items[1].x + 5, z: items[1].z });       // stand near item 1 (not close enough to pick it)
  const t = ctx.rt.target();
  assert.equal(t.id, items[1].id);
  assert.equal(t.role, 'item');
  ctx.bananas.update(on(items[1]));
  assert.notEqual(ctx.rt.target().id, items[1].id);               // the taken one is no longer a target
  for (const i of [items[0], items[2]]) ctx.bananas.update(on(i));
  const sci = ctx.SA.npc.scientist();
  const c = ctx.rt.target();
  assert.deepEqual([c.x, c.z, c.id], [sci.x, sci.z, 'scientist']);
});

test('talking to the scientist gives the crown (spoken + cheered) and completes the mission once', () => {
  const ctx = startFiesta(setup());
  assert.equal(ctx.rt.report({ type: 'talked', who: 'scientist' }).status, 'ignored');   // too early: still collecting
  assert.deepEqual(ctx.gives, []);
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  assert.equal(ctx.rt.report({ type: 'talked', who: 'scientist' }).status, 'step');
  assert.equal(ctx.rt.report({ type: 'invited', animal: 'conejo' }).status, 'step');
  assert.equal(ctx.rt.report({ type: 'invited', animal: 'ciervo' }).status, 'step');
  assert.equal(ctx.rt.report({ type: 'arrived', place: 'arbol-mono' }).status, 'step');
  assert.equal(ctx.rt.report({ type: 'partied', place: 'arbol-mono' }).status, 'step');
  const r = ctx.rt.report({ type: 'photo', target: 'mono' });
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'fiesta');
  assert.equal(r.firstTime, true);
  assert.deepEqual(ctx.gives, ['corona']);
  assert.ok(ctx.said.includes('thing:corona'));
  assert.equal(ctx.cheers.length, 1);
  assert.equal(ctx.missions.status('fiesta'), 'done');
  assert.equal(ctx.missions.active(), null);
  assert.equal(ctx.bananas.sync(), null);
  assert.equal(ctx.rt.report({ type: 'arrived', place: 'arbol-mono' }).status, 'none');
  assert.equal(ctx.gives.length, 1);
});

test('a replay scatters fresh bananas and gives no second reward', () => {
  const ctx = startFiesta(setup());
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  ctx.rt.report({ type: 'talked', who: 'scientist' });
  ctx.rt.report({ type: 'invited', animal: 'conejo' }); ctx.rt.report({ type: 'invited', animal: 'ciervo' }); ctx.rt.report({ type: 'arrived', place: 'arbol-mono' });
  ctx.rt.report({ type: 'partied', place: 'arbol-mono' }); ctx.rt.report({ type: 'photo', target: 'mono' });
  const r = ctx.missions.start('fiesta');
  assert.equal(r.replay, true);
  ctx.bananas.sync();
  assert.equal(ctx.bananas.visible().length, 3);
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  ctx.rt.report({ type: 'talked', who: 'scientist' });
  ctx.rt.report({ type: 'invited', animal: 'conejo' }); ctx.rt.report({ type: 'invited', animal: 'ciervo' });
  ctx.rt.report({ type: 'arrived', place: 'arbol-mono' }); ctx.rt.report({ type: 'partied', place: 'arbol-mono' });
  const done = ctx.rt.report({ type: 'photo', target: 'mono' });
  assert.equal(done.status, 'complete');
  assert.equal(done.firstTime, false);
  assert.equal(done.reward, null);
});
