import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/audio.js', 'game/picking.js',
  'game/data/items.js', 'game/inventory.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/ui/care-flow.js',
  'game/map.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const calls = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(7), level: 1, track: () => {} });
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast') };
  const fx = { show: rec('fx.show'), scrub: rec('fx.scrub'), hide: rec('fx.hide'), fly: rec('fx.fly'), free: rec('fx.free') };
  const forced = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'espina') };
  const flow = SA.careFlow.create({ care: forced, view, fx, audio: { say: rec('say'), sfx: rec('sfx') }, later: () => {}, react: rec('react') });
  const withPatas = (a) => a.parts.some((p) => p.part === 'patas');
  const walkers = SA.data.all('animals').filter((a) => !a.easterEgg && withPatas(a));
  return { SA, care, flow, calls, walkers };
}

test('quitar la espina is data: a limp cue, gives the espina, says the new phrase; cue is validated', () => {
  const { SA } = setup();
  const a = SA.data.get('actions', 'quitarespina');
  assert.deepEqual([a.item, [...a.parts], a.cue, a.gives, a.say], ['hands', ['patas'], 'limp', 'espina', 'phrase:yacaminabien']);
  assert.equal(SA.vocab.get('phrase:yacaminabien').es, '¡Ya camina bien!');
  assert.equal(SA.vocab.get('item:espina').es, 'la espina');
  assert.equal(SA.data.get('items', 'espina').name.es, 'la espina');
  const task = SA.data.get('careTasks', 'quitarespina');
  assert.equal(task.rubs, 2);
  assert.ok(task.prompt.startsWith('Quita '));
  const bad = (patch, re) => assert.throws(() => SA.data.register('actions', [{ ...a, id: 'prueba', ...patch }]), re);
  bad({ cue: 'dance' }, /cue/);
  bad({ tangled: true }, /alias/);
  bad({ gives: 'martillo' }, /unknown item/);
});

test('tangled stays an alias of cue "tangled" in both directions', () => {
  const { SA } = setup();
  const w = SA.data.get('actions', 'desenredar');
  assert.deepEqual([w.cue, w.tangled], ['tangled', true]);
  const base = SA.data.get('actions', 'quitarespina');
  SA.data.register('actions', [{ ...base, id: 'pruebauno', cue: undefined, tangled: true, gives: undefined, say: undefined }]);
  assert.equal(SA.data.get('actions', 'pruebauno').cue, 'tangled');
  assert.equal(SA.data.get('actions', 'quitarespina').tangled, undefined, 'a limp action is not tangled');
});

test('only animals with patas can get the thorn task; it is a limp cue, not a tangle', () => {
  const { SA, care, walkers } = setup();
  assert.ok(walkers.length >= 5);
  for (const a of SA.data.all('animals')) {
    care.cancel();
    const t = care.maybeStart(a.id, true, 'espina');
    const has = a.parts.some((p) => p.part === 'patas');
    if (a.easterEgg && SA.save.get().unlockedAnimals.indexOf(a.id) < 0) assert.equal(t, null, a.id + ' hidden');
    else if (!has) assert.equal(t, null, a.id + ' has no patas');
    else {
      assert.ok(t, a.id);
      assert.deepEqual([t.kind, t.part, t.cue, t.tangled, t.action, t.item], ['espina', 'patas', 'limp', false, 'quitarespina', 'hands']);
      assert.equal(t.text, 'Quita la espina de las patas');
    }
  }
});

test('two tugs finish it; the done result carries the cue, the espina and the phrase', () => {
  const { SA, care, walkers } = setup();
  const id = walkers[0].id;
  care.maybeStart(id, true, 'espina');
  assert.equal(care.tap({ animalId: id, part: 'patas', item: 'cepillo' }).reason, 'tool');
  assert.equal(care.tap({ animalId: id, part: 'cola' }).reason, 'part');
  assert.equal(care.current().remaining, 2);
  assert.equal(care.tap({ animalId: id, part: 'patas' }).status, 'scrub');
  const done = care.tap({ animalId: id, part: 'patas' });
  assert.deepEqual([done.status, done.cue, done.tangled, done.gives, done.say], ['done', 'limp', false, 'espina', 'phrase:yacaminabien']);
  assert.equal(SA.save.get().stars, 1);
});

