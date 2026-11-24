// AS-0333: Mission 5 slice 3: the camel rests ('recover' step, persisted in the save), is healthy on the next session or after the next finished
// mission, and the photo of the healthy camel completes the mission with its sticker. Pure logic in node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/badges.js', 'game/save.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/jump.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/album.js', 'game/badges.js', 'game/rescue-log.js',
  'game/desert-plan.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js',
  'game/carry.js', 'game/mission-doctor.js', 'game/mission-runtime.js', 'game/scientist-talk.js'];

// One "session": its own missions / doctor / runtime instances over the shared save (a reload keeps the save and gets a new session id).
function boot(SA, session, ctx) {
  const said = ctx ? ctx.said : [], tracked = ctx ? ctx.tracked : [], photos = ctx ? ctx.photos : [], cheers = ctx ? ctx.cheers : [];
  const missions = SA.missions.create({ session, track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const log = SA.rescueLog.create({});
  const doctor = SA.missionDoctor.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), now: () => 1000, later: (fn) => fn(), photo: { record: (id) => photos.push(id) }, rescueLog: log });
  rt = SA.missionRuntime.create({ missions, thing: doctor, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  const out = { SA, missions, doctor, rt, said, tracked, photos, cheers, log };
  doctor.onSticker = (e) => (out.sticker = e);
  return out;
}

const at = (o) => ({ x: o.x, z: o.z, y: o.y, heading: 0 });
const step = (ctx) => ctx.missions.active().stepData.kind;

// Plays Mission 5 up to the umbrella; leaves it waiting on the 'recover' step.
function resting(session) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const ctx = boot(SA, session || 'one');
  for (const id of ['mama', 'huevo', 'rio', 'fiesta']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  assert.equal(ctx.missions.start('doctor').ok, true);
  const { doctor, rt } = ctx, cur = doctor.sync();
  doctor.touch(at(cur.animal), 'frente');
  rt.update(at(cur.bucket));
  rt.update({ x: cur.pool.x + cur.pool.r + 1, z: cur.pool.z });
  rt.update(at(cur.animal));
  doctor.update(at(cur.animal));
  rt.update(at(cur.stock.medicine));
  rt.update(at(cur.animal));
  doctor.update(at(cur.animal));
  rt.update(at(cur.stock.shade));
  rt.update(at(cur.animal));
  doctor.update(at(cur.animal));
  assert.equal(step(ctx), 'recover');
  return ctx;
}

test('rest: after the umbrella the mission waits; the camel stays sick for the whole session and nothing completes', () => {
  const ctx = resting();
  const { doctor, missions, SA } = ctx;
  const v = doctor.view();
  assert.equal(v.rested, true);
  assert.equal(v.sick, true);
  assert.equal(v.healthy, false);
  for (let i = 0; i < 5; i++) { doctor.update({ x: 0, z: 0 }); assert.equal(missions.settle(), null); }
  assert.equal(step(ctx), 'recover');
  assert.equal(doctor.view().healthy, false);
  assert.equal(ctx.cheers.length, 0);
  assert.equal(missions.status('doctor'), 'active');
  const w = JSON.parse(JSON.stringify(SA.save.get().missions));
  assert.equal(w.active.id, 'doctor');
  assert.equal(typeof w.active.wait.session, 'string');
  assert.equal(w.active.wait.mark, 4);
});

test('the waiting state survives a reload through the save and migrate(); the camel is healthy on the next session', () => {
  const ctx = resting();
  const saved = JSON.parse(JSON.stringify(ctx.SA.save.get()));
  const back = ctx.SA.save.migrate(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(back.missions.active.wait)), JSON.parse(JSON.stringify(saved.missions.active.wait)));
  assert.equal(back.missions.completions, 4);
  // A new page load: same save, new session id.
  const next = boot(ctx.SA, 'two', ctx);
  assert.equal(next.missions.active().stepData.kind, 'recover');
  next.doctor.update({ x: 0, z: 0 });
  assert.equal(step(next), 'photo', 'recovered at once on the next session');
  const v = next.doctor.view();
  assert.equal(v.healthy, true);
  assert.equal(v.sick, false);
  assert.equal(v.rested, false);
  assert.equal(v.umbrella, null);
  assert.ok(ctx.said.includes('phrase:estoysano'));
  assert.ok(SA_vocab(ctx.SA, 'phrase:estoysano'));
  assert.equal(next.missions.active().stepData.target, 'camello');
  assert.equal(JSON.parse(JSON.stringify(ctx.SA.save.get().missions.active.wait ?? null)), null, 'the stamp is gone');
});

function SA_vocab(SA, key) { return SA.vocab.get(key); }

test('the same session never recovers; a bad or missing stamp never leaves the mission stuck', () => {
  const ctx = resting('one');
  const same = boot(ctx.SA, 'one', ctx);
  assert.equal(same.missions.settle(), null);
  assert.equal(step(same), 'recover');
  ctx.SA.save.update({ missions: { active: { wait: { session: '', mark: 'x' } } } });   // junk stamp is dropped by normalize: due at once
  assert.equal(same.missions.settle().recovered, 'doctor');
  assert.equal(step(same), 'photo');
});

