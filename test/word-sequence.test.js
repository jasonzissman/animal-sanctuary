import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js',
  'game/camera.js', 'game/round.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/word-sequence.js', 'game/ui/care-flow.js',
  'game/ui/prompt.js'];

const J = (x) => JSON.parse(JSON.stringify(x));

test('plan: ordered, spaced times and food ids only for food words', () => {
  const SA = loadGame(FILES);
  const steps = SA.wordSeq.plan(['number:2', 'foodpl:fresa', 'phrase:y', 'number:una', 'foodsg:zanahoria']);
  assert.deepEqual(J(steps.map((s) => s.key)), ['number:2', 'foodpl:fresa', 'phrase:y', 'number:una', 'foodsg:zanahoria']);
  assert.deepEqual(J(steps.map((s) => s.food)), [null, 'fresa', null, null, 'zanahoria']);
  assert.equal(steps[0].at, 0);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at > steps[i - 1].at);
  assert.deepEqual(J(SA.wordSeq.plan([])), []);
  assert.deepEqual(J(SA.wordSeq.plan(null)), []);
  assert.equal(SA.wordSeq.foodOf('animal:gato'), null);
});

test('play: says every word in order on its timer, pulsing foods; cancel and alive stop it', () => {
  const SA = loadGame(FILES);
  const timers = [], said = [], pulsed = [];
  const later = (fn, ms) => timers.push([fn, ms]);
  let ended = 0, alive = true;
  const h = SA.wordSeq.play(['number:3', 'foodpl:fresa'], { say: (k) => said.push(k), later, onWord: (s) => s.food && pulsed.push(s.food),
    onEnd: () => { ended += 1; }, alive: () => alive });
  assert.equal(timers.length, 2);
  timers[0][0]();
  assert.deepEqual(J(said), ['number:3']);
  timers[1][0]();
  assert.deepEqual(J(said), ['number:3', 'foodpl:fresa']);
  assert.deepEqual(J(pulsed), ['fresa']);
  assert.equal(ended, 1);
  // cancelled: nothing more is said
  const h2 = SA.wordSeq.play(['number:1', 'foodsg:pez'], { say: (k) => said.push(k), later });
  h2.cancel();
  timers.slice(2).forEach(([fn]) => fn());
  assert.equal(said.length, 2);
  // not alive: nothing is said
  alive = false;
  const before = timers.length;
  SA.wordSeq.play(['number:1'], { say: (k) => said.push(k), later, alive: () => alive });
  timers[before][0]();
  assert.equal(said.length, 2);
  assert.ok(h.cancel);
});

function feedFlow(audioOver = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const care = SA.care.create({ rng: SA.clues.makeRng(5), now: () => 1000, level: 3, track() {} });
  const calls = [], timers = [];
  const rec = (n) => (...a) => calls.push([n, ...a]);
  const view = { showCare() {}, showFeed() {}, updateFeed() {}, hideFeed() {}, bounceFood() {}, celebrate() {}, confetti() {},
    toast() {}, pulseFood: rec('pulse') };
  const audio = { say: rec('say'), sfx() {}, ...audioOver };
  const only = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'alimentar') };
  const flow = SA.careFlow.create({ care: only, view, fx: { show() {}, scrub() {}, hide() {} }, audio,
    later: (fn, ms) => timers.push([fn, ms]), onDone() {} });
  return { SA, care, flow, calls, timers };
}

test('feed replay speaks task.words one by one and pulses the matching tray food', () => {
  const f = feedFlow();
  assert.equal(f.flow.offer('conejo'), true);
  const task = f.care.current();
  f.calls.length = 0;
  f.flow.replay();
  assert.equal(f.calls.length, 0, 'nothing is spoken until the timers run');
  f.timers.splice(0).forEach(([fn]) => fn());
  assert.deepEqual(J(f.calls.filter((c) => c[0] === 'say').map((c) => c[1])), [...task.words]);
  const foods = task.words.filter((k) => /^food/.test(k)).map((k) => k.split(':')[1]);
  assert.deepEqual(J(f.calls.filter((c) => c[0] === 'pulse').map((c) => c[1])), J(foods));
  assert.ok(foods.every((id) => task.tray.includes(id)));
});

test('feed replay: a second Replay cancels the first; finishing the task stops the rest', () => {
  const f = feedFlow();
  f.flow.offer('conejo');
  const task = f.care.current();
  f.calls.length = 0;
  f.flow.replay();
  const first = f.timers.splice(0);
  f.flow.replay();
  first.forEach(([fn]) => fn());
  assert.equal(f.calls.filter((c) => c[0] === 'say').length, 0, 'old sequence is cancelled');
  const second = f.timers.splice(0);
  for (let n = 0; n < task.count * 2 + 2; n++) task.items.forEach((it) => f.flow.onFeed(it.food));
  f.calls.length = 0;
  second.forEach(([fn]) => fn());
  assert.equal(f.calls.filter((c) => c[0] === 'say').length, 0, 'finished task: no late words');
});

test('feed replay does nothing extra when muted or without audio.say', () => {
  const muted = feedFlow({ isMuted: () => true });
  muted.flow.offer('conejo');
  muted.calls.length = 0; muted.timers.length = 0;
  muted.flow.replay();
  assert.equal(muted.timers.length, 0);
  assert.equal(muted.calls.length, 0);
  const none = feedFlow({ say: undefined });
  none.flow.offer('conejo');
  none.timers.length = 0;
  none.flow.replay();
  assert.equal(none.timers.length, 0);
});

test('non-feed replay still speaks the whole phrase', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const care = SA.care.create({ rng: SA.clues.makeRng(5), now: () => 1000, level: 1, track() {} });
  const said = [];
  const only = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'curar') };
  const flow = SA.careFlow.create({ care: only, view: { showCare() {} }, fx: { show() {} }, audio: { say: (k) => said.push(k), sfx() {} },
    later() {} });
  flow.offer('tucan');
  said.length = 0;
  flow.replay();
  assert.deepEqual(J(said), [care.current().text]);
});

test('prompt view pulseFood animates the tray button and ignores unknown foods', () => {
  const SA = loadGame(FILES);
  const made = [];
  const mk = (tag) => { const e = { tag, style: {}, children: [], textContent: '', attrs: {}, appendChild() {}, setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {}, animate() { this.animated = true; } }; made.push(e); return e; };
  const view = SA.prompt.createView({ createElement: mk, body: { appendChild() {} } }, {});
  view.showFeed({ count: 1, given: 0, icon: '🍓', tray: [{ id: 'fresa', icon: '🍓', label: 'la fresa' }] });
  view.pulseFood('nope');
  view.pulseFood('fresa');
  assert.equal(made.find((e) => e.attrs['aria-label'] === 'la fresa').animated, true);
});
