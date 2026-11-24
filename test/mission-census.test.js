// AS-0341: Mission 7 (Censo de animales): the data row, the 'census' step kind, and SA.missionCensus (list on step start, fitting photos tick
// and speak the trait, a gentle reaction otherwise, the full list finishes the mission with its sticker, a replay draws a new list).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/album.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/data/badges.js', 'game/badges.js',
  'game/rescue-log.js', 'game/census.js', 'game/mission-census.js', 'game/mission-runtime.js'];

function setup(seed = 7) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], sfx = [], tracked = [], cheers = [], photos = [], misses = [], ticks = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  const rt = SA.missionRuntime.create({ missions, spawn: null, celebrate: (r) => cheers.push(r), track: () => {} });
  const log = SA.rescueLog.create({});
  const rng = SA.census.makeRng(seed);
  const census = SA.missionCensus.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => sfx.push(n) }, report: (e) => rt.report(e),
    rescueLog: log, photo: { record: (id) => photos.push(id) }, rng, track: (t, f) => tracked.push([t, f]) });
  const out = { SA, missions, rt, census, log, said, sfx, tracked, cheers, photos, misses, ticks };
  census.onMiss = (m) => misses.push(m);
  census.onTick = (t) => ticks.push(t);
  census.onSticker = (e) => (out.sticker = e);
  return out;
}

function startCensus(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  const r = ctx.missions.start('censo');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.census.sync();
  return ctx;
}

const animals = (SA) => SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
const fitting = (SA, entry) => animals(SA).filter((a) => SA.census.matches(a, entry));
const misfit = (SA, list) => animals(SA).find((a) => !list.entries.some((e) => SA.census.matches(a, e)));

// Photograph distinct fitting animals until every entry is done; returns the last result.
function finishList(ctx) {
  let last = null;
  for (const e of ctx.census.view().list.entries) {
    for (const a of fitting(ctx.SA, e)) {
      if (last && last.status === 'done') break;
      last = ctx.census.photo(a.id);
    }
  }
  return last;
}

test('the Mission 7 row validates, follows Mission 6 and has a single short intro line', () => {
  const { SA, missions } = setup();
  const row = SA.data.get('missions', 'censo');
  assert.equal(row.n, 7);
  assert.equal(SA.data.all('missions').find((m) => m.n === 6).id, 'aguila');
  assert.ok(!Array.isArray(row.intro) && row.intro.es.split(/\s+/).length <= 4 && row.intro.icon);
  assert.equal(row.steps.map((s) => s.kind).join(), 'census');
  SA.missionRun.validate(row.steps);
  assert.equal(missions.status('censo'), 'locked');
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor']) { missions.start(id); missions.complete(); }
  assert.equal(missions.status('censo'), 'locked');
  missions.start('aguila'); missions.complete();
  assert.equal(missions.status('censo'), 'available');
  assert.ok(SA.data.get('badges', 'censo-completo'));
});

test('the census step only completes on its own event', () => {
  const { SA } = setup();
  const steps = SA.data.get('missions', 'censo').steps;
  const s0 = SA.missionRun.start(steps);
  assert.equal(SA.missionRun.step(s0, { type: 'photo', target: 'conejo' }).advanced, false);
  assert.equal(SA.missionRun.step(s0, { type: 'censused' }).done, true);
});

test('starting the step generates a list; with no census step running a photo does nothing', () => {
  const ctx = setup();
  assert.equal(ctx.census.view(), null);
  assert.equal(ctx.census.photo('conejo').status, 'none');
  startCensus(ctx);
  const v = ctx.census.view();
  assert.ok(v.list.entries.length >= 1 && v.progress.every((p) => !p.done));
  assert.equal(ctx.census.view().list, v.list, 'the list is stable while the step runs');
  assert.ok(ctx.tracked.some(([t]) => t === 'census.start'));
});

