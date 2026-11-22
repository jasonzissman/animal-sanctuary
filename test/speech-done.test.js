import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// SA.audio.say(key, done): done fires exactly once on every path (clip, speechSynthesis, muted/unavailable).
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/audio.js', 'game/data/parts.js', 'game/data/biomes.js',
  'game/data/animals.js', 'game/data/vocab.js', 'game/speech.js'];

function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function setup(extra = {}) {
  const spoken = [], clips = [];
  class Utter { constructor(text) { this.text = text; } }
  class FakeAudio {
    constructor(path) { this.path = path; clips.push(this); }
    play() { return this.playResult || Promise.resolve(); }
  }
  const globals = { localStorage: storage(), SpeechSynthesisUtterance: Utter, Audio: FakeAudio,
    speechSynthesis: { getVoices: () => [], speak: (u) => spoken.push(u), cancel() {} }, ...extra };
  const SA = loadGame(FILES, globals);
  return { SA, spoken, clips };
}

const counter = () => { const c = { n: 0, fn: () => { c.n += 1; } }; return c; };

test('muted: done fires immediately, once, and nothing is spoken', () => {
  const { SA, spoken } = setup();
  SA.audio.setMuted(true);
  const d = counter();
  assert.equal(SA.audio.say('part:cola', d.fn), null);
  assert.equal(d.n, 1);
  assert.equal(spoken.length, 0);
});

test('invalid text or no audio available: done fires immediately; no callback is fine', () => {
  const { SA } = setup();
  const a = counter(), b = counter();
  assert.equal(SA.audio.say('', a.fn), null);
  assert.equal(SA.audio.say(null, b.fn), null);
  assert.equal(a.n, 1);
  assert.equal(b.n, 1);
  assert.equal(SA.audio.say('', undefined), null);
  const bare = setup({ speechSynthesis: undefined, SpeechSynthesisUtterance: undefined, Audio: undefined });
  const c = counter();
  assert.equal(bare.SA.audio.say('part:cola', c.fn), null);
  assert.equal(c.n, 1);
});

test('a throwing done callback never breaks say', () => {
  const { SA } = setup();
  SA.audio.setMuted(true);
  assert.doesNotThrow(() => SA.audio.say('part:cola', () => { throw new Error('boom'); }));
});

test('speechSynthesis: done waits for onend, and onerror after onend does not fire it twice', () => {
  const { SA, spoken } = setup();
  const d = counter();
  assert.equal(SA.audio.say('part:cola', d.fn), 'speech');
  assert.equal(d.n, 0, 'still speaking');
  spoken[0].onend();
  spoken[0].onerror();
  spoken[0].onend();
  assert.equal(d.n, 1);
  // an interrupted / failed utterance also completes
  const e = counter();
  SA.audio.say('part:orejas', e.fn);
  spoken[1].onerror({ error: 'interrupted' });
  assert.equal(e.n, 1);
});

test('speechSynthesis that throws on speak: done fires immediately', () => {
  const { SA } = setup({ speechSynthesis: { getVoices: () => [], speak() { throw new Error('boom'); }, cancel() {} } });
  const d = counter();
  assert.equal(SA.audio.say('part:cola', d.fn), null);
  assert.equal(d.n, 1);
});

test('clip: done waits for the audio ended event and fires once', () => {
  const { SA, clips, spoken } = setup();
  SA.vocab.applyClips({ 'animal:rana': 'assets/voice/animal-rana.m4a' });
  const d = counter();
  assert.equal(SA.audio.say('animal:rana', d.fn), 'clip');
  assert.equal(d.n, 0);
  clips[0].onended();
  clips[0].onended();
  assert.equal(d.n, 1);
  assert.equal(spoken.length, 0);
});

test('clip that fails to load: speech takes over and done fires after the utterance, once', async () => {
  const { SA, clips, spoken } = setup();
  SA.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  const d = counter();
  assert.equal(SA.audio.say('animal:rana', d.fn), 'clip');
  clips[0].onerror();
  assert.equal(spoken.length, 1);
  assert.equal(d.n, 0);
  spoken[0].onend();
  assert.equal(d.n, 1);
  // a rejected play() after the error fallback must not speak or complete twice
  const rej = setup();
  rej.SA.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  const e = counter();
  rej.SA.audio.say('animal:rana', e.fn);
  rej.clips[0].onerror();
  rej.spoken[0].onend();
  rej.clips[0].onended();
  assert.equal(e.n, 1);
});

test('clip load failure with no speech available: done fires at once', () => {
  const { SA, clips } = setup({ speechSynthesis: undefined, SpeechSynthesisUtterance: undefined });
  SA.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  const d = counter();
  assert.equal(SA.audio.say('animal:rana', d.fn), 'clip');
  clips[0].onerror();
  assert.equal(d.n, 1);
});

test('clip blocked by autoplay policy: done fires (nothing will play); a failed play() falls back to speech', async () => {
  const FakeBlocked = class { constructor() { this.p = Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })); } play() { return this.p; } };
  const b = setup({ Audio: FakeBlocked });
  b.SA.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  const d = counter();
  assert.equal(b.SA.audio.say('animal:rana', d.fn), 'clip');
  await new Promise((r) => setImmediate(r));
  assert.equal(d.n, 1);
  assert.equal(b.spoken.length, 0);

  const FakeBroken = class { play() { return Promise.reject(new Error('decode')); } };
  const f = setup({ Audio: FakeBroken });
  f.SA.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  const e = counter();
  f.SA.audio.say('animal:rana', e.fn);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.spoken.length, 1);
  assert.equal(e.n, 0);
  f.spoken[0].onend();
  assert.equal(e.n, 1);
});
