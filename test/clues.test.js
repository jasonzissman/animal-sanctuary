import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js'];
const load = () => loadGame(FILES);

// Synthetic animal with the given [part, scale] entries and traits.
function animal(id, parts, traits = {}) {
  return {
    id, name: { es: id, en: id, gender: 'm' }, biome: 'bosque',
    traits: { size: 'mediano', color: 'gris', movement: 'corre', diet: 'herbívoro', legs: 4, ...traits },
    parts: parts.map(([part, scale]) => ({ part, color: '#ffffff', scale, count: 1, offset: [0, 0, 0] })),
    easterEgg: false,
  };
}

test('adjectives agree with the part gender and number (m/f, sg/pl)', () => {
  const SA = load();
  const largo = SA.data.get('clueTemplates', 'part-length').adjectives[0];
  assert.equal(SA.clues.inflect(largo, 'm', 'sg'), 'largo');
  assert.equal(SA.clues.inflect(largo, 'f', 'sg'), 'larga');
  assert.equal(SA.clues.inflect(largo, 'm', 'pl'), 'largos');
  assert.equal(SA.clues.inflect(largo, 'f', 'pl'), 'largas');

  // One animal with a long part of each gender/number: orejas f pl, cola f sg, pico m sg, cuernos m pl.
  const long = animal('largon', [['orejas', 1.4], ['cola', 1.4], ['pico', 1.4], ['cuernos', 1.4]]);
  const texts = SA.clues.candidates([long], ['partAdjective']).map((c) => c.text);
  assert.ok(texts.includes('Busca el animal con orejas largas'));
  assert.ok(texts.includes('Busca el animal con cola larga'));
  assert.ok(texts.includes('Busca el animal con pico largo'));
  assert.ok(texts.includes('Busca el animal con cuernos largos'));
  assert.ok(!texts.some((t) => /orejas larg[oa]\b|cola largas|pico larga/.test(t)));

  const short = animal('chico', [['orejas', 0.2], ['cola', 0.2], ['pico', 0.2], ['cuernos', 0.2]]);
  const shortTexts = SA.clues.candidates([short], ['partAdjective']).map((c) => c.text);
  assert.ok(shortTexts.includes('Busca el animal con orejas cortas'));
  assert.ok(shortTexts.includes('Busca el animal con cola corta'));
  assert.ok(shortTexts.includes('Busca el animal con pico corto'));
  assert.ok(shortTexts.includes('Busca el animal con cuernos cortos'));
});

test('generates the example clue shapes from the real animals', () => {
  const SA = load();
  const all = SA.clues.candidates(['conejo', 'tucan'], null);
  // JSON round-trip: objects built inside node:vm have a different Object prototype than the test realm.
  const byText = JSON.parse(JSON.stringify(Object.fromEntries(all.map((c) => [c.text, c]))));
  assert.deepEqual(byText['Busca el animal con orejas largas'].answer, { animalId: 'conejo', part: 'orejas' });
  assert.deepEqual(byText['Busca el animal que vuela'].answer, { animalId: 'tucan' });
  assert.deepEqual(byText['Toca las orejas'].answer, { animalId: 'conejo', part: 'orejas' });
  assert.deepEqual(byText['Toca el pico'].answer, { animalId: 'tucan', part: 'pico' });
  assert.ok(byText['Busca el animal que salta']);
  assert.ok(byText['Busca el animal negro']);
  assert.ok(byText['Busca el animal con pico largo']);
});

test('every clue has at least one satisfying animal, vocab keys that exist, and an answer in play', () => {
  const SA = load();
  const ids = SA.data.all('animals').map((a) => a.id);
  const sets = [ids, ids.slice(0, 2), ids.slice(2, 5), ['conejo', 'pato', 'rana']];
  for (const set of sets) {
    const clues = SA.clues.candidates(set, null);
    assert.ok(clues.length > 0);
    for (const c of clues) {
      assert.ok(set.includes(c.answer.animalId), c.text);
      assert.ok(c.vocabKeys.length >= 2);
      c.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `missing vocab ${k} for "${c.text}"`));
    }
    // Cross-check: re-derive the matching animals independently for trait clues; answerIds lists exactly those.
    for (const c of clues.filter((x) => x.type === 'trait')) {
      const [, v] = c.key.split(':');
      const trait = SA.data.get('clueTemplates', c.templateId).trait;
      const want = Array.from(set).filter((id) => {
        const t = SA.data.get('animals', id).traits;
        return t[trait] === v || (trait === 'movement' && (t.alsoMoves || []).includes(v));
      });
      assert.ok(want.length >= 1, c.text);
      assert.deepEqual(JSON.parse(JSON.stringify(c.answerIds)), want, c.text);
      assert.ok(c.answerIds.includes(c.answer.animalId), c.text);
    }
  }
});

