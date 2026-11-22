import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js',
  'game/photo.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const game = SA.round.create({ rng: SA.clues.makeRng(7), level: 1, track: (type, f) => events.push({ type, ...f }) });
  return { SA, game, events };
}

const plain = (o) => JSON.parse(JSON.stringify(o));   // objects built inside the vm context are not reference-equal
// An animal that does NOT fit the round's clue (any animal that fits is a match).
const other = (SA, r) => SA.data.all('animals').find((a) => !r.answerIds.includes(a.id) && !a.easterEgg).id;

test('isShot is true only for a pick made with the camera', () => {
  const { SA } = setup();
  assert.equal(SA.photo.isShot({ animalId: 'a', part: 'cola', item: 'camara' }), true);
  for (const p of [{ animalId: 'a' }, { item: 'cepillo' }, null, undefined]) assert.equal(SA.photo.isShot(p), false);
});

test('judge: match, other animal, and none without an open mission', () => {
  const { SA, game } = setup();
  assert.equal(SA.photo.judge(null, 'conejo'), 'none');
  const r = game.start();
  assert.equal(SA.photo.judge(r, r.answerId), 'match');
  assert.equal(SA.photo.judge(r, other(SA, r)), 'other');
  assert.equal(SA.photo.judge(r, 7), 'none');
  r.done = true;
  assert.equal(SA.photo.judge(r, r.answerId), 'none');
});

test('record counts photos per animal in the save and ignores bad ids', () => {
  const { SA } = setup();
  assert.equal(SA.photo.record('pato'), 1);
  assert.equal(SA.photo.record('pato'), 2);
  assert.equal(SA.photo.record('conejo'), 1);
  assert.deepEqual(plain(SA.save.get().photos), { pato: 2, conejo: 1 });
  assert.equal(SA.photo.record('__proto__ x'), 0);
  assert.equal(SA.photo.record(null), 0);
});

test('take: a photo of the right animal completes the round and awards a star', () => {
  const { SA, game, events } = setup();
  const r = game.start();
  const res = SA.photo.take(game, { animalId: r.answerId, part: 'cuerpo', item: 'camara' });
  assert.deepEqual([res.photo, res.verdict, res.status, res.stars, res.saved], [true, 'match', 'correct', 1, 1]);
  assert.equal(game.current().done, true);
  assert.equal(SA.save.get().stars, 1);
  assert.ok(events.some((e) => e.type === 'round.complete'));
});

test('take: a different animal is saved but only a friendly miss; the round stays open', () => {
  const { SA, game } = setup();
  const r = game.start();
  const wrong = other(SA, r);
  const res = SA.photo.take(game, { animalId: wrong, part: 'cuerpo', item: 'camara' });
  assert.deepEqual([res.verdict, res.status, res.saved], ['other', 'wrong', 1]);
  assert.equal(game.current().done, false);
  assert.equal(SA.save.get().stars, 0);
  assert.equal(SA.save.get().photos[wrong], 1);
});

test('take: with no open round the photo is just kept; junk picks are ignored', () => {
  const { SA, game } = setup();
  assert.deepEqual(plain(SA.photo.take(game, { animalId: 'pato', item: 'camara' })), { photo: true, verdict: 'none', saved: 1, status: 'saved' });
  assert.deepEqual(plain(SA.photo.take(game, null)), { photo: false, status: 'ignored' });
  assert.deepEqual(plain(SA.photo.take(game, { part: 'cola' })), { photo: false, status: 'ignored' });
});

test('take on a rescue mission answers through mission.photo (needs the found animal and the help done)', () => {
  const calls = [];
  const mission = { current: () => ({ done: false, answerIds: ['conejo'] }), photo: (id) => { calls.push(id); return { status: 'early', step: 'help' }; } };
  const { SA } = setup();
  const res = SA.photo.take(mission, { animalId: 'conejo', item: 'camara' });
  assert.deepEqual(calls, ['conejo']);
  assert.deepEqual([res.photo, res.status, res.saved], [true, 'early', 1]);
});

test('the shutter sound exists and every vocab key used is registered', () => {
  const SA = loadGame([...FILES.slice(0, 7), 'game/audio.js']);
  assert.ok(SA.audio.NAMES.includes('shutter'));
  assert.ok(SA.vocab.get('phrase:quefoto'));
  assert.equal(SA.vocab.get('phrase:tomalefoto').es, 'Tómale una foto');
});
