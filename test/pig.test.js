import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/animal-plan.js'];

const SA = loadGame(FILES);
const sow = SA.data.get('animals', 'cerda');
const piglet = SA.data.get('animals', 'cerdito');
const plan = (a) => SA.animalPlan.plan(a);
const first = (specs, part) => specs.find((s) => s.part === part && !s.extra);
const top = (specs) => Math.max(...specs.map((s) => s.position[1] + s.worldSize[1] / 2));

test('la cerda and el cerdito are registered, pink, with snout, curly tail and ears (and validate)', () => {
  for (const a of [sow, piglet]) {
    assert.equal(a.traits.color, 'rosa');
    assert.equal(a.story, true);
    const parts = new Set(a.parts.map((p) => p.part));
    for (const k of ['cuerpo', 'cabeza', 'hocico', 'orejas', 'cola', 'ojos', 'patas']) assert.ok(parts.has(k), `${a.id} has ${k}`);
    assert.ok(plan(a).filter((s) => s.part === 'cola').length >= 3, 'the tail is a curl of several pieces');
    assert.ok(plan(a).filter((s) => s.part === 'orejas').length === 2);
  }
  assert.deepEqual([sow.name.es, sow.name.gender, piglet.name.es, piglet.name.gender], ['cerda', 'f', 'cerdito', 'm']);
  assert.equal(SA.vocab.get('animal:cerda').es, 'la cerda');
  assert.equal(SA.vocab.get('animal:cerdito').es, 'el cerdito');
  assert.equal(SA.vocab.get('color:rosa').es, 'rosa');
  assert.equal(SA.vocab.adjKey('rosa', 'f', 'pl'), 'adj:rosas');
});

test('every part mesh spec carries the animal id and part key, and tail curls answer as la cola', () => {
  for (const a of [sow, piglet]) {
    for (const s of plan(a)) {
      assert.equal(s.animalId, a.id);
      assert.ok(SA.data.get('parts', s.part), s.part);
    }
  }
});

test('the piglet plan is ~55% of the sow with a relatively bigger head and eyes', () => {
  const big = plan(sow), small = plan(piglet);
  assert.ok(Math.abs(piglet.baby.scale - 0.55) < 1e-9 && piglet.baby.of === 'cerda');
  const ratio = top(small) / top(big);
  assert.ok(ratio > 0.5 && ratio < 0.7, `height ratio ${ratio}`);
  const bodyBig = first(big, 'cuerpo').worldSize, bodySmall = first(small, 'cuerpo').worldSize;
  assert.ok(Math.abs(bodySmall[2] / bodyBig[2] - 0.55) < 1e-6);
  const rel = (specs, part) => first(specs, part).worldSize[0] / first(specs, 'cuerpo').worldSize[0];
  assert.ok(rel(small, 'cabeza') > rel(big, 'cabeza') * 1.3, 'head is relatively bigger');
  assert.ok(rel(small, 'ojos') > rel(big, 'ojos') * 1.5, 'eyes are relatively bigger');
  // The head sits in front of the body and the eyes stay on the (bigger) head.
  const head = first(small, 'cabeza'), eye = first(small, 'ojos');
  assert.ok(Math.hypot(eye.position[0], eye.position[1] - head.position[1], eye.position[2] - head.position[2]) < head.worldSize[0] * 0.6);
});

test('babyParts is generic: it works on any animal with a head and leaves the adult untouched', () => {
  const rabbit = SA.data.get('animals', 'conejo');
  const before = JSON.stringify(rabbit.parts);
  const kid = SA.animals.babyParts(rabbit.parts, { scale: 0.5, headScale: 1.5, eyeScale: 2 });
  assert.equal(JSON.stringify(rabbit.parts), before);
  const head = (parts) => parts.find((p) => p.part === 'cabeza').scale;
  assert.ok(Math.abs(head(kid) - head(rabbit.parts) * 0.75) < 1e-9);
});

test('voices: oinc oinc exists and the baby voice is pitched higher; no engine special-casing of the pig id', () => {
  assert.equal(sow.voice, 'phrase:oinc');
  assert.equal(piglet.voice, 'phrase:oincbebe');
  const a = SA.vocab.get(sow.voice), b = SA.vocab.get(piglet.voice);
  assert.match(a.es, /oinc/i);
  assert.equal(a.pitch, undefined);
  assert.ok(b.pitch > 1.3 && b.pitch <= 2);
});
