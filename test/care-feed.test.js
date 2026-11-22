import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js',
  'game/camera.js', 'game/round.js', 'game/data/care.js', 'game/care.js', 'game/ui/care-flow.js', 'game/ui/prompt.js'];

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  let t = 1000;
  const events = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(5), now: () => t, level: 1, track: (type, f) => events.push({ type, ...f }), ...opts });
  return { SA, care, events, advance: (ms) => { t += ms; } };
}

const realAnimals = (SA) => SA.data.all('animals').filter((a) => !a.easterEgg);

test('foods are data with es labels, gender, plural and vocab entries; every diet has a food', () => {
  const { SA } = setup();
  for (const f of SA.data.all('foods')) {
    const v = SA.vocab.get('food:' + f.id);
    assert.ok(v, 'vocab for ' + f.id);
    assert.equal(v.es, (f.label.gender === 'f' ? 'la ' : 'el ') + f.label.es);
    assert.ok(f.label.plural.length > 0 && f.icon);
  }
  for (const d of SA.animals.DIETS) assert.ok(SA.data.all('foods').some((f) => f.diets.includes(d)), 'food for ' + d);
  assert.throws(() => SA.data.register('foods', [{ id: 'x', icon: '?', label: { es: 'x', plural: 'xs', gender: 'm' }, diets: ['nope'] }]), /diet/);
  assert.throws(() => SA.data.register('foods', [{ id: 'y', icon: '?', label: { es: 'y', plural: 'ys', gender: 'q' }, diets: ['herbívoro'] }]), /gender/);
});

test('care task data validates the new kinds', () => {
  const { SA } = setup();
  assert.deepEqual([...SA.data.all('careTasks').map((d) => d.kind)],['limpiar', 'curar', 'alimentar']);
  const feed = SA.data.get('careTasks', 'alimentar');
  assert.throws(() => SA.data.register('careTasks', [{ ...feed, id: 'a1', prompt: 'Dale {count} {food}' }]), /\{animal\}/);
  assert.throws(() => SA.data.register('careTasks', [{ ...feed, id: 'a2', maxCount: 6 }]), /maxCount/);
  assert.throws(() => SA.data.register('careTasks', [{ ...feed, id: 'a3', easyMax: 5, maxCount: 4 }]), /easyMax/);
  const heal = SA.data.get('careTasks', 'curar');
  assert.throws(() => SA.data.register('careTasks', [{ ...heal, id: 'h1', rubs: 2 }]), /rubs/);
  assert.throws(() => SA.data.register('careTasks', [{ ...heal, id: 'h2', kind: 'bailar' }]), /kind/);
});

test('feed tasks ask for 1-3 at level 1 and 1-5 at level 2, with agreeing Spanish', () => {
  const seen = { 1: new Set(), 2: new Set() };
  for (const level of [1, 2]) {
    const { SA, care } = setup({ level });
    for (const a of realAnimals(SA)) {
      for (let i = 0; i < 30; i++) {
        const task = care.maybeStart(a.id, true, 'alimentar');
        const food = SA.data.get('foods', task.food);
        seen[level].add(task.count);
        const who = (a.name.gender === 'f' && a.id !== 'aguila' ? 'a la ' : 'al ') + a.name.es;   // el águila
        const word = task.count === 1 ? (food.label.gender === 'f' ? 'una' : 'un') : SA.vocab.get('number:' + task.count).es;
        assert.equal(task.text, `Dale ${word} ${task.count === 1 ? food.label.es : food.label.plural} ${who}`);
        assert.ok(food.diets.includes(a.traits.diet), `${a.id} eats ${food.id}`);
        assert.ok(task.tray.includes(task.food) && new Set(task.tray).size === task.tray.length);
        assert.ok(task.tray.some((id) => !SA.data.get('foods', id).diets.includes(a.traits.diet)), 'tray has foods it does not eat');
        assert.equal(task.given, 0);
        assert.equal(task.part, null);
      }
    }
  }
  assert.deepEqual([...seen[1]].sort(), [1, 2, 3]);
  assert.deepEqual([...seen[2]].sort(), [1, 2, 3, 4, 5]);
});

test('exact text for known cases: "Dale una fresa al conejo", "Dale cinco fresas al conejo"', () => {
  const one = setup({ rng: () => 0 }).care.maybeStart('conejo', true, 'alimentar');
  assert.equal(one.food, 'fresa');
  assert.equal(one.text, 'Dale una fresa al conejo');
  // rng sequence: def pick, target food, count (0.99 -> the highest), then tray shuffles
  const seq = [0, 0, 0.99];
  let i = 0;
  const five = setup({ level: 2, rng: () => (i < seq.length ? seq[i++] : 0) }).care.maybeStart('conejo', true, 'alimentar');
  assert.equal(five.count, 5);
  assert.equal(five.text, 'Dale cinco fresas al conejo');
});

