import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/audio.js', 'game/picking.js',
  'game/data/items.js', 'game/inventory.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/ui/care-flow.js',
  'game/map.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [], calls = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(7), level: 1, track: (type, f) => events.push({ type, ...f }) });
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast') };
  const fx = { show: rec('fx.show'), scrub: rec('fx.scrub'), hide: rec('fx.hide'), fly: rec('fx.fly') };
  const forced = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'desenredar') };
  const flow = SA.careFlow.create({ care: forced, view, fx, audio: { say: rec('say'), sfx: rec('sfx') }, later: () => {}, react: rec('react') });
  const birds = SA.data.all('animals').filter((a) => !a.easterEgg && a.parts.some((p) => p.part === 'alas'));
  return { SA, care, flow, calls, events, birds };
}

test('the tangled-wing action and task are data: empty hands on las alas, gives la hoja, says ¡Ya puede volar!', () => {
  const { SA } = setup();
  const a = SA.data.get('actions', 'desenredar');
  assert.deepEqual([a.item, [...a.parts], a.tangled, a.gives, a.say], ['hands', ['alas'], true, 'hoja', 'phrase:yapuedevolar']);
  assert.equal(SA.vocab.get('phrase:yapuedevolar').es, '¡Ya puede volar!');
  const bad = (patch, re) => assert.throws(() => SA.data.register('actions', [{ ...a, id: 'prueba', ...patch }]), re);
  bad({ gives: 'martillo' }, /unknown item/);
  bad({ say: 'phrase:nope' }, /vocab key/);
  bad({ tangled: 'yes' }, /true or false/);
  assert.ok(SA.data.get('careTasks', 'desenredar').prompt.startsWith('Quita '));
});

test('only animals with alas can get a stuck leaf; the task is tangled until it is removed', () => {
  const { care, birds } = setup();
  assert.ok(birds.length >= 2);
  for (const b of birds) {
    const t = care.maybeStart(b.id, true, 'desenredar');
    assert.ok(t, b.id);
    assert.deepEqual([t.kind, t.part, t.tangled, t.action, t.item], ['desenredar', 'alas', true, 'desenredar', 'hands']);
    assert.equal(t.text, 'Quita la hoja de las alas');
    assert.equal(care.active(), true);
  }
  assert.equal(care.maybeStart('conejo', true, 'desenredar'), null, 'no wings, no tangle');
});

test('three tugs with empty hands on the wing finish it; wrong tool or part never progresses', () => {
  const { SA, care, birds, events } = setup();
  const id = birds[0].id;
  care.maybeStart(id, true, 'desenredar');
  assert.equal(care.tap({ animalId: id, part: 'alas', item: 'cepillo' }).reason, 'tool');
  assert.equal(care.tap({ animalId: id, part: 'cola' }).reason, 'part');
  assert.equal(care.tap({ animalId: 'conejo', part: 'alas' }).status, 'ignored');
  assert.equal(care.current().remaining, 3, 'misses do not count');
  assert.equal(care.tap({ animalId: id, part: 'alas' }).status, 'scrub');
  assert.equal(care.tap({ animalId: id, part: 'alas' }).status, 'scrub');
  assert.equal(care.active(), true);
  const done = care.tap({ animalId: id, part: 'alas' });
  assert.deepEqual([done.status, done.kind, done.tangled, done.gives, done.say], ['done', 'desenredar', true, 'hoja', 'phrase:yapuedevolar']);
  assert.equal(care.active(), false);
  assert.equal(SA.save.get().stars, 1);
  assert.equal(events.filter((e) => e.type === 'round.complete').length, 1);
});

test('flow: Space on the wing frees the bird, adds la hoja to the inventory and says ¡Ya puede volar!', () => {
  const { SA, flow, calls, birds } = setup();
  const id = birds[0].id, before = SA.inventory.count('hoja');
  assert.equal(flow.offer(id), true);
  for (let i = 0; i < 2; i++) assert.equal(flow.onPick({ animalId: id, part: 'alas' }).status, 'scrub');
  assert.equal(SA.inventory.count('hoja'), before, 'not yet');
  assert.ok(!calls.some((c) => c[0] === 'fx.fly'));
  assert.equal(flow.onPick({ animalId: id, part: 'alas' }).status, 'done');
  assert.equal(SA.inventory.count('hoja'), before + 1);
  assert.ok(calls.some((c) => c[0] === 'fx.fly' && c[1] === id));
  assert.ok(calls.some((c) => c[0] === 'say' && c[1] === 'phrase:yapuedevolar'));
  assert.ok(!calls.some((c) => c[0] === 'say' && c[1] === 'phrase:muybien'));
  assert.ok(calls.some((c) => c[0] === 'toast' && /Ya puede volar/.test(c[1])));
});

function fakeBird(id, x, z) {
  const wing = (side) => ({ userData: { animalId: id, part: 'alas', side }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } });
  return { name: id, userData: { animalId: id }, position: { x, y: 0, z }, rotation: { y: 0 },
    scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }, children: [wing('left'), wing('right')] };
}

test('ambient: a tangled bird hops on the ground with drooping wings, then flies a spinning loop and is free', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const id = SA.data.all('animals').find((a) => !a.easterEgg && a.traits.movement === 'vuela' && a.perch !== 'tree').id;
  const g = fakeBird(id, -9, 14);
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  amb.hold(id);
  const ground = () => SA.map.groundHeight(g.position.x, g.position.z);
  amb.setTangled(id, true);
  let maxUp = 0;
  for (let i = 0; i < 90; i++) { amb.update(1 / 30); maxUp = Math.max(maxUp, g.position.y - ground()); }
  assert.ok(maxUp > 0.02 && maxUp < 0.4, 'it hops a little, it does not hover: ' + maxUp);
  assert.ok(Math.abs(g.children[0].rotation.z) > 0.4 && Math.abs(g.children[1].rotation.z) > 0.4, 'wings droop');
  assert.ok(g.children[0].rotation.z * g.children[1].rotation.z < 0, 'mirrored');
  const home = { x: g.position.x, z: g.position.z };
  amb.flyLoop(id);
  let maxLift = 0, spun = 0, last = g.rotation.y;
  for (let i = 0; i < 40; i++) {
    amb.update(1 / 30);
    maxLift = Math.max(maxLift, g.position.y - ground());
    spun += Math.abs(g.rotation.y - last); last = g.rotation.y;
  }
  assert.ok(maxLift > 1, 'it flies up: ' + maxLift);
  assert.ok(spun > 3, 'it spins around');
  for (let i = 0; i < 40; i++) amb.update(1 / 30);
  assert.ok(Math.hypot(g.position.x - home.x, g.position.z - home.z) < 0.01, 'the loop ends where it began');
  assert.ok(g.position.y - ground() >= 0 && g.position.y - ground() < 1.5, 'back to normal hovering');
});
