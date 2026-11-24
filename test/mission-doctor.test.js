// AS-0331: Mission 5 core (Doctor del santuario): the data row, the sick animal and the bucket placed by the oasis only while the mission runs,
// the ordered steps (touch la frente -> pick up the bucket -> fill it -> deliver it), the spoken vocab and the compass targets. Pure logic in node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js','game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js','game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/player.js',
  'game/jump.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/desert-plan.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/carry.js', 'game/mission-doctor.js', 'game/mission-runtime.js',
  'game/scientist-talk.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [], clock = { t: 1000 }, queued = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const doctor = SA.missionDoctor.create({ missions, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), report: (e) => rt.report(e),
    now: () => clock.t, later: (fn, ms) => queued.push([fn, ms]) });
  rt = SA.missionRuntime.create({ missions, thing: doctor, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  return { SA, missions, doctor, rt, said, tracked, cheers, clock, queued };
}

function startDoctor(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  const r = ctx.missions.start('doctor');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.doctor.sync();
  return ctx;
}
const at = (o) => ({ x: o.x, z: o.z, y: o.y, heading: 0 });
const step = (ctx) => ctx.missions.active().stepData.kind;

test('data: mission 5 follows mission 4, a one-line intro of <= 4 words, steps in order: check, water, medicine, shade; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[4];
  assert.equal(m.n, 5);
  assert.equal(m.id, 'doctor');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.equal(m.intro.es, '¡El camello está enfermo!');
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind + ':' + (s.item || s.part))),
    ['touch:frente', 'carry:cubo', 'fill:cubo', 'deliver:cubo', 'carry:medicina', 'deliver:medicina', 'carry:sombrilla', 'deliver:sombrilla', 'recover:undefined', 'photo:undefined']);
  assert.equal(SA.data.get('props', m.doctor.shade).builder, 'umbrella');   // the umbrella is a registered prop row
  for (const k of ['thing:medicina', 'thing:sombra', 'thing:sombrilla', 'phrase:mananamejor']) assert.ok(SA.vocab.get(k), k);
  assert.match(SA.vocab.get('phrase:mananamejor').es, /Mañana/);
  assert.deepEqual([m.steps[0].animal, m.steps[0].part, m.doctor.part, m.doctor.item], ['camello', 'frente', 'frente', 'cubo']);
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4));
  SA.missionRun.validate(m.steps);
});

