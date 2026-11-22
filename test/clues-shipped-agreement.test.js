import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js'];
const load = () => loadGame(FILES);

// Synthetic animal so exactly one animal in play is green / small, whatever the shipped animals are.
const animal = (id, traits) => ({
  id, name: { es: id, en: id, gender: 'm' }, biome: 'bosque',
  traits: { size: 'mediano', color: 'gris', movement: 'corre', diet: 'herbívoro', legs: 4, ...traits },
  parts: [{ part: 'cola', color: '#ffffff', scale: 1, count: 1, offset: [0, 0, 0] }], easterEgg: false,
});
const pair = [animal('a', { color: 'verde', size: 'pequeño' }), animal('b', { color: 'rojo', size: 'grande' })];

test('shipped templates declare feminine gender and plural number, and validate at load', () => {
  const SA = load();
  const trait = SA.data.all('clueTemplates').filter((t) => t.type === 'trait');
  assert.ok(trait.some((t) => t.gender === 'f'));
  assert.ok(trait.some((t) => t.number === 'pl'));
});

test('feminine singular, masculine plural and feminine plural clues agree in text and spoken keys', () => {
  const SA = load();
  const byKey = Object.fromEntries(SA.clues.candidates(pair, ['trait']).map((c) => [c.key, c]));

  const f = byKey['trait-color-f:verde'];
  assert.equal(f.text, 'Busca la criatura verde');
  assert.deepEqual([...f.vocabKeys], ['phrase:buscalacriatura', 'adj:verde']);

  const mpl = byKey['trait-color-mpl:verde'];
  assert.equal(mpl.text, 'Busca los animales verdes');
  assert.deepEqual([...mpl.vocabKeys],['phrase:buscalosanimales', 'adj:verdes']);
  assert.equal(byKey['trait-color-mpl:rojo'].text, 'Busca los animales rojos');
  assert.equal(byKey['trait-color-f:rojo'].text, 'Busca la criatura roja');

  const fpl = byKey['trait-size-fpl:pequeño'];
  assert.equal(fpl.text, 'Busca las criaturas pequeñas');
  assert.deepEqual([...fpl.vocabKeys],['phrase:buscalascriaturas', 'adj:pequeñas']);
  assert.equal(fpl.answer.animalId, 'a');
});

test('every shipped agreement clue speaks only keys that exist, in about six words or fewer', () => {
  const SA = load();
  const ids = SA.data.all('animals').map((a) => a.id);
  const clues = SA.clues.candidates(ids, ['trait']).filter((c) => /-(f|mpl|fpl)$/.test(c.templateId));
  assert.ok(clues.length > 0);
  for (const c of clues) {
    c.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `missing vocab ${k} for "${c.text}"`));
    assert.ok(c.text.split(' ').length <= 6, c.text);
    assert.equal(c.vocabKeys[1], SA.vocab.adjKey(c.key.split(':')[1], c.templateId.endsWith('-f') ? 'f' : c.templateId.endsWith('mpl') ? 'm' : 'f',
      c.templateId.endsWith('-f') ? 'sg' : 'pl'));
  }
});
