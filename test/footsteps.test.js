import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/footsteps.js']);
const F = SA.footsteps;

/** Runs `seconds` of input at 60 fps; returns the events with the time they fired. */
function run(input, seconds, state = F.create()) {
  const events = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    const r = F.step(state, input, dt);
    state = r.state;
    if (r.event) events.push({ t, ...r.event });
  }
  return { events, state };
}

test('walking steps about every 0.45 s', () => {
  const { events } = run({ moving: true }, 4.5);
  assert.ok(events.length >= 9 && events.length <= 11, 'got ' + events.length);
  for (let i = 1; i < events.length; i++) assert.ok(Math.abs(events[i].t - events[i - 1].t - F.WALK_GAP) < 0.03);
});

test('running steps about every 0.28 s: quicker than walking', () => {
  const { events } = run({ moving: true, running: true }, 2.8);
  assert.ok(events.length >= 9 && events.length <= 11, 'got ' + events.length);
  assert.ok(events.length > run({ moving: true }, 2.8).events.length);
  for (let i = 1; i < events.length; i++) assert.ok(Math.abs(events[i].t - events[i - 1].t - F.RUN_GAP) < 0.03);
});

test('no steps when still, airborne or climbing', () => {
  assert.equal(run({ moving: false }, 3).events.length, 0);
  assert.equal(run({ moving: true, air: true }, 3).events.length, 0);
  assert.equal(run({ moving: true, climbing: true }, 3).events.length, 0);
  assert.equal(run({ moving: true, running: true, air: true }, 3).events.length, 0);
});

test('the surface picks the recipe: water -> stepWet, canopy -> stepLeaf, otherwise step', () => {
  const name = (surface) => run({ moving: true, surface }, 1).events[0].sfx;
  assert.equal(name('water'), 'stepWet');
  assert.equal(name('canopy'), 'stepLeaf');
  assert.equal(name('ground'), 'step');
  assert.equal(name(undefined), 'step');
  assert.equal(name('lava'), 'step');
});

test('pitch varies a little from step to step (never random, never wild)', () => {
  const rates = run({ moving: true, running: true }, 3).events.map((e) => e.rate);
  assert.ok(new Set(rates).size > 2);
  rates.forEach((r) => assert.ok(r >= 0.9 && r <= 1.1));
  assert.deepEqual(rates, run({ moving: true, running: true }, 3).events.map((e) => e.rate));
});

test('stopping or jumping resets the timer; the next walk steps soon, and the state is never mutated', () => {
  const s = F.create();
  const frozen = JSON.stringify(s);
  F.step(s, { moving: true }, 0.1);
  assert.equal(JSON.stringify(s), frozen);
  const mid = run({ moving: true }, 0.2).state;
  const reset = F.step(mid, { moving: false }, 0.016).state;
  assert.equal(reset.t, 0);
  const first = run({ moving: true }, 1, reset).events[0];
  assert.ok(first.t < F.WALK_GAP, 'first step comes within a half gap');
});

test('a long frame does not burst several steps and missing input is safe', () => {
  const r = F.step(F.create(), { moving: true }, 5);
  assert.ok(r.event);
  assert.ok(r.state.t < F.WALK_GAP);
  assert.equal(F.step(undefined, undefined, 0.1).event, null);
});

test('landSound: thump on ground, quieter splash in water, leafy brush in a canopy (AS-0119)', () => {
  assert.equal(F.landSound('ground').sfx, 'land');
  assert.equal(F.landSound('water').sfx, 'splash');
  assert.ok(F.landSound('water').volume < 1, 'splash is quieter than its usual level');
  assert.equal(F.landSound('canopy').sfx, 'stepLeaf');
  assert.equal(F.landSound(undefined).sfx, 'land');
  assert.equal(F.landSound('lava').sfx, 'land');
  F.landSound('water').volume = 9;
  assert.equal(F.landSound('water').volume, 0.5, 'callers cannot mutate the table');
});
