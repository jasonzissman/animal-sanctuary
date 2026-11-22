import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';
import { bounds, overlapDepth, volumesOverlap, surfaceDistance, eyeSurfaceDistance } from './helpers/head-fit.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
  'game/data/animals.js', 'game/animal-plan.js']);

const MIN_OVERLAP = 0.05;   // head and body must share at least this much depth on every axis
// An eye's centre may sit up to its own radius outside the head surface, or up to this fraction
// of its radius sunk inside (the pupil pokes out the front), so it reads as "on" the head.
const MAX_SUNK = 0.5;

test('every registered animal has a head that overlaps its body', () => {
  const animals = SA.data.all('animals');
  assert.ok(animals.length > 0);
  for (const a of animals) {
    const plan = SA.animalPlan.plan(a);
    const head = plan.find((e) => e.part === 'cabeza');
    const body = plan.find((e) => e.part === 'cuerpo');
    assert.ok(head && body, `${a.id} needs a cabeza and a cuerpo`);
    // The head attaches to the body directly, or through a chain of overlapping extra head pieces (a long neck).
    const pieces = plan.filter((e) => e.part === 'cabeza');
    const linked = new Set([head]);
    for (let grew = true; grew;) {
      grew = false;
      for (const p of pieces) {
        if (!linked.has(p) && [...linked].some((q) => volumesOverlap(p, q, MIN_OVERLAP))) { linked.add(p); grew = true; }
      }
    }
    assert.equal(linked.size, pieces.length, `${a.id}: a head/neck piece floats free of the head`);
    assert.ok([...linked].some((p) => volumesOverlap(p, body, MIN_OVERLAP)),
      `${a.id}: head does not reach the body (depth per axis ${overlapDepth(head, body).map((d) => d.toFixed(2))})`);
  }
});

test('every eye of every animal sits near the head surface', () => {
  for (const a of SA.data.all('animals')) {
    const plan = SA.animalPlan.plan(a);
    const head = plan.find((e) => e.part === 'cabeza');
    const eyes = plan.filter((e) => e.part === 'ojos');
    for (const eye of eyes) {
      const radius = eye.worldSize[0] / 2;
      const dist = eyeSurfaceDistance(head, eye);
      assert.ok(dist <= radius && dist >= -MAX_SUNK * radius,
        `${a.id}: eye ${eye.index} is ${dist.toFixed(3)} from the head surface (allowed ${(-MAX_SUNK * radius).toFixed(3)}..${radius.toFixed(3)})`);
    }
  }
});

test('geometry helper: bounds, overlap and surface distance', () => {
  const box = { builder: 'box', position: [0, 0, 0], worldSize: [2, 2, 2] };
  const ball = { builder: 'sphere', position: [0, 0, 0], worldSize: [2, 2, 2] };
  assert.deepEqual(bounds(box), { min: [-1, -1, -1], max: [1, 1, 1] });
  assert.deepEqual(overlapDepth(box, { ...box, position: [1.5, 0, 0] }), [0.5, 2, 2]);
  assert.ok(volumesOverlap(box, { ...box, position: [1.5, 0, 0] }));
  assert.ok(!volumesOverlap(box, { ...box, position: [3, 0, 0] }));
  assert.ok(!volumesOverlap(box, { ...box, position: [1.5, 0, 0] }, 0.6));
  assert.equal(surfaceDistance(ball, [2, 0, 0]), 1);
  assert.equal(surfaceDistance(ball, [0, 0, 0]), -1);
  assert.equal(surfaceDistance(ball, [1, 0, 0]), 0);
  assert.equal(surfaceDistance(box, [3, 0, 0]), 2);
  assert.equal(surfaceDistance(box, [0.5, 0, 0]), -0.5);
  assert.equal(surfaceDistance(box, [2, 2, 1]), Math.hypot(1, 1));
});

test('checks flag a floating head and a buried or detached eye', () => {
  const head = { builder: 'sphere', position: [0, 1, 0], worldSize: [1, 1, 1] };
  assert.ok(!volumesOverlap(head, { builder: 'sphere', position: [0, 3, 0], worldSize: [1, 1, 1] }, MIN_OVERLAP));
  assert.ok(eyeSurfaceDistance(head, { position: [0, 1, 0] }) < -0.4);      // buried at the centre
  assert.ok(eyeSurfaceDistance(head, { position: [0, 1, 1.5] }) > 0.4);     // floating away
});
