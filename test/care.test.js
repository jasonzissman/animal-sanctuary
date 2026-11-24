import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/camera.js',
  'game/round.js', 'game/data/foods.js', 'game/data/items.js', 'game/inventory.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js',
  'game/ui/care-flow.js', 'game/ui/prompt.js'];

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  let t = 1000;
  const events = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(3), now: () => t, level: 1, track: (type, f) => events.push({ type, ...f }), ...opts });
  return { SA, care, events, advance: (ms) => { t += ms; } };
}

test('care task data validates and only names parts that exist', () => {
  const { SA } = setup();
  const defs = SA.data.all('careTasks');
  assert.ok(defs.length >= 1);
  assert.ok(defs[0].parts.includes('patas') && defs[0].parts.includes('caparazon') && defs[0].parts.includes('cola'));
  const ok = { kind: 'limpiar', action: 'lavar', parts: ['patas'], prompt: 'Lava {part}', rubs: 3, spotsPerRub: 2, chance: 1 };
  assert.throws(() => SA.data.register('careTasks', [{ ...ok, id: 'x', parts: ['nope'] }]), /unknown part/);
  assert.throws(() => SA.data.register('careTasks', [{ ...ok, id: 'y', prompt: 'Lava' }]), /\{part\}/);
  assert.throws(() => SA.data.register('careTasks', [{ ...ok, id: 'z', action: 'volar' }]), /unknown action/);
  assert.throws(() => SA.data.register('careTasks', [{ ...ok, id: 'w', prompt: 'Limpia {part}' }]), /action verb/);
  assert.throws(() => SA.data.register('careTasks', [{ ...ok, id: 'v', parts: ['barriga'] }]), /does not work on/);
});

test('maybeStart targets a part the animal really has, for every animal, with agreeing Spanish', () => {
  const { SA, care } = setup();
  const def = SA.data.get('careTasks', 'limpiar');
  for (const a of SA.data.all('animals').filter((x) => !x.easterEgg)) {
    for (let i = 0; i < 6; i++) {
      const task = care.maybeStart(a.id, true, 'limpiar');
      if (!task) { assert.ok(!a.parts.some((p) => def.parts.includes(p.part))); continue; }
      assert.ok(a.parts.some((p) => p.part === task.part), `${a.id} has ${task.part}`);
      assert.ok(def.parts.includes(task.part));
      assert.equal(task.text, 'Lava ' +SA.data.get('parts', task.part).label.es);
      assert.equal(task.remaining, def.rubs);
      assert.equal(task.spots, def.rubs * def.spotsPerRub);
    }
  }
});

test('maybeStart only sometimes starts a task, and never for unknown animals', () => {
  const { SA, care } = setup({ rng: SA_rng(11) });
  let started = 0;
  for (let i = 0; i < 200; i++) if (care.maybeStart('tortuga')) started += 1;
  assert.ok(started > 40 && started < 160, 'started ' + started + ' of 200');
  assert.equal(care.maybeStart('dragon', true), null);
  assert.equal(setup({ rng: () => 0.99 }).care.maybeStart('tortuga'), null);
  assert.ok(setup({ rng: () => 0 }).care.maybeStart('tortuga'));

  function SA_rng(seed) { return loadGame(FILES).clues.makeRng(seed); }
});

