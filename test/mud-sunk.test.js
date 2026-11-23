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
  const forced = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'barro') };
  const flow = SA.careFlow.create({ care: forced, view, fx, audio: { say: rec('say'), sfx: rec('sfx') }, later: () => {}, react: rec('react') });
  const walkers = SA.data.all('animals').filter((a) => !a.easterEgg && a.parts.some((p) => p.part === 'patas'));
  return { SA, care, flow, calls, walkers };
}

test('sacar del barro is data: a sunk cue, empty hands on patas, a new phrase; vocab exists; cue still validated', () => {
  const { SA } = setup();
  const a = SA.data.get('actions', 'sacardelbarro');
  assert.deepEqual([a.item, [...a.parts], a.cue, a.say, a.tangled], ['hands', ['patas'], 'sunk', 'phrase:yasaliodelbarro', undefined]);
  assert.ok(SA.actions.CUES.includes('sunk'));
  assert.equal(SA.vocab.get('phrase:yasaliodelbarro').es, '¡Ya salió del barro!');
  assert.equal(SA.vocab.get('phrase:barro').es, 'el barro');
  const task = SA.data.get('careTasks', 'sacardelbarro');
  assert.deepEqual([task.kind, task.rubs, task.prompt], ['barro', 3, 'Saca {part} del barro']);
  assert.throws(() => SA.data.register('actions', [{ ...a, id: 'prueba', say: 'phrase:nadaaqui' }]), /vocab/);
});

test('only animals with patas can get the mud task, and it carries the sunk cue', () => {
  const { SA, care, walkers } = setup();
  assert.ok(walkers.length >= 5);
  let got = 0;
  for (const a of SA.data.all('animals')) {
    care.cancel();
    const t = care.maybeStart(a.id, true, 'barro');
    const has = a.parts.some((p) => p.part === 'patas');
    if (a.easterEgg && SA.save.get().unlockedAnimals.indexOf(a.id) < 0) assert.equal(t, null, a.id + ' hidden');
    else if (!has) assert.equal(t, null, a.id + ' has no patas');
    else {
      got += 1;
      assert.deepEqual([t.kind, t.part, t.cue, t.tangled, t.action, t.item, t.remaining], ['barro', 'patas', 'sunk', false, 'sacardelbarro', 'hands', 3]);
      assert.equal(t.text, 'Saca las patas del barro');
    }
  }
  assert.ok(got >= 5);
});

test('three tugs free it; a wrong tool or part only gently counts a miss', () => {
  const { SA, care, walkers } = setup();
  const id = walkers[0].id;
  care.maybeStart(id, true, 'barro');
  assert.equal(care.tap({ animalId: id, part: 'patas', item: 'esponja' }).reason, 'tool');
  assert.equal(care.tap({ animalId: id, part: 'cola' }).reason, 'part');
  assert.equal(care.tap({ animalId: id, part: 'patas' }).status, 'scrub');
  assert.equal(care.tap({ animalId: id, part: 'patas' }).status, 'scrub');
  const done = care.tap({ animalId: id, part: 'patas' });
  assert.deepEqual([done.status, done.cue, done.say, done.gives], ['done', 'sunk', 'phrase:yasaliodelbarro', null]);
  assert.equal(SA.save.get().stars, 1);
});

test('flow: the cue is freed after 3 tugs and the phrase plays', () => {
  const { flow, calls, walkers } = setup();
  const id = walkers[0].id;
  assert.equal(flow.offer(id), true);
  assert.equal(flow.onPick({ animalId: id, part: 'patas' }).status, 'scrub');
  assert.equal(flow.onPick({ animalId: id, part: 'patas' }).status, 'scrub');
  assert.ok(!calls.some((c) => c[0] === 'fx.free'));
  assert.equal(flow.onPick({ animalId: id, part: 'patas' }).status, 'done');
  assert.ok(calls.some((c) => c[0] === 'fx.free' && c[1] === id && c[2] === 'sunk'));
  assert.ok(calls.some((c) => c[0] === 'say' && c[1] === 'phrase:yasaliodelbarro'));
});

function fakeWalker(id) {
  const leg = (side, index, z) => ({ userData: { animalId: id, part: 'patas', side, index }, position: { x: side === 'left' ? -0.3 : 0.3, y: 0.3, z },
    rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.2, y: 0.6, z: 0.2 } });
  return { name: id, userData: { animalId: id }, position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
    children: [leg('left', 0, 0.5), leg('right', 0, 0.5), leg('left', 1, -0.5), leg('right', 1, -0.5)] };
}