test('data: validation rejects a bad doctor spec', () => {
  const { SA } = setup();
  const row = (doctor) => ({ id: 'x5', n: 99, es: 'X', en: 'X', icon: '🩺', intro: { es: 'Hola', icon: '🩺' }, doctor,
    steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.throws(() => SA.data.register('missions', [row({ animal: 'Camello', part: 'frente', item: 'cubo' })]), /doctor\.animal/);
  assert.throws(() => SA.data.register('missions', [row({ animal: 'camello', part: 'frente' })]), /doctor\.item/);
  assert.throws(() => SA.data.register('missions', [row({ animal: 'camello', part: 'frente', item: 'cubo', say: { bad: 'x' } })]), /doctor\.say/);
  assert.throws(() => SA.data.register('missions', [row('camello')]), /doctor/);
});

test('mission 5 is locked until mission 4 is done, then starts like any other (one-line intro)', () => {
  const { SA, missions } = setup();
  assert.equal(missions.start('doctor').ok, false);
  for (const id of ['mama', 'huevo', 'rio']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('doctor').ok, false, 'still locked: mission 4 is not done');
  missions.start('fiesta'); missions.complete();
  assert.equal(missions.next().id, 'doctor');
  assert.equal(missions.start('doctor').ok, true);
  assert.ok(SA.vocab.get('phrase:enfermo') && SA.vocab.get('thing:fiebre') && SA.vocab.get('thing:agua') && SA.vocab.get('phrase:tienefiebre'));
});

test('place: the camel stands in the desierto and the bucket on the oasis rim; deterministic; nothing exists without the mission', () => {
  const ctx = setup();
  const { SA, doctor } = ctx;
  assert.equal(doctor.sync(), null);
  startDoctor(ctx);
  const cur = doctor.current();
  assert.equal(cur.animal.id, 'camello');
  assert.equal(SA.map.biomeAt(cur.animal.x), 'desierto');
  const o = SA.desertPlan.get().oasis;
  assert.ok(Math.hypot(cur.bucket.x - o.x, cur.bucket.z - o.z) > o.poolR);
  assert.ok(Math.hypot(cur.bucket.x - o.x, cur.bucket.z - o.z) < o.poolR + 2);
  const again = SA.missionDoctor.place(cur.spec, ctx.missions.active().seed);
  assert.deepEqual(JSON.parse(JSON.stringify(again.animal)), JSON.parse(JSON.stringify(cur.animal)));
  assert.equal(doctor.view().sick, true);
  ctx.missions.abandon && ctx.missions.abandon();
  doctor.sync();
  assert.equal(doctor.current(), null);
  assert.equal(doctor.view().sick, false);
});

test('the whole mission in order: touch la frente (tiene fiebre) -> bucket -> fill -> deliver to the camel completes it', () => {
  const ctx = startDoctor(setup());
  const { doctor, rt, said, SA } = ctx, cur = doctor.current();
  // Before the check nothing else counts: the bucket cannot be picked up and the pool fills nothing.
  doctor.update(at(cur.bucket));
  assert.equal(cur.phase, 'ground');
  assert.equal(step(ctx), 'touch');
  assert.deepEqual(rt.target().id, 'camello');
  // A tap from far away only asks the kid to come closer.
  assert.equal(doctor.touch({ x: cur.animal.x + 30, z: cur.animal.z }, 'frente').reason, 'far');
  assert.ok(said.includes('phrase:acercate'));
  assert.equal(step(ctx), 'touch');
  assert.equal(doctor.touch(at(cur.animal), 'cola').reason, 'part');   // another part is not la frente
  assert.equal(doctor.touch(at(cur.animal), 'frente').ok, true);
  assert.ok(said.includes('phrase:tienefiebre'), 'tiene fiebre is spoken');
  assert.equal(step(ctx), 'carry');
  assert.equal(doctor.view().checked, true);
  // Step 2: the compass leads to the bucket, walking up picks it up.
  assert.deepEqual([rt.target().role, rt.target().id], ['item', 'cubo']);
  rt.update(at(cur.animal));
  assert.equal(step(ctx), 'carry');
  rt.update(at(cur.bucket));
  assert.equal(cur.phase, 'held');
  assert.ok(said.includes('thing:cubo'), 'el cubo is spoken');
  assert.equal(step(ctx), 'fill');
  assert.equal(rt.target().role, 'water');
  rt.update(at(cur.animal));                 // far from the pool: still empty
  assert.equal(cur.phase, 'held');
  const pool = { x: cur.pool.x + cur.pool.r + 1, z: cur.pool.z };
  rt.update(pool);
  assert.equal(cur.phase, 'full');
  assert.ok(said.includes('thing:agua'), 'el agua is spoken');
  assert.equal(step(ctx), 'deliver');
  assert.equal(rt.target().id, 'camello');
  rt.update({ x: cur.animal.x + 20, z: cur.animal.z });
  assert.equal(step(ctx), 'deliver');
  const res = rt.update(at(cur.animal));
  assert.equal(res.status, 'step', 'the water is not the end any more: the medicine comes next');
  assert.equal(SA.carry.holds('cubo'), false);
  assert.equal(ctx.cheers.length, 0);
  assert.equal(step(ctx), 'carry');
  doctor.update(at(cur.animal));
  assert.equal(cur.phase, 'given');
  assert.ok(said.filter((k) => k === 'thing:agua').length >= 2, 'the give speech fires');
});

// Walk the bucket part (touch, pick up, fill, deliver) so the mission stands on the medicine step.
function giveWater(ctx) {
  const { doctor, rt } = ctx, cur = doctor.current();
  doctor.touch(at(cur.animal), 'frente');
  rt.update(at(cur.bucket));
  rt.update({ x: cur.pool.x + cur.pool.r + 1, z: cur.pool.z });
  rt.update(at(cur.animal));
  doctor.update(at(cur.animal));
  return cur;
}

test('order: the medicine cannot be taken before the water, the umbrella not before the medicine', () => {
  const ctx = startDoctor(setup());
  const { doctor, rt, SA } = ctx, cur = doctor.current();
  const med = cur.stock.medicine, shade = cur.stock.shade;
  // On the touch step standing at the bench picks up nothing.
  rt.update(at(med));
  rt.update(at(shade));
  assert.equal(med.phase, 'shelf');
  assert.equal(shade.phase, 'shelf');
  assert.equal(SA.carry.holds('medicina'), false);
  // Events for later steps are ignored while an earlier step is current.
  for (const ev of [{ type: 'carried', item: 'medicina' }, { type: 'delivered', item: 'medicina', to: 'camello' }, { type: 'carried', item: 'sombrilla' },
    { type: 'delivered', item: 'sombrilla', to: 'camello' }]) { assert.equal(rt.report(ev).status, 'ignored'); assert.equal(step(ctx), 'touch'); }
  doctor.touch(at(cur.animal), 'frente');
  rt.update(at(med));                          // on the bucket steps the bench still gives nothing
  assert.equal(med.phase, 'shelf');
  rt.update(at(cur.bucket));
  assert.equal(step(ctx), 'fill');
  rt.update(at(med));
  assert.equal(med.phase, 'shelf');
  rt.update({ x: cur.pool.x + cur.pool.r + 1, z: cur.pool.z });
  rt.update(at(med));                          // water not yet given
  assert.equal(med.phase, 'shelf');
  assert.equal(step(ctx), 'deliver');
  rt.update(at(cur.animal));                   // water given
  assert.equal(step(ctx), 'carry');
  // Medicine step: the umbrella still stays on the bench.
  rt.update(at(shade));
  assert.equal(shade.phase, 'shelf');
  assert.equal(SA.carry.holds('sombrilla'), false);
  assert.equal(rt.report({ type: 'carried', item: 'sombrilla' }).status, 'ignored');
  rt.update(at(med));
  assert.equal(med.phase, 'held');
  assert.equal(step(ctx), 'deliver');
  rt.update(at(shade));                        // holding the medicine: the umbrella is not picked up on a deliver step
  assert.equal(shade.phase, 'shelf');
  assert.equal(rt.report({ type: 'delivered', item: 'sombrilla', to: 'camello' }).status, 'ignored');
  assert.equal(step(ctx), 'deliver');
});

test('medicine: taken from the station bench, spoken (la medicina), given to the camel; the compass leads there', () => {
  const ctx = startDoctor(setup());
  const { doctor, rt, said, SA } = ctx, cur = giveWater(ctx);
  const L = SA.station.layout();
  assert.ok(Math.abs(cur.stock.medicine.z - L.bench.z) < 0.01, 'the medicine lies on the bench');
  assert.deepEqual([rt.target().role, rt.target().id], ['item', 'medicina']);
  assert.equal(Math.round(rt.target().x * 100), Math.round(cur.stock.medicine.x * 100));
  rt.update(at(cur.animal));                   // far from the bench
  assert.equal(step(ctx), 'carry');
  rt.update(at(cur.stock.medicine));
  assert.ok(said.includes('thing:medicina'), 'la medicina is spoken when taken');
  assert.equal(SA.carry.holds('medicina'), true);
  assert.equal(step(ctx), 'deliver');
  assert.equal(rt.target().id, 'camello');
  rt.update({ x: cur.animal.x + 20, z: cur.animal.z });
  assert.equal(step(ctx), 'deliver');
  const n = said.filter((k) => k === 'thing:medicina').length;
  assert.equal(rt.update(at(cur.animal)).status, 'step');
  doctor.update(at(cur.animal));
  assert.equal(doctor.view().med, 'given');
  assert.equal(said.filter((k) => k === 'thing:medicina').length, n + 1, 'la medicina is spoken again when given');
  assert.equal(doctor.view().rested, false, 'no rest before the shade');
  assert.equal(step(ctx), 'carry');
  assert.deepEqual([rt.target().role, rt.target().id], ['item', 'sombrilla']);
});

test('shade: the umbrella goes up beside the camel (la sombra), it lies down and says it will be better mañana; the scene lingers then clears', () => {
  const ctx = startDoctor(setup());
  const { doctor, rt, said, SA, clock, queued } = ctx, cur = giveWater(ctx);
  rt.update(at(cur.stock.medicine));
  rt.update(at(cur.animal));
  doctor.update(at(cur.animal));
  rt.update(at(cur.stock.shade));
  assert.ok(said.includes('thing:sombrilla'));
  assert.equal(step(ctx), 'deliver');
  assert.equal(doctor.view().rested, false);
  assert.equal(said.includes('thing:sombra'), false);
  const res = rt.update(at(cur.animal));
  assert.equal(res.status, 'step', 'the umbrella is followed by the wait (AS-0333)');
  assert.equal(step(ctx), 'recover');
  assert.equal(ctx.cheers.length, 0);
  doctor.update(at(cur.animal));               // the next frame
  const v = doctor.view();
  assert.equal(v.rested, true);
  assert.equal(v.shade, 'given');
  assert.ok(Math.hypot(v.umbrella.x - cur.animal.x, v.umbrella.z - cur.animal.z) < 2.5, 'the umbrella stands next to the camel');
  assert.ok(Math.hypot(v.umbrella.x - cur.animal.x, v.umbrella.z - cur.animal.z) > 0.5);
  assert.ok(said.includes('thing:sombra'), 'la sombra is spoken');
  assert.equal(said.includes('phrase:mananamejor'), false, 'the line follows la sombra');
  queued.forEach(([fn]) => fn());
  assert.deepEqual(said.slice(-2), ['thing:sombra', 'phrase:mananamejor']);
  assert.ok(SA.vocab.get('phrase:mananamejor').es.includes('Mañana'));
  assert.equal(SA.carry.holds('sombrilla'), false);
  assert.ok(doctor.current(), 'the resting camel stays while the mission waits');
  assert.equal(doctor.view().sick, true);
  assert.equal(doctor.view().healthy, false);
  clock.t += 20000;
  doctor.sync();
  assert.ok(doctor.current(), 'it never leaves while the mission waits');
});

test('a reload on the medicine or umbrella delivery step puts the item back in hand; past the water the bucket is not left at the pool', () => {
  const ctx = startDoctor(setup());
  const { doctor, missions, SA } = ctx;
  for (let i = 0; i < 5; i++) missions.advance();       // now on 'deliver medicina'
  assert.equal(step(ctx), 'deliver');
  doctor.update(at(doctor.current().animal));
  assert.equal(doctor.view().med, 'held');
  assert.equal(SA.carry.holds('medicina'), true);
  assert.equal(doctor.view().phase, 'given', 'the bucket rests by the camel');
  missions.advance(); missions.advance();               // 'deliver sombrilla'
  SA.carry.drop();
  doctor.update(at(doctor.current().animal));
  assert.equal(SA.carry.holds('sombrilla'), true);
  assert.equal(doctor.view().med, 'given');
});

test('a reload on the fill or deliver step puts the bucket back in hand (never stuck)', () => {
  const ctx = startDoctor(setup());
  const { doctor, missions, SA } = ctx;
  doctor.touch(at(doctor.current().animal), 'frente');
  missions.advance();                         // now on 'fill' (the carry step was passed in the save)
  assert.equal(step(ctx), 'fill');
  doctor.update(at(doctor.current().animal));
  assert.equal(doctor.current().phase, 'held');
  assert.equal(SA.carry.holds('cubo'), true);
});

test('touch outside the touch step is ignored', () => {
  const ctx = startDoctor(setup());
  const { doctor } = ctx;
  ctx.rt.report({ type: 'touched', animal: 'camello', part: 'frente' });   // step 1 done by the event itself
  assert.equal(step(ctx), 'carry');
  const r = doctor.touch(at(doctor.current().animal), 'frente');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'step');
});

test('the scientist has a spoken line for the new step kinds', () => {
  const { SA } = setup();
  assert.equal(SA.scientistTalk.STEPS.touch.key, 'phrase:pasotoca');
  assert.equal(SA.scientistTalk.STEPS.fill.key, 'phrase:pasollena');
  assert.ok(SA.vocab.get('phrase:pasotoca') && SA.vocab.get('phrase:pasollena'));
});
