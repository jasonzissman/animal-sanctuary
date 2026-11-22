import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const DATA = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js'];
const ALL = [...DATA.slice(0, 2), 'game/save.js', 'game/audio.js', ...DATA.slice(2), 'game/speech.js'];

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function speechGlobals(voices = []) {
  const spoken = [];
  const cancelled = { n: 0 };
  class Utter { constructor(text) { this.text = text; } }
  return {
    spoken, cancelled,
    globals: {
      localStorage: fakeStorage(),
      SpeechSynthesisUtterance: Utter,
      speechSynthesis: { getVoices: () => voices, speak: (u) => spoken.push(u), cancel: () => cancelled.n++ },
    },
  };
}

test('every part, animal, biome and trait word in the data has a vocab entry', () => {
  const SA = loadGame(DATA);
  const has = (key, es) => {
    const e = SA.vocab.get(key);
    assert.ok(e, `missing vocab entry "${key}"`);
    if (es) assert.ok(e.es.toLowerCase().includes(es.toLowerCase()), `vocab "${key}" text ${e.es} should include ${es}`);
  };
  SA.data.all('parts').forEach((p) => { has('part:' + p.key); assert.equal(SA.vocab.get('part:' + p.key).es, p.label.es); });
  SA.data.all('animals').forEach((a) => has('animal:' + a.id, a.name.es));
  SA.data.all('biomes').forEach((b) => { has('biome:' + b.id); assert.equal(SA.vocab.get('biome:' + b.id).es, b.name.es); });
  SA.animals.SIZES.forEach((w) => has('size:' + w, w));
  SA.animals.COLORS.forEach((w) => has('color:' + w, w));
  SA.animals.MOVEMENTS.forEach((w) => has('movement:' + w, w));
  SA.animals.DIETS.forEach((w) => has('diet:' + w, w));
  for (let n = 1; n <= 10; n++) has('number:' + n);
  assert.ok(SA.vocab.keys().some((k) => k.startsWith('phrase:')));
});

test('every animal name and every trait value an animal actually uses has a vocab entry', () => {
  const SA = loadGame(DATA);
  const animals = SA.data.all('animals');
  assert.ok(animals.length >= 10);
  const missing = [];
  const need = (animal, key, es) => {
    const e = SA.vocab.get(key);
    if (!e) missing.push(`${animal.id}: no vocab entry "${key}"`);
    else if (es !== undefined && e.es !== es) missing.push(`${animal.id}: "${key}" text ${JSON.stringify(e.es)} != ${JSON.stringify(es)}`);
  };
  const article = { m: 'el ', f: 'la ' };
  animals.forEach((a) => {
    // The spoken name carries the article for its gender (el águila is feminine but takes "el").
    need(a, 'animal:' + a.id);
    const name = SA.vocab.get('animal:' + a.id);
    if (name) assert.ok(/^(el|la|los|las) /.test(name.es) && name.es.endsWith(a.name.es), `${a.id}: ${name.es}`);
    if (name && a.id !== 'aguila') assert.ok(name.es.startsWith(article[a.name.gender]), `${a.id} article vs gender`);
    need(a, 'biome:' + a.biome, SA.data.get('biomes', a.biome).name.es);   // habitat
    need(a, 'size:' + a.traits.size, a.traits.size);
    need(a, 'color:' + a.traits.color, a.traits.color);
    need(a, 'movement:' + a.traits.movement, a.traits.movement);
    need(a, 'diet:' + a.traits.diet, a.traits.diet);
    need(a, 'number:' + a.traits.legs);                                    // count
    a.parts.forEach((p) => need(a, 'number:' + p.count));
  });
  assert.deepEqual(missing, []);
});

test('the missing-vocab check really fails when an animal or trait value has no entry', () => {
  const SA = loadGame(DATA);
  const bad = { id: 'dragon', name: { es: 'dragón', en: 'dragon', gender: 'm' }, traits: { size: 'enorme', color: 'morado', movement: 'surfea', diet: 'fuego', legs: 11 } };
  assert.equal(SA.vocab.get('animal:' + bad.id), null);
  ['size', 'color', 'movement', 'diet'].forEach((t) => assert.equal(SA.vocab.get(t + ':' + bad.traits[t]), null, t));
  assert.equal(SA.vocab.get('number:' + bad.traits.legs), null);
});

test('say() can speak every animal name and trait value', () => {
  const { spoken, globals } = speechGlobals();
  const SA = loadGame(ALL, globals);
  SA.data.all('animals').forEach((a) => {
    [['animal:' + a.id, SA.vocab.get('animal:' + a.id).es], ['size:' + a.traits.size, a.traits.size], ['color:' + a.traits.color, a.traits.color],
      ['movement:' + a.traits.movement, a.traits.movement], ['diet:' + a.traits.diet, a.traits.diet]].forEach(([key, es]) => {
      spoken.length = 0;
      assert.equal(SA.audio.say(key), 'speech', key);
      assert.equal(spoken[0].text, es);
    });
  });
});

