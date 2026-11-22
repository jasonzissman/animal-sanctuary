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

// A fake clock: later() queues timers, run() fires them in due-time order.
function clock() {
  const q = [];
  let now = 0;
  return {
    later: (fn, ms) => q.push({ fn, at: now + ms, n: q.length }),
    pending: () => q.length,
    run() {
      while (q.length) {
        q.sort((a, b) => a.at - b.at || a.n - b.n);
        const t = q.shift();
        now = t.at;
        t.fn();
      }
    },
    step() {   // fires only the earliest timer
      q.sort((a, b) => a.at - b.at || a.n - b.n);
      const t = q.shift();
      now = t.at;
      t.fn();
    },
  };
}

test('play: done() advances to the next word, then onEnd fires exactly once (extra done calls are ignored)', () => {
  const SA = loadGame(FILES);
  const c = clock(), said = [], dones = [], pulsed = [];
  let ended = 0;
  SA.wordSeq.play(['number:3', 'foodpl:fresa'], { say: (k, done) => { said.push(k); dones.push(done); }, later: c.later,
    onWord: (s) => s.food && pulsed.push(s.food), onEnd: () => { ended += 1; } });
  c.step();                                     // start timer
  assert.deepEqual(J(said), ['number:3']);
  dones[0]();                                   // clip ended: schedules the next word after a short pause
  dones[0]();                                   // a duplicate done is harmless
  c.step();                                     // the pause timer (150ms) comes before the 4000ms safety
  assert.deepEqual(J(said), ['number:3', 'foodpl:fresa']);
  assert.deepEqual(J(pulsed), ['fresa']);
  assert.equal(ended, 0, 'still waiting for the last word');
  dones[1]();
  assert.equal(ended, 1);
  c.run();                                      // leftover safety timers do nothing
  assert.equal(said.length, 2);
  assert.equal(ended, 1);
});

test('play: a say that never calls done is rescued by the safety timeout, so it never stalls', () => {
  const SA = loadGame(FILES);
  const c = clock(), said = [];
  let ended = 0;
  SA.wordSeq.play(['number:1', 'foodsg:pez', 'phrase:y'], { say: (k) => said.push(k), later: c.later, onEnd: () => { ended += 1; } });
  c.run();
  assert.deepEqual(J(said), ['number:1', 'foodsg:pez', 'phrase:y']);
  assert.equal(ended, 1);
});

test('play: a synchronous done (muted / no audio) still speaks in order and ends once', () => {
  const SA = loadGame(FILES);
  const c = clock(), said = [];
  let ended = 0;
  SA.wordSeq.play(['number:1', 'foodsg:pez'], { say: (k, done) => { said.push(k); done(); }, later: c.later, onEnd: () => { ended += 1; } });
  c.run();
  assert.deepEqual(J(said), ['number:1', 'foodsg:pez']);
  assert.equal(ended, 1);
});

test('play: cancel and alive stop the rest quietly', () => {
  const SA = loadGame(FILES);
  const said = [];
  const c = clock();
  const h = SA.wordSeq.play(['number:1', 'foodsg:pez'], { say: (k, done) => { said.push(k); done(); }, later: c.later });
  h.cancel();
  c.run();
  assert.equal(said.length, 0);
  let alive = true, ended = 0;
  SA.wordSeq.play(['number:1', 'foodsg:pez'], { say: (k, done) => { said.push(k); alive = false; done(); }, later: c.later,
    alive: () => alive, onEnd: () => { ended += 1; } });
  c.run();
  assert.deepEqual(J(said), ['number:1'], 'task over after the first word: no more words');
  assert.equal(ended, 0);
});

function feedFlow(audioOver = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const care = SA.care.create({ rng: SA.clues.makeRng(5), now: () => 1000, level: 3, track() {} });
  const calls = [], timers = [];
  const rec = (n) => (...a) => calls.push([n, ...a]);
  const view = { showCare() {}, showFeed() {}, updateFeed() {}, hideFeed() {}, bounceFood() {}, celebrate() {}, confetti() {},
    toast() {}, pulseFood: rec('pulse') };
  const audio = { say: (k, done) => { calls.push(['say', k]); if (done) done(); }, sfx() {}, ...audioOver };
  const only = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'alimentar') };
  const flow = SA.careFlow.create({ care: only, view, fx: { show() {}, scrub() {}, hide() {} }, audio,
    later: (fn, ms) => timers.push([fn, ms]), onDone() {} });
  return { SA, care, flow, calls, timers };
}

// Fires queued timers (including ones queued while running) until none are left.
function runAll(timers) { while (timers.length) timers.shift()[0](); }

test('feed replay speaks task.words one by one and pulses the matching tray food', () => {
  const f = feedFlow();
  assert.equal(f.flow.offer('conejo'), true);
  const task = f.care.current();
  f.calls.length = 0;
  f.flow.replay();
  assert.equal(f.calls.length, 0, 'nothing is spoken until the timers run');
  runAll(f.timers);
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
  runAll(f.timers);
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