test('tapping the right part scrubs spots away and finishing awards a star and round.complete', () => {
  const { SA, care, events, advance } = setup();
  const task = care.maybeStart('tortuga', true, 'limpiar');
  const ctx = { animalId: 'tortuga', part: task.part, item: 'esponja' };
  advance(4200);
  let res = care.tap(ctx);
  assert.deepEqual({ ...res }, { status: 'scrub', remaining: 2, spotsLeft: 4 });
  assert.equal(care.active(), true);
  res = care.tap(ctx);
  assert.equal(res.spotsLeft, 2);
  res = care.tap(ctx);
  assert.equal(res.status, 'done');
  assert.equal(res.stars, 1);
  assert.equal(res.seconds, 4.2);
  assert.equal(care.active(), false);
  assert.equal(SA.save.get().stars, 1);
  assert.equal(SA.save.get().rounds.completed, 1);
  const taps = events.filter((e) => e.type === 'part.tap');
  assert.equal(taps.length, 3);
  assert.ok(taps.every((e) => e.correct === true && e.part === task.part));
  const done = events.filter((e) => e.type === 'round.complete');
  assert.equal(done.length, 1);
  assert.deepEqual({ ...done[0] }, { type: 'round.complete', roundId: task.id, seconds: 4.2, misses: 0, hints: 0, level: 1 });
  assert.equal(care.tap(ctx).status, 'ignored');       // finished: further taps do nothing
  assert.equal(SA.save.get().stars, 1);
});

test('a wrong part names itself, counts a miss, emits part.tap correct:false and the task continues', () => {
  const { SA, care, events } = setup();
  const task = care.maybeStart('tortuga', true, 'limpiar');
  const other = SA.data.get('animals', 'tortuga').parts.map((p) => p.part).find((k) => k !== task.part);
  const res = care.tap({ animalId: 'tortuga', part: other, item: 'esponja' });
  assert.equal(res.status, 'wrong');
  assert.equal(res.reason, 'part');
  assert.equal(res.label, SA.data.get('parts', other).label.es);
  assert.equal(res.misses, 1);
  assert.equal(task.remaining, task.rubs);
  assert.equal(SA.save.get().stars, 0);
  assert.deepEqual({ ...events[0] }, { type: 'part.tap', part: other, correct: false });
  assert.equal(care.active(), true);
});

test('taps with no task, or on another animal, are ignored and emit nothing', () => {
  const { care, events } = setup();
  assert.equal(care.tap({ animalId: 'tortuga', part: 'patas' }).status, 'ignored');
  care.maybeStart('tortuga', true, 'limpiar');
  assert.equal(care.tap({ animalId: 'conejo', part: 'cola' }).status, 'ignored');
  assert.equal(care.tap(null).status, 'ignored');
  assert.equal(events.length, 0);
});

// ---- care flow (wiring) with stubs ----
function flowSetup(rngValue = 0) {
  const t = setup({ rng: () => rngValue });
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast') };
  const fx = { show: rec('show'), scrub: rec('scrub'), hide: rec('hide') };
  const audio = { say: rec('say'), sfx: rec('sfx') };
  const timers = [];
  let done = 0;
  const flow = t.SA.careFlow.create({ care: t.care, view, fx, audio, later: (fn, ms) => timers.push([fn, ms]), onDone: () => { done += 1; } });
  return { ...t, flow, calls, timers, done: () => done, names: () => calls.map((c) => c[0]) };
}

test('flow: offer shows the prompt, speaks it, zooms in and makes the part rub-able', () => {
  const f = flowSetup();
  assert.equal(f.flow.offer('tortuga'), true);
  const task = f.care.current();
  assert.ok(f.calls.some((c) => c[0] === 'show' && c[1] === task));
  assert.ok(f.calls.some((c) => c[0] === 'say' && c[1] === task.text));
  assert.ok(f.calls.some((c) => c[0] === 'showCare' && c[1].text === task.text));
  assert.equal(f.SA.picking.isRubTarget({ animalId: 'tortuga', part: task.part }), true);
  assert.equal(f.SA.picking.isRubTarget({ animalId: 'tortuga', part: 'ojos' }), false);
  assert.equal(f.flow.active(), true);
  f.calls.length = 0;
  f.flow.replay();
  assert.deepEqual(f.calls, [['say', task.text]]);
});