test('feeding completes only at exactly the asked count; the asked food is counted, others bounce back', () => {
  const { SA, care, events, advance } = setup();
  let task;
  do { task = care.maybeStart('conejo', true, 'alimentar'); } while (task.count < 3);
  const wrongDiet = task.tray.find((id) => !SA.data.get('foods', id).diets.includes('herbívoro'));
  const label = SA.vocab.get('food:' + wrongDiet).es;
  advance(6000);

  let res = care.feed(wrongDiet);
  assert.deepEqual({ ...res }, { status: 'wrong', reason: 'diet', food: wrongDiet, label, misses: 1 });
  assert.equal(task.given, 0);
  res = care.feed(task.food);
  assert.deepEqual({ ...res }, { status: 'fed', food: task.food, given: 1, remaining: task.count - 1 });
  res = care.feed(wrongDiet);
  assert.equal(res.status, 'wrong');
  assert.equal(task.given, 1);
  assert.equal(care.active(), true);
  assert.equal(SA.save.get().stars, 0);

  for (let n = 2; n < task.count; n++) assert.equal(care.feed(task.food).status, 'fed');
  assert.equal(care.active(), true);                       // one short: still going
  assert.equal(SA.save.get().rounds.completed, 0);
  res = care.feed(task.food);
  assert.equal(res.status, 'done');
  assert.equal(res.kind, 'alimentar');
  assert.equal(res.stars, 1);
  assert.equal(res.seconds, 6);
  assert.equal(res.misses, 2);
  assert.equal(task.given, task.count);
  assert.equal(care.active(), false);
  assert.equal(SA.save.get().rounds.completed, 1);
  assert.equal(care.feed(task.food).status, 'ignored');   // finished: nothing more happens
  assert.equal(SA.save.get().stars, 1);

  const done = events.filter((e) => e.type === 'round.complete');
  assert.equal(done.length, 1);
  assert.deepEqual({ ...done[0] }, { type: 'round.complete', roundId: task.id, seconds: 6, misses: 2, hints: 0, level: 1 });
  const feeds = events.filter((e) => e.type === 'care.feed');
  assert.equal(feeds.filter((e) => e.correct).length, task.count);
  assert.equal(feeds.filter((e) => !e.correct).length, 2);
  assert.equal(events.filter((e) => e.type === 'part.tap').length, 0);
});

test('a food the animal eats but was not asked for is "other"; foods outside the tray and part taps are ignored', () => {
  const { SA, care } = setup();
  let task;
  const eatsIt = (f) => f.diets.includes('herbívoro');
  for (let i = 0; i < 80; i++) {            // find a tray that holds a second food the rabbit eats
    task = care.maybeStart('conejo', true, 'alimentar');
    if (task.tray.some((id) => id !== task.food && eatsIt(SA.data.get('foods', id)))) break;
  }
  const other = task.tray.find((id) => id !== task.food && eatsIt(SA.data.get('foods', id)));
  assert.equal(care.feed(other).reason, 'other');
  const outside = SA.data.all('foods').map((f) => f.id).find((id) => !task.tray.includes(id));
  assert.equal(care.feed(outside).status, 'ignored');
  assert.equal(care.feed('nope').status, 'ignored');
  assert.equal(care.tap({ animalId: 'conejo', part: 'orejas' }).status, 'ignored');
  assert.equal(task.misses, 1);
  assert.equal(task.given, 0);
  // an extra item (one more than asked) can never be counted
  task.given = task.count;
  assert.deepEqual({ ...care.feed(task.food) }, { status: 'wrong', reason: 'extra', food: task.food, label: SA.vocab.get('food:' + task.food).es, misses: 2 });
  assert.equal(task.given, task.count);
});

test('feed with no task, or while a different kind of task is active, is ignored', () => {
  const { care, events } = setup();
  assert.equal(care.feed('fresa').status, 'ignored');
  care.maybeStart('tortuga', true, 'limpiar');
  assert.equal(care.feed('fresa').status, 'ignored');
  assert.equal(events.length, 0);
});

