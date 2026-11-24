import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/surfaces.js', 'game/player.js', 'game/inventory.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js',
  'game/carry.js', 'game/mission-carry.js', 'game/mission-log.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], later = [], cheers = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  const thing = SA.missionLog.create({ missions, runtime: { report: () => {} }, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), later: (fn) => later.push(fn) });
  return { SA, missions, thing, said, tracked, cheers, later };
}

// The log module reports 'pushed' to a runtime that asks it for locate / target: the same wiring as the game.
function flow() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], cheers = [], later = [], tracked = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  const box = {};
  const thing = SA.missionLog.create({ missions, runtime: { report: (e) => box.rt.report(e) }, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), later: (fn) => later.push(fn) });
  box.rt = SA.missionRuntime.create({ missions, spawn: null, thing, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  return { SA, missions, thing, rt: box.rt, said, tracked, cheers, later };
}

function startRio(ctx) {
  const { missions, thing } = ctx;
  for (const id of ['mama', 'huevo']) { assert.equal(missions.start(id).ok, true); assert.equal(missions.complete().status, 'complete'); }
  const r = missions.start('rio');
  assert.equal(r.ok, true, JSON.stringify(r));
  thing.sync();
  assert.ok(thing.current(), 'the river scene was placed');
  return ctx;
}
const EAST = Math.PI / 2;   // heading 0 = +z, so +x is pi / 2

// Walks the player into the log's west end, facing east, until it locks (or the frames run out).
function pushAcross(ctx, frames = 600) {
  const { thing } = ctx, c = thing.current();
  for (let i = 0; i < frames && c.phase === 'ready'; i++) {
    const west = thing.logX() - thing.HALF;
    thing.update({ x: west - 0.7, z: c.log.z, heading: EAST }, 0.05);
  }
  return c;
}

test('data: mission 3 follows mission 2, one intro line of <= 4 words, steps push then cross', () => {
  const { SA, missions } = setup();
  const rows = SA.data.all('missions');
  assert.deepEqual(Array.from(rows.map((m) => m.n)), [1, 2, 3]);
  const m = rows[2];
  assert.equal(m.id, 'rio');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['push', 'goTo']);
  assert.equal(m.steps[0].line.es, 'Empuja el tronco');
  assert.equal(m.steps[1].line.es, 'Cruza el río');
  assert.equal(m.steps[0].item, m.river.log);
  assert.equal(m.steps[1].place, m.river.rock);
  assert.equal(missions.start('rio').reason, 'locked');
});

test('data: a bad river row is rejected with a clear error', () => {
  const { SA } = setup();
  const base = SA.data.all('missions')[2];
  assert.throws(() => SA.data.register('missions', [{ ...base, id: 'rio2', n: 4, river: { animal: 'perrito' } }]), /river\.rock/);
  assert.throws(() => SA.data.register('missions', [{ ...base, id: 'rio3', n: 4, river: [] }]), /river/);
});

test('vocab: el tronco, la roca and el perrito are speakable', () => {
  const { SA } = setup();
  assert.equal(SA.vocab.get('thing:tronco').es, 'el tronco');
  assert.equal(SA.vocab.get('thing:roca').es, 'la roca');
  assert.equal(SA.vocab.get('animal:perrito').es, 'el perrito');
});

