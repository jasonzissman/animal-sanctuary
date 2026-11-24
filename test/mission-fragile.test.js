import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/inventory.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/carry.js', 'game/mission-fragile.js'];

const WALK = { moving: true, running: false, jump: null };
const RUN = { moving: true, running: true, jump: null };
const STILL = { moving: false, running: true, jump: null };   // running flag but not moving: no reaction
const JUMP = { moving: false, running: false, jump: 'takeoff' };

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const sfx = [], said = [], toasts = [], tracked = [];
  const carry = SA.carry.create({ track: () => {} });
  const watch = SA.missionFragile.create({ carry, audio: { sfx: (n) => sfx.push(n), say: (k) => said.push(k) },
    toast: (m) => toasts.push(m), track: (t, f) => tracked.push([t, f]) });
  return { SA, carry, watch, sfx, said, toasts, tracked };
}

test('data: the egg step is flagged fragile as data, and ¡Despacio! is a vocab phrase', () => {
  const { SA } = setup();
  const egg = SA.data.all('missions').find((m) => m.carry);
  assert.equal(egg.steps[0].kind, 'carry');
  assert.equal(egg.steps[0].fragile, true);
  assert.equal(SA.vocab.get('phrase:despacio').es, '¡Despacio!');
  assert.equal(SA.missionFragile.KEY, 'phrase:despacio');
});

test('hurry: jumping or running while moving counts; walking, standing and a stale running flag do not', () => {
  const { SA } = setup();
  const h = SA.missionFragile.hurry;
  assert.equal(h(JUMP), 'jump');
  assert.equal(h({ jump: 'double' }), 'jump');
  assert.equal(h(RUN), 'run');
  assert.equal(h(WALK), null);
  assert.equal(h(STILL), null);
  assert.equal(h({ jump: 'land', moving: false }), null);
  assert.equal(h(null), null);
});

test('walking slowly while carrying the fragile egg gives no warning', () => {
  const { carry, watch, sfx, said, toasts } = setup();
  carry.pickUp('huevo', { fragile: true });
  for (let i = 0; i < 300; i++) assert.equal(watch.update(0.05, WALK), null);
  assert.deepEqual([sfx, said, toasts], [[], [], []]);
});

test('running with the fragile egg quacks, says and shows ¡Despacio! once, then waits out the rate limit', () => {
  const { SA, carry, watch, sfx, said, toasts, tracked } = setup();
  carry.pickUp('huevo', { fragile: true });
  const ev = watch.update(0.05, RUN);
  assert.equal(ev.kind, 'run');
  assert.deepEqual(sfx, ['quack']);
  assert.deepEqual(said, ['phrase:despacio']);
  assert.equal(toasts.length, 1);
  assert.ok(toasts[0].includes('¡Despacio!'));
  assert.equal(tracked[0][0], 'carry.despacio');
  assert.equal(tracked[0][1].kind, 'run');
  const n = Math.floor((SA.missionFragile.COOLDOWN - 0.3) / 0.05);
  for (let i = 0; i < n; i++) assert.equal(watch.update(0.05, RUN), null);     // still inside the cooldown
  assert.equal(sfx.length, 1);
  for (let i = 0; i < 12; i++) watch.update(0.05, RUN);                        // the cooldown is over: it may speak again
  assert.equal(sfx.length, 2);
});

test('a jump with the fragile egg reacts once per takeoff, and a held takeoff event is not a second jump', () => {
  const { SA, carry, watch, sfx } = setup();
  carry.pickUp('huevo', { fragile: true });
  assert.equal(watch.update(0.016, JUMP).kind, 'jump');
  for (let i = 0; i < 5; i++) assert.equal(watch.update(0.016, JUMP), null);
  assert.equal(sfx.length, 1);
  // a second jump after the cooldown fires again
  watch.update(SA.missionFragile.COOLDOWN, { moving: false, jump: null });
  for (let i = 0; i < 20; i++) watch.update(0.25, { moving: false, jump: null });
  assert.equal(watch.update(0.016, { moving: false, jump: 'double' }).kind, 'jump');
});

test('no reaction for a thing that is not fragile or when nothing is carried', () => {
  const { carry, watch, sfx } = setup();
  assert.equal(watch.update(0.05, RUN), null);              // empty hands
  carry.pickUp('roca');                                     // held but not flagged fragile
  assert.equal(watch.update(0.05, RUN), null);
  assert.equal(watch.update(0.05, JUMP), null);
  assert.deepEqual(sfx, []);
});

test('step() is pure: the same input gives the same answer and the input state is not mutated', () => {
  const { SA } = setup();
  const s0 = { wait: 0, prevJump: null };
  const a = SA.missionFragile.step(s0, { fragile: true, player: RUN }, 0.1);
  const b = SA.missionFragile.step(s0, { fragile: true, player: RUN }, 0.1);
  assert.deepEqual(a, b);
  assert.deepEqual(s0, { wait: 0, prevJump: null });
  assert.equal(SA.missionFragile.step(null, { fragile: false, player: RUN }, 0.1).event, null);
});

test('the egg is never harmed: running keeps it held and fragile, and the wobble restarts while running', () => {
  const { carry, watch } = setup();
  carry.pickUp('huevo', { fragile: true });
  carry.update(0.016, RUN);
  assert.equal(carry.wobble().active, true);                 // running wobbles the held egg
  for (let i = 0; i < 100; i++) { carry.update(0.05, RUN); watch.update(0.05, RUN); }
  assert.equal(carry.holds('huevo'), true);
  assert.equal(carry.fragile(), true);
  for (let i = 0; i < 40; i++) carry.update(0.05, WALK);     // walking: the wobble fades out
  assert.equal(carry.wobble().active, false);
});

test('a throwing audio or toast never breaks the loop', () => {
  const { SA, carry } = setup();
  const w = SA.missionFragile.create({ carry, audio: { sfx() { throw new Error('x'); } }, toast() { throw new Error('y'); }, track() { throw new Error('z'); } });
  carry.pickUp('huevo', { fragile: true });
  assert.equal(w.update(0.05, RUN).kind, 'run');
});
