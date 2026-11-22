import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js',
  'game/mission-card.js', 'game/hint-stage.js', 'game/level-cue.js', 'game/photo.js', 'game/data/missions.js', 'game/missions.js',
  'game/focus.js', 'game/ui/care-flow.js', 'game/ui/mission-flow.js', 'game/ui/prompt.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const log = { later: [], toasts: [], clears: 0, fxHide: 0, events: [], said: [] };
  SA.audio = { sfx() {}, say: (k) => log.said.push(k) };
  const view = new Proxy({ toast: (m) => log.toasts.push(m), clear: () => { log.clears += 1; } }, { get: (o, k) => o[k] || (() => {}) });
  const fx = { show() {}, hide: () => { log.fxHide += 1; }, scrub() {}, play() {} };
  const later = (fn, ms) => log.later.push([fn, ms]);
  const careCore = SA.care.create({ rng: SA.clues.makeRng(5), level: 1, track: (type, f) => log.events.push({ type, ...f }) });
  const care = SA.careFlow.create({ care: careCore, view, fx, audio: SA.audio, later });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(5), level: 1, track: (type, f) => log.events.push({ type, ...f }) });
  const flow = SA.missionFlow.create({ mission, view, fx: { play() {} }, care, audio: SA.audio, later });
  const startStory = () => SA.missions.start(SA.missions.list()[0].id);
  return { SA, log, view, care, careCore, mission, flow, startStory };
}

const animalWithCare = (SA) => SA.data.all('animals').find((a) => !a.easterEgg && SA.data.all('careTasks').some((d) => d.parts.some((p) => a.parts.some((x) => x.part === p))));

test('SA.focus.active() is mission while a story mission runs, free otherwise', () => {
  const { SA, startStory } = setup();
  assert.equal(SA.focus.active(), 'free');
  assert.equal(SA.focus.allowsSmall(), true);
  assert.equal(startStory().ok, true);
  assert.equal(SA.focus.active(), 'mission');
  assert.equal(SA.focus.allowsSmall(), false);
  SA.missions.abandon();
  assert.equal(SA.focus.active(), 'free');
  startStory();
  SA.missions.complete();
  assert.equal(SA.focus.active(), 'free', 'done also frees small tasks');
});

test('SA.focus.update() tells listeners once per change; a broken source reads as free', () => {
  const { SA, startStory } = setup();
  const seen = [];
  const off = SA.focus.onChange((m) => seen.push(m));
  SA.focus.update();
  assert.deepEqual(seen, []);
  startStory();
  SA.focus.update(); SA.focus.update();
  SA.missions.abandon();
  SA.focus.update();
  assert.deepEqual(seen, ['mission', 'free']);
  off();
  startStory();
  SA.focus.update();
  assert.deepEqual(seen, ['mission', 'free']);
  const broken = SA.focus.create({ missions: { active() { throw new Error('bad save'); } } });
  assert.equal(broken.active(), 'free');
  broken.onChange(() => { throw new Error('listener'); });
  assert.doesNotThrow(() => broken.update());
});

test('random care offers do not start during a mission, a forced mission help step still does', () => {
  const { SA, care, careCore, startStory } = setup();
  const id = animalWithCare(SA).id;
  startStory();
  let asked = 0;
  const realMaybe = careCore.maybeStart;
  careCore.maybeStart = (...a) => { asked += 1; return realMaybe(...a); };
  for (let i = 0; i < 30; i++) assert.equal(care.offer(id), false);
  assert.equal(asked, 0, 'the care rules were never even asked');
  assert.equal(care.active(), false);
  assert.equal(care.offer(id, true), true, 'help step: forced offer works');
  assert.equal(care.active(), true);
});

test('random care offers start again after the mission is done or abandoned', () => {
  const { SA, care, careCore, startStory } = setup();
  const id = animalWithCare(SA).id;
  startStory();
  assert.equal(care.offer(id), false);
  SA.missions.abandon();
  const tries = [];
  for (let i = 0; i < 60 && !care.active(); i++) tries.push(care.offer(id));
  assert.equal(care.active(), true, 'a random offer lands eventually');
  assert.ok(careCore.current());
  careCore.cancel();
  startStory();
  SA.missions.complete();
  for (let i = 0; i < 60 && !care.active(); i++) care.offer(id);
  assert.equal(care.active(), true);
});

test('no new clue round starts during a mission (rescue flow and plain rounds), and they start again after', () => {
  const { SA, flow, mission, view, startStory } = setup();
  startStory();
  assert.equal(flow.begin(), null);
  assert.equal(mission.current(), null);
  const ctl = SA.prompt.createController({ game: SA.round.create({ rng: SA.clues.makeRng(3) }), view, audio: SA.audio, later: () => {} });
  assert.equal(ctl.begin(), null);
  SA.missions.abandon();
  assert.ok(flow.begin(), 'rescue clue starts again');
  assert.ok(ctl.begin(), 'plain round starts again');
});

test('a rescue clue on screen is cleared quietly when a mission starts: no miss, no star, no round event', () => {
  const { SA, log, flow, mission, startStory } = setup();
  const m = flow.begin();
  flow.onPick({ animalId: SA.data.all('animals').find((a) => !m.answerIds.includes(a.id) && !a.easterEgg).id, part: 'cuerpo' });   // one gentle miss before
  const starsBefore = SA.save.get().stars;
  const roundsBefore = SA.save.get().rounds.completed;
  const eventsBefore = log.events.length;
  startStory();
  flow.pause();
  assert.equal(mission.current(), null);
  assert.ok(log.clears > 0, 'the card is cleared');
  assert.equal(SA.save.get().stars, starsBefore);
  assert.equal(SA.save.get().rounds.completed, roundsBefore);
  assert.equal(log.events.length, eventsBefore, 'nothing is tracked: no round.complete, no extra miss');
  log.later.forEach(([fn]) => fn());      // pending hint / help timers do nothing
  assert.equal(mission.current(), null);
  SA.missions.abandon();
  assert.ok(flow.begin(), 'after the mission, a clue starts again');
});

test('a care task on screen is put away quietly (highlight removed, no star, no round) when a mission starts', () => {
  const { SA, log, flow, care, careCore, startStory } = setup();
  const m = flow.begin();
  flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  log.later.forEach(([fn]) => fn());
  assert.equal(care.active(), true, 'the help task is on screen');
  const stars = SA.save.get().stars, rounds = SA.save.get().rounds.completed, hides = log.fxHide;
  startStory();
  flow.pause();
  assert.equal(care.active(), false);
  assert.equal(careCore.current(), null);
  assert.ok(log.fxHide > hides, 'the glow/highlight is removed (fx.hide)');
  assert.equal(SA.save.get().stars, stars);
  assert.equal(SA.save.get().rounds.completed, rounds);
  assert.equal(log.events.filter((e) => e.type === 'care.complete' || e.type === 'round.complete').length, 0);
  assert.equal(care.cancel(), false, 'cancelling twice is harmless');
});

test('a plain round and its care task are cleared by the controller pause', () => {
  const { SA, log, view, care, startStory } = setup();
  const game = SA.round.create({ rng: SA.clues.makeRng(3) });
  const ctl = SA.prompt.createController({ game, view, care, audio: SA.audio, later: () => {} });
  ctl.begin();
  assert.ok(game.current());
  care.offer(animalWithCare(SA).id, true);
  startStory();
  ctl.pause();
  assert.equal(game.current(), null);
  assert.equal(care.active(), false);
  assert.ok(log.clears > 0);
});
