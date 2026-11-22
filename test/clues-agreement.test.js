import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js'];
const load = () => loadGame(FILES);
const lead = { key: 'phrase:buscaanimal', es: 'Busca el animal' };
const COLORS = ['blanco', 'gris', 'marrón', 'negro', 'verde', 'amarillo', 'naranja', 'rojo', 'azul'];
const SIZES = ['pequeño', 'mediano', 'grande'];

function withAgreement(SA, gender, number) {
  const id = `t-${gender}-${number}`;
  SA.data.register('clueTemplates', [
    { id: `${id}-color`, type: 'trait', lead, trait: 'color', values: COLORS, gender, number },
    { id: `${id}-size`, type: 'trait', lead, trait: 'size', values: SIZES, gender, number },
  ]);
  const ids = SA.data.all('animals').map((a) => a.id);
  const all = SA.clues.candidates(ids, ['trait']);
  return all.filter((c) => c.templateId.startsWith(id));
}

test('feminine, plural and feminine plural nouns speak the adjKey form', () => {
  const SA = load();
  const f = withAgreement(SA, 'f', 'sg');
  const pl = withAgreement(SA, 'm', 'pl');
  const fpl = withAgreement(SA, 'f', 'pl');
  assert.ok(f.length && pl.length && fpl.length);
  const check = (clues, g, n) => clues.forEach((c) => {
    const value = c.key.split(':')[1];
    const expected = SA.vocab.adjKey(value, g, n);
    assert.equal(c.vocabKeys[1], expected, c.key);
    assert.equal(c.text, 'Busca el animal ' + SA.vocab.get(expected).es);
  });
  check(f, 'f', 'sg');
  check(pl, 'm', 'pl');
  check(fpl, 'f', 'pl');
  assert.ok(fpl.some((c) => c.vocabKeys[1] === 'adj:blancas' || c.vocabKeys[1] === 'adj:negras' || c.vocabKeys[1] === 'adj:rojas' ||
    c.vocabKeys[1] === 'adj:verdes' || c.vocabKeys[1] === 'adj:grandes' || c.vocabKeys[1] === 'adj:pequeñas'));
});

test('masculine singular clues keep the base keys, including with the default template', () => {
  const SA = load();
  const base = SA.clues.candidates(SA.data.all('animals').map((a) => a.id), ['trait']);
  const colorClue = base.find((c) => c.templateId === 'trait-color');
  assert.ok(colorClue);
  assert.equal(colorClue.vocabKeys[1], 'color:' + colorClue.key.split(':')[1]);
  const explicit = withAgreement(SA, 'm', 'sg');
  assert.ok(explicit.length);
  explicit.forEach((c) => assert.match(c.vocabKeys[1], /^(color|size):/));
});

test('a missing SA.vocab.adjKey (or SA.vocab) falls back to the base key without throwing', () => {
  const SA = load();
  SA.vocab.adjKey = undefined;
  const noAdj = withAgreement(SA, 'f', 'pl');
  assert.ok(noAdj.length);
  noAdj.forEach((c) => assert.match(c.vocabKeys[1], /^(color|size):/));
  const SA2 = load();
  const saved = SA2.vocab;
  SA2.vocab = undefined;
  const none = withAgreement(SA2, 'f', 'pl');
  assert.ok(none.length);
  none.forEach((c) => assert.match(c.vocabKeys[1], /^(color|size):/));
  SA2.vocab = saved;
});

test('every key a clue can emit resolves to a vocab entry (all genders and numbers)', () => {
  const SA = load();
  for (const g of ['m', 'f']) for (const n of ['sg', 'pl']) withAgreement(SA, g, n);
  const ids = SA.data.all('animals').map((a) => a.id);
  const clues = SA.clues.candidates(ids, null);
  assert.ok(clues.length > 20);
  for (const c of clues) c.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `missing vocab ${k} for "${c.text}"`));
});

test('template validation rejects a bad noun gender or number', () => {
  const SA = load();
  assert.throws(() => SA.data.register('clueTemplates', [{ id: 'bad-g', type: 'trait', lead, trait: 'color', values: ['verde'], gender: 'x' }]));
  assert.throws(() => SA.data.register('clueTemplates', [{ id: 'bad-n', type: 'trait', lead, trait: 'color', values: ['verde'], number: 'dual' }]));
});
