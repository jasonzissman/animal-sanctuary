import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js',
  'game/save.js', 'game/round.js'];
const load = () => loadGame(FILES);
const real = (SA) => Array.from(SA.data.all('animals')).filter((a) => !a.easterEgg);   // test-realm array (vm arrays differ)
const clueByKey = (SA, animals, key, types = null) => SA.clues.candidates(animals, types).find((c) => c.key === key);

// Synthetic animal with the given [part, scale, count] entries and trait overrides.
function animal(id, parts, traits = {}, biome = 'bosque') {
  return {
    id, name: { es: id, en: id, gender: 'm' }, biome, easterEgg: false,
    traits: { size: 'mediano', color: 'gris', movement: 'corre', diet: 'herbívoro', legs: 4, ...traits },
    parts: parts.map(([part, scale, count]) => ({ part, color: '#fff', scale, count: count || 1, offset: [0, 0, 0] })),
  };
}

test('a "nada" clue accepts the duck and the turtle (real data), and nothing else', () => {
  const SA = load();
  const animals = real(SA);
  const clue = clueByKey(SA, animals, 'trait-movement:nada');
  assert.ok(clue);
  assert.equal(clue.text, 'Busca el animal que nada');
  const accepted = animals.filter((a) => SA.clues.matches(clue, a)).map((a) => a.id).sort();
  assert.deepEqual(accepted, ['pato', 'tortuga']);
  assert.deepEqual([...clue.answerIds].sort(), ['pato', 'tortuga']);
  assert.equal(SA.clues.matches(clue, 'tortuga'), true);       // ids work too
  assert.equal(SA.clues.matches(clue, 'conejo'), false);
});

test('a colour clue accepts every animal of that colour (real data and an extra grey animal)', () => {
  const SA = load();
  const animals = real(SA);
  const grey = animals.filter((a) => a.traits.color === 'gris').map((a) => a.id);
  assert.ok(grey.length >= 1);
  const clue = clueByKey(SA, animals, 'trait-color:gris');
  assert.deepEqual(animals.filter((a) => SA.clues.matches(clue, a)).map((a) => a.id), grey);
  for (const id of grey) assert.ok(clue.answerIds.includes(id));

  const elefante = animal('elefante', [['orejas', 1.2]], { color: 'gris', size: 'grande' });
  const raton = animal('raton', [['orejas', 0.3]], { color: 'gris', size: 'pequeño' });
  const rojo = animal('rojo', [['orejas', 0.3]], { color: 'rojo' });
  const both = clueByKey(SA, [elefante, raton, rojo], 'trait-color:gris');
  assert.deepEqual([...both.answerIds], ['elefante', 'raton']);
  assert.deepEqual([elefante, raton, rojo].map((a) => SA.clues.matches(both, a)), [true, true, false]);
  const feminine = clueByKey(SA, [elefante, raton, rojo], 'trait-color-f:gris');
  assert.deepEqual([elefante, raton, rojo].map((a) => SA.clues.matches(feminine, a)), [true, true, false]);
});

test('part + adjective clues match by the part length, count clues by the part count', () => {
  const SA = load();
  const largas = animal('a', [['orejas', 1.4]]);
  const largas2 = animal('b', [['orejas', 1.0]]);
  const cortas = animal('c', [['orejas', 0.2]]);
  const sin = animal('d', [['cola', 1.4]]);
  const list = [largas, largas2, cortas, sin];
  const clue = clueByKey(SA, list, 'part-length:orejas:largo');
  assert.equal(clue.text, 'Busca el animal con orejas largas');
  assert.deepEqual(list.map((a) => SA.clues.matches(clue, a)), [true, true, false, false]);
  assert.deepEqual([...clue.answerIds], ['a', 'b']);
  assert.equal(clue.answer.part, 'orejas');

  const dos = animal('dos', [['alas', 0.5, 2]]);
  const uno = animal('uno', [['alas', 0.5, 1]]);
  const two = { match: [{ kind: 'count', part: 'alas', count: 2 }], answer: { animalId: 'dos' } };
  assert.equal(SA.clues.matches(two, dos), true);
  assert.equal(SA.clues.matches(two, uno), false);
  assert.equal(SA.clues.matches(two, animal('x', [['cola', 1]])), false);
});