test('heal: "Cura las alas" is done by one tap on the named part; wrong parts are named and the task continues', () => {
  const { SA, care, events } = setup();
  for (const a of realAnimals(SA)) {
    const task = care.maybeStart(a.id, true, 'curar');
    if (!task) continue;
    assert.equal(task.kind, 'curar');
    assert.equal(task.text, 'Cura ' + SA.data.get('parts', task.part).label.es);
    assert.ok(a.parts.some((p) => p.part === task.part));
  }
  const task = care.maybeStart('tucan', true, 'curar');
  const other = SA.data.get('animals', 'tucan').parts.map((p) => p.part).find((k) => k !== task.part);
  events.length = 0;
  const wrong = care.tap({ animalId: 'tucan', part: other });
  assert.equal(wrong.status, 'wrong');
  assert.equal(wrong.label, SA.data.get('parts', other).label.es);
  assert.equal(care.active(), true);
  assert.equal(SA.save.get().stars, 0);
  const done = care.tap({ animalId: 'tucan', part: task.part });
  assert.equal(done.status, 'done');
  assert.equal(done.kind, 'curar');
  assert.equal(done.stars, 1);
  assert.equal(care.active(), false);
  assert.deepEqual(events.filter((e) => e.type === 'part.tap').map((e) => e.correct), [false, true]);
  assert.equal(events.filter((e) => e.type === 'round.complete').length, 1);
});

// ---- flow with stubs ----
function flowSetup(opts = {}) {
  const t = setup(opts);
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast'),
    showFeed: rec('showFeed'), updateFeed: rec('updateFeed'), hideFeed: rec('hideFeed'), bounceFood: rec('bounceFood') };
  const fx = { show: rec('show'), scrub: rec('scrub'), hide: rec('hide'), bandage: rec('bandage') };
  const audio = { say: rec('say'), sfx: rec('sfx') };
  const timers = [];
  let done = 0;
  const flow = t.SA.careFlow.create({ care: t.care, view, fx, audio, later: (fn, ms) => timers.push([fn, ms]), onDone: () => { done += 1; } });
  return { ...t, flow, calls, timers, done: () => done, names: () => calls.map((c) => c[0]) };
}

test('flow (feed): shows the tray, counts aloud, bounces wrong food with a giggle, then celebrates', () => {
  const f = flowSetup();
  // offer() picks a random kind, so drive the feed flow through a feed-only care
  const only = { ...f.care, maybeStart: (id) => f.care.maybeStart(id, true, 'alimentar') };
  const flow = f.SA.careFlow.create({ care: only, view: { showCare: (r) => f.calls.push(['showCare', r]), showFeed: (r) => f.calls.push(['showFeed', r]),
    updateFeed: (r) => f.calls.push(['updateFeed', r]), hideFeed: () => f.calls.push(['hideFeed']), bounceFood: (id) => f.calls.push(['bounceFood', id]),
    celebrate: () => f.calls.push(['celebrate']), confetti: () => f.calls.push(['confetti']), toast: (m) => f.calls.push(['toast', m]) },
  fx: { show: () => f.calls.push(['show']), scrub() {}, hide() {} }, audio: { say: (k) => f.calls.push(['say', k]), sfx: (n) => f.calls.push(['sfx', n]) },
  later: (fn, ms) => f.timers.push([fn, ms]), onDone: () => {} });
  f.calls.length = 0;
  assert.equal(flow.offer('conejo'), true);
  const task = f.care.current();
  const shown = f.calls.find((c) => c[0] === 'showFeed')[1];
  assert.equal(shown.count, task.count);
  assert.deepEqual(shown.tray.map((x) => x.id), task.tray);
  assert.ok(shown.tray.every((x) => x.icon && x.label));
  assert.ok(f.calls.some((c) => c[0] === 'say' && c[1] === task.text));
  assert.equal(f.SA.picking.hasRubTarget(), false);

  f.calls.length = 0;
  const bad = task.tray.find((id) => id !== task.food);
  flow.onFeed(bad);
  assert.deepEqual(f.calls.map((c) => c[0]), ['sfx', 'bounceFood', 'toast', 'say']);
  assert.equal(f.calls[0][1], 'giggle');
  assert.equal(f.calls[3][1], 'food:' + bad);
  assert.equal(f.SA.save.get().stars, 0);

  f.calls.length = 0;
  for (let n = 1; n <= task.count; n++) flow.onFeed(task.food);
  const said = f.calls.filter((c) => c[0] === 'say').map((c) => c[1]);
  assert.deepEqual(said.slice(0, task.count), Array.from({ length: task.count }, (_, i) => 'number:' + (i + 1)));
  assert.ok(f.calls.some((c) => c[0] === 'hideFeed') && f.calls.some((c) => c[0] === 'confetti'));
  assert.equal(f.SA.save.get().stars, 1);
  assert.equal(f.timers.length, 1);
});