test('a fitting photo ticks its entry, speaks the trait word and plays a happy chime', () => {
  const ctx = setup();
  startCensus(ctx);
  const e = ctx.census.view().list.entries[0];
  const a = fitting(ctx.SA, e)[0];
  const r = ctx.census.photo(a.id);
  assert.ok(r.status === 'tick' || r.status === 'done');
  assert.equal(r.entry.value, e.value);
  assert.ok(ctx.said.includes(e.trait + ':' + e.value), ctx.said.join());
  assert.ok(ctx.SA.data.get('vocab', e.trait + ':' + e.value), 'the spoken key is real vocab');
  assert.ok(ctx.sfx.includes('chime'));
  assert.equal(ctx.photos.join(), a.id);
  assert.ok(ctx.census.view().progress[0].have >= 1);
  assert.equal(ctx.ticks.length, 1);
  assert.ok(ctx.tracked.some(([t]) => t === 'census.tick'));
});

test('a photo that fits nothing, or repeats a counted animal, is a gentle reaction and changes nothing', () => {
  const ctx = setup(3);
  startCensus(ctx);
  const list = ctx.census.view().list;
  const bad = misfit(ctx.SA, list);
  if (bad) {
    const r = ctx.census.photo(bad.id);
    assert.equal(r.status, 'miss');
    assert.ok(ctx.sfx.includes('boing'));
    assert.equal(ctx.misses.length, 1);
  }
  const before = JSON.stringify(ctx.census.view().progress);
  assert.equal(ctx.census.photo('no-such-animal').status, 'none');
  assert.equal(ctx.census.photo(undefined).status, 'none');
  assert.equal(JSON.stringify(ctx.census.view().progress), before);
  if (list.entries[0].n >= 2 || list.entries.length > 1) {
    const a = fitting(ctx.SA, list.entries[0])[0];
    ctx.census.photo(a.id);
    const again = ctx.census.photo(a.id);
    assert.equal(again.status, 'again');
    assert.ok(ctx.sfx.includes('pop'));
  }
  assert.equal(ctx.missions.active().id, 'censo', 'nothing ends or fails the mission');
});

test('finishing the list completes Mission 7, pays the reward once and awards the sticker', () => {
  const ctx = setup();
  startCensus(ctx);
  const stars = ctx.SA.save.get().stars || 0;
  const last = finishList(ctx);
  assert.equal(last.status, 'done');
  assert.equal(last.result.status, 'complete');
  assert.equal(ctx.missions.active(), null);
  assert.equal(ctx.missions.status('censo'), 'done');
  assert.equal(ctx.SA.save.get().stars, stars + 2);
  assert.equal(ctx.log.count('census'), 1);
  assert.ok(ctx.sticker.badges.map((b) => b.id).includes('censo-completo'));   // (the very first rescue also earns 'primer-rescate')
  assert.equal(ctx.sticker.mission, 'censo');
  assert.equal(ctx.cheers.length, 1);
  assert.ok(ctx.tracked.some(([t]) => t === 'census.done'));
  assert.equal(ctx.census.photo('conejo').status, 'none', 'no more census once finished');
});

test('replaying Mission 7 generates a new list and does not pay or re-award', () => {
  const ctx = setup();
  startCensus(ctx);
  const first = ctx.census.view().list.key;
  finishList(ctx);
  const stars = ctx.SA.save.get().stars;
  const r = ctx.missions.start('censo');
  assert.equal(r.replay, true);
  const second = ctx.census.view().list;
  assert.notEqual(second.key, first);
  assert.ok(ctx.census.view().progress.every((p) => p.have === 0), 'fresh progress');
  const last = finishList(ctx);
  assert.equal(last.result.status, 'complete');
  assert.equal(ctx.SA.save.get().stars, stars);
  assert.equal(ctx.log.count('census'), 1, 'the sticker is earned once');
  assert.equal(ctx.sticker.badges.length, 0, 'no new badge on the replay');
});

test('the runtime asks the census piece to sync each frame (update hook)', () => {
  const ctx = setup();
  startCensus(ctx);
  assert.equal(ctx.census.update({ x: 0, z: 0 }).status, 'none');
});