test('matches handles biome facts, every fact must hold, and hand-made clues fall back to the answer', () => {
  const SA = load();
  const selva = animal('s', [['cola', 1]], {}, 'selva');
  const bosque = animal('b', [['cola', 1]], {}, 'bosque');
  const clue = { match: [{ kind: 'biome', id: 'selva' }, { kind: 'part', part: 'cola' }], answer: { animalId: 's' } };
  assert.equal(SA.clues.matches(clue, selva), true);
  assert.equal(SA.clues.matches(clue, bosque), false);
  assert.equal(SA.clues.matches({ match: [{ kind: 'biome', id: 'selva' }, { kind: 'part', part: 'alas' }] }, selva), false);
  assert.equal(SA.clues.matches({ match: [{ kind: 'nope' }] }, selva), false);
  assert.equal(SA.clues.matches({ answer: { animalId: 's' } }, selva), true);
  assert.equal(SA.clues.matches({ answer: { animalId: 's' } }, bosque), false);
  assert.equal(SA.clues.matches(null, selva), false);
  assert.equal(SA.clues.matches(clue, null), false);
  assert.equal(SA.clues.matches(clue, 'no-such-animal'), false);
});

test('leveled (multi-trait) clues carry match facts that the answer satisfies', () => {
  const SA = load();
  const animals = real(SA);
  for (const level of [2, 3]) {
    const clues = SA.clues.leveled(animals, level);
    assert.ok(clues.length > 0);
    for (const c of clues) {
      const ok = animals.filter((a) => SA.clues.matches(c, a)).map((a) => a.id);
      assert.deepEqual(ok, [c.answer.animalId], c.text);
    }
  }
});

test('every rolled clue has at least one match in the pool, at every level and for every biome pool', () => {
  const SA = load();
  const animals = real(SA);
  const biomes = [null, ...new Set(animals.map((a) => a.biome))];
  for (const biome of biomes) {
    const pool = SA.round.candidatesForBiome(animals, biome);
    for (const level of [1, 2, 3]) {
      const state = { animals: pool, recent: [], types: SA.round.TYPES, level };
      const rng = SA.clues.makeRng(level * 31 + 1);
      for (let i = 0; i < 40; i++) {
        const clue = SA.clues.pickClue(state, rng);
        if (!clue) { state.recent = []; continue; }
        SA.clues.remember(state, clue);
        const hits = pool.filter((a) => SA.clues.matches(clue, a));
        assert.ok(hits.length >= 1, clue.text);
        assert.ok(hits.some((a) => a.id === clue.answer.animalId), clue.text);
      }
    }
  }
});

test('round.pick is correct for every matching animal (naming the picked one) and wrong only for non-matches', () => {
  const SA = load();
  SA.save.reset();
  const animals = real(SA);
  const events = [];
  const mk = () => SA.round.create({ animals, rng: SA.clues.makeRng(5), track: (t, f) => events.push({ t, ...f }) });
  // Find a seeded round whose clue has several matches.
  const game = mk();
  let r = null;
  for (let i = 0; i < 200 && !(r && r.answerIds.length > 1); i++) r = game.start();
  assert.ok(r && r.answerIds.length > 1, 'some clue has several matching animals');
  assert.ok(r.answerIds.includes(r.answerId));
  const ids = [...r.answerIds];
  const nonMatch = animals.find((a) => !ids.includes(a.id)).id;
  assert.deepEqual(ids.slice().sort(), animals.filter((a) => SA.clues.matches(r.clue, a)).map((a) => a.id).sort());

  assert.equal(game.pick({ animalId: nonMatch, part: 'cuerpo' }).status, 'wrong');
  assert.equal(game.current().misses, 1);
  const other = ids.find((id) => id !== r.answerId);           // a matching animal that is NOT the hinted one
  const res = game.pick({ animalId: other, part: 'cuerpo' });
  assert.equal(res.status, 'correct');
  assert.equal(res.animalId, other);
  assert.equal(events.filter((e) => e.t === 'part.tap').map((e) => e.correct).slice(-2).join(), 'false,true');
  assert.equal(game.pick({ animalId: other, part: 'cuerpo' }).status, 'ignored');
});

test('swim round over real data: both the duck and the turtle complete it', () => {
  const SA = load();
  const animals = real(SA);
  for (const pickId of ['pato', 'tortuga']) {
    SA.save.reset();
    const game = SA.round.create({ animals, rng: SA.clues.makeRng(3), track: () => {} });
    let r = null;
    for (let i = 0; i < 400 && !(r && r.clue.key === 'trait-movement:nada'); i++) r = game.start();
    assert.equal(r.clue.key, 'trait-movement:nada');
    assert.deepEqual([...r.answerIds].sort(), ['pato', 'tortuga']);
    const res = game.pick({ animalId: pickId, part: 'cuerpo' });
    assert.equal(res.status, 'correct');
    assert.equal(res.animalId, pickId);
  }
});