test('vocab entries are validated', () => {
  const SA = loadGame(DATA);
  assert.throws(() => SA.data.register('vocab', [{ id: 'x', key: 'x', es: 'hola', clip: null }]), /group:name/);
  assert.throws(() => SA.data.register('vocab', [{ id: 'a:b', key: 'a:b', es: '', clip: null }]), /es/);
  assert.throws(() => SA.data.register('vocab', [{ id: 'a:b', key: 'a:b', es: 'hola', clip: 3 }]), /clip/);
  assert.equal(SA.vocab.get('nope'), null);
  assert.equal(SA.vocab.get(5), null);
});

test('say() speaks a vocab key with the best Spanish voice at a slower rate', () => {
  const voices = [{ lang: 'en-US' }, { lang: 'es-ES', localService: true }, { lang: 'es-MX', localService: false }, { lang: 'es-US' }];
  const { spoken, cancelled, globals } = speechGlobals(voices);
  const SA = loadGame(ALL, globals);
  assert.equal(SA.audio.say('part:caparazon'), 'speech');
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, 'el caparazón');
  assert.equal(spoken[0].lang, 'es-MX');
  assert.equal(spoken[0].voice, voices[2]);
  assert.ok(spoken[0].rate < 1);
  assert.equal(cancelled.n, 1);
  assert.equal(SA.audio.say('¡Hola amigo!'), 'speech');   // unknown key = plain text
  assert.equal(spoken[1].text, '¡Hola amigo!');
});

test('pickVoice prefers es-MX > es-US > es-ES > other es, ignores non-Spanish', () => {
  const SA = loadGame(ALL, speechGlobals().globals);
  const pick = (langs) => SA.audio.pickVoice(langs.map((lang) => ({ lang })));
  assert.equal(pick(['es-ES', 'es-US']).lang, 'es-US');
  assert.equal(pick(['es-ES', 'es_MX']).lang, 'es_MX');
  assert.equal(pick(['en-US', 'es-AR']).lang, 'es-AR');
  assert.equal(pick(['en-US', 'fil-PH', 'est']), null);
  assert.equal(pick([]), null);
  assert.equal(SA.audio.pickVoice(undefined), null);
});

test('say() with no Spanish voice still speaks with lang es-MX', () => {
  const { spoken, globals } = speechGlobals([{ lang: 'en-US' }]);
  const SA = loadGame(ALL, globals);
  SA.audio.say('animal:rana');
  assert.equal(spoken[0].lang, 'es-MX');
  assert.equal(spoken[0].voice, undefined);
});

test('say() prefers a clip over speech; falls back to speech if the clip cannot play', () => {
  const { spoken, globals } = speechGlobals();
  const played = [];
  globals.Audio = class { constructor(p) { played.push(p); } play() { return Promise.resolve(); } };
  const SA = loadGame(ALL, globals);
  SA.data.get('vocab', 'animal:pato').clip = 'game/audio/pato.mp3';
  assert.equal(SA.audio.say('animal:pato'), 'clip');
  assert.deepEqual(played, ['game/audio/pato.mp3']);
  assert.equal(spoken.length, 0);

  globals.Audio = class { constructor() { throw new Error('no audio'); } };
  const SA2 = loadGame(ALL, globals);
  SA2.data.get('vocab', 'animal:pato').clip = 'game/audio/pato.mp3';
  assert.equal(SA2.audio.say('animal:pato'), 'speech');

  const SA3 = loadGame(ALL, { ...globals, Audio: undefined });
  SA3.data.get('vocab', 'animal:pato').clip = 'x.mp3';
  assert.equal(SA3.audio.say('animal:pato'), 'speech');
});

test('say() swallows a rejected clip play() promise', async () => {
  const { globals } = speechGlobals();
  globals.Audio = class { play() { return Promise.reject(new Error('blocked')); } };
  const SA = loadGame(ALL, globals);
  SA.data.get('vocab', 'animal:pato').clip = 'x.mp3';
  assert.equal(SA.audio.say('animal:pato'), 'clip');
  await new Promise((r) => setImmediate(r));
});

test('say() is silent when muted, and unmuting restores it', () => {
  const { spoken, globals } = speechGlobals();
  const SA = loadGame(ALL, globals);
  SA.audio.setMuted(true);
  assert.equal(SA.audio.say('part:cola'), null);
  assert.equal(spoken.length, 0);
  SA.audio.setMuted(false);
  assert.equal(SA.audio.say('part:cola'), 'speech');
});

test('say() does nothing and never throws without speechSynthesis or on bad input', () => {
  const SA = loadGame(ALL, { localStorage: fakeStorage() });
  assert.equal(SA.audio.say('part:cola'), null);
  assert.equal(SA.audio.say(''), null);
  assert.equal(SA.audio.say(undefined), null);

  const throwing = speechGlobals().globals;
  throwing.speechSynthesis.speak = () => { throw new Error('boom'); };
  const SA2 = loadGame(ALL, throwing);
  assert.equal(SA2.audio.say('part:cola'), null);

  const noGetVoices = speechGlobals().globals;
  delete noGetVoices.speechSynthesis.getVoices;
  delete noGetVoices.speechSynthesis.cancel;
  assert.equal(loadGame(ALL, noGetVoices).audio.say('part:cola'), 'speech');
});