test('a finished mission also ends the wait: start another one while waiting, finish it, and the camel is healthy', () => {
  const ctx = resting();
  const { missions } = ctx;
  assert.equal(missions.start('mama').ok, true, 'a waiting mission does not block the board');
  assert.equal(missions.active().id, 'mama');
  assert.equal(JSON.parse(JSON.stringify(ctx.SA.save.get().missions.waiting)).id, 'doctor');
  assert.equal(missions.start('huevo').ok, false, 'one mission at a time still');
  missions.complete();
  const a = missions.active();
  assert.equal(a.id, 'doctor');
  assert.equal(a.stepData.kind, 'photo');
  assert.equal(ctx.SA.save.get().missions.waiting, undefined);
  ctx.doctor.update({ x: 0, z: 0 });
  assert.equal(ctx.doctor.view().healthy, true);
});

test('a parked mission is picked up again from the board where it waits (never stuck); another start does not lose it', () => {
  const ctx = resting();
  const { missions } = ctx;
  missions.start('mama');
  assert.equal(missions.settle(), null, 'still waiting while another mission runs in the same session');
  missions.abandon();
  assert.equal(missions.active(), null);
  const r = missions.start('doctor');
  assert.equal(r.ok, true);
  assert.equal(missions.active().stepData.kind, 'recover');
  assert.equal(ctx.SA.save.get().missions.waiting, undefined);
});

test('photo: only a healthy camel with la cámara in hand and close; completes the mission, the album, the stars and the sticker', () => {
  const ctx = resting();
  const { SA } = ctx;
  assert.equal(ctx.doctor.snap({ x: 0, z: 0 }).status, 'none', 'still resting');
  const next = boot(SA, 'two', ctx);
  next.doctor.update({ x: 0, z: 0 });
  const cur = next.doctor.current();
  assert.equal(next.doctor.snap(at(cur.animal)).status, 'nocamera');
  assert.equal(SA.inventory.equip('camara'), true);
  assert.equal(next.doctor.snap({ x: cur.animal.x + 60, z: cur.animal.z }).status, 'far');
  assert.equal(step(next), 'photo');
  assert.equal(next.doctor.target(next.missions.active().stepData).role, 'animal', 'the compass points at the camel');
  const stars = SA.save.get().stars || 0;
  const r = next.doctor.snap(at(cur.animal));
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'doctor');
  assert.equal(r.firstTime, true);
  assert.deepEqual(next.photos, ['camello']);
  assert.equal(next.missions.status('doctor'), 'done');
  assert.equal(next.sticker.mission, 'doctor');
  assert.equal(next.sticker.badges[next.sticker.badges.length - 1].id, 'camello-sano');
  assert.ok(Array.from(SA.save.get().badges).includes('camello-sano'));
  assert.equal(next.log.count('doctor'), 1);
  assert.ok(next.said.includes('sfx:shutter'));
  assert.equal(next.doctor.snap(at(cur.animal)).status, 'none', 'no second photo');
  assert.ok(next.doctor.current(), 'the healthy camel lingers a moment after the mission');
  assert.ok(next.tracked.some(([t]) => t === 'doctor.photo'));
  assert.ok(SA.save.get().stars >= stars);
});

test('a reload on the photo step shows the healthy camel again; a reload while resting shows it resting under the umbrella', () => {
  const ctx = resting();
  const again = boot(ctx.SA, 'one', ctx);
  again.doctor.update({ x: 0, z: 0 });
  assert.equal(again.doctor.view().rested, true);
  assert.equal(again.doctor.view().shade, 'given');
  assert.ok(again.doctor.view().umbrella);
  const later = boot(ctx.SA, 'two', ctx);
  later.doctor.update({ x: 0, z: 0 });
  const photo = boot(ctx.SA, 'two', ctx);
  photo.doctor.update({ x: 0, z: 0 });
  assert.equal(photo.doctor.view().healthy, true);
  assert.equal(photo.doctor.view().umbrella, null);
});

test('save: wait stamps, parked missions and the completions counter normalize; junk is dropped and nothing else is lost', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const s = SA.save.migrate({ version: 6, stars: 3, missions: { done: ['mama'], completions: 2.7,
    active: { id: 'doctor', step: 8, seed: 5, replay: false, wait: { session: 'abc', mark: 1 } },
    waiting: { id: 'doctor', step: 8, seed: 5, wait: { session: 7 } } } });
  assert.equal(s.stars, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(s.missions.active)), { id: 'doctor', step: 8, seed: 5, replay: false, wait: { session: 'abc', mark: 1 } });
  assert.deepEqual(JSON.parse(JSON.stringify(s.missions.waiting)), { id: 'doctor', step: 8, seed: 5, replay: false });
  assert.equal(s.missions.completions, 2);
  const old = SA.save.migrate({ version: 6, missions: { done: ['mama'], active: null } });
  assert.deepEqual(JSON.parse(JSON.stringify(old.missions)), { done: ['mama'], active: null }, 'old saves are unchanged');
});