test('place: rock in deep river water, log on the dry west bank, bridged position overlaps the rock; deterministic', () => {
  const { SA, thing } = setup();
  const spec = { animal: 'perrito', rock: 'roca', log: 'tronco' };
  const M = SA.map;
  for (let seed = 1; seed <= 30; seed++) {
    const r = thing.place(spec, seed, { solids: [] });
    assert.ok(r, `seed ${seed}`);
    assert.deepEqual(JSON.parse(JSON.stringify(thing.place(spec, seed, { solids: [] }))), JSON.parse(JSON.stringify(r)));
    assert.ok(M.isWater(r.rock.x, r.rock.z), 'the rock stands in the river');
    assert.equal(r.rock.x, M.riverX(r.z));
    assert.equal(r.pup.x, r.rock.x);
    for (let x = r.log.x0 - r.log.half; x <= r.log.x0 + r.log.half; x += 0.5) assert.ok(!M.isWater(x, r.z), `seed ${seed}: the log starts on dry ground at x ${x}`);
    const eastEnd = r.log.x1 + r.log.half;
    assert.ok(eastEnd > r.rock.x - r.rock.r, 'the bridged log reaches the rock');
    assert.ok(eastEnd < r.rock.x + 0.5, 'and does not pass the middle of the rock');
    assert.ok(M.isWater(r.log.x1, r.z), 'the middle of the bridged log is over water');
    assert.ok(!SA.station.inFootprint(r.log.x0, r.z, 2));
    assert.ok(Math.abs(r.z - M.FORD.z) >= 12);
  }
  assert.equal(thing.place({ animal: 'x' }, 1), null);
});

test('place: keeps clear of solids and a different seed can move the scene', () => {
  const { SA, thing } = setup();
  const spec = { animal: 'perrito', rock: 'roca', log: 'tronco' };
  const a = thing.place(spec, 1, { solids: [] });
  const wall = [[a.log.x0, a.z, 3]];
  const b = thing.place(spec, 1, { solids: wall });
  assert.ok(b);
  assert.ok(Math.abs(b.z - a.z) > 0.5, 'moved off the blocked spot');
  const zs = new Set(); for (let s = 1; s <= 12; s++) zs.add(Math.round(thing.place(spec, s, { solids: [] }).z));
  assert.ok(zs.size > 1);
});

test('starting mission 3 shows the puppy waiting on the rock and the log on the bank with its steps pointing at them', () => {
  const ctx = startRio(flow());
  const { thing, missions } = ctx, c = thing.current();
  assert.equal(c.phase, 'ready');
  assert.equal(c.pup.id, 'perrito');
  assert.equal(c.pup.y, c.rock.y);
  assert.equal(c.t, 0);
  assert.equal(missions.active().stepData.kind, 'push');
  const t1 = ctx.rt.target();
  assert.equal(t1.role, 'log');
  assert.equal(t1.z, c.log.z);
  assert.equal(ctx.rt.target().x, c.log.x0);
  assert.equal(thing.locate('roca'), null, 'wading to the rock does not count yet');
  assert.ok(thing.solids().length > 5, 'the sliding log blocks like a solid');
  for (const s of thing.solids()) assert.equal(s.length, 3);
});

test('walking into the log pushes it along its path; facing away or standing off does nothing', () => {
  const { thing } = startRio(flow());
  const c = thing.current(), west = thing.logX() - thing.HALF;
  thing.update({ x: west - 0.7, z: c.log.z, heading: -EAST }, 0.1);                      // facing west: no push
  thing.update({ x: west - 4, z: c.log.z, heading: EAST }, 0.1);                         // too far
  thing.update({ x: west - 0.7, z: c.log.z + 3, heading: EAST }, 0.1);                   // beside it
  thing.update({ x: west - 0.7, z: c.log.z, heading: EAST }, 0);                         // no time passes
  assert.equal(c.t, 0);
  thing.update({ x: west - 0.7, z: c.log.z, heading: EAST }, 0.1);
  assert.ok(c.t > 0 && c.t < 0.2, 'pushed a little: ' + c.t);
  assert.equal(c.pushing, true);
  assert.ok(Math.abs(thing.logX() - (c.log.x0 + (c.log.x1 - c.log.x0) * c.t)) < 1e-9);
  assert.equal(thing.logX() - c.log.x0 > 0, true);
  assert.equal(c.log.z, thing.current().log.z, 'it only slides along x');
  const span = thing.logSpan();
  assert.ok(Math.abs(span[1] - span[0] - 2 * thing.HALF) < 1e-9);
  thing.update({ x: 0, z: 0, heading: 0 }, 0.1);
  assert.equal(c.pushing, false);
});

