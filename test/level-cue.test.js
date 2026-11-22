import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/level-cue.js', 'game/ui/prompt.js'];

test('cueFor maps up/down/null (and junk) to cue ids', () => {
  const { cueFor, sfxFor } = loadGame(FILES).levelCue;
  assert.equal(cueFor('up'), 'star-burst');
  assert.equal(cueFor('down'), 'soft-sparkle');
  for (const v of [null, undefined, '', 'sideways', 0, {}]) assert.equal(cueFor(v), null);
  assert.equal(sfxFor('star-burst'), 'fanfare');
  assert.equal(sfxFor('soft-sparkle'), null);
  assert.equal(sfxFor('toString'), null);
  assert.equal(sfxFor(null), null);
});

function setup(levelChange, withAudio = true) {
  const SA = loadGame(FILES);
  const sfx = [], cues = [];
  SA.audio = withAudio ? { sfx: (n) => sfx.push(n), say() {} } : undefined;
  const view = new Proxy({ levelCue: (c) => cues.push(c) }, { get: (t, k) => t[k] || (() => {}) });
  const r = { done: false, clue: { text: 'x' }, answerId: 'a' };
  const game = { start: () => r, current: () => r, pick: () => ({ status: 'wrong', levelChange }), hint() {} };
  const ctl = SA.prompt.createController({ game, view, fx: null, later: () => {} });
  return { SA, ctl, sfx, cues };
}

test('level up shows the star burst with a happy sound; down is a silent sparkle; null shows nothing', () => {
  let s = setup('up');
  s.ctl.onPick({ animalId: 'b', part: 'cola' });
  assert.deepEqual(s.cues, ['star-burst']);
  assert.ok(s.sfx.includes('fanfare'));

  s = setup('down');
  s.ctl.onPick({ animalId: 'b', part: 'cola' });
  assert.deepEqual(s.cues, ['soft-sparkle']);
  assert.ok(!s.sfx.includes('fanfare'));

  s = setup(null);
  s.ctl.onPick({ animalId: 'b', part: 'cola' });
  assert.deepEqual(s.cues, []);
});

test('no SA.audio: the cue is still drawn and nothing throws', () => {
  const s = setup('up', false);
  assert.doesNotThrow(() => s.ctl.onPick({ animalId: 'b', part: 'cola' }));
  assert.deepEqual(s.cues, ['star-burst']);
});

test('a view without levelCue, or one that throws, never breaks a pick', () => {
  const SA = loadGame(FILES);
  const r = { done: false, clue: { text: 'x' }, answerId: 'a' };
  const game = { start: () => r, current: () => r, pick: () => ({ status: 'wrong', levelChange: 'up' }) };
  const quiet = new Proxy({}, { get: (t, k) => (k === 'levelCue' ? undefined : () => {}) });
  assert.doesNotThrow(() => SA.prompt.createController({ game, view: quiet, later: () => {} }).onPick({}));
  const boom = new Proxy({}, { get: (t, k) => (k === 'levelCue' ? () => { throw new Error('x'); } : () => {}) });
  assert.doesNotThrow(() => SA.prompt.createController({ game, view: boom, later: () => {} }).onPick({}));
});

test('the DOM-less view has a levelCue no-op, and index.html/manifest load level-cue.js before prompt.js', async () => {
  const SA = loadGame(FILES);
  assert.doesNotThrow(() => SA.prompt.createView(null).levelCue('star-burst'));
  for (const f of ['index.html', 'game/manifest.js']) {
    const src = await readFile(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(src.indexOf('game/level-cue.js') > 0 && src.indexOf('game/level-cue.js') < src.indexOf('game/ui/prompt.js'), f);
  }
});
