import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';
import { legSink, nearestPointInBox } from './helpers/leg-fit.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
  'game/data/animals.js', 'game/animal-plan.js']);

const MIN_SINK = 0.03;   // every leg must reach at least this far inside the body volume

test('every leg of every registered animal overlaps its body (no visible gap)', () => {
  const animals = SA.data.all('animals');
  assert.ok(animals.length > 0);
  let legs = 0;
  for (const a of animals) {
    const plan = SA.animalPlan.plan(a);
    const body = plan.find((e) => e.part === 'cuerpo');
    for (const leg of plan.filter((e) => e.part === 'patas' && !e.extra)) {   // the legs themselves; knee bumps and feet are extras
      legs++;
      assert.ok(body, `${a.id} has legs but no cuerpo`);
      const sink = legSink(leg, body);
      assert.ok(sink >= MIN_SINK,
        `${a.id}: leg ${leg.index} sinks only ${sink.toFixed(3)} into the body (needs >= ${MIN_SINK}); move or enlarge the leg in game/data/animals.js`);
    }
  }
  assert.ok(legs > 0);
});

test('leg helper: nearest point and sink depth', () => {
  const body = { builder: 'sphere', position: [0, 0, 0], worldSize: [2, 2, 2] };
  const leg = (pos) => ({ builder: 'cylinder', position: pos, worldSize: [0.2, 0.2, 0.2] });
  assert.deepEqual(nearestPointInBox(leg([0, 3, 0]), [0, 0, 0]), [0, 2.9, 0]);
  assert.ok(Math.abs(legSink(leg([0, 0.9, 0]), body) - 0.2) < 1e-9);   // top reaches 0.2 inside the surface
  assert.ok(legSink(leg([0, 1.5, 0]), body) < 0);                      // floating below/above the body: a gap
  assert.ok(legSink(leg([0.9, 0.9, 0.9]), body) < 0);                  // corner of a sphere: box overlaps, volume does not
});
