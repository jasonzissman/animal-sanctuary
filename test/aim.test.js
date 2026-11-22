import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const LOGIC = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/picking.js', 'game/aim.js'];
const part = (id, x, y, extra = {}) => ({ id, x, y, ...extra });

test('aiming a few pixels off a small part (feet, beak) still targets it', () => {
  const SA = loadGame(LOGIC);
  const feet = part('conejo:patas:0', 300, 400, { r: 4 });
  const n = SA.aim.nearest({ x: 318, y: 392 }, [feet, part('conejo:cuerpo:0', 300, 300, { r: 40 })]);
  assert.equal(n.candidate.id, 'conejo:patas:0');
  assert.ok(n.dist < SA.aim.RADIUS);
});

test('nothing within the radius is no target; touch gets a larger radius', () => {
  const SA = loadGame(LOGIC);
  const beak = part('tucan:pico:0', 100, 100);
  assert.equal(SA.aim.nearest({ x: 100, y: 160 }, [beak]), null);              // 60px: too far for a mouse
  assert.equal(SA.aim.nearest({ x: 100, y: 160 }, [beak], { touch: true }).candidate.id, 'tucan:pico:0');   // 72px reach
  assert.equal(SA.aim.nearest({ x: 100, y: 190 }, [beak], { touch: true }), null);
  assert.equal(SA.aim.nearest({ x: 0, y: 0 }, []), null);
  assert.equal(SA.aim.nearest(null, [beak]), null);
  assert.equal(SA.aim.nearest({ x: NaN, y: 0 }, [beak]), null);
});

test('nearest picks the closest part; a direct hit wins; ties go to the smaller part', () => {
  const SA = loadGame(LOGIC);
  const a = part('a', 100, 100), b = part('b', 120, 100);
  assert.equal(SA.aim.nearest({ x: 115, y: 100 }, [a, b]).candidate.id, 'b');
  assert.equal(SA.aim.nearest({ x: 115, y: 100 }, [a, { ...a, id: 'c', x: 200, direct: true }, b]).candidate.id, 'c');
  const big = part('big', 100, 100, { r: 60 }), small = part('small', 100, 100, { r: 5 });
  assert.equal(SA.aim.nearest({ x: 100, y: 100 }, [big, small]).candidate.id, 'small');
});

test("a part's own size is forgiven only up to SLACK_MAX", () => {
  const SA = loadGame(LOGIC);
  const huge = part('huge', 100, 100, { r: 500 });
  const n = SA.aim.nearest({ x: 100, y: 200 }, [huge], { radius: 100 });
  assert.equal(Math.round(n.dist), 100 - SA.aim.SLACK_MAX);
});

test('hysteresis: the target sticks while the pointer wobbles between two close parts', () => {
  const SA = loadGame(LOGIC);
  const aim = SA.aim.create();
  const left = part('left', 100, 100), right = part('right', 140, 100);
  const both = [left, right];
  assert.equal(aim.update({ x: 105, y: 100 }, both).id, 'left');
  // Pointer drifts past the midpoint: right is a bit closer, but not by enough to steal the highlight.
  for (const x of [118, 121, 122, 119, 120]) assert.equal(aim.update({ x, y: 100 }, both).id, 'left', 'x=' + x);
  // Clearly nearer the other one: the highlight moves, and then it sticks there too.
  assert.equal(aim.update({ x: 138, y: 100 }, both).id, 'right');
  for (const x of [121, 120, 122]) assert.equal(aim.update({ x, y: 100 }, both).id, 'right', 'x=' + x);
  assert.equal(aim.target().id, 'right');
});

test('hysteresis: a target is kept a bit beyond the acquire radius, then released', () => {
  const SA = loadGame(LOGIC);
  const aim = SA.aim.create();
  const p = part('p', 100, 100);
  assert.equal(aim.update({ x: 100, y: 140 }, [p]).id, 'p');
  assert.equal(aim.update({ x: 100, y: 100 + 55 }, [p]).id, 'p');                 // 55 > 48 but < 48 * 1.3
  assert.equal(aim.update({ x: 100, y: 100 + 70 }, [p]), null);                    // way out: released
  assert.equal(aim.target(), null);
  assert.equal(aim.update({ x: 100, y: 100 + 55 }, [p]), null);                    // and 55px no longer acquires a new one
});

test('hysteresis follows a moving part (fresh position, same id) and drops it when it leaves the candidates', () => {
  const SA = loadGame(LOGIC);
  const aim = SA.aim.create();
  assert.equal(aim.update({ x: 100, y: 100 }, [part('p', 100, 110)]).y, 110);
  assert.equal(aim.update({ x: 100, y: 100 }, [part('p', 102, 120)]).y, 120);
  assert.equal(aim.update({ x: 100, y: 100 }, []), null);                          // out of reach / off screen
  assert.equal(aim.update(null, [part('p', 100, 100)]), null);                     // no pointer: no target
});

test('aim.clear and touch updates', () => {
  const SA = loadGame(LOGIC);
  const aim = SA.aim.create({ radius: 20 });
  const p = part('p', 100, 100);
  assert.equal(aim.update({ x: 100, y: 130 }, [p]), null);                         // 30 > 20
  assert.equal(aim.update({ x: 100, y: 130 }, [p], { touch: true }).id, 'p');      // 20 * 1.5 = 30
  aim.clear();
  assert.equal(aim.target(), null);
});

test('SA.picking.emit passes the equipped item through, and omits it for empty hands', () => {
  const SA = loadGame(LOGIC);
  const seen = [];
  SA.picking.onPick(p => seen.push({ ...p }));
  SA.picking.emit({ animalId: 'conejo', part: 'cola', item: 'venda' });
  SA.picking.emit({ animalId: 'conejo', part: 'cola', item: undefined });
  assert.deepEqual(seen, [{ animalId: 'conejo', part: 'cola', item: 'venda' }, { animalId: 'conejo', part: 'cola' }]);
});
