import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/reach.js'];

test('vocab registers phrase:acercate with es and en text', () => {
  const SA = loadGame(FILES);
  const e = SA.vocab.get('phrase:acercate');
  assert.ok(e);
  assert.equal(e.es, '¡Acércate!');
  assert.equal(e.en, 'Come closer!');
  assert.equal(e.clip, null);
  assert.equal(SA.reach.CUE_KEY, 'phrase:acercate');
  assert.equal(SA.reach.cue().es, e.es);
});

test('vocab validation rejects a blank en', () => {
  const SA = loadGame(FILES);
  assert.throws(() => SA.data.register('vocab', [{ id: 'phrase:x', key: 'phrase:x', es: 'x', en: '', clip: null }]), /en/);
});

test('the reach cue speaks once per appearance, not on every call', () => {
  const SA = loadGame(FILES);
  const said = [];
  SA.audio = { say: (k) => said.push(k) };
  assert.equal(SA.reach.speakCue(1000), true);
  assert.equal(SA.reach.speakCue(1016), false);     // next frame
  assert.equal(SA.reach.speakCue(2000), false);     // bubble still up
  assert.deepEqual(said, ['phrase:acercate']);
  assert.equal(SA.reach.speakCue(1000 + SA.reach.CUE_MS), true);   // a new appearance
  assert.deepEqual(said, ['phrase:acercate', 'phrase:acercate']);
});

test('speakCue is safe without SA.audio or when speech throws', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.reach.speakCue(0), true);
  SA.audio = { say: () => { throw new Error('boom'); } };
  assert.doesNotThrow(() => SA.reach.speakCue(5000));
});