test('ambient: sunk sits lower, sinks a little more (capped), stays put, and rises back when freed', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const id = SA.data.all('animals').find((a) => !a.easterEgg && a.traits.movement !== 'vuela' && a.traits.movement !== 'repta'
    && a.perch !== 'tree' && a.parts.some((p) => p.part === 'patas')).id;
  const g = fakeWalker(id);
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  amb.hold(id);
  const depth = () => SA.map.groundHeight(g.position.x, g.position.z) - g.position.y;
  const run = (n) => { for (let i = 0; i < n; i++) amb.update(1 / 30); };
  run(30);
  assert.ok(Math.abs(depth()) < 0.001, 'normal height before');
  amb.setCue(id, 'sunk');
  run(3);
  const first = depth();
  assert.ok(first > 0.09, 'sits lower at once: ' + first);
  run(60);
  const later = depth();
  assert.ok(later > first + 0.005, 'sinks a little more over time');
  run(900);
  const capped = depth();
  assert.ok(capped < 0.25 && capped >= later, 'but only to a cap: ' + capped);
  assert.ok(g.children.every((l) => l.rotation.x === 0 || Math.abs(l.rotation.x) < 0.05), 'stuck: the paws do not walk');
  assert.equal(amb.rigs[id].sunkBy, capped);
  amb.setCue(id, null);
  run(150);
  assert.ok(Math.abs(depth()) < 0.001 && amb.rigs[id].sunkBy === 0, 'back to normal height');
  amb.setCue(id, 'sunk');
  run(3);
  assert.ok(depth() < 0.15, 'the next time starts shallow again');
});

test('care fx: a sunk task draws a flat mud puddle that follows the depth; tugs splash lumps; free() shrinks it away', () => {
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
  const rigs = {};
  const ambient = { rigs, hold: () => {}, release: () => {}, setCue: (id, cue) => calls.push(['cue', id, cue]), flyLoop: () => calls.push(['loop']) };
  const fx = SA.render.createCareFx(THREE, { animals, ambient });
  const id = animals.children.map((g) => g.userData.animalId).find((a) => SA.data.get('animals', a).parts.some((p) => p.part === 'patas') && !SA.data.get('animals', a).easterEgg);
  rigs[id] = { sunkBy: 0.2 };
  const group = animals.getObjectByName(id);
  const before = group.children.length;
  assert.equal(fx.show({ animalId: id, part: 'patas', spots: 3, kind: 'barro', cue: 'sunk' }), true);
  assert.equal(group.children.length, before + 1, 'one puddle group');
  const puddle = group.children.find((c) => c.userData.sunkPuddle);
  assert.ok(puddle);
  const disc = puddle.children[0];
  assert.equal(disc.geometry.type, 'CylinderGeometry');
  assert.ok(disc.scale.y < 0.1 && disc.scale.x > 0.5, 'flat and wide');
  assert.equal(disc.material.color.getHex(), 0x6b4423, 'brown');
  assert.equal(fx.spotCount(), 3);
  assert.ok(Math.abs(puddle.position.y - (0.2 / group.scale.y + 0.01)) < 1e-9, 'sits on the ground, not sunk with the animal');
  rigs[id].sunkBy = 0.26;
  fx.update(0.016);
  assert.ok(Math.abs(puddle.position.y - (0.26 / group.scale.y + 0.01)) < 1e-9, 'follows the animal while it sinks');
  assert.deepEqual(calls.filter((c) => c[0] === 'cue'), [['cue', id, 'sunk']]);
  fx.scrub(2);
  assert.equal(fx.spotCount(), 2);
  fx.scrub(0);
  fx.free(id, 'sunk');
  assert.deepEqual(calls.slice(-1)[0], ['cue', id, null]);
  assert.ok(!calls.some((c) => c[0] === 'loop'), 'no happy flight');
  assert.ok(group.children.includes(puddle), 'still there for a moment, shrinking');
  for (let i = 0; i < 60; i++) fx.update(0.05);
  assert.ok(!group.children.includes(puddle), 'the puddle went away');
  fx.hide();
  assert.equal(group.children.length, before);
});