test('flow (heal): a tap bandages the part with a plus star; no rub target is set', () => {
  const f = flowSetup();
  const only = { ...f.care, maybeStart: (id) => f.care.maybeStart(id, true, 'curar') };
  const flow = f.SA.careFlow.create({ care: only, view: { showCare: (r) => f.calls.push(['showCare', r]), celebrate() {}, confetti() {}, toast() {} },
    fx: { show: () => f.calls.push(['show']), scrub: (n) => f.calls.push(['scrub', n]), hide() {}, bandage: () => f.calls.push(['bandage']) },
    audio: { say() {}, sfx() {} }, later: (fn, ms) => f.timers.push([fn, ms]) });
  assert.equal(flow.offer('tucan'), true);
  const task = f.care.current();
  assert.equal(f.calls.find((c) => c[0] === 'showCare')[1].icon, '🩹');
  assert.equal(f.SA.picking.hasRubTarget(), false);
  const res = flow.onPick({ animalId: 'tucan', part: task.part });
  assert.equal(res.status, 'done');
  assert.deepEqual(f.calls.filter((c) => c[0] === 'scrub' || c[0] === 'bandage').map((c) => c[0]), ['scrub', 'bandage']);
});

test('index.html loads foods.js after vocab/animals and before the care data', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (s) => html.indexOf(s);
  assert.ok(at('game/data/foods.js') > at('game/data/vocab.js'));
  assert.ok(at('game/data/foods.js') > at('game/data/animals.js'));
  assert.ok(at('game/data/foods.js') < at('game/data/care.js'));
});

test('prompt view: feed tray renders food buttons, counts dots, bounces and hides (fake DOM)', () => {
  const { SA } = setup();
  const made = [];
  const mk = (tag) => {
    const e = { tag, style: {}, children: [], listeners: {}, textContent: '', attrs: {},
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; }, animate() { this.animated = true; } };
    made.push(e);
    return e;
  };
  const fed = [];
  const view = SA.prompt.createView({ createElement: mk, body: { appendChild() {} } }, { feed: (id) => fed.push(id) });
  view.showFeed({ count: 3, given: 0, icon: '🍓', tray: [{ id: 'fresa', icon: '🍓', label: 'la fresa' }, { id: 'pez', icon: '🐟', label: 'el pez' }] });
  const btns = made.filter((e) => e.tag === 'button' && e.attrs['aria-label'] === 'la fresa' || e.attrs['aria-label'] === 'el pez');
  assert.equal(btns.length, 2);
  btns[0].listeners.click();
  assert.deepEqual(fed, ['fresa']);
  const dots = made.find((e) => e.textContent === '⚪⚪⚪');
  assert.ok(dots);
  view.updateFeed({ given: 2 });
  assert.equal(dots.textContent, '🍓🍓⚪');
  view.bounceFood('pez');
  assert.equal(btns[1].animated, true);
  view.hideFeed();
});

// ---- 3D: scrape + bandage and a feed task (no part) with the real vendored three.js ----
test('care fx: heal draws a scrape then a bandage; a feed task only zooms the camera', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
    'game/data/animals.js', 'game/map.js', 'game/animal-plan.js', 'game/render/zigzag.js', 'game/render/animals.js', 'game/render/care-fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const animals = SA.render.buildAnimals(THREE, {});
  const calls = [];
  const fx = SA.render.createCareFx(THREE, { animals, rig: { focusOn: () => calls.push('focus'), release: () => calls.push('release') } });
  const group = animals.getObjectByName('tucan');
  const before = group.children.length;
  assert.equal(fx.show({ kind: 'curar', animalId: 'tucan', part: 'alas', spots: 2 }), true);
  assert.equal(fx.spotCount(), 2);
  fx.scrub(0);
  assert.equal(fx.spotCount(), 0);
  fx.bandage();
  assert.equal(fx.spotCount(), 1);
  assert.equal(group.children.length, before + 1);
  fx.hide();
  assert.equal(group.children.length, before);
  assert.equal(fx.show({ kind: 'alimentar', animalId: 'tucan', part: null }), true);
  assert.equal(fx.spotCount(), 0);
  assert.deepEqual(calls.filter((c) => c === 'focus').length, 2);
  fx.hide();
});
