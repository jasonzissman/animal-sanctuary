// AS-0256: photos, clues, hints and the easter-egg reveal treat any herd instance as the species.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/photo.js',
  'game/render/instances.js', 'game/unlock-flow.js'];

// A stub animals group: children named by instanceId with userData.animalId (as buildAnimals makes them).
function herd(rows) {
  const children = rows.map(([id, x, z, visible]) => ({ name: id, visible: visible !== false, position: { x, z }, userData: { animalId: id.split('#')[0], instanceId: id } }));
  return { children, getObjectByName: (n) => children.find((c) => c.name === n) || null };
}

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  SA.render.instances.reset();
  return SA;
}

test('nearest: the closest visible instance among any of the matching species', () => {
  const SA = setup();
  const I = SA.render.instances;
  const g = herd([['conejo#0', 0, 0], ['conejo#1', 30, 0], ['pato#0', 12, 0], ['pato#1', 50, 0], ['pato#2', 4, 0, false]]);
  assert.equal(I.nearest(g, ['conejo', 'pato']).name, 'conejo#0', 'no player position: the first species\' default instance');
  I.setNear(28, 0);
  assert.equal(I.nearest(g, ['conejo', 'pato']).name, 'conejo#1');
  assert.equal(I.nearest(g, 'pato').name, 'pato#0', 'one species id works too');
  I.setNear(5, 0);
  assert.equal(I.nearest(g, ['pato']).name, 'pato#0', 'a hidden instance is never picked');
  I.setNear(49, 0);
  assert.equal(I.nearest(g, ['conejo', 'pato']).name, 'pato#1');
  assert.equal(I.nearest(g, ['nadie']), null);
  assert.equal(I.nearest(g, []), null);
});

test('photo of any instance counts for the species: judge and record go by animalId', () => {
  const SA = setup();
  const game = SA.round.create({ rng: SA.clues.makeRng(7), level: 1, track: () => {} });
  const r = game.start();
  // the tapped instance only changes the pick's instanceId; the pick still reports the species id
  assert.equal(SA.photo.judge(r, r.answerId), 'match');
  const res = SA.photo.take(game, { animalId: r.answerId, instanceId: r.answerId + '#3', part: 'cola', item: 'camara' });
  assert.equal(res.verdict, 'match');
  assert.equal(res.saved, 1);
  assert.equal(res.status, 'correct');
  assert.equal(SA.save.get().photos[r.answerId], 1, 'the album counts it under the species');
  assert.equal(SA.photo.record(r.answerId), 1 + 1, 'another instance adds to the same species');
});

test('clue answers: every species that fits is right whichever instance is picked', () => {
  const SA = setup();
  const game = SA.round.create({ rng: SA.clues.makeRng(11), level: 1, track: () => {} });
  const r = game.start();
  for (const id of r.answerIds) {
    const g2 = SA.round.create({ rng: SA.clues.makeRng(11), level: 1, track: () => {} });
    const r2 = g2.start();
    assert.equal(g2.pick({ animalId: id, instanceId: id + '#4', part: 'cola' }).status, 'correct');
    assert.equal(r2.answerIds.includes(id), true);
  }
});

test('unlockFlow.reveal shows every instance of the creature', () => {
  const SA = setup();
  const g = herd([['raton#0', 5, 5, false], ['raton#1', 40, 3, false], ['conejo#0', 1, 1, false]]);
  const flow = SA.unlockFlow.create({ group: g, audio: {}, later: () => {} });
  assert.equal(flow.reveal(SA.data.get('animals', 'raton')), true);
  assert.deepEqual(g.children.map((c) => c.visible), [true, true, false], 'both mice, not the rabbit');
});