test('pushing all the way locks the log at the bridged spot as a walkable surface; the push step is done', () => {
  const ctx = startRio(flow());
  const { SA, thing, missions, said, tracked } = ctx, c = thing.current();
  const before = SA.surfaces.heightAt(c.log.x1, c.log.z);
  assert.ok(before === null || before < 0, 'over the water nothing holds you yet');
  pushAcross(ctx);
  assert.equal(c.phase, 'locked');
  assert.equal(c.t, 1);
  assert.equal(thing.logX(), c.log.x1);
  assert.equal(thing.solids().length, 0, 'you walk ON a locked log, it no longer blocks');
  assert.ok(said.includes('thing:tronco'));
  assert.ok(tracked.some(([t]) => t === 'log.locked'));
  assert.equal(missions.active().stepData.kind, 'goTo', 'the push step advanced');
  assert.equal(ctx.rt.target().role, 'rock');
  // the log and the rock are decks above the water, from the bank to the rock
  const top = SA.surfaces.heightAt(c.log.x1, c.log.z);
  assert.ok(top > SA.map.WATER_LEVEL + 0.5, 'standing height over the water: ' + top);
  for (let x = c.log.x1 - c.log.half + 0.1; x <= c.rock.x; x += 0.5) {
    assert.ok(SA.surfaces.heightAt(x, c.log.z) !== null, `walkable at x ${x}`);
  }
  assert.ok(SA.surfaces.heightAt(c.rock.x, c.rock.z) >= c.rock.y - 1e-9);
  assert.equal(SA.player.inWater(c.log.x1, c.log.z), false);
  // a locked log never moves again
  thing.update({ x: c.log.x1 - c.log.half - 0.7, z: c.log.z, heading: EAST }, 0.1);
  assert.equal(c.t, 1);
  // the physical hand-over: only the player's step along the deck (never a blocking circle) moves the kid onto the rock
  let p = { x: c.log.x1 - c.log.half - 0.6, z: c.log.z, heading: EAST };
  for (let i = 0; i < 200; i++) p = SA.player.step(p, { forward: true }, 0.05, thing.solids());
  assert.ok(p.x > c.rock.x - 0.5, 'the kid walks across the bridge to the rock: ' + p.x);
});

test('crossing: reaching the rock over the locked log completes the mission, says the animal and its bark, and rewards once', () => {
  const ctx = startRio(flow());
  const { SA, thing, missions, rt, said, later, cheers } = ctx, c = thing.current();
  // wading to the rock first does nothing
  rt.update({ x: c.rock.x, z: c.rock.z });
  assert.equal(missions.active().stepData.kind, 'push');
  assert.equal(said.length, 0);
  pushAcross(ctx);
  assert.equal(missions.active().stepData.kind, 'goTo');
  rt.update({ x: c.log.x1 - 2, z: c.log.z });                                      // still on the bank side of the rock
  assert.equal(missions.active().stepData.kind, 'goTo');
  const stars = SA.save.get().stars || 0;
  thing.update({ x: c.rock.x, z: c.rock.z, heading: EAST }, 0.016);
  assert.ok(said.includes('animal:perrito'));
  later.forEach((f) => f());
  assert.ok(said.includes('phrase:guau'));
  assert.equal(said.filter((k) => k === 'animal:perrito').length, 1, 'said once');
  const res = rt.update({ x: c.rock.x, z: c.rock.z });
  assert.equal(res.status, 'complete');
  assert.equal(missions.active(), null);
  assert.equal(missions.status('rio'), 'done');
  assert.equal(cheers.length, 1);
  assert.equal(SA.save.get().stars, stars + 2);
  assert.equal(thing.current().phase, 'locked', 'the bridge stays after the mission');
  assert.ok(thing.sync(), 'and stays after sync with no mission');
});

