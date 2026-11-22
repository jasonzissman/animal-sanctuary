import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js'];

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  let t = 1000;
  const events = [];
  const game = SA.mission.create({
    rng: SA.clues.makeRng(5), now: () => t, level: 1, track: (type, f) => events.push({ type, ...f }), ...opts,
  });
  return { SA, game, events, advance: (ms) => { t += ms; } };
}

function toHelp(ctx) {
  const m = ctx.game.start();
  const res = ctx.game.found(m.answerIds[0]);
  return { m, res };
}

test('start() begins at the find step with a clue', () => {
  const { game } = setup();
  const m = game.start();
  assert.equal(m.step, 'find');
  assert.equal(typeof m.clue.text, 'string');
  assert.ok(m.clue.text.length > 0);
  assert.equal(m.animalId, null);
  assert.equal(game.current(), m);
});

test('any animal that fits the clue is found; a different one is a friendly miss', () => {
  const ctx = setup();
  const m = ctx.game.start();
  const other = ctx.SA.data.all('animals').find((a) => !m.answerIds.includes(a.id) && !a.easterEgg).id;
  assert.deepEqual({ ...ctx.game.found(other) }, { status: 'wrong', misses: 1 });
  assert.equal(m.step, 'find');
  const last = m.answerIds[m.answerIds.length - 1];
  assert.equal(ctx.game.found(last).status, 'found');
  assert.equal(m.animalId, last);
  assert.equal(ctx.game.found(m.answerIds[0]).status, 'ignored');   // sticks to the found animal
});

test('steps advance find -> help (1 task at level 1) -> photo -> done', () => {
  const ctx = setup({ level: 1 });
  const { m, res } = toHelp(ctx);
  assert.equal(res.step, 'help');
  assert.equal(m.tasks.length, 1);
  assert.equal(ctx.game.taskDone(m.tasks[0].id).status, 'helped');
  assert.equal(m.step, 'photo');
  assert.equal(ctx.game.photo(m.animalId).status, 'correct');
  assert.equal(m.step, 'done');
  assert.equal(m.done, true);
});

test('level 2+ asks for two different tasks, one after the other', () => {
  for (const level of [2, 3]) {
    const ctx = setup({ level });
    const { m } = toHelp(ctx);
    assert.equal(m.tasks.length, 2);
    assert.notEqual(m.tasks[0].id, m.tasks[1].id);
    assert.deepEqual({ ...ctx.game.taskDone(m.tasks[1].id) }, { status: 'task', remaining: 1 });
    assert.equal(m.step, 'help');
    assert.equal(ctx.game.taskDone(m.tasks[1].id).status, 'ignored');   // already done
    assert.equal(ctx.game.taskDone('nope').status, 'ignored');
    assert.equal(ctx.game.taskDone(m.tasks[0].id).status, 'helped');
    assert.equal(m.step, 'photo');
  }
});

test('help tasks are only ones the found animal supports (every real animal)', () => {
  const { SA } = setup();
  const animals = SA.data.all('animals').filter((a) => !a.easterEgg);   // hidden eggs are not in play until unlocked
  assert.ok(animals.length > 5);
  for (const a of animals) {
    const supported = SA.mission.supportedTasks(a);
    assert.ok(supported.length >= 1, a.id + ' supports at least one help task');
    const has = a.parts.map((p) => p.part);
    for (const d of supported) {
      if (d.kind === 'alimentar') assert.ok(SA.data.all('foods').some((f) => f.diets.includes(a.traits.diet)), a.id + ' eats something');
      else assert.ok(d.parts.some((k) => has.includes(k)), a.id + ' has a part for ' + d.id);
    }
    // and SA.care can really start every task the mission would ask for
    const care = SA.care.create({ rng: SA.clues.makeRng(1), level: 1 });
    for (const d of supported) assert.ok(care.maybeStart(a.id, true, d.kind), a.id + ' can do ' + d.id);
  }
});

