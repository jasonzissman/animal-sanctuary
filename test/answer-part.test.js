import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// A find-animal clue whose answer also names a part (rana: 'Busca el animal con ojos grandes' -> { animalId, part: 'ojos' }).
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/map.js', 'game/camera.js',
  'game/round.js', 'game/hint-pointer.js', 'game/ui/hint-arrow.js', 'game/ui/hint-flow.js'];
const CAM = { x: 0, z: 0, dist: 40, yaw: 0, pitch: 55 };

function ranaRound(SA) {
  SA.save.reset();
  const events = [];
  for (let seed = 1; seed < 400; seed++) {
    const game = SA.round.create({ rng: SA.clues.makeRng(seed), level: 1, track: (type, f) => events.push({ type, ...f }) });
    const r = game.start();
    if (r && r.clue.answer.animalId === 'rana' && r.clue.answer.part === 'ojos' && r.clue.text === 'Busca el animal con ojos grandes') return { game, r, events };
  }
  throw new Error('no rana ojos clue rolled');
}

test('picking the rana on the "ojos grandes" clue is correct, on the eyes or any other part', () => {
  const SA = loadGame(FILES);
  const { game, r, events } = ranaRound(SA);
  assert.equal(r.clue.text, 'Busca el animal con ojos grandes');
  assert.equal(r.answerId, 'rana');
  assert.equal(r.answerPart, 'ojos');
  const other = SA.data.all('animals').find((a) => a.id !== 'rana' && !a.easterEgg).id;
  assert.equal(game.pick({ animalId: other, part: 'ojos' }).status, 'wrong', 'same part on another animal is wrong');
  const res = game.pick({ animalId: 'rana', part: 'cuerpo' });
  assert.equal(res.status, 'correct');
  assert.equal(res.animalId, 'rana');
  assert.deepEqual(events.filter((e) => e.type === 'part.tap').map((e) => e.correct), [false, true]);
  assert.ok(events.some((e) => e.type === 'round.complete'));
});

test('picking the rana eyes directly also completes the round', () => {
  const SA = loadGame(FILES);
  const { game } = ranaRound(SA);
  assert.equal(game.pick({ animalId: 'rana', part: 'ojos', side: 'left' }).status, 'correct');
});

test('a clue without a part has answerPart null', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const game = SA.round.create({ rng: SA.clues.makeRng(3), level: 1, track() {} });
  for (let i = 0; i < 60; i++) {
    const r = game.start();
    assert.equal(r.answerPart, r.clue.answer.part === undefined ? null : r.clue.answer.part);
  }
});

test('hint pointer and hint flow resolve the target for an answer with animalId and part', () => {
  const SA = loadGame(FILES);
  const { game, r } = ranaRound(SA);
  const looked = [];
  const animals = { getObjectByName: (id) => { looked.push(id); return id === 'rana' ? { position: { x: 70, y: 0, z: 0 } } : null; } };
  const glides = [];
  const rig = { getState: () => ({ ...CAM }), glideTo: (x, z) => glides.push([x, z]) };
  const made = [];
  const doc = { body: { appendChild() {} }, createElement() {
    const e = { style: {}, setAttribute() {}, addEventListener(t, f) { this.click = f; } };
    made.push(e);
    return e;
  } };
  const flow = SA.hintFlow.create({ doc, game, animals, rig, camera: { aspect: 1.5 } });
  flow.update(5);
  const shown = flow.update(5.1);
  assert.ok(shown && Number.isFinite(shown.ex) && Number.isFinite(shown.angle), 'off-screen rana gets an arrow');
  assert.ok(looked.length && looked.every((id) => id === 'rana'), 'target is looked up by the animal id only');
  made[0].click();
  assert.deepEqual(glides[0], [70, 0]);
  assert.equal(r.hints, 1);
  const loc = SA.hintPointer.locate({ x: 70, y: 0, z: 0 }, CAM, 1.5);
  assert.equal(loc.visible, false);
});
