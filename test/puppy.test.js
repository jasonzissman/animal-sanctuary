import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/audio.js', 'game/wag.js'];

test('data: el perrito is a valid story animal (not in the world) with a part per key and a tail that wags', () => {
  const SA = loadGame(DATA);
  const a = SA.data.get('animals', 'perrito');
  assert.equal(a.story, true);
  assert.equal(a.easterEgg, false);
  assert.deepEqual({ ...a.name }, { es: 'perrito', en: 'puppy', gender: 'm' });
  const keys = a.parts.map((x) => x.part);
  for (const k of ['orejas', 'cola', 'patas', 'hocico', 'cabeza', 'cuerpo', 'ojos']) assert.ok(keys.includes(k), k);
  assert.equal(a.parts.find((x) => x.part === 'patas').count, 4);
  assert.deepEqual({ ...a.wag }, { part: 'cola', angle: 0.6, hz: 4 });
});

test('data: wag and sounds are validated', () => {
  const SA = loadGame(DATA);
  const good = () => JSON.parse(JSON.stringify(SA.data.get('animals', 'perrito')));
  const bad = (mut, re) => {
    const a = good();
    a.id = 'perritob';
    mut(a);
    assert.throws(() => SA.data.register('animals', [a]), re);
  };
  bad((a) => { a.wag.part = 'alas'; }, /wag\.part/);
  bad((a) => { a.wag.angle = 3; }, /wag\.angle/);
  bad((a) => { a.wag.hz = 0; }, /wag\.hz/);
  bad((a) => { a.wag = 'yes'; }, /field "wag"/);
  bad((a) => { a.sounds = { happy: 'whine' }; }, /sounds\.happy/);
  bad((a) => { a.sounds = { sad: 'who is this' }; }, /sounds\.sad/);
  bad((a) => { a.sounds = null; }, /field "sounds"/);
  const ok = good();
  ok.id = 'perritoc';
  SA.data.register('animals', [ok]);
});

test('vocab: el perrito, las partes, el río, el tronco, cruzar and the wet/dry words are speakable with correct articles', () => {
  const SA = loadGame(DATA);
  const es = (k) => SA.vocab.get(k) && SA.vocab.get(k).es;
  assert.equal(es('animal:perrito'), 'el perrito');
  assert.equal(es('part:cola'), 'la cola');
  assert.equal(es('part:orejas'), 'las orejas');
  assert.equal(es('thing:rio'), 'el río');
  assert.equal(es('thing:tronco'), 'el tronco');
  assert.equal(es('phrase:cruzar'), 'cruzar');
  assert.equal(es('phrase:guau'), '¡Guau!');
  for (const w of ['mojado', 'mojada', 'mojados', 'mojadas', 'seco', 'seca', 'secos', 'secas']) assert.equal(es('adj:' + w), w);
  assert.equal(SA.data.get('vocab', 'adj:mojado').en, 'wet');
  assert.equal(SA.data.get('vocab', 'adj:seco').en, 'dry');
  assert.equal(es(SA.data.get('animals', 'perrito').voice), '¡Guau!');
});

test('audio: the whine is a procedural recipe and is what the puppy declares for sad (no id-specific engine code)', () => {
  const SA = loadGame(DATA);
  assert.ok(SA.audio.NAMES.includes('whine'));
  assert.ok(SA.audio.RECIPES.whine.length >= 2);
  assert.equal(SA.wag.sound('perrito', 'sad'), 'whine');
  assert.equal(SA.wag.sound(SA.data.get('animals', 'perrito'), 'sad'), 'whine');
  assert.equal(SA.wag.sound('perrito', 'happy'), null);
  assert.equal(SA.wag.sound('conejo', 'sad'), null);
  assert.equal(SA.wag.sound('nadie', 'sad'), null);
  for (const a of SA.data.all('animals')) if (a.sounds) for (const n of Object.values(a.sounds)) assert.ok(SA.audio.NAMES.includes(n), `${a.id}: ${n}`);
  const src = fs.readFileSync(path.join(ROOT, 'game', 'wag.js'), 'utf8');
  assert.ok(!/perrito/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'wag.js has no id');
});

test('wag: angle swings with the declared hz and angle; apply() moves only tail meshes and rest() puts them back', () => {
  const SA = loadGame(DATA);
  assert.equal(SA.wag.angle('perrito', 0), 0);
  assert.ok(Math.abs(SA.wag.angle('perrito', 1 / 16) - 0.6) < 1e-9);   // quarter period of 4 Hz
  assert.ok(Math.abs(SA.wag.angle('perrito', 3 / 16) + 0.6) < 1e-9);
  assert.equal(SA.wag.angle('conejo', 0.1), 0);                        // no wag declared
  assert.equal(SA.wag.angle('perrito', NaN), 0);
  const mesh = (part, extra = {}) => ({ rotation: { y: 0.25 }, userData: { animalId: 'perrito', part, ...extra } });
  const tail = mesh('cola'), ear = mesh('orejas'), pick = mesh('cola', { pick: true });
  const group = { userData: { animalId: 'perrito' }, children: [tail, ear, pick] };
  assert.equal(SA.wag.apply(group, 1 / 16), true);
  assert.ok(Math.abs(tail.rotation.y - 0.85) < 1e-9);
  assert.equal(ear.rotation.y, 0.25);
  assert.equal(pick.rotation.y, 0.25);
  SA.wag.apply(group, 3 / 16);
  assert.ok(Math.abs(tail.rotation.y - (0.25 - 0.6)) < 1e-9, 'swings around its own rest rotation, not cumulatively');
  SA.wag.rest(group);
  assert.equal(tail.rotation.y, 0.25);
  assert.equal(SA.wag.apply({ userData: { animalId: 'conejo' }, children: [mesh('cola')] }, 0.1), false);
  assert.equal(SA.wag.apply(null, 0.1), false);
});

test('render: the puppy builds from primitives; every mesh and pick volume carries { animalId, part }; the tail wags for real', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA.slice(0, 5), 'game/map.js', 'game/animal-plan.js', 'game/render/zigzag.js', 'game/render/instances.js',
    'game/render/animals.js', 'game/wag.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { SA, THREE } = ctx;
  const world = SA.render.buildAnimals(THREE, {});
  assert.ok(!world.children.some((g) => g.userData.animalId === 'perrito'), 'not placed in the world');
  const g = SA.render.animalBuilder(THREE)(SA.data.get('animals', 'perrito'), { x: 0, y: 0, z: 0, rotY: 0 });
  assert.equal(g.name, 'perrito');
  const parts = SA.data.get('animals', 'perrito').parts.map((p) => p.part);
  const seen = new Set();
  g.children.forEach((m) => {
    assert.equal(m.userData.animalId, 'perrito');
    assert.ok(typeof m.userData.part === 'string' && SA.data.get('parts', m.userData.part), 'registered part');
    seen.add(m.userData.part);
  });
  for (const p of parts) assert.ok(seen.has(p), p);
  assert.ok(g.userData.pickVolumes.length >= parts.length);
  assert.ok(g.userData.pickVolumes.every((v) => v.userData.animalId === 'perrito' && v.userData.part));
  const tail = g.children.find((m) => m.userData.part === 'cola' && !m.userData.pick);
  const y0 = tail.rotation.y;
  assert.equal(SA.wag.apply(g, 1 / 16), true);
  assert.notEqual(tail.rotation.y, y0);
  SA.wag.rest(g);
  assert.equal(tail.rotation.y, y0);
});
