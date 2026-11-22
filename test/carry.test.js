import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/carry.js', 'game/mission-runtime.js'];

const line = (es, icon) => ({ es, icon });
const ROWS = [{ id: 'm1', n: 1, es: 'Uno', en: 'One', icon: '1', reward: { stars: 3 },
  steps: [{ kind: 'carry', item: 'roca', fragile: true, line: line('Lleva la roca', '🪨') },
    { kind: 'deliver', item: 'roca', to: 'nido', line: line('Déjala en el nido', '🪺') }] },
{ id: 'm2', n: 2, es: 'Dos', en: 'Two', icon: '2', reward: { stars: 1 },
  steps: [{ kind: 'carry', item: 'cerdito', line: line('Lleva al cerdito', '🐷') },
    { kind: 'deliver', item: 'cerdito', to: 'mama', line: line('Con mamá', '🐖') }] }];
const LOCATE = { nido: { x: 10, z: 0 }, mama: { x: 0, z: 10, r: 4 } };
const locate = (id) => LOCATE[id] || null;

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [], cheers = [], said = [];
  const missions = SA.missions.create({ missions: ROWS, track: (t, f) => tracked.push([t, f]) });
  const carry = SA.carry.create({ track: (t, f) => tracked.push([t, f]) });
  const rt = SA.missionRuntime.create({ missions, carry, locate, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  const focus = SA.focus.create({ missions });
  const shown = [];
  const pill = SA.missionPill.create({ view: { showStep: (s) => shown.push(s) }, audio: { say: (t) => said.push(t) }, missions, focus });
  return { SA, missions, carry, rt, cheers, tracked, shown, said, pill };
}

test('pickUp: an item is added to the inventory and equipped; an animal fills the slot; holds() tells which', () => {
  const { SA, carry } = setup();
  assert.equal(carry.holds(), false);
  assert.equal(carry.holds('roca'), false);
  assert.equal(carry.pickUp('roca'), true);
  assert.equal(SA.inventory.equipped(), 'roca');
  assert.equal(carry.holds('roca'), true);
  assert.equal(carry.holds('cerdito'), false);
  assert.equal(carry.pickUp('cerdito'), true);
  assert.equal(carry.holds('cerdito'), true);
  assert.equal(carry.pickUp(''), false);
  assert.equal(carry.pickUp(7), false);
});

test('a carry step advances only when the item is held', () => {
  const { carry, rt, missions } = setup();
  missions.start('m1');
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'none');           // nothing in hand
  assert.equal(missions.active().step, 0);
  carry.pickUp('cerdito');                                          // the wrong thing
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'none');
  assert.equal(missions.active().step, 0);
  carry.pickUp('roca');
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'step');
  assert.equal(missions.active().step, 1);
});

test('a carry step with an animal (not an inventory item) works through the slot', () => {
  const { SA, carry, rt, missions } = setup();
  SA.save.update({ missions: { done: ['m1'], active: null } });
  missions.start('m2');
  carry.pickUp('cerdito');
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'step');
  assert.equal(rt.update({ x: 0, z: 3 }).status, 'none');           // 7 away from mamá (reach 4)
  assert.equal(rt.update({ x: 0, z: 7 }).status, 'complete');       // 3 away: drops the piglet
  assert.equal(carry.holds('cerdito'), false);
});

test('fragile: a jump wobbles the held thing, fades out, and never fails, drops or resets the step', () => {
  const { carry, rt, missions } = setup();
  missions.start('m1');
  carry.pickUp('roca');
  assert.equal(carry.fragile(), false);
  assert.equal(carry.jumped(), false);                              // not flagged fragile yet: no wobble
  assert.equal(carry.wobble().active, false);
  rt.update({ x: 0, z: 0 });                                        // the carry step flags it fragile and advances
  assert.equal(carry.fragile(), true);
  assert.equal(missions.active().step, 1);
  carry.update(0.016, { jump: 'takeoff' });
  const w = carry.wobble();
  assert.equal(w.active, true);
  assert.ok(w.t < 0.1);
  let moved = false;
  for (let i = 0; i < 20; i++) { carry.update(0.016, { jump: null }); if (Math.abs(carry.wobble().angle) > 0.05) moved = true; }
  assert.ok(moved, 'the held thing swings');
  // still held, step untouched
  assert.equal(carry.holds('roca'), true);
  assert.equal(missions.active().step, 1);
  for (let i = 0; i < 20; i++) carry.update(0.1, { jump: null });
  assert.deepEqual(JSON.parse(JSON.stringify(carry.wobble())), { active: false, angle: 0, tilt: 0, t: carry.DURATION });
  assert.equal(carry.holds('roca'), true);
});

