import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/census.js'];
const load = () => loadGame(FILES);

const fake = (id, traits, extra = {}) => ({ id, traits: { size: 'mediano', color: 'gris', movement: 'corre', diet: 'herbívoro', legs: 4, ...traits }, ...extra });

const pool = [
  fake('a', { color: 'gris', movement: 'salta', size: 'pequeño' }),
  fake('b', { color: 'gris', movement: 'nada', size: 'mediano', diet: 'omnívoro' }),
  fake('c', { color: 'gris', movement: 'camina lento', alsoMoves: ['nada'], size: 'grande' }),
  fake('d', { color: 'rojo', movement: 'vuela', size: 'pequeño', diet: 'carnívoro' }),
  fake('e', { color: 'verde', movement: 'salta', size: 'pequeño', diet: 'insectívoro' }),
];

function fitCount(animals, e) { return animals.filter((a) => a.traits[e.trait] === e.value || (e.trait === 'movement' && (a.traits.alsoMoves || []).includes(e.value))).length; }

test('generated lists have 2-3 entries and only entries enough distinct animals fit (fixture and shipped data)', () => {
  const SA = load();
  const shipped = SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);
  for (const animals of [pool, shipped]) {
    for (let seed = 1; seed <= 60; seed++) {
      const list = SA.census.build(animals, seed);
      assert.ok(list.entries.length >= 2 && list.entries.length <= 3, `seed ${seed}`);
      const seen = new Set();
      for (const e of list.entries) {
        assert.ok(e.n >= 1 && e.n <= 3);
        assert.ok(fitCount(animals, e) >= e.n, `${e.trait}=${e.value} x${e.n} needs enough animals`);
        assert.ok(!seen.has(e.trait + e.value));
        seen.add(e.trait + e.value);
        assert.ok(e.icon && e.es && e.short);
      }
    }
  }
});

test('story animals and easter eggs are not in the pool, and a tiny pool yields what it can', () => {
  const SA = load();
  const only = [fake('s', { color: 'rosa' }, { story: true }), fake('x', { color: 'azul' }, { easterEgg: true })];
  assert.equal(SA.census.build(only, 1), null);
  const one = SA.census.build([fake('z', { color: 'rojo' })], 3);
  assert.ok(one.entries.every((e) => e.n === 1));
  assert.equal(SA.census.generate(5).entries.length >= 2, true);
});

test('any fitting animal counts, an animal never ticks the same entry twice, and the list finishes', () => {
  const SA = load();
  const grey = { trait: 'color', value: 'gris', n: 3 };
  const swim = { trait: 'movement', value: 'nada', n: 2 };
  const state = SA.census.newState({ entries: [grey, swim], key: 'k' });
  assert.equal(SA.census.isDone(state), false);
  assert.equal(SA.census.tick(state, pool[3]), null);                    // red bird fits nothing
  assert.equal(SA.census.tick(state, pool[2]), grey);                    // turtle-like: grey (first entry)...
  assert.equal(state.ticked[1].length, 1);                               // ...and it swims too (alsoMoves)
  assert.equal(SA.census.tick(state, pool[2]), null);                    // same animal again: nothing
  assert.equal(SA.census.tick(state, pool[1]), grey);
  assert.equal(SA.census.tick(state, pool[0]), grey);
  assert.deepEqual(SA.census.progress(state).map((p) => p.have), [3, 2]);   // grey: c, b, a; swimmers: c, b
  assert.equal(SA.census.isDone(state), true);
  assert.equal(SA.census.tick(state, pool[4]), null);                    // full entries take no more
});

test('matches takes an object or an id, and counts alsoMoves', () => {
  const SA = load();
  const turtle = SA.data.all('animals').find((a) => (a.traits.alsoMoves || []).includes('nada'));
  assert.ok(turtle);
  assert.equal(SA.census.matches(turtle.id, { trait: 'movement', value: 'nada' }), true);
  assert.equal(SA.census.matches(turtle, { trait: 'color', value: 'rosa' }), turtle.traits.color === 'rosa');
  assert.equal(SA.census.matches('nope', { trait: 'color', value: 'gris' }), false);
  assert.equal(SA.census.tick(null, turtle), null);
});

