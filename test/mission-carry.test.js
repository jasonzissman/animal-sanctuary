import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/inventory.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js',
  'game/carry.js', 'game/mission-carry.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  const carry = SA.carry.create({ track: (t, f) => tracked.push([t, f]) });
  const thing = SA.missionCarry.create({ missions, carry, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]) });
  const rt = SA.missionRuntime.create({ missions, carry, thing, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  return { SA, missions, carry, thing, rt, said, tracked, cheers };
}

function finishMama(missions) {
  assert.equal(missions.start('mama').ok, true);
  assert.equal(missions.complete().status, 'complete');
}

// Mission 2 unlocks once mission 1 is done; returns the active mission-2 run.
function startEgg(ctx) {
  const { SA, missions } = ctx;
  finishMama(missions);
  const r = missions.start('huevo');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.thing.sync();
  return ctx;
}
const at = (p, dx = 0, dz = 0) => ({ x: p.x + dx, z: p.z + dz, heading: 0, y: 0 });

test('data: mission 2 follows mission 1, has a one-line intro of <= 4 words, and its steps are carry, deliver, hatch, photo', () => {
  const { SA } = setup();
  const rows = SA.data.all('missions');
  assert.deepEqual(Array.from(rows.map((m) => m.n)), [1, 2]);
  const m = rows[1];
  assert.equal(m.id, 'huevo');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['carry', 'deliver', 'hatch', 'photo']);
  assert.equal(m.steps[0].item, m.carry.item);
  assert.equal(m.steps[1].to, m.carry.to);
});

test('mission 2 is locked until mission 1 is done, then appears as the next card', () => {
  const { missions } = setup();
  assert.equal(missions.start('huevo').reason, 'locked');
  assert.equal(missions.next().id, 'mama');
  finishMama(missions);
  assert.equal(missions.next().id, 'huevo');
  assert.equal(missions.start('huevo').ok, true);
});

test('vocab: el huevo and el nido exist as speakable keys', () => {
  const { SA } = setup();
  assert.equal(SA.vocab.get('thing:huevo').es, 'el huevo');
  assert.equal(SA.vocab.get('thing:nido').es, 'el nido');
});

test('place: nest by the pond, egg a short walk away, both on dry ground; deterministic per seed', () => {
  const { SA } = setup();
  const spec = { item: 'huevo', to: 'nido', near: 'pond' };
  const P = SA.map.POND;
  for (let seed = 1; seed <= 40; seed++) {
    const r = SA.missionCarry.place(spec, seed, { solids: [] });
    assert.ok(r, `seed ${seed}`);
    const dn = Math.hypot(r.to.x - P.x, r.to.z - P.z);
    assert.ok(dn > P.radius && dn < P.radius + 8, `nest ${dn} from the pond centre`);
    const de = Math.hypot(r.item.x - r.to.x, r.item.z - r.to.z);
    assert.ok(de >= 4.9 && de <= 7.1, `egg ${de} from the nest`);
    for (const p of [r.item, r.to]) {
      assert.equal(SA.map.isWater(p.x, p.z), false);
      assert.equal(SA.map.nearWater(p.x, p.z, 0), false);
    }
    assert.equal(JSON.stringify(SA.missionCarry.place(spec, seed, { solids: [] })), JSON.stringify(r));
  }
  assert.equal(SA.missionCarry.place({ item: 'a', to: 'b', near: 'nowhere' }, 1), null);
});

test('place keeps clear of solids', () => {
  const { SA } = setup();
  const P = SA.map.POND;
  const solids = [[P.x + 8, P.z, 3], [P.x - 8, P.z, 3], [P.x, P.z + 8, 3], [P.x, P.z - 8, 3]];
  const r = SA.missionCarry.place({ item: 'huevo', to: 'nido' }, 3, { solids });
  assert.ok(r);
  for (const p of [r.item, r.to]) for (const s of solids) assert.ok(Math.hypot(p.x - s[0], p.z - s[1]) >= s[2]);
});

test('sync: places when the mission starts, clears when it is abandoned', () => {
  const ctx = setup();
  assert.equal(ctx.thing.sync(), null);
  const cur = startEgg(ctx).thing.current();
  assert.equal(cur.phase, 'ground');
  const l = ctx.thing.locate('huevo');
  assert.deepEqual([l.x, l.z, l.r], [cur.item.x, cur.item.z, ctx.thing.PICK_REACH]);
  assert.equal(ctx.thing.locate('nido').x, cur.to.x);
  ctx.missions.abandon();
  assert.equal(ctx.thing.sync(), null);
  assert.equal(ctx.thing.locate('nido'), null);
});

