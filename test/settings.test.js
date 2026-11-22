import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const plain = (o) => JSON.parse(JSON.stringify(o));
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/save.js', 'game/scaffold.js',
  'game/stats.js', 'game/settings.js'];

function load(extra = {}, files = BASE) {
  const SA = loadGame(files, extra);
  SA.save.reset();
  return SA;
}

// ---- SA.stats (pure miss rates) ----

test('missRates: per-part rate, sorted by rate then taps; ignores junk', () => {
  const SA = load();
  const rates = plain(SA.stats.missRates({ parts: {
    orejas: { taps: 4, misses: 1 }, cola: { taps: 2, misses: 2 }, pico: { taps: 10, misses: 5 },
    patas: { taps: 0, misses: 3 }, alas: 'x', ojos: { taps: 3, misses: 9 },
  } }));
  assert.deepEqual(rates.map((r) => r.part), ['ojos', 'cola', 'pico', 'orejas']);
  assert.equal(rates[1].missRate, 1);
  assert.equal(rates[0].misses, 3, 'misses are capped at taps');
  assert.equal(rates[2].missRate, 0.5);
  assert.equal(rates[3].missRate, 0.25);
  assert.deepEqual(plain(SA.stats.missRates(undefined)), []);
  assert.deepEqual(plain(SA.stats.missRates({ parts: [] })), []);
});

test('recordTap accumulates in the save; summary and text report accuracy and most-missed parts', () => {
  const SA = load();
  SA.stats.recordTap('orejas', true);
  SA.stats.recordTap('orejas', false);
  SA.stats.recordTap('cola', false);
  SA.stats.recordTap('pico', true);
  assert.equal(SA.stats.recordTap('Bad Key!', true), false);
  assert.deepEqual(plain(SA.save.get().stats.parts.orejas), { taps: 2, misses: 1 });
  SA.save.update({ rounds: { completed: 3 } });
  const s = SA.stats.summary(SA.save.get());
  assert.equal(s.rounds, 3);
  assert.equal(s.taps, 4);
  assert.equal(s.accuracy, 0.5);
  assert.deepEqual(plain(s.mostMissed.map((r) => r.part)), ['cola', 'orejas']);
  const text = SA.stats.toText(SA.save.get(), (p) => `<${p}>`);
  assert.match(text, /Rondas: 3/);
  assert.match(text, /Aciertos: 50% \(4 toques\)/);
  assert.match(text, /<cola>: 100% \(1\/1\)/);
});

test('summary/toText on an empty save; recordTap stops adding new part keys at the cap', () => {
  const SA = load();
  const s = SA.stats.summary(SA.save.get());
  assert.equal(s.accuracy, null);
  assert.match(SA.stats.toText(SA.save.get()), /Aciertos: - \(0 toques\)/);
  assert.deepEqual(plain(SA.stats.summary(null).mostMissed), []);
  for (let i = 0; i < 45; i++) SA.stats.recordTap('p' + i, false);
  assert.equal(Object.keys(SA.save.get().stats.parts).length, 40);
  assert.equal(SA.stats.recordTap('p0', true), true);
});

// ---- SA.settings ----

test('english defaults off and persists; mute persists through the save', () => {
  const SA = load();
  assert.equal(SA.settings.get().english, false);
  SA.settings.setEnglish(true);
  assert.equal(SA.save.get().settings.english, true);
  assert.equal(SA.settings.setMuted(true), true);
  assert.equal(SA.save.get().settings.muted, true);
  assert.equal(SA.settings.get().muted, true);
});

test('difficulty: auto by default; fixed levels pin scaffold and stop adaptation', () => {
  const SA = load();
  assert.equal(SA.settings.get().difficulty, 'auto');
  assert.equal(SA.settings.setDifficulty('nonsense'), false);
  assert.equal(SA.settings.setDifficulty('challenge'), true);
  assert.equal(SA.save.get().settings.scaffold, 3);
  assert.equal(SA.settings.get().difficulty, 'challenge');
  for (let i = 0; i < 6; i++) SA.scaffold.record({ seconds: 30, misses: 2, hints: 1 });
  assert.equal(SA.save.get().settings.scaffold, 3, 'slow rounds do not lower a pinned level');
  SA.settings.setDifficulty('beginner');
  assert.equal(SA.save.get().settings.scaffold, 1);
  SA.settings.setDifficulty('auto');
  assert.equal(SA.save.get().settings.scaffold, 1, 'auto keeps the current level');
  for (let i = 0; i < 3; i++) SA.scaffold.record({ seconds: 3, misses: 0, hints: 0 });
  assert.equal(SA.save.get().settings.scaffold, 2, 'auto adapts again');
});