test('flow: scrub splashes, wrong boings with its name, finish celebrates then calls onDone', () => {
  const f = flowSetup();
  f.flow.offer('tortuga');
  const task = f.care.current();
  f.calls.length = 0;
  const sponge = { animalId: 'tortuga', part: task.part, item: 'esponja' };
  f.flow.onPick(sponge);
  assert.deepEqual(f.calls, [['sfx', 'splash'], ['scrub', 4]]);
  f.calls.length = 0;
  const other = ['ojos', 'cabeza', 'cuerpo'].find((k) => k !== task.part);
  const partLabel = f.SA.data.get('parts', other).label.es;
  f.flow.onPick({ animalId: 'tortuga', part: other, item: 'esponja' });           // right tool, wrong part
  assert.deepEqual(f.calls, [['sfx', 'boing'], ['toast', '🙈 la esponja · ' + partLabel], ['say', 'item:esponja']]);
  f.timers.length = 0;
  f.calls.length = 0;
  f.flow.onPick({ animalId: 'tortuga', part: task.part, item: 'cepillo' });       // wrong tool, right part: names both, no progress
  assert.deepEqual(f.calls.slice(0, 3), [['sfx', 'boing'], ['toast', '🙈 el cepillo · ' + f.SA.data.get('parts', task.part).label.es], ['say', 'item:cepillo']]);
  assert.equal(f.timers.length, 1, 'the part name follows after a pause');
  f.timers[0][0]();
  assert.deepEqual(f.calls.at(-1), ['say', 'part:' + task.part]);
  f.timers.length = 0;
  assert.equal(f.care.current().remaining, 2, 'wrong pairings never progress or penalise');
  assert.equal(f.SA.save.get().stars, 0);
  f.flow.onPick({ animalId: 'tortuga', part: task.part });                         // empty hands on a sponge task: also a funny miss
  assert.equal(f.care.current().remaining, 2);
  f.flow.onPick(sponge);
  f.flow.onPick(sponge);
  assert.ok(f.names().includes('confetti') && f.names().includes('celebrate'));
  assert.equal(f.SA.picking.hasRubTarget(), false);
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0][1], f.SA.careFlow.NEXT_MS);
  assert.equal(f.done(), 0);
  f.timers[0][0]();
  assert.equal(f.done(), 1);
  assert.ok(f.names().includes('hide'));
  assert.equal(f.SA.save.get().stars, 1);
});

test('flow: no task (chance miss) offers nothing; broken audio never throws', () => {
  const f = flowSetup(0.99);
  assert.equal(f.flow.offer('tortuga'), false);
  assert.equal(f.flow.active(), false);
  const { SA, care } = setup({ rng: () => 0 });
  const flow = SA.careFlow.create({ care, view: { showCare() {} }, audio: { say() { throw new Error('x'); }, sfx() { throw new Error('y'); } } });
  assert.equal(flow.offer('tortuga'), true);
});

test('prompt controller: a correct pick can lead into a care task, then the next round', () => {
  const t = setup({ rng: () => 0 });
  const game = t.SA.round.create({ rng: t.SA.clues.makeRng(7), track: () => {} });
  const calls = [];
  const view = { showRound: () => calls.push('round'), showCare: () => calls.push('care'), celebrate() {}, toast() {}, shake() {}, confetti() {}, clear() {} };
  const timers = [];
  const later = (fn) => timers.push(fn);
  let ctl;
  const care = t.SA.careFlow.create({ care: t.care, view, audio: {}, later, onDone: () => ctl.begin() });
  ctl = t.SA.prompt.createController({ game, view, audio: {}, later, care });
  const r = ctl.begin();
  assert.equal(ctl.onPick({ animalId: r.answerId, part: 'cuerpo' }).status, 'correct');
  timers.shift()();                                   // celebration over: care task starts
  assert.deepEqual(calls, ['round', 'care']);
  assert.equal(care.active(), true);
  const task = t.care.current();
  for (let i = 0; i < task.rubs; i++) ctl.onPick({ animalId: task.animalId, part: task.part, item: task.item });
  assert.equal(care.active(), false);
  timers.shift()();                                   // care celebration over: next round
  assert.deepEqual(calls, ['round', 'care', 'round']);
});

