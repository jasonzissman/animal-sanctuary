import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/pick-sfx.js',
  'game/round.js', 'game/render/round-fx.js', 'game/ui/prompt.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const sfx = [];
  SA.audio = { sfx: (n) => sfx.push(n), say() {} };
  const quiet = new Proxy({}, { get: () => () => {} });
  const game = SA.round.create({ rng: SA.clues.makeRng(7), track: () => {} });
  const ctl = SA.prompt.createController({ game, view: quiet, fx: null, later: () => {} });
  SA.pickSfx.install();
  SA.picking.onPick(ctl.onPick);
  return { SA, sfx, ctl };
}

test('every pick plays pop exactly once (correct pick: pop + chime)', () => {
  const { SA, sfx, ctl } = setup();
  const r = ctl.begin();
  SA.picking.emit({ animalId: r.answerId, part: 'cuerpo' });
  assert.deepEqual(sfx.filter((n) => n === 'pop'), ['pop']);
  assert.deepEqual(sfx, ['pop', 'chime']);
});

test('a wrong pick plays pop once and boing once', () => {
  const { SA, sfx, ctl } = setup();
  const r = ctl.begin();
  const other = SA.data.all('animals').find((a) => a.id !== r.answerId).id;
  SA.picking.emit({ animalId: other, part: 'cola' });
  assert.deepEqual(sfx, ['pop', 'boing']);
});

test('rubbing a care target stays quiet (care plays its own splash)', () => {
  const { SA, sfx } = setup();
  SA.picking.setRubTarget('tortuga', 'caparazon');
  SA.picking.emit({ animalId: 'tortuga', part: 'caparazon' });
  assert.deepEqual(sfx, []);
  SA.picking.emit({ animalId: 'tortuga', part: 'cola' });
  assert.deepEqual(sfx, ['pop']);
});

test('missing SA.audio, audio without sfx, or a throwing sfx never throws', () => {
  const { SA } = setup();
  SA.audio = undefined;
  assert.doesNotThrow(() => SA.picking.emit({ animalId: 'x', part: 'cola' }));
  SA.audio = {};
  assert.doesNotThrow(() => SA.picking.emit({ animalId: 'x', part: 'cola' }));
  SA.audio = { sfx() { throw new Error('boom'); } };
  assert.doesNotThrow(() => SA.picking.emit({ animalId: 'x', part: 'cola' }));
});

test('install can be unsubscribed, and is a no-op without SA.picking', () => {
  const SA = loadGame(['game/sa.js', 'game/pick-sfx.js']);
  assert.equal(typeof SA.pickSfx.install(), 'function');
  const SA2 = loadGame(['game/sa.js', 'game/picking.js', 'game/pick-sfx.js']);
  const sfx = [];
  SA2.audio = { sfx: (n) => sfx.push(n) };
  const off = SA2.pickSfx.install();
  SA2.picking.emit({ animalId: 'a', part: 'cola' });
  off();
  SA2.picking.emit({ animalId: 'a', part: 'cola' });
  assert.deepEqual(sfx, ['pop']);
});