test('carry step: too far away does nothing; close up picks the egg up and says "el huevo"', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item, 6, 0));
  assert.equal(cur.phase, 'ground');
  assert.equal(ctx.carry.holds('huevo'), false);
  assert.deepEqual(ctx.said, []);
  const res = ctx.rt.update(at(cur.item, 1, 0));
  assert.equal(cur.phase, 'held');
  assert.equal(ctx.carry.holds('huevo'), true);
  assert.deepEqual(ctx.said, ['thing:huevo']);
  assert.equal(res.status, 'step', 'holding the egg completes the carry step');
  assert.equal(ctx.missions.active().stepData.kind, 'deliver');
  assert.equal(ctx.thing.locate('huevo'), null, 'a held egg is no longer on the ground');
});

test('place step: far from the nest keeps holding; at the nest it is placed and said, and the mission moves on to the hatch', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item));                                   // pick up
  ctx.rt.update(at(cur.to, 8, 0));                               // still walking
  assert.equal(ctx.carry.holds('huevo'), true);
  assert.equal(cur.phase, 'held');
  assert.equal(ctx.thing.target(ctx.missions.active().stepData).role, 'to', 'the compass points at the nest');
  const res = ctx.rt.update(at(cur.to, 1, 0));
  assert.equal(res.status, 'step', 'the delivery is no longer the last step (AS-0315)');
  assert.equal(ctx.carry.holds('huevo'), false);
  assert.equal(ctx.missions.active().stepData.kind, 'hatch');
  ctx.thing.update(at(cur.to));
  assert.equal(ctx.thing.current().phase, 'placed', 'the egg rests in the nest');
  assert.deepEqual(ctx.said, ['thing:huevo', 'thing:nido']);
  assert.equal(ctx.cheers.length, 0);
  ctx.thing.update(at(cur.to));
  assert.deepEqual(ctx.said, ['thing:huevo', 'thing:nido'], 'said once');
});

test('the egg is only picked up on the carry step, and a repeated update never picks it up twice', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item));
  ctx.rt.update(at(cur.item));
  assert.equal(ctx.said.filter((k) => k === 'thing:huevo').length, 1);
});

test('abandoning while holding lets go of the egg', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item));
  assert.equal(ctx.carry.holds('huevo'), true);
  ctx.missions.abandon();
  ctx.thing.sync();
  assert.equal(ctx.carry.holds('huevo'), false);
  assert.equal(ctx.thing.current(), null);
});

test('target: the egg for the carry step while it lies on the ground', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  const t = ctx.rt.target();
  assert.deepEqual([t.x, t.z, t.role], [cur.item.x, cur.item.z, 'item']);
  assert.equal(ctx.thing.target(null), null);
});

test('a replay re-places the egg for the new run', () => {
  const ctx = startEgg(setup());
  const cur = ctx.thing.current();
  ctx.rt.update(at(cur.item));
  ctx.rt.update(at(cur.to));
  assert.equal(ctx.missions.active().stepData.kind, 'hatch');
  assert.equal(ctx.missions.complete().status, 'complete');       // (the hatch and photo are tested in mission-hatch.test.js)
  assert.equal(ctx.missions.start('huevo').ok, true, 'a finished mission can be replayed');
  const again = ctx.thing.sync();
  assert.equal(again.phase, 'ground');
  assert.notEqual(again, cur);
});

test('a reload on the deliver step puts the egg back in hand, so the kid can still finish', () => {
  const ctx = startEgg(setup());
  const first = ctx.thing.current();
  ctx.rt.update(at(first.item));                                 // picked up: now on the deliver step
  assert.equal(ctx.missions.active().stepData.kind, 'deliver');
  // "reload": the save keeps the step; a fresh carry + mission-carry + runtime know nothing about the hand
  const carry = ctx.SA.carry.create({ track: () => {} });
  const said = [];
  const thing = ctx.SA.missionCarry.create({ missions: ctx.missions, carry, audio: { say: (k) => said.push(k) }, track: () => {} });
  const rt = ctx.SA.missionRuntime.create({ missions: ctx.missions, carry, thing, spawn: null, celebrate: () => {}, track: () => {} });
  thing.sync();
  assert.equal(thing.current().phase, 'ground');
  assert.equal(carry.holds('huevo'), false);
  rt.update(at(thing.current().to, 8, 0));
  assert.equal(carry.holds('huevo'), true, 'back in hand without walking to the egg');
  assert.equal(thing.current().phase, 'held');
  const res = rt.update(at(thing.current().to, 1, 0));
  assert.equal(res.status, 'step');
  thing.update(at(thing.current().to));
  assert.equal(thing.current().phase, 'placed');
  assert.ok(said.includes('thing:nido'));
});