test('index.html loads the care scripts before scene.js', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf(f);
  for (const f of ['game/data/care.js', 'game/care.js', 'game/render/care-fx.js', 'game/ui/care-flow.js']) {
    assert.ok(at(f) > 0 && at(f) < at('game/render/scene.js'), f);
  }
  assert.ok(at('game/data/care.js') < at('game/care.js'));
});

// ---- 3D care effects with the real vendored three.js (no WebGL needed) ----
test('care fx: mud spots appear on the target part, wash away with sparkles, and the camera is left alone', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
    'game/data/animals.js', 'game/map.js', 'game/animal-plan.js', 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/care-fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const animals = SA.render.buildAnimals(THREE, {});
  const rigCalls = [];
  // The camera is never touched during care: any rig call would be recorded here.
  const rig = new Proxy({}, { get: (_, name) => (...a) => rigCalls.push([name, ...a]) });
  const fx = SA.render.createCareFx(THREE, { animals, rig });
  const group = animals.getObjectByName('tortuga#0');
  const herd = animals.children.length;
  const before = group.children.length;
  assert.equal(fx.show({ animalId: 'tortuga', part: 'patas', spots: 6 }), true);
  assert.equal(fx.spotCount(), 6);
  assert.equal(group.children.length, before + 6);
  fx.scrub(4);
  assert.equal(fx.spotCount(), 4);
  assert.equal(animals.children.length, herd + 12);        // 2 spots washed away burst into 6 sparkles each
  fx.update(0.3);
  fx.update(1);                                           // sparkles expire
  assert.equal(animals.children.length, herd);
  fx.scrub(0);
  fx.hide();
  assert.equal(group.children.length, before);
  assert.deepEqual(rigCalls, [], 'care never moves the camera');
  assert.equal(fx.show({ animalId: 'nadie', part: 'patas', spots: 2 }), false);
  assert.equal(fx.show({ animalId: 'tortuga', part: 'alas', spots: 2 }), false);   // a part it does not have
});

test('care fx: a tangled wing shows leaf bits on ONE wing, tells ambient the bird is stuck, and fly() frees it', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
    'game/data/animals.js', 'game/map.js', 'game/animal-plan.js', 'game/render/zigzag.js', 'game/render/instances.js', 'game/render/animals.js', 'game/render/care-fx.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const animals = SA.render.buildAnimals(THREE, {});
  const calls = [];
  const ambient = { hold: (id) => calls.push(['hold', id]), release: (id) => calls.push(['release', id]),
    setTangled: (id, on) => calls.push(['tangled', id, on]), flyLoop: (id) => calls.push(['loop', id]) };
  const fx = SA.render.createCareFx(THREE, { animals, ambient });
  const id = animals.children.map((g) => g.userData.animalId).find((a) => SA.data.get('animals', a).parts.some((p) => p.part === 'alas'));
  const group = animals.getObjectByName(id + '#0');
  const before = group.children.length;
  assert.equal(fx.show({ animalId: id, part: 'alas', spots: 3, kind: 'desenredar', tangled: true }), true);
  assert.equal(fx.spotCount(), 3);
  assert.equal(group.children.length, before + 3);
  const wings = group.children.filter((m) => !m.userData.pick && m.userData.part === 'alas');
  const leaves = group.children.filter((m) => m.userData.mud);
  const nearest = (leaf) => wings.map((w) => w.position.distanceTo(leaf.position)).indexOf(Math.min(...wings.map((w) => w.position.distanceTo(leaf.position))));
  assert.equal(new Set(leaves.map(nearest)).size, 1, 'all the leaf bits are on the same wing');
  assert.deepEqual(calls.filter((c) => c[0] === 'tangled'), [['tangled', id + '#0', true]]);   // ambient is keyed by the instance the task is on (AS-0255)
  fx.scrub(0);
  fx.fly(id);
  assert.deepEqual(calls.slice(-2), [['tangled', id + '#0', false], ['loop', id + '#0']]);
  fx.hide();
  assert.equal(group.children.length, before);
  assert.deepEqual(calls.slice(-1)[0], ['release', id + '#0']);
});
