import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/round.js',
  'game/render/round-fx.js', 'game/ui/prompt.js'];

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  let t = 1000;
  const events = [];
  const game = SA.round.create({
    rng: SA.clues.makeRng(7), now: () => t, track: (type, f) => events.push({ type, ...f }), ...opts,
  });
  return { SA, game, events, advance: (ms) => { t += ms; } };
}

test('start() makes a round with a Spanish clue whose answer is a registered animal', () => {
  const { SA, game } = setup();
  const r = game.start();
  assert.match(r.clue.text, /^Busca el animal/);
  assert.ok(SA.data.get('animals', r.answerId));
  assert.equal(r.misses, 0);
  assert.equal(r.done, false);
  assert.equal(game.current(), r);
});

test('beginner level shows the silhouette right away; higher levels need a hint (counted once)', () => {
  const beginner = setup({ level: 1 }).game.start();
  assert.equal(beginner.hintShown, true);
  const { game } = setup({ level: 2 });
  const r = game.start();
  assert.equal(r.hintShown, false);
  game.hint(); game.hint();
  assert.equal(r.hintShown, true);
  assert.equal(r.hints, 1);
});

test('level defaults to the saved scaffold setting', () => {
  const { SA, game } = setup({ level: undefined });
  SA.save.update({ settings: { scaffold: 3 } });
  assert.equal(game.start().level, 3);
});

test('wrong pick: counts a miss, emits part.tap correct:false, round continues', () => {
  const { SA, game, events } = setup();
  const r = game.start();
  const other = SA.data.all('animals').find((a) => a.id !== r.answerId).id;
  const res = game.pick({ animalId: other, part: 'orejas' });
  assert.deepEqual({ ...res }, { status: 'wrong', misses: 1 });
  assert.equal(r.done, false);
  assert.deepEqual({ ...events[0] }, { type: 'part.tap', part: 'orejas', correct: false });
  assert.equal(SA.save.get().stars, 0);
  assert.equal(game.pick({ animalId: other, part: 'cola' }).misses, 2);
});

test('correct pick: part.tap + round.complete, 1 star saved, round ends', () => {
  const { SA, game, events, advance } = setup();
  const r = game.start();
  advance(4200);
  const res = game.pick({ animalId: r.answerId, part: 'cuerpo' });
  assert.equal(res.status, 'correct');
  assert.equal(res.stars, 1);
  assert.equal(res.seconds, 4.2);
  assert.equal(r.done, true);
  assert.deepEqual({ ...events[0] }, { type: 'part.tap', part: 'cuerpo', correct: true });
  const done = events[1];
  assert.equal(done.type, 'round.complete');
  assert.deepEqual([done.roundId, done.seconds, done.misses, done.hints, done.level], [r.id, 4.2, 0, 0, 1]);
  const s = SA.save.get();
  assert.equal(s.stars, 1);
  assert.deepEqual({ ...s.rounds }, { completed: 1, streak: 1 });
  assert.equal(game.pick({ animalId: r.answerId, part: 'cuerpo' }).status, 'ignored');
});

test('misses reset the streak, hints are reported, stars accumulate across rounds', () => {
  const { SA, game, events } = setup({ level: 2 });
  let r = game.start();
  game.hint();
  const other = SA.data.all('animals').find((a) => a.id !== r.answerId).id;
  game.pick({ animalId: other, part: 'cola' });
  game.pick({ animalId: r.answerId, part: 'cola' });
  const done = events.find((e) => e.type === 'round.complete');
  assert.deepEqual([done.misses, done.hints, done.level], [1, 1, 2]);
  assert.equal(SA.save.get().rounds.streak, 0);
  r = game.start();
  game.pick({ animalId: r.answerId, part: 'cola' });
  const s = SA.save.get();
  assert.equal(s.stars, 2);
  assert.deepEqual({ ...s.rounds }, { completed: 2, streak: 1 });
});

test('ignored picks: before start, junk input; hint before start is null', () => {
  const { game, events } = setup();
  assert.equal(game.pick({ animalId: 'conejo', part: 'x' }).status, 'ignored');
  assert.equal(game.hint(), null);
  game.start();
  assert.equal(game.pick(null).status, 'ignored');
  assert.equal(game.pick({}).status, 'ignored');
  assert.equal(events.length, 0);
});

test('many rounds in a row never run out of clues or repeat the previous clue', () => {
  const { game } = setup();
  let prev = null;
  for (let i = 0; i < 30; i++) {
    const r = game.start();
    assert.ok(r, 'round ' + i);
    assert.notEqual(r.clue.key, prev);
    prev = r.clue.key;
    game.pick({ animalId: r.answerId, part: 'cuerpo' });
  }
});

test('start() returns null when no animals are in play', () => {
  const { game } = setup({ animals: [] });
  assert.equal(game.start(), null);
});

test('telemetry sink errors never break a pick', () => {
  const { game } = setup({ track: () => { throw new Error('boom'); } });
  const r = game.start();
  assert.equal(game.pick({ animalId: r.answerId, part: 'cuerpo' }).status, 'correct');
});

// ---- controller (prompt.js) with stubs ----