test('missions only ever pick tasks the found animal supports (many seeds, every matching animal)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const SA = setup().SA;
    const m = SA.mission.create({ rng: SA.clues.makeRng(seed), level: 2, track: () => {} }).start();
    for (const id of m.answerIds) {
      const g = SA.mission.create({ rng: SA.clues.makeRng(seed), level: 2, track: () => {} });
      const mm = g.start();
      g.found(id);
      const ok = SA.mission.supportedTasks(SA.data.get('animals', id)).map((d) => d.id);
      for (const t of mm.tasks) assert.ok(ok.includes(t.id), id + ' ' + t.id);
    }
  }
});

test('a photo of a different animal, or before the help is done, does not complete the mission', () => {
  const ctx = setup();
  const m = ctx.game.start();
  assert.equal(ctx.game.photo(m.answerIds[0]).status, 'wrong');     // nothing found yet
  ctx.game.found(m.answerIds[0]);
  assert.equal(ctx.game.photo(m.animalId).status, 'early');         // help not done
  assert.equal(m.step, 'help');
  ctx.game.taskDone(m.tasks[0].id);
  const other = ctx.SA.data.all('animals').find((a) => a.id !== m.animalId).id;
  const r = ctx.game.photo(other);
  assert.equal(r.status, 'wrong');
  assert.equal(m.done, false);
  assert.equal(ctx.SA.save.get().stars, 0);
  assert.equal(ctx.events.length, 0);
  assert.equal(m.misses, 3);
  assert.equal(ctx.game.photo(m.animalId).status, 'correct');       // nothing was lost
});

test('completion awards one star and emits round.complete exactly once', () => {
  const ctx = setup();
  const { m } = toHelp(ctx);
  ctx.game.taskDone(m.tasks[0].id);
  ctx.advance(7300);
  const res = ctx.game.photo(m.animalId);
  assert.equal(res.status, 'correct');
  assert.equal(res.stars, 1);
  assert.equal(res.seconds, 7.3);
  assert.equal(ctx.SA.save.get().stars, 1);
  assert.equal(ctx.SA.save.get().rounds.completed, 1);
  assert.equal(ctx.game.photo(m.animalId).status, 'ignored');
  assert.equal(ctx.game.found(m.animalId).status, 'ignored');
  assert.equal(ctx.game.taskDone(m.tasks[0].id).status, 'ignored');
  assert.equal(ctx.SA.save.get().stars, 1);
  const done = ctx.events.filter((e) => e.type === 'round.complete');
  assert.equal(done.length, 1);
  assert.deepEqual({ ...done[0] }, { type: 'round.complete', roundId: m.id, seconds: 7.3, misses: 0, hints: 0, level: 1 });
});

test('hint() counts; calls before start or after completion are ignored', () => {
  const { game } = setup();
  assert.equal(game.hint(), null);
  assert.equal(game.found('conejo').status, 'ignored');
  assert.equal(game.photo('conejo').status, 'ignored');
  assert.equal(game.taskDone('limpiar').status, 'ignored');
  const m = game.start();
  game.hint();
  assert.equal(m.hints, 1);
});

test('records on the shared scaffold when the level comes from the save', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const game = SA.mission.create({ rng: SA.clues.makeRng(2), track: () => {} });
  for (let i = 0; i < 3; i++) {
    const m = game.start();
    game.found(m.answerIds[0]);
    for (const t of m.tasks) game.taskDone(t.id);
    const res = game.photo(m.animalId);
    assert.equal(res.status, 'correct');
    if (i === 2) assert.equal(res.levelChange, 'up');
  }
  assert.equal(SA.save.get().settings.scaffold, 2);
});

test('supportedTasks of nothing is empty', () => {
  const { SA } = setup();
  assert.equal(SA.mission.supportedTasks(null).length, 0);
  assert.equal(SA.mission.supportedTasks({}).length, 0);
});
