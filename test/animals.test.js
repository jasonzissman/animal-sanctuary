import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js'];
const part = () => ({ part: 'cuerpo', color: '#aabbcc', scale: 1, count: 1, offset: [0, 0, 0] });
const good = () => ({
  id: 'zorro', name: { es: 'zorro', en: 'fox', gender: 'm' }, icon: '🦊', biome: 'bosque',
  traits: { size: 'mediano', color: 'naranja', movement: 'corre', diet: 'omnívoro', legs: 4 },
  parts: [part()], easterEgg: false,
});

test('4 biomes, 22 real animals and 1 easter egg are registered, all in known biomes', () => {
  const SA = loadGame(FILES);
  assert.deepEqual(Array.from(SA.data.all('biomes'), (b) => b.id), ['bosque', 'selva', 'desierto', 'montana']);
  const everything = SA.data.all('animals');
  assert.deepEqual(Array.from(everything.filter((a) => a.story), (a) => a.id), ['cerda', 'cerdito', 'patito', 'perrito', 'ratoncampo', 'ratoncito', 'conejito']);   // AS-0232 / AS-0315 / AS-0318 / AS-0346 / AS-0350: not in the world population
  const all = everything.filter((a) => !a.story);
  assert.deepEqual(Array.from(all, (a) => a.id),
    ['conejo', 'pato', 'tortuga', 'mono', 'tucan', 'rana', 'camello', 'serpiente', 'cabra', 'aguila', 'raton', 'zorrodesierto', 'lagartija', 'correcaminos', 'oso', 'llama', 'condor', 'ciervo', 'ardilla', 'jaguar', 'perezoso', 'buho', 'murcielago']);
  assert.deepEqual(Array.from(all.filter((a) => a.easterEgg), (a) => a.id), ['raton']);
  const animals = all.filter((a) => !a.easterEgg);
  for (const a of all) {
    assert.equal(a.easterEgg, a.id === 'raton');
    assert.equal(a.unlock !== undefined, a.easterEgg);
    assert.ok(SA.data.get('biomes', a.biome), a.id);
    for (const p of a.parts) assert.ok(SA.data.get('parts', p.part), `${a.id}/${p.part}`);
  }
  const byBiome = (b) => Array.from(animals.filter((a) => a.biome === b), (a) => a.id);
  assert.deepEqual(byBiome('bosque'), ['conejo', 'pato', 'tortuga', 'ciervo', 'ardilla', 'buho']);
  assert.deepEqual(byBiome('selva'), ['mono', 'tucan', 'rana', 'jaguar', 'perezoso', 'murcielago']);
  assert.deepEqual(byBiome('desierto'), ['camello', 'serpiente', 'zorrodesierto', 'lagartija', 'correcaminos']);
  assert.deepEqual(byBiome('montana'), ['cabra', 'aguila', 'oso', 'llama', 'condor']);
  // AS-0269: the mountain trio are regular herd species with correct Spanish gender.
  const g = (id) => SA.data.get('animals', id);
  assert.deepEqual(['oso', 'llama', 'condor'].map((id) => g(id).name.gender), ['m', 'f', 'm']);
  assert.equal(g('condor').name.es, 'cóndor');
  for (const id of ['oso', 'llama', 'condor']) assert.ok(g(id).herd >= 3 && g(id).herd <= 5, id);
  // AS-0270: the forest and jungle newcomers are regular herd species with correct gender, names and parts.
  assert.deepEqual(['ciervo', 'ardilla', 'jaguar', 'perezoso'].map((id) => g(id).name.gender), ['m', 'f', 'm', 'm']);
  for (const id of ['ciervo', 'ardilla', 'jaguar', 'perezoso']) assert.ok(g(id).herd >= 3 && g(id).herd <= 5 && !g(id).story && !g(id).easterEgg, id);
  assert.equal(g('perezoso').perch, 'tree');
  assert.ok(g('jaguar').parts.some((p) => p.part === 'manchas') && g('perezoso').parts.some((p) => p.part === 'garras'));
  assert.ok(g('ciervo').parts.some((p) => p.part === 'cuernos') && g('ardilla').parts.some((p) => p.part === 'cola'));
});

test('AS-0270: every biome has at least 5 regular species (no story animals, no easter eggs)', () => {
  const SA = loadGame(FILES);
  const regular = SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
  for (const b of SA.data.all('biomes')) {
    const n = regular.filter((a) => a.biome === b.id).length;
    assert.ok(n >= 5, `${b.id} has only ${n} regular species (needs >= 5)`);
  }
});