test('resetProgress clears progress but keeps grown-up settings, and the save stays usable', () => {
  const SA = load();
  SA.save.update({ stars: 7, unlockedAnimals: ['gato'], placedProps: [{ id: 'arbol' }], rounds: { completed: 5, streak: 2 } });
  SA.stats.recordTap('cola', false);
  SA.settings.setEnglish(true);
  SA.settings.setDifficulty('intermediate');
  const fresh = plain(SA.settings.resetProgress());
  assert.equal(fresh.stars, 0);
  assert.deepEqual(fresh.placedProps, []);
  assert.deepEqual(fresh.rounds, { completed: 0, streak: 0 });
  assert.deepEqual(fresh.stats, { unlocks: {} });
  assert.equal(fresh.settings.english, true);
  assert.equal(fresh.settings.difficulty, 'intermediate');
  SA.save.update({ stars: 1 });
  assert.equal(SA.save.get().stars, 1);
});

test('feedback carries level, stars and round context; blank text sends nothing', () => {
  const calls = [];
  const SA = load({ SAT: { feedback: (...a) => (calls.push(a), { ok: true }) } });
  SA.save.update({ stars: 4, rounds: { completed: 6 }, settings: { scaffold: 2 } });
  assert.equal(SA.settings.sendFeedback('   '), null);
  assert.deepEqual(calls, []);
  assert.deepEqual(plain(SA.settings.sendFeedback('  muy bien  ')), { ok: true });
  assert.equal(calls[0][0], 'muy bien');
  assert.equal(calls[0][1], 'feedback');
  assert.deepEqual(plain(calls[0][2]), { level: 2, stars: 4, round: 6 });
  const noSat = load();
  assert.equal(noSat.settings.sendFeedback('hi'), null);
});

test('press-and-hold opens only after the full delay; a quick tap does not', () => {
  const SA = load();
  const timers = [];
  let opened = 0;
  const hold = SA.settings.createHold({
    onOpen: () => opened++,
    setTimer: (fn, ms) => (timers.push({ fn, ms, live: true }), timers.length - 1),
    clearTimer: (h) => { timers[h].live = false; },
  });
  hold.down();
  assert.equal(timers[0].ms, 1500);
  hold.up();                                   // released early
  timers.filter((t) => t.live).forEach((t) => t.fn());
  assert.equal(opened, 0);
  hold.down();
  hold.down();                                 // repeated pointerdown/touchstart restarts, never double-fires
  timers.filter((t) => t.live).forEach((t) => t.fn());
  assert.equal(opened, 1);
  hold.cancel();
});

test('round and care taps are recorded into stats (part.tap hook)', () => {
  const SA = loadGame([...BASE, 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js', 'game/data/clues.js',
    'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js', 'game/picking.js', 'game/round.js']);
  SA.save.reset();
  const game = SA.round.create({ level: 1, track() {} });
  const r = game.start();
  const wrong = SA.data.all('animals').find((a) => a.id !== r.answerId);
  game.pick({ animalId: wrong.id, part: 'cola' });
  game.pick({ animalId: r.answerId, part: 'orejas' });
  assert.deepEqual(plain(SA.save.get().stats.parts), { cola: { taps: 1, misses: 1 }, orejas: { taps: 1, misses: 0 } });
});

// ---- SA.settingsView (fake DOM) ----