test('pickClue accepts clues several animals satisfy; the answer is always one of the matches', () => {
  const SA = load();
  // Two identical-trait animals: a trait clue now matches both of them.
  const a = animal('a', [['cola', 1.5]], { movement: 'salta', color: 'verde', size: 'grande' });
  const b = animal('b', [['cola', 1.5]], { movement: 'salta', color: 'verde', size: 'grande' });
  const both = SA.clues.pickClue({ animals: [a, b] }, () => 0.5);
  assert.ok(both);
  assert.ok(SA.clues.matches(both, a) && SA.clues.matches(both, b));
  const c = animal('c', [['cola', 0.2]], { movement: 'salta', color: 'verde', size: 'pequeño' });
  const rng = SA.clues.makeRng(7);
  const shown = new Set();
  for (let i = 0; i < 60; i++) {
    const clue = SA.clues.pickClue({ animals: [a, b, c] }, rng);
    assert.ok(clue);
    assert.ok(clue.answerIds.length >= 1, clue.text);
    assert.ok(clue.answerIds.includes(clue.answer.animalId), clue.text);
    assert.ok(SA.clues.matches(clue, clue.answer.animalId.length ? [a, b, c].find((x) => x.id === clue.answer.animalId) : null), clue.text);
    if (clue.answerIds.length > 1) shown.add(clue.answer.animalId);
  }
  assert.ok(shown.size > 1, 'the hinted answer rotates among the matches');
  assert.equal(SA.clues.pickClue({ animals: [] }, () => 0), null);
  assert.equal(SA.clues.pickClue(undefined, () => 0), null);
});

test('the same clue is not repeated within 3 rounds', () => {
  const SA = load();
  const state = { animals: ['conejo', 'pato', 'tucan'], recent: [] };
  const rng = SA.clues.makeRng(42);
  const keys = [];
  for (let i = 0; i < 40; i++) {
    const clue = SA.clues.pickClue(state, rng);
    assert.ok(clue);
    const last3 = keys.slice(-SA.clues.RECENT_LIMIT);
    assert.ok(!last3.includes(clue.key), `${clue.key} repeated within 3 rounds`);
    keys.push(clue.key);
    SA.clues.remember(state, clue);
    assert.ok(state.recent.length <= 3);
  }
  assert.equal(SA.clues.RECENT_LIMIT, 3);
});

test('when every unique clue was used recently, pickClue returns null instead of repeating', () => {
  const SA = load();
  const only = animal('solo', [['cola', 1.5]]);
  const all = SA.clues.candidates([only], ['trait']);
  // one animal in play: its size, colour and movement, plus the feminine/plural colour and size agreement clues
  assert.equal(all.length, 6);
  const state = { animals: [only], types: ['trait'], recent: all.slice(0, 2).map((c) => c.key) };
  const clue = SA.clues.pickClue(state, () => 0);
  assert.ok(!state.recent.includes(clue.key));
  state.recent = all.map((c) => c.key);
  assert.equal(SA.clues.pickClue(state, () => 0), null);
});