test('wobble: a held jump event triggers once; a double jump triggers again; non-fragile never wobbles', () => {
  const { carry } = setup();
  carry.pickUp('roca');                                             // not fragile
  carry.update(0.016, { jump: 'takeoff' });
  assert.equal(carry.wobble().active, false);
  carry.update(0.016, { jump: null });
  carry.pickUp('roca', { fragile: true });
  carry.update(0.016, { jump: 'takeoff' });
  assert.equal(carry.wobble().active, true);
  for (let i = 0; i < 12; i++) carry.update(0.1, { jump: null });
  assert.equal(carry.wobble().active, false);
  carry.update(0.016, { jump: 'land' });
  assert.equal(carry.wobble().active, false);
  carry.update(0.016, { jump: 'double' });
  assert.equal(carry.wobble().active, true);
  carry.update(0.016);                                              // no player: just ticks
  carry.update(0.016, null);
});

test('a deliver step advances only when the carried item reaches its target', () => {
  const { carry, rt, missions } = setup();
  missions.start('m1');
  carry.pickUp('roca');
  rt.update({ x: 0, z: 0 });                                        // carry done
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'none');           // far from the nido
  assert.equal(missions.active().step, 1);
  assert.equal(rt.update({ x: 7.4, z: 0 }).status, 'none');         // 2.6 away: just outside the default reach 2.5
  assert.equal(carry.holds('roca'), true);
  assert.equal(rt.update({ x: 8, z: 0 }).status, 'complete');
  assert.equal(carry.holds('roca'), false);
});

test('a deliver step does nothing when the item is not held, even at the target', () => {
  const { carry, rt, missions, SA } = setup();
  missions.start('m1');
  carry.pickUp('roca');
  rt.update({ x: 10, z: 0 });                                       // carry done (the step after is deliver, we are at the nido)
  carry.drop();
  assert.equal(SA.inventory.has('roca'), false);
  assert.equal(rt.update({ x: 10, z: 0 }).status, 'none');
  assert.equal(missions.active().step, 1);
  assert.equal(carry.deliver({ x: 10, z: 0 }, { item: 'roca', to: 'nido' }, locate), null);
  assert.equal(carry.deliver({ x: 10, z: 0 }, { item: 'roca', to: 'nowhere' }, locate), null);
  assert.equal(carry.deliver(null, { item: 'roca', to: 'nido' }, locate), null);
});

test('end to end: carry (fragile), jump-wobble, deliver completes the mission once with its reward; the pill follows each step', () => {
  const { SA, carry, rt, missions, cheers, shown, said, pill } = setup();
  missions.start('m1');
  pill.update();
  assert.equal(shown[shown.length - 1].icon, '🪨');
  carry.pickUp('roca');
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'step');
  pill.update();
  assert.equal(shown[shown.length - 1].icon, '🪺');
  assert.ok(said.length >= 2, 'each step is spoken');
  carry.update(0.016, { jump: 'takeoff' });                         // a funny wobble on the way
  assert.equal(carry.wobble().active, true);
  const done = rt.update({ x: 10, z: 1 });
  assert.equal(done.status, 'complete');
  assert.equal(done.firstTime, true);
  assert.equal(SA.save.get().stars, 3);
  assert.equal(cheers.length, 1);
  assert.equal(missions.active(), null);
  assert.equal(rt.update({ x: 10, z: 1 }).status, 'none');          // nothing runs: no second reward
  assert.equal(SA.save.get().stars, 3);
});
