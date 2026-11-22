import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/round.js',
  'game/photo.js', 'game/ui/prompt.js'];

function setup(extra = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const game = SA.round.create({ rng: SA.clues.makeRng(7), level: 1, track: (type, f) => events.push({ type, ...f }) });
  const sfx = [], said = [], toasts = [], snaps = [], played = [], later = [];
  SA.audio = { sfx: (n) => sfx.push(n), say: (k) => said.push(k) };
  const view = new Proxy({ toast: (m) => toasts.push(m), snapshot: (s) => snaps.push(s) }, { get: (t, k) => t[k] || (() => {}) });
  const ctl = SA.prompt.createController({ game, view, fx: { play: (id, n) => played.push([id, n]) },
    later: (fn) => later.push(fn), photoMode: true, ...extra });
  return { SA, game, ctl, events, sfx, said, toasts, snaps, played, later };
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

test('take: a photo of the right animal completes the mission and awards a star', () => {
  const { SA, game, events } = setup();
  const r = game.start();
  const res = SA.photo.take(game, { animalId: r.answerId, part: 'cuerpo', item: 'camara' });
  assert.deepEqual([res.photo, res.verdict, res.status, res.stars, res.saved], [true, 'match', 'correct', 1, 1]);
  assert.equal(game.current().done, true);
  assert.equal(SA.save.get().stars, 1);
  assert.ok(events.some((e) => e.type === 'round.complete'));
});

test('take: a different animal is saved but only a friendly miss; the mission stays open', () => {
  const { SA, game } = setup();
  const r = game.start();
  const wrong = other(SA, r);
  const res = SA.photo.take(game, { animalId: wrong, part: 'cuerpo', item: 'camara' });
  assert.deepEqual([res.verdict, res.status, res.saved], ['other', 'wrong', 1]);
  assert.equal(game.current().done, false);
  assert.equal(SA.save.get().stars, 0);
  assert.equal(SA.save.get().photos[wrong], 1);
});

test('take: with no open mission the photo is just kept; junk picks are ignored', () => {
  const { SA, game } = setup();
  assert.deepEqual(plain(SA.photo.take(game, { animalId: 'pato', item: 'camara' })), { photo: true, verdict: 'none', saved: 1, status: 'saved' });
  assert.deepEqual(plain(SA.photo.take(game, null)), { photo: false, status: 'ignored' });
  assert.deepEqual(plain(SA.photo.take(game, { part: 'cola' })), { photo: false, status: 'ignored' });
});

test('mission card: other tools and empty hands never touch the round', () => {
  const t = setup();
  const r = t.ctl.begin();
  for (const item of [undefined, 'cepillo', 'esponja']) {
    assert.equal(t.ctl.onPick({ animalId: r.answerId, part: 'cuerpo', item }).status, 'ignored');
  }
  assert.equal(t.game.current().done, false);
  assert.equal(t.game.current().misses, 0);
  assert.deepEqual(t.sfx, []);
});

test('camera shot at the right animal: shutter, snapshot, celebration, star', () => {
  const t = setup();
  const r = t.ctl.begin();
  const res = t.ctl.onPick({ animalId: r.answerId, part: 'cuerpo', item: 'camara' });
  assert.equal(res.status, 'correct');
  assert.deepEqual(t.sfx.slice(0, 2), ['shutter', 'chime']);
  assert.equal(t.snaps.length, 1);
  assert.ok(t.snaps[0].text && t.snaps[0].icon);
  assert.ok(t.said.includes('animal:' + r.answerId));
  assert.ok(t.toasts.some((m) => m.includes('¡Muy bien!')));
  assert.equal(t.SA.save.get().stars, 1);
});

test('camera shot at a different animal: friendly hint, photo saved, clue replayed, round continues', () => {
  const t = setup();
  const r = t.ctl.begin();
  const wrong = other(t.SA, r);
  const res = t.ctl.onPick({ animalId: wrong, part: 'cuerpo', item: 'camara' });
  assert.equal(res.status, 'wrong');
  assert.ok(t.sfx.includes('shutter'));
  assert.equal(t.snaps.length, 1);
  assert.ok(t.toasts.includes('¡Qué foto! Pero busca…'));
  assert.ok(t.said.includes('phrase:quefoto'));
  assert.equal(t.SA.save.get().photos[wrong], 1);
  t.later.forEach((fn) => fn());
  assert.equal(t.said[t.said.length - 1], r.clue.text, 'the clue is spoken again');
  assert.equal(t.game.current().done, false);
  assert.equal(t.SA.save.get().stars, 0);
});

test('equipCamera puts the camera in hand and says its name', () => {
  const t = setup();
  assert.equal(t.ctl.equipCamera(), false, 'no inventory module: nothing happens');
  t.SA.inventory = { equip: (id) => id === 'camara' };
  assert.equal(t.ctl.equipCamera(), true);
  assert.ok(t.said.includes('item:camara'));
});

test('without photoMode a plain pick still answers the round (old behaviour)', () => {
  const t = setup({ photoMode: false });
  const r = t.ctl.begin();
  assert.equal(t.ctl.onPick({ animalId: r.answerId, part: 'cuerpo' }).status, 'correct');
});

test('the shutter sound exists and every vocab key used is registered', () => {
  const SA = loadGame([...FILES.slice(0, 7), 'game/audio.js']);
  assert.ok(SA.audio.NAMES.includes('shutter'));
  assert.ok(SA.vocab.get('phrase:quefoto'));
});