test('flow: after 2 tugs the cue is freed, the espina is in the inventory and the new phrase plays', () => {
  const { SA, flow, calls, walkers } = setup();
  const id = walkers[0].id, n = SA.inventory.count('espina');
  assert.equal(flow.offer(id), true);
  assert.equal(flow.onPick({ animalId: id, part: 'patas' }).status, 'scrub');
  assert.equal(SA.inventory.count('espina'), n, 'not yet');
  assert.ok(!calls.some((c) => c[0] === 'fx.free'));
  assert.equal(flow.onPick({ animalId: id, part: 'patas' }).status, 'done');
  assert.equal(SA.inventory.count('espina'), n + 1);
  assert.ok(calls.some((c) => c[0] === 'fx.free' && c[1] === id && c[2] === 'limp'));
  assert.ok(!calls.some((c) => c[0] === 'fx.fly'), 'no happy flight for a limp');
  assert.ok(calls.some((c) => c[0] === 'say' && c[1] === 'phrase:yacaminabien'));
  assert.ok(calls.some((c) => c[0] === 'toast' && /Ya camina bien/.test(c[1])));
});

function fakeWalker(id) {
  const leg = (side, index, z) => ({ userData: { animalId: id, part: 'patas', side, index }, position: { x: side === 'left' ? -0.3 : 0.3, y: 0.3, z },
    rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.2, y: 0.6, z: 0.2 } });
  return { name: id, userData: { animalId: id }, position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
    children: [leg('left', 0, 0.5), leg('right', 0, 0.5), leg('left', 1, -0.5), leg('right', 1, -0.5)] };
}

test('ambient: the limp cue gives an uneven walk (sore paw barely swings, body dips) and clears when freed', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const id = SA.data.all('animals').find((a) => !a.easterEgg && a.traits.movement !== 'vuela' && a.traits.movement !== 'repta'
    && a.perch !== 'tree' && a.parts.some((p) => p.part === 'patas')).id;
  const g = fakeWalker(id);
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  amb.hold(id);
  const range = (xs) => Math.max(...xs) - Math.min(...xs);
  const run = (n) => {
    const swing = [[], [], [], []], y = [], roll = [];
    for (let i = 0; i < n; i++) {
      amb.update(1 / 30);
      g.children.forEach((l, k) => swing[k].push(l.rotation.x));
      y.push(g.position.y - SA.map.groundHeight(g.position.x, g.position.z)); roll.push(g.rotation.z);
    }
    return { swing: swing.map(range), y: range(y), roll: range(roll) };
  };
  const before = run(60);
  assert.ok(before.swing.every((s) => s < 0.01) && before.y < 0.001 && before.roll === 0, 'held and healthy: standing still');
  amb.setCue(id, 'limp');
  const limp = run(90);
  assert.ok(limp.swing[0] < limp.swing[1] * 0.4, 'the first paw is the sore one: ' + limp.swing);
  assert.ok(limp.swing[1] > 0.3 && limp.swing[2] > 0.3, 'the other paws step');
  assert.ok(limp.y > 0.03, 'the body dips on the sore step: ' + limp.y);
  assert.ok(limp.roll > 0.05, 'and leans');
  amb.setTangled(id, false);
  assert.ok(run(40).roll > 0, 'clearing a tangle never clears a limp');
  amb.setCue(id, null);
  const after = run(60);
  assert.ok(after.y < 0.001 && after.roll === 0 && g.rotation.z === 0, 'walks normally again');
});

test('care fx: a limp task puts thorn bits on ONE paw and sets the limp cue; free() clears it without a flight', () => {
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
  const ambient = { hold: (id) => calls.push(['hold', id]), release: (id) => calls.push(['release', id]),
    setCue: (id, cue) => calls.push(['cue', id, cue]), flyLoop: (id) => calls.push(['loop', id]) };
  const fx = SA.render.createCareFx(THREE, { animals, ambient });
  const id = animals.children.map((g) => g.userData.animalId).find((a) => SA.data.get('animals', a).parts.some((p) => p.part === 'patas') && !SA.data.get('animals', a).easterEgg);
  const group = animals.getObjectByName(id);
  const before = group.children.length;
  assert.equal(fx.show({ animalId: id, part: 'patas', spots: 2, kind: 'espina', cue: 'limp' }), true);
  assert.equal(group.children.length, before + 2);
  const thorns = group.children.filter((m) => m.userData.mud);
  assert.ok(thorns.every((m) => m.geometry.type === 'ConeGeometry'), 'thorn-shaped, not mud');
  const legs = group.children.filter((m) => !m.userData.pick && m.userData.part === 'patas');
  const nearest = (b) => legs.map((w) => w.position.distanceTo(b.position)).indexOf(Math.min(...legs.map((w) => w.position.distanceTo(b.position))));
  assert.equal(new Set(thorns.map(nearest)).size, 1, 'all the thorn bits are on the same paw');
  assert.deepEqual(calls.filter((c) => c[0] === 'cue'), [['cue', id, 'limp']]);
  fx.scrub(0);
  fx.free(id, 'limp');
  assert.deepEqual(calls.slice(-1)[0], ['cue', id, null]);
  assert.ok(!calls.some((c) => c[0] === 'loop'));
  fx.hide();
  assert.equal(group.children.length, before);
});
