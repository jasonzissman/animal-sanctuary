import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/movement-sounds.js']);
const M = SA.movesound;

/** Feeds `input` for `seconds` at 60 fps; returns { state, events: [{ t, ...event }] }. */
function run(input, seconds, state = M.create(), t0 = 0) {
  const events = [];
  const dt = 1 / 60;
  let t = 0;
  for (let k = 0; k < Math.round(seconds * 60); k++) {
    const r = M.step(state, input, dt);
    state = r.state;
    t += dt;
    r.events.forEach((e) => events.push({ t: t0 + t, ...e }));
  }
  return { state, events };
}

test('walking dry ground makes no sound', () => {
  assert.equal(run({}, 3).events.length, 0);
});

test('entering water plays one splash; staying in water does not repeat', () => {
  let r = run({ water: false }, 0.5);
  r = run({ water: true }, 5, r.state);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].sfx, 'splash');
  assert.ok(r.events[0].volume > 0 && r.events[0].volume <= 0.6, 'soft');
});

test('in-out-in water within 1 s is rate limited; after 1 s it splashes again', () => {
  let r = run({ water: true }, 0.1);
  assert.equal(r.events.length, 1);
  r = run({ water: false }, 0.2, r.state);
  r = run({ water: true }, 0.2, r.state);
  assert.equal(r.events.length, 0, 'too soon');
  r = run({ water: false }, 1.2, r.state);
  r = run({ water: true }, 0.1, r.state);
  assert.equal(r.events.length, 1, 'a fresh entry after the gap');
});

test('a hop landing in water is left to the landing sound (no extra splash)', () => {
  let r = run({ water: true, air: true }, 0.2);
  r = run({ water: true }, 1, r.state);
  assert.equal(r.events.length, 0);
});

test('the first frame of a game already standing in water splashes once, not every frame', () => {
  assert.equal(run({ water: true }, 3).events.length, 1);
});

test('up a tree is never "in water"', () => {
  assert.equal(run({ water: true, climbing: true }, 0.2).events.filter((e) => e.sfx === 'splash').length, 0);
});

test('climbing rustles at a steady ~0.35 s cadence and stops when the climb ends', () => {
  let r = run({ climbing: true }, 2);
  const rustles = r.events.filter((e) => e.sfx === 'rustle');
  assert.ok(rustles.length >= 5 && rustles.length <= 7, 'about every 0.35 s over 2 s: ' + rustles.length);
  assert.ok(rustles[0].t < 0.05, 'starts right away');
  for (let k = 1; k < rustles.length; k++) assert.ok(Math.abs(rustles[k].t - rustles[k - 1].t - M.RUSTLE_GAP) < 0.03, 'steady gap');
  assert.ok(rustles.every((e) => e.rate >= 0.5 && e.rate <= 2 && e.volume <= 1));
  assert.notEqual(rustles[0].rate, rustles[1].rate, 'tiny pitch variation');
  r = run({}, 2, r.state);
  assert.equal(r.events.length, 0, 'silent once the climb ends on the ground');
});

test('arriving in the canopy pops leaves once; climbing down to the ground does not', () => {
  let r = run({ climbing: true }, 1);
  r = run({ canopy: true }, 2, r.state);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].sfx, 'leafPop');
  let d = run({ climbing: true }, 1);
  d = run({}, 1, d.state);
  assert.equal(d.events.length, 0);
  let stay = run({ canopy: true }, 2);
  assert.equal(stay.events.length, 0, 'standing in the canopy is silent');
});

test('bad input and huge dt never throw or spam', () => {
  const r = M.step(null, null, -1);
  assert.equal(r.events.length, 0);
  const first = M.step(null, { climbing: true }, 0);
  assert.equal(first.events.length, 1, 'the climb starts with a rustle');
  const big = M.step(first.state, { climbing: true }, 99);   // dt is clamped to 0.25 s: one hitch frame never bursts
  assert.equal(big.events.length, 0);
  assert.equal(M.step(big.state, { climbing: true }, 99).events.length, 1);
});
