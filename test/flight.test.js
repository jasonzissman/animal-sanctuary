// AS-0337: the eagle chick's first flight as pure path / timing math (SA.flight): the phases, a loop that starts and ends at the nest, and the wing beat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/flight.js']);
const F = SA.flight;
const spec = { home: { x: 10, y: 5, z: 4 }, mama: { x: 9.8, z: 4.1 } };
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('phases follow each other: flap, fly, land, done; the total is the sum', () => {
  assert.equal(F.DURATION, F.PHASES.flap + F.PHASES.fly + F.PHASES.land);
  assert.deepEqual([0, F.PHASES.flap - 0.01, F.PHASES.flap, F.PHASES.flap + F.PHASES.fly - 0.01, F.PHASES.flap + F.PHASES.fly, F.DURATION - 0.01, F.DURATION, 99, -3, NaN].map((t) => F.phaseAt(t)),
    ['flap', 'flap', 'fly', 'fly', 'land', 'land', 'done', 'done', 'flap', 'flap']);
  assert.ok(F.DURATION > 4 && F.DURATION < 10, 'a short, readable flight');
});

test('the flight starts and ends exactly in the nest (no jump) and never goes below it', () => {
  const a = F.sample(spec, 0), z = F.sample(spec, F.DURATION), over = F.sample(spec, 500);
  [a, z, over].forEach((s) => assert.ok(Math.abs(s.x - 10) < 1e-9 && Math.abs(s.z - 4) < 1e-9));
  assert.ok(Math.abs(a.y - 5) < 1e-9 && Math.abs(z.y - 5) < 1e-9);
  assert.deepEqual([z.phase, z.flap], ['done', 0]);
  for (let t = 0; t <= F.DURATION; t += 0.05) assert.ok(F.sample(spec, t).y >= 5 - 1e-9, 'never under the twigs at ' + t);
});

test('it is continuous: no frame-to-frame jump bigger than a short hop (a smooth loop beside mamá)', () => {
  let prev = F.sample(spec, 0), far = 0, top = 0;
  for (let t = 0.02; t <= F.DURATION; t += 0.02) {
    const s = F.sample(spec, t);
    assert.ok(Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z) < 0.35, 'smooth at ' + t.toFixed(2));
    far = Math.max(far, d(s, spec.mama)); top = Math.max(top, s.y - 5);
    prev = s;
  }
  assert.ok(far > 1 && far < 3, 'a small loop, not a trip across the map: ' + far);
  assert.ok(top > 0.8 && top < 2.5, 'it rises into the air: ' + top);
});

test('the loop circles mamá once, in the fly phase only; heading follows the way it goes; the wings beat hardest while flying', () => {
  const t0 = F.PHASES.flap + 0.5, mid = F.sample(spec, F.PHASES.flap + F.PHASES.fly / 2);
  assert.equal(F.sample(spec, 0.5).phase, 'flap');
  assert.ok(d(F.sample(spec, 0.5), spec.home) < 1e-9, 'flapping on the spot');
  assert.equal(mid.phase, 'fly');
  assert.ok(Math.abs(d(mid, spec.mama) - 1.7) < 0.05, 'half-way round it is on the circle round mamá');
  const a = F.sample(spec, t0), b = F.sample(spec, t0 + 0.05);
  assert.ok(Math.abs(Math.sin(a.heading - Math.atan2(b.x - a.x, b.z - a.z))) < 0.35, 'it faces where it is going');
  assert.equal(F.sample(spec, 0.2).flap, 1);
  const late = F.sample(spec, F.DURATION - 0.1);
  assert.ok(late.flap < 1 && late.flap > 0, 'wings slow down as it lands');
  assert.deepEqual([F.sample(spec, NaN).phase, F.sample({ ...spec, radius: 3, height: 2 }, F.PHASES.flap + F.PHASES.fly / 2).y > mid.y], ['flap', true]);
});