test('different seeds and replays give different lists', () => {
  const SA = load();
  const keys = new Set();
  for (let seed = 1; seed <= 25; seed++) keys.add(SA.census.build(pool, seed).key);
  assert.ok(keys.size >= 5, `only ${keys.size} distinct lists`);
  assert.equal(SA.census.build(pool, 9).key, SA.census.build(pool, 9).key);   // same seed, same list
  const rng = SA.census.makeRng(4);
  let prev = SA.census.build(pool, rng);
  for (let i = 0; i < 20; i++) {
    const next = SA.census.build(pool, rng, { avoid: prev });
    assert.notEqual(next.key, prev.key);
    prev = next;
  }
  assert.notEqual(SA.census.generate(2, { avoid: SA.census.generate(2).key }).key, SA.census.generate(2).key);
});

test('Spanish agrees in number and gender, and every phrase word is a vocab key', () => {
  const SA = load();
  const { agree, numberWord } = SA.census;
  assert.equal(agree('color', 'gris', 'm', false).text, 'gris');
  assert.equal(agree('color', 'gris', 'm', true).text, 'grises');
  assert.equal(agree('color', 'blanco', 'f', true).text, 'blancas');
  assert.equal(agree('color', 'marrón', 'm', true).text, 'marrones');
  assert.equal(agree('size', 'pequeño', 'm', true).text, 'pequeños');
  assert.equal(agree('diet', 'herbívoro', 'f', true).text, 'herbívoras');
  assert.equal(agree('movement', 'nada', 'm', true).text, 'que nadan');
  assert.equal(agree('movement', 'salta', 'm', false).text, 'que salta');
  assert.equal(agree('movement', 'camina lento', 'm', true).text, 'que caminan lento');
  assert.equal(numberWord(1, 'm', false).text, 'uno');
  assert.equal(numberWord(1, 'm', true).text, 'un');
  assert.equal(numberWord(1, 'f', false).text, 'una');
  assert.equal(numberWord(2, 'f', false).text, 'dos');
  assert.equal(numberWord(3, 'm', true).text, 'tres');

  const texts = {};
  for (let seed = 1; seed <= 80; seed++) {
    for (const en of SA.census.build(SA.data.all('animals'), seed).entries) texts[en.es] = en;
  }
  assert.ok(Object.keys(texts).length > 10);
  for (const [text, en] of Object.entries(texts)) {
    const first = en.n === 1 ? /^un animal / : /^(dos|tres) animales /;
    assert.match(text, first);
    if (en.trait === 'movement') assert.match(text, en.n === 1 ? /que (salta|nada|vuela|trepa|camina lento|corre|repta)$/ : /que \w+n( lento)?$/);
    if (en.trait === 'color' && en.value === 'gris') assert.ok(text.endsWith(en.n === 1 ? ' gris' : ' grises'));
    for (const k of en.vocabKeys.concat(en.shortKeys)) assert.ok(SA.vocab.get(k), `vocab key ${k}`);
    assert.equal(en.vocabKeys.length >= 3, true);
  }
  // The joined sentence: "a, b y c", short forms after the first, with the "y" key before the last.
  const sample = SA.census.build(SA.data.all('animals'), 7);
  const parts = sample.es.split(/, | y /);
  assert.equal(parts.length, sample.entries.length);
  assert.equal(parts[0], sample.entries[0].es);
  assert.equal(parts[parts.length - 1], sample.entries[sample.entries.length - 1].short);
  assert.ok(sample.vocabKeys.includes('phrase:y'));
  sample.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `vocab key ${k}`));
});

test('the documented sentence builds from its parts', () => {
  const SA = load();
  const entries = [
    { trait: 'color', value: 'gris', n: 3 }, { trait: 'movement', value: 'nada', n: 2 }, { trait: 'movement', value: 'salta', n: 1 }];
  const state = SA.census.newState({ entries, key: 'k' });
  assert.equal(state.ticked.length, 3);
  // Rebuild phrases through the public API for each entry via a pool that forces exactly these entries.
  const forced = SA.census.agree;
  assert.equal(`${SA.census.numberWord(3, 'm', true).text} animales ${forced('color', 'gris', 'm', true).text}`, 'tres animales grises');
  assert.equal(`${SA.census.numberWord(2, 'm', false).text} ${forced('movement', 'nada', 'm', true).text}`, 'dos que nadan');
  assert.equal(`${SA.census.numberWord(1, 'm', false).text} ${forced('movement', 'salta', 'm', false).text}`, 'uno que salta');
});