test('new animals use the new parts (joroba, cuernos) and Spanish names agree', () => {
  const SA = loadGame(FILES);
  const has = (id, part) => SA.data.get('animals', id).parts.some((p) => p.part === part);
  assert.ok(has('camello', 'joroba') && has('cabra', 'cuernos'));
  assert.equal(SA.data.get('parts', 'joroba').label.es, 'la joroba');
  assert.equal(SA.data.get('animals', 'aguila').name.es, 'águila');
  assert.equal(SA.data.get('animals', 'serpiente').traits.legs, 0);
  assert.equal(SA.data.get('animals', 'serpiente').traits.movement, 'repta');
});

test('Spanish names carry accents and gender', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.data.get('animals', 'tucan').name.es, 'tucán');
  assert.equal(SA.data.get('animals', 'tortuga').name.gender, 'f');
  assert.equal(SA.data.get('animals', 'conejo').name.gender, 'm');
});

test('every pair of animals differs by at least one part or trait', () => {
  const SA = loadGame(FILES);
  const partSig = (a) => JSON.stringify(a.parts.map((p) => `${p.part}x${p.count}`).sort());
  const animals = SA.data.all('animals');
  for (let i = 0; i < animals.length; i++) {
    for (let j = i + 1; j < animals.length; j++) {
      const a = animals[i];
      const b = animals[j];
      const traitDiffs = Object.keys(a.traits).filter((k) => a.traits[k] !== b.traits[k]);
      assert.ok(traitDiffs.length > 0 || partSig(a) !== partSig(b), `${a.id} vs ${b.id} are indistinguishable`);
    }
  }
});

test('validator accepts a good animal and biome', () => {
  const SA = loadGame(FILES);
  SA.data.register('animals', [good()]);
  assert.equal(SA.data.get('animals', 'zorro').name.en, 'fox');
  SA.data.register('biomes', [{ id: 'playa', name: { es: 'La playa', en: 'Beach' }, ground: '#e0c080', accent: '#c08040', peak: '#ffffff' }]);
  assert.ok(SA.data.get('biomes', 'playa'));
  assert.throws(() => SA.data.register('biomes', [{ id: 'cueva', name: { es: 'La cueva', en: 'Cave' }, ground: '#e0c080', accent: '#c08040', peak: 'white' }]), /peak/);
});

test('validation fails clearly on an unknown part key or biome', () => {
  const SA = loadGame(FILES);
  let a = good();
  a.parts[0].part = 'tentaculos';
  assert.throws(() => SA.data.register('animals', [a]), /id "zorro", field "parts\[0\]\.part".*unknown part key "tentaculos"/);
  a = good();
  a.biome = 'luna';
  assert.throws(() => SA.data.register('animals', [a]), /id "zorro", field "biome".*unknown biome "luna"/);
});

test('validator rejects other bad animals naming the field', () => {
  const SA = loadGame(FILES);
  const cases = [
    [(a) => { a.id = 'Zorro'; }, /field "id"/],
    [(a) => { a.name = null; }, /field "name"/],
    [(a) => { a.name.es = ''; }, /field "name.es"/],
    [(a) => { a.name.en = ''; }, /field "name.en"/],
    [(a) => { a.name.gender = 'x'; }, /field "name.gender"/],
    [(a) => { a.traits = null; }, /field "traits"/],
    [(a) => { a.traits.size = 'enorme'; }, /field "traits.size"/],
    [(a) => { a.traits.color = 'turquesa'; }, /field "traits.color"/],
    [(a) => { a.traits.movement = 'teletransporta'; }, /field "traits.movement"/],
    [(a) => { a.traits.diet = 'solar'; }, /field "traits.diet"/],
    [(a) => { a.traits.legs = 2.5; }, /field "traits.legs"/],
    [(a) => { a.parts = []; }, /field "parts"/],
    [(a) => { a.parts = [null]; }, /field "parts\[0\]"/],
    [(a) => { a.parts.push(part()); }, /duplicate part/],
    [(a) => { a.parts[0].color = 'red'; }, /field "parts\[0\]\.color"/],
    [(a) => { a.parts[0].scale = 0; }, /field "parts\[0\]\.scale"/],
    [(a) => { a.parts[0].scale = [1, 1]; }, /field "parts\[0\]\.scale"/],
    [(a) => { a.parts[0].scale = [1, 'a', 1]; }, /field "parts\[0\]\.scale"/],
    [(a) => { a.parts[0].count = 0; }, /field "parts\[0\]\.count"/],
    [(a) => { a.parts[0].offset = [0, 0]; }, /field "parts\[0\]\.offset"/],
    [(a) => { a.parts[0].rot = [0, 1]; }, /field "parts\[0\]\.rot"/],
    [(a) => { a.parts[0].row = 0; }, /field "parts\[0\]\.row"/],
    [(a) => { a.parts[0].also = 'x'; }, /field "parts\[0\]\.also"/],
    [(a) => { a.parts[0].also = [null]; }, /field "parts\[0\]\.also\[0\]"/],
    [(a) => { a.parts[0].also = [{ scale: 1, count: 1, offset: [0, 0, 0], color: 'red' }]; }, /field "parts\[0\]\.also\[0\]\.color"/],
    [(a) => { a.parts[0].also = [{ scale: 0, count: 1, offset: [0, 0, 0] }]; }, /field "parts\[0\]\.also\[0\]\.scale"/],
    [(a) => { a.easterEgg = 'no'; }, /field "easterEgg"/],
    [(a) => { a.story = 'yes'; }, /field "story"/],
    [(a) => { a.herd = 0; }, /field "herd".*1 to 5/],
    [(a) => { a.herd = 6; }, /field "herd"/],
    [(a) => { a.herd = 2.5; }, /field "herd"/],
    [(a) => { a.feet = 'wheel'; }, /field "feet".*one of paw, hoof, claw, none \(got "wheel"\)/],
    [(a) => { a.voice = 'oinc'; }, /field "voice"/],
    [(a) => { a.baby = { of: 'cerda', scale: 1, headScale: 1.4, eyeScale: 1.4 }; }, /field "baby.scale"/],
    [(a) => { a.baby = { of: 'cerda', scale: 0.5, headScale: 0, eyeScale: 1.4 }; }, /field "baby.headScale"/],
    [(a) => { a.baby = { scale: 0.5, headScale: 1.4, eyeScale: 1.4 }; }, /field "baby.of"/],
  ];
  for (const [mutate, re] of cases) {
    const a = good();
    mutate(a);
    assert.throws(() => SA.data.register('animals', [a]), re);
  }
});

