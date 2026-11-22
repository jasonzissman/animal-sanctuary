import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/turn.js']);
const T = SA.turn, PI = Math.PI;
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

test('shortest takes the short way round, across the ±PI wrap', () => {
  near(T.shortest(0, 1), 1);
  near(T.shortest(1, 0), -1);
  near(T.shortest(PI - 0.1, -PI + 0.1), 0.2);    // forward across the wrap, not -2PI+0.2
  near(T.shortest(-PI + 0.1, PI - 0.1), -0.2);
  near(T.shortest(0.1, 2 * PI - 0.1), -0.2);     // headings in [0, 2PI) too
  near(T.shortest(2 * PI - 0.1, 0.1), 0.2);
  near(T.shortest(3, 3), 0);
  assert.ok(Math.abs(T.shortest(0, PI)) <= PI + 1e-9);
  assert.equal(T.shortest(NaN, undefined), 0);
});

test('ease is a clamped smoothstep', () => {
  assert.equal(T.ease(-1), 0);
  assert.equal(T.ease(0), 0);
  assert.equal(T.ease(0.5), 0.5);
  assert.equal(T.ease(1), 1);
  assert.equal(T.ease(7), 1);
  assert.equal(T.ease(NaN), 0);
});

test('a turn lasts ~300 ms, moves monotonically along the short path and lands on the target', () => {
  assert.equal(T.DURATION, 0.3);
  let t = T.start(PI - 0.2, -PI + 0.2);   // 0.4 rad across the wrap
  const seen = [];
  let r;
  for (let i = 0; i < 20; i++) {
    r = T.step(t, 0.02); t = r.turn; seen.push(r.heading);
    if (r.done) break;
  }
  assert.ok(r.done);
  assert.ok(seen.length >= 14 && seen.length <= 16, 'about 300 ms of 20 ms frames: ' + seen.length);
  near(r.heading, (-PI + 0.2) + 2 * PI);          // normalised to [0, 2PI)
  // unwrap and check progress never goes backwards or the long way
  let prev = PI - 0.2;
  for (const h of seen) {
    let d = h - prev; if (d < -PI) d += 2 * PI;
    assert.ok(d >= -1e-12 && d < 0.4, 'monotonic short step ' + d);
    prev = h;
  }
});

test('step never mutates its input, tolerates junk dt, and a huge dt cannot skip past the target', () => {
  const t0 = T.start(0, 1);
  const frozen = JSON.stringify(t0);
  const r = T.step(t0, 0.1);
  assert.equal(JSON.stringify(t0), frozen);
  assert.ok(r.turn.t > t0.t);
  assert.equal(T.step(t0, NaN).turn.t, 0);
  assert.equal(T.step(t0, -5).turn.t, 0);
  let t = t0, out;
  for (let i = 0; i < 10; i++) { out = T.step(t, 100); t = out.turn; }
  assert.ok(out.done);
  near(out.heading, 1);
  assert.equal(T.start(0, 1, -3).dur, T.DURATION);   // bad duration falls back
  near(T.heading(T.start(0, 1)), 0);
});