test('selection is seeded and deterministic', () => {
  const SA1 = load();
  const SA2 = load();
  const run = (SA, seed) => {
    const state = { animals: ['conejo', 'tortuga', 'mono'], recent: [] };
    const rng = SA.clues.makeRng(seed);
    const out = [];
    for (let i = 0; i < 15; i++) { const c = SA.clues.pickClue(state, rng); out.push(c.key); SA.clues.remember(state, c); }
    return out;
  };
  assert.deepEqual(run(SA1, 123), run(SA2, 123));
  assert.notDeepEqual(run(SA1, 123), run(SA1, 124));
  const r = SA1.clues.makeRng(5);
  for (let i = 0; i < 100; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});

test('with all 20 animals every clue has one answer; the new animals get clues (joroba, repta, cuernos, desert, mountain, forest and jungle newcomers)', () => {
  const SA = load();
  const ids = SA.data.all('animals').filter((a) => !a.easterEgg && !a.story).map((a) => a.id);   // the hidden egg and story animals are not in play
  assert.equal(ids.length, 20);
  const clues = SA.clues.candidates(ids, null);
  const byText = Object.fromEntries(clues.map((c) => [c.text, c.answer.animalId]));
  assert.equal(byText['Toca la joroba'], 'camello');
  assert.equal(byText['Busca el animal que repta'], 'serpiente');
  assert.equal(byText['Busca el animal con alas largas'], 'aguila');
  assert.equal(byText['Busca el animal con patas largas'], 'camello');
  assert.equal(byText['Busca el animal con cola larga'], 'mono');
  // AS-0268: each desert newcomer is the one answer of a clue (agreeing gender/number).
  assert.equal(byText['Busca el animal con orejas grandes'], 'zorrodesierto');
  assert.equal(byText['Busca el animal con alas cortas'], 'correcaminos');
  assert.equal(byText['Busca la criatura azul'], 'lagartija');
  // AS-0269: each mountain newcomer is the one answer of a clue (agreeing gender/number: cuello is masculine, pelo masculine, alas feminine).
  assert.equal(byText['Busca el animal con cuello largo'], 'llama');
  assert.equal(byText['Busca el animal con pelo largo'], 'oso');
  assert.equal(byText['Busca el animal con alas grandes'], 'condor');
  assert.equal(byText['Toca el cuello'], 'llama');
  assert.equal(byText['Toca las plumas'], 'condor');
  // AS-0270: each forest/jungle newcomer is the one answer of a clue (cuernos masculine, manchas and garras feminine; rojo for the squirrel).
  assert.equal(byText['Busca el animal con cuernos largos'], 'ciervo');
  assert.equal(byText['Busca el animal con manchas grandes'], 'jaguar');
  assert.equal(byText['Busca el animal con garras largas'], 'perezoso');
  assert.equal(byText['Busca la criatura roja'] || byText['Busca el animal rojo'] || byText['Busca los animales rojos'], 'ardilla');
  assert.equal(byText['Toca las manchas'], 'jaguar');
  assert.equal(byText['Toca las garras'], 'perezoso');
  for (const c of clues) c.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `missing vocab ${k}`));
  for (const id of ['camello', 'serpiente', 'cabra', 'aguila', 'mono', 'zorrodesierto', 'lagartija', 'correcaminos', 'oso', 'llama', 'condor', 'ciervo', 'ardilla', 'jaguar', 'perezoso']) assert.ok(clues.some((c) => c.answer.animalId === id), id);
});

test('every animal has at least one unique level-1 single-fact clue (the rana via "ojos grandes")', () => {
  const SA = load();
  const ids = SA.data.all('animals').filter((a) => !a.easterEgg && !a.story).map((a) => a.id);
  const clues = SA.clues.candidates(ids, ['trait', 'partAdjective']);
  for (const id of ids) {
    assert.ok(clues.some((c) => c.answer.animalId === id), `no unique level-1 clue for ${id}`);
  }
  const rana = clues.find((c) => c.answer.animalId === 'rana');
  assert.equal(rana.text, 'Busca el animal con ojos grandes');
  assert.deepEqual(JSON.parse(JSON.stringify(rana.answer)), { animalId: 'rana', part: 'ojos' });
  rana.vocabKeys.forEach((k) => assert.ok(SA.vocab.get(k), `missing vocab ${k}`));
  assert.equal(SA.clues.inflect(SA.data.get('clueTemplates', 'part-size').adjectives[0], 'm', 'pl'), 'grandes');
});

test('types filter restricts which clue kinds are generated', () => {
  const SA = load();
  const only = (types) => new Set(SA.clues.candidates(['conejo', 'tucan'], types).map((c) => c.type));
  assert.deepEqual([...only(['touchPart'])], ['touchPart']);
  assert.deepEqual([...only(['trait'])], ['trait']);
});

test('clue template validation gives clear errors', () => {
  const SA = load();
  const lead = { key: 'phrase:x', es: 'Busca' };
  const bad = (t, re) => assert.throws(() => SA.data.register('clueTemplates', [t]), re);
  bad({ id: 't1', type: 'nope', lead }, /type/);
  bad({ id: 't2', type: 'touchPart', lead, parts: ['nopart'] }, /unknown part/);
  bad({ id: 't3', type: 'trait', lead, trait: 'color', values: ['morado'] }, /unknown color value/);
  bad({ id: 't4', type: 'trait', lead, trait: 'legs', values: [4] }, /trait/);
  bad({ id: 't5', type: 'partAdjective', lead, parts: ['cola'], adjectives: [{ id: 'x', min: 1, forms: { m: { sg: 'a', pl: 'b' } } }] }, /forms/);
  bad({ id: 't6', type: 'partAdjective', lead, parts: ['cola'],
    adjectives: [{ id: 'x', forms: { m: { sg: 'a', pl: 'b' }, f: { sg: 'c', pl: 'd' } } }] }, /min and\/or max/);
  bad({ id: 't7', type: 'touchPart', parts: ['cola'] }, /lead/);
});