function controllerSetup(opts = {}) {
  const t = setup(opts);
  const log = [];
  const view = new Proxy({}, { get: (_, name) => (...a) => log.push([name, ...a]) });
  const audio = { say: (k) => log.push(['say', k]), sfx: (n) => log.push(['sfx', n]) };
  const fx = { play: (id, r) => log.push(['fx', id, r]) };
  const timers = [];
  const ctl = t.SA.prompt.createController({ game: t.game, view, fx, audio, later: (fn, ms) => timers.push([fn, ms]) });
  return { ...t, ctl, log, timers };
}

test('controller: begin shows the clue and speaks it; replay speaks it again', () => {
  const { ctl, log } = controllerSetup();
  const r = ctl.begin();
  assert.deepEqual(log[0].slice(0, 1), ['showRound']);
  assert.equal(log[0][1].text, r.clue.text);
  assert.equal(log[0][1].hintShown, true);
  assert.deepEqual(log.find((l) => l[0] === 'say'), ['say', r.clue.text]);
  log.length = 0;
  ctl.replay();
  assert.deepEqual(log, [['say', r.clue.text]]);
});

test('controller: wrong pick = boing + wobble + toast, no new round scheduled', () => {
  const { SA, ctl, log, timers } = controllerSetup();
  const r = ctl.begin();
  log.length = 0;
  const other = SA.data.all('animals').find((a) => a.id !== r.answerId).id;
  assert.equal(ctl.onPick({ animalId: other, part: 'cola' }).status, 'wrong');
  assert.deepEqual(log.filter((l) => l[0] === 'sfx' || l[0] === 'fx'), [['sfx', 'boing'], ['fx', other, 'wobble']]);
  assert.equal(timers.length, 0);
});

test('controller: correct pick = chime, confetti, name spoken, star, then the next round starts', () => {
  const { SA, ctl, log, timers } = controllerSetup();
  const r = ctl.begin();
  log.length = 0;
  ctl.onPick({ animalId: r.answerId, part: 'cuerpo' });
  const names = log.map((l) => l[0]);
  for (const n of ['sfx', 'fx', 'celebrate', 'confetti', 'toast']) assert.ok(names.includes(n), n);
  assert.deepEqual(log.find((l) => l[0] === 'sfx'), ['sfx', 'chime']);
  assert.deepEqual(log.find((l) => l[0] === 'say'), ['say', 'animal:' + r.answerId]);
  assert.equal(SA.save.get().stars, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0][1], SA.prompt.NEXT_MS);
  log.length = 0;
  timers[0][0]();
  assert.equal(log[0][0], 'showRound');
  assert.notEqual(ctl.onPick({ animalId: 'nope-not-an-animal', part: 'x' }).status, 'correct');
});

test('controller: hint reveals the silhouette; audio errors are swallowed; empty game clears the bar', () => {
  const { SA, game, log } = controllerSetup({ level: 2 });
  const view = new Proxy({}, { get: (_, name) => (...a) => log.push([name, ...a]) });
  const ctl = SA.prompt.createController({ game, view, audio: { say() { throw new Error('x'); }, sfx() { throw new Error('y'); } } });
  ctl.begin();
  ctl.hint();
  assert.ok(log.some((l) => l[0] === 'showHint'));
  const none = SA.prompt.createController({ game: SA.round.create({ animals: [] }), view });
  log.length = 0;
  assert.equal(none.begin(), null);
  assert.deepEqual(log, [['clear']]);
});

test('view is a harmless no-op without a DOM', () => {
  const { SA } = setup();
  const v = SA.prompt.createView(null);
  assert.doesNotThrow(() => { v.showRound(); v.celebrate(); v.confetti(); v.toast('x'); v.shake(); v.clear(); v.showHint(); });
  assert.equal(SA.prompt.ICONS.conejo, '🐰');
});

test('round fx: wobble moves an animal and always returns it to rest', () => {
  const { SA } = setup();
  const obj = { position: { y: 0.5 }, rotation: { x: 0, z: 0 }, scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } } };
  const fx = SA.render.createRoundFx({ animals: { getObjectByName: (id) => (id === 'conejo' ? obj : null) } });
  assert.equal(fx.play('nope', 'wobble'), false);
  assert.equal(fx.play('conejo', 'boing'), true);
  fx.update(0.1);
  assert.notEqual(obj.scale.y, 1);
  fx.play('conejo', 'wobble');           // restarting mid-reaction restores first
  assert.equal(obj.scale.y, 1);
  for (let i = 0; i < 20; i++) fx.update(0.05);
  assert.deepEqual([obj.position.y, obj.rotation.x, obj.rotation.z, obj.scale.x, obj.scale.y, obj.scale.z], [0.5, 0, 0, 1, 1, 1]);
});

test('index.html loads round.js, round-fx.js and prompt.js before scene.js', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf('src="' + f + '"');
  for (const f of ['game/round.js', 'game/render/round-fx.js', 'game/ui/prompt.js']) assert.ok(at(f) > 0, f);
  assert.ok(at('game/round.js') > at('game/picking.js'));
  assert.ok(at('game/ui/prompt.js') < at('game/render/scene.js'));
  assert.ok(at('game/render/scene.js') < at('game/main.js'));
});