test('every step line is a short Spanish phrase (the pill speaks it) and the small tasks pause while the mission runs', () => {
  const ctx = startRio(flow());
  const { SA, missions } = ctx;
  const lines = missions.active().mission.steps.map((s) => s.line.es);
  for (const l of lines) assert.ok(l.split(/\s+/).length <= 4);
  const said = [];
  const view = { showStep: () => {} };
  const pill = SA.missionPill.create({ view, audio: { say: (k) => said.push(k) }, missions, focus: { active: () => 'mission' } });
  pill.update();
  assert.deepEqual(said, ['Empuja el tronco']);
  pushAcross(ctx);
  pill.update();
  assert.deepEqual(said, ['Empuja el tronco', 'Cruza el río']);
});

test('resume: a reload on the cross step puts the log across at once (never stuck); a replay re-places with a fresh seed', () => {
  const ctx = startRio(flow());
  const { SA, thing, missions } = ctx;
  pushAcross(ctx);
  // simulate a reload: a fresh instance reads the saved step (goTo)
  const fresh = { addFixed: () => {}, removeFixed: () => {}, near: () => false };   // a reload starts with no decks registered
  const again = SA.missionLog.create({ missions, surfaces: fresh, runtime: { report: () => { throw new Error('no report on resume'); } }, audio: { say: () => {} }, track: () => {} });
  again.update({ x: 0, z: 0, heading: 0 }, 0.016);
  assert.equal(again.current().phase, 'locked');
  assert.equal(again.locate('roca').r > 1, true);
  const deckBefore = SA.surfaces.heightAt(thing.current().log.x1, thing.current().log.z);
  assert.ok(deckBefore > 0);
  // finish, then replay: the old bridge goes away and a new scene is placed
  ctx.rt.update({ x: thing.current().rock.x, z: thing.current().rock.z });
  assert.equal(missions.active(), null);
  const oldZ = thing.current().z === undefined ? thing.current().log.z : thing.current().log.z;
  assert.equal(missions.start('rio').ok, true);
  thing.sync();
  assert.equal(thing.current().phase, 'ready');
  assert.equal(thing.current().t, 0);
  assert.ok(typeof oldZ === 'number');
  // the old log's deck was removed (unless the replay happens to place it on the same spot)
  const c = thing.current();
  if (Math.abs(c.log.z - oldZ) > 1) assert.equal(SA.surfaces.heightAt(c.log.x1, oldZ) === null || SA.surfaces.heightAt(c.log.x1, oldZ) < 0.3, true);
});

test('with no mission running there is nothing to draw, push or locate', () => {
  const { thing } = setup();
  assert.equal(thing.update({ x: 0, z: 0, heading: 0 }, 0.1), null);
  assert.equal(thing.current(), null);
  assert.equal(thing.solids().length, 0);
  assert.equal(thing.locate('roca'), null);
  assert.equal(thing.target({ kind: 'push', item: 'tronco' }), null);
  assert.equal(thing.logSpan(), null);
});

test('onChange tells views about a new scene, and the runtime default also asks the log for targets', () => {
  const ctx = flow();
  const seen = [];
  ctx.thing.onChange((cur) => seen.push(cur && cur.phase));
  startRio(ctx);
  pushAcross(ctx);
  assert.deepEqual(seen.slice(0, 2), ['ready', 'locked']);
  const SA = ctx.SA;
  const def = SA.missionRuntime.create({ missions: ctx.missions, spawn: null });
  SA.missionLog.setSolids([]);
  assert.equal(typeof def.target, 'function');
  assert.equal(def.target(), null, 'the default instance reads the global log, which has no scene');
  assert.equal(def.update({ x: 0, z: 0 }).status, 'none');
});

test('surfaces.removeFixed unregisters a fixed deck', () => {
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/map.js', 'game/surfaces.js']);
  const deck = { id: 't', x: 0, z: 0, dx: 1, dz: 0, halfLen: 1, halfWid: 1, y: 5, ramp: 0, railR: 0.1 };
  SA.surfaces.addFixed([deck]);
  assert.equal(SA.surfaces.heightAt(0, 0), 5);
  SA.surfaces.removeFixed([deck]);
  assert.ok(SA.surfaces.heightAt(0, 0) === null);
  SA.surfaces.removeFixed();
});