function fakeDom() {
  const made = [];
  const mk = (tag) => {
    const e = {
      tag, style: {}, children: [], handlers: {}, textContent: '', value: '', attrs: {},
      addEventListener(n, f) { (this.handlers[n] ||= []).push(f); },
      appendChild(c) { this.children.push(c); return c; },
      removeChild() {}, setAttribute(k, v) { this.attrs[k] = v; }, select() {},
      fire(n) { (this.handlers[n] || []).forEach((f) => f({})); },
    };
    made.push(e);
    return e;
  };
  return { made, doc: { createElement: mk, body: mk('body'), execCommand: () => true } };
}

function viewSetup(opts = {}) {
  const timers = [];
  const calls = [];
  const SA = load({
    setTimeout: (fn, ms) => (timers.push({ fn, ms, live: true }), timers.length),
    clearTimeout: (h) => { if (timers[h - 1]) timers[h - 1].live = false; },
    SAT: { feedback: (...a) => (calls.push(a), { ok: true }) },
  }, [...BASE, 'game/ui/settings-view.js']);
  const { made, doc } = fakeDom();
  const view = SA.settingsView.create(doc, { reload: () => calls.push('reload'), copy: (t) => calls.push(['copy', t]), ...opts });
  const byText = (re) => made.find((e) => re.test(e.textContent));
  const fireTimers = () => timers.filter((t) => t.live).forEach((t) => { t.live = false; t.fn(); });
  return { SA, view, made, byText, timers, calls, fireTimers, gear: made.find((e) => e.tag === 'button' && e.textContent === '⚙️') };
}

test('drawer: opens only on long-press of the gear', () => {
  const { view, gear, timers, fireTimers } = viewSetup();
  assert.equal(view.isOpen(), false);
  gear.fire('pointerdown');
  assert.equal(timers[0].ms, 1500);
  gear.fire('pointerup');
  fireTimers();
  assert.equal(view.isOpen(), false);
  gear.fire('pointerdown');
  fireTimers();
  assert.equal(view.isOpen(), true);
  view.close();
  assert.equal(view.isOpen(), false);
});

test('drawer: english, difficulty, mute and copy are wired to the save', () => {
  const { SA, view, byText, calls } = viewSetup();
  view.open();
  byText(/^English labels/).fire('click');
  assert.equal(SA.save.get().settings.english, true);
  assert.match(byText(/^English labels/).textContent, /ON/);
  byText(/^Intermediate$/).fire('click');
  assert.equal(SA.save.get().settings.difficulty, 'intermediate');
  byText(/Sound:/).fire('click');
  assert.equal(SA.save.get().settings.muted, true);
  SA.stats.recordTap('cola', false);
  byText(/^Copy stats$/).fire('click');
  assert.match(calls.find((c) => c[0] === 'copy')[1], /Rondas: 0/);
});

test('drawer: reset needs a confirm step, then clears progress and reloads', () => {
  const { SA, view, byText, calls } = viewSetup();
  SA.save.update({ stars: 9 });
  view.open();
  byText(/^Reset progress$/).fire('click');
  assert.equal(SA.save.get().stars, 9, 'first click only asks');
  byText(/^Cancel$/).fire('click');
  assert.equal(SA.save.get().stars, 9);
  byText(/^Reset progress$/).fire('click');
  byText(/^Yes, erase$/).fire('click');
  assert.equal(SA.save.get().stars, 0);
  assert.ok(calls.includes('reload'));
});

test('drawer: feedback goes to SAT.feedback with context; empty text is not sent', () => {
  const { SA, view, made, byText, calls } = viewSetup();
  SA.save.update({ stars: 2, rounds: { completed: 3 } });
  view.open();
  const box = made.find((e) => e.tag === 'textarea');
  byText(/^Send feedback$/).fire('click');
  assert.equal(calls.length, 0);
  box.value = 'the owl is hard to find';
  byText(/^Send feedback$/).fire('click');
  assert.equal(calls[0][0], 'the owl is hard to find');
  assert.deepEqual(plain(calls[0][2]), { level: 1, stars: 2, round: 3 });
  assert.equal(box.value, '');
});

test('drawer: harmless without a DOM', () => {
  const SA = load({}, [...BASE, 'game/ui/settings-view.js']);
  const v = SA.settingsView.create(undefined);
  assert.doesNotThrow(() => { v.open(); v.close(); v.refresh(); });
  assert.equal(v.isOpen(), false);
});
