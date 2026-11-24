import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/audio.js', 'game/picking.js',
  'game/data/items.js', 'game/inventory.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/ui/care-flow.js',
  'game/map.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/instances.js', 'game/render/ambient.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const calls = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(7), level: 1, track: () => {} });
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast') };
  const fx = { show: rec('fx.show'), scrub: rec('fx.scrub'), hide: rec('fx.hide'), fly: rec('fx.fly'), free: rec('fx.free') };
  const forced = { ...care, maybeStart: (id) => care.maybeStart(id, true, 'acariciar') };
  const flow = SA.careFlow.create({ care: forced, view, fx, audio: { say: rec('say'), sfx: rec('sfx') }, later: () => {}, react: rec('react') });
  return { SA, care, flow, calls };
}

test('acariciar is data: a tremble cue, empty hands on la barriga, a gender-neutral phrase; vocab exists', () => {
  const { SA } = setup();
  const a = SA.data.get('actions', 'acariciar');
  assert.deepEqual([a.item, [...a.parts], a.cue, a.say, a.tangled], ['hands', ['barriga'], 'tremble', 'phrase:yasecalmo', undefined]);
  assert.ok(SA.actions.CUES.includes('tremble'));
  const v = SA.vocab.get('phrase:yasecalmo');
  assert.equal(v.es, '¡Ya se calmó!');
  assert.ok(!/\b(tranquilo|tranquila|calmado|calmada)\b/.test(v.es), 'no gendered adjective: it works for every animal');
  assert.throws(() => SA.data.register('actions', [{ ...a, id: 'prueba', say: 'phrase:nadaaqui' }]), /vocab/);
  assert.throws(() => SA.data.register('actions', [{ ...a, id: 'prueba', cue: 'temblar' }]), /cue/);
});

test('only animals with la barriga can get the calm task, and it carries the tremble cue', () => {
  const { SA, care } = setup();
  let got = 0;
  for (const a of SA.data.all('animals')) {
    care.cancel();
    const t = care.maybeStart(a.id, true, 'acariciar');
    const has = a.parts.some((p) => p.part === 'barriga');
    if (a.easterEgg && SA.save.get().unlockedAnimals.indexOf(a.id) < 0) assert.equal(t, null, a.id + ' hidden');
    else if (!has) assert.equal(t, null, a.id + ' has no barriga');
    else {
      got += 1;
      assert.deepEqual([t.kind, t.part, t.cue, t.tangled, t.action, t.item, t.remaining], ['acariciar', 'barriga', 'tremble', false, 'acariciar', 'hands', 3]);
    }
  }
  assert.ok(got >= 3, 'several animals can be calmed');
  assert.ok(got < SA.data.all('animals').filter((a) => !a.easterEgg).length, 'but not every animal');
});

test('flow: three rubs calm it, the cue is freed and the phrase plays; wrong tools only count a miss', () => {
  const { SA, flow, calls } = setup();
  const id = SA.data.all('animals').find((a) => !a.easterEgg && a.parts.some((p) => p.part === 'barriga')).id;
  assert.equal(flow.offer(id), true);
  assert.equal(calls.find((c) => c[0] === 'fx.show')[1].cue, 'tremble');
  assert.equal(flow.onPick({ animalId: id, part: 'barriga', item: 'cepillo' }).status, 'wrong');
  assert.equal(flow.onPick({ animalId: id, part: 'barriga' }).status, 'scrub');
  assert.equal(flow.onPick({ animalId: id, part: 'barriga' }).status, 'scrub');
  assert.ok(!calls.some((c) => c[0] === 'fx.free'), 'still scared');
  assert.equal(flow.onPick({ animalId: id, part: 'barriga' }).status, 'done');
  assert.ok(calls.some((c) => c[0] === 'fx.free' && c[1] === id && c[2] === 'tremble'));
  assert.ok(calls.some((c) => c[0] === 'say' && c[1] === 'phrase:yasecalmo'));
});

function fakeAnimal(id) {
  return { name: id, userData: { animalId: id }, position: { x: 3, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }, children: [] };
}

test('ambient: tremble jitters the animal fast and a little, in place, and stops when the cue clears', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const id = SA.data.all('animals').find((a) => !a.easterEgg && a.traits.movement !== 'vuela' && a.perch !== 'tree').id;
  const g = fakeAnimal(id);
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  amb.hold(id);
  const run = (n) => { for (let i = 0; i < n; i++) amb.update(1 / 60); };
  run(30);
  const home = { x: g.position.x, z: g.position.z };
  assert.equal(g.rotation.z, 0);
  amb.setCue(id, 'tremble');
  const xs = [], rolls = [];
  for (let i = 0; i < 60; i++) { amb.update(1 / 60); xs.push(g.position.x - home.x); rolls.push(g.rotation.z); }
  const span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span > 0.03 && span < 0.12, 'a small shake: ' + span);
  assert.ok(Math.max(...rolls) > 0.01 && Math.max(...rolls) < 0.1, 'rolls a little');
  let flips = 0;
  for (let i = 2; i < xs.length; i++) if ((xs[i] - xs[i - 1]) * (xs[i - 1] - xs[i - 2]) < 0) flips += 1;
  assert.ok(flips > 10, 'fast: it changes direction many times a second (' + flips + ')');
  assert.ok(Math.abs(Math.min(...xs)) < 0.1 && Math.abs(Math.max(...xs)) < 0.1, 'stays in place');
  amb.setCue(id, null);
  run(2);
  assert.ok(Math.abs(g.position.x - home.x) < 1e-6 && g.rotation.z === 0, 'calm: no shaking');
});