test('every animal has a validated non-empty icon; a missing or empty icon is rejected naming the animal', () => {
  const SA = loadGame(FILES);
  for (const a of SA.data.all('animals')) assert.ok(typeof a.icon === 'string' && a.icon.trim(), `${a.id} icon`);
  for (const bad of [undefined, '', '  ', 5, null]) {
    const a = good();
    if (bad === undefined) delete a.icon; else a.icon = bad;
    assert.throws(() => SA.data.register('animals', [a]), /id "zorro", field "icon": must be a short non-empty emoji string/);
  }
});

test('validator rejects bad biomes', () => {
  const SA = loadGame(FILES);
  const b = () => ({ id: 'mar', name: { es: 'El mar', en: 'Sea' }, ground: '#001122', accent: '#334455' });
  const cases = [
    [(x) => { x.id = 'Mar!'; }, /field "id"/],
    [(x) => { x.name = 1; }, /field "name"/],
    [(x) => { x.name.es = ''; }, /field "name.es"/],
    [(x) => { x.name.en = ''; }, /field "name.en"/],
    [(x) => { x.ground = 'blue'; }, /field "ground"/],
    [(x) => { x.accent = '#12'; }, /field "accent"/],
  ];
  for (const [mutate, re] of cases) {
    const x = b();
    mutate(x);
    assert.throws(() => SA.data.register('biomes', [x]), re);
  }
});

test('index.html loads biomes and animals after parts, in order', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (s) => html.indexOf(`game/data/${s}.js`);
  assert.ok(at('parts') > 0 && at('parts') < at('biomes') && at('biomes') < at('animals'));
});

test('every animal eye has a data-defined pupil that contrasts with the eye colour', () => {
  const SA = loadGame(FILES);
  for (const a of SA.data.all('animals')) {
    const eye = a.parts.find((p) => p.part === 'ojos');
    assert.ok(eye, `${a.id} has eyes`);
    assert.match(eye.pupil, /^#[0-9a-f]{6}$/i, `${a.id} pupil`);
    assert.notEqual(eye.pupil.toLowerCase(), eye.color.toLowerCase(), a.id);
  }
});

test('validator rejects a pupil that is not a colour or does not contrast with the part', () => {
  const withPupil = (id, color, pupil) => { const a = good(); a.id = id; a.parts = [{ ...part(), color, pupil }]; return a; };
  let SA = loadGame(FILES);
  assert.doesNotThrow(() => SA.data.register('animals', [withPupil('zorroa', '#f4f4f4', '#111111')]));
  SA = loadGame(FILES);
  assert.throws(() => SA.data.register('animals', [withPupil('zorrob', '#f4f4f4', 'black')]), /pupil/);
  SA = loadGame(FILES);
  assert.throws(() => SA.data.register('animals', [withPupil('zorroc', '#222222', '#111111')]), /pupil/);
  const withLid = (id, eyelid) => { const a = good(); a.id = id; a.parts = [{ ...part(), eyelid }]; return a; };
  assert.throws(() => SA.data.register('animals', [withLid('zorrod', 'pink')]), /eyelid/);
});
