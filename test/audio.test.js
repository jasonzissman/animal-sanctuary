import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/save.js', 'game/audio.js', 'game/hud.js', 'game/ui/hud-place.js', 'game/audio-ui.js'];
const KEY = 'santuario_save_v1';

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

function param() {
  return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
}

/** A fake AudioContext that records what was created and started. */
function makeCtx(stats, state = 'running') {
  return class FakeCtx {
    constructor() {
      stats.created++;
      this.state = state;
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = {};
    }
    resume() { stats.resumed++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() {
      stats.nodes++;
      return { type: '', frequency: param(), connect() {}, start() { stats.started++; }, stop() {} };
    }
    createBufferSource() {
      stats.nodes++;
      return { buffer: null, connect() {}, start() { stats.started++; }, stop() {} };
    }
    createBiquadFilter() { return { type: '', frequency: param(), connect() {} }; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
}

function setup({ audio = true, storage = fakeStorage(), state } = {}) {
  const stats = { created: 0, resumed: 0, nodes: 0, started: 0 };
  const listeners = {};
  const globals = {
    localStorage: storage,
    addEventListener: (n, f) => (listeners[n] = f),
    removeEventListener: (n) => delete listeners[n],
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  if (audio) globals.AudioContext = makeCtx(stats, state);
  const SA = loadGame(FILES, globals);
  return { SA, stats, storage, listeners };
}

test('before the first gesture nothing plays and nothing is created', () => {
  const { SA, stats } = setup();
  assert.equal(SA.audio.sfx('chime'), false);
  assert.equal(stats.created, 0);
  assert.equal(SA.audio.isUnlocked(), false);
});

test('after unlock all 6 named effects play; unknown names do not', () => {
  const { SA, stats } = setup();
  assert.deepEqual([...SA.audio.NAMES].sort(), ['boing', 'chime', 'chirp', 'fanfare', 'giggle', 'hop', 'ouch', 'pop', 'shutter', 'sparkle', 'splash']);
  assert.equal(SA.audio.unlock(), true);
  assert.equal(SA.audio.unlock(), true);
  assert.equal(stats.created, 1, 'context created once');
  SA.audio.NAMES.forEach((n) => {
    const before = stats.started;
    assert.equal(SA.audio.sfx(n), true, n);
    assert.ok(stats.started > before, n + ' started voices');
  });
  assert.equal(SA.audio.sfx('nope'), false);
  assert.equal(SA.audio.sfx('toString'), false);
});

test('a suspended context is resumed on unlock', () => {
  const { SA, stats } = setup({ state: 'suspended' });
  SA.audio.unlock();
  assert.equal(stats.resumed, 1);
});

test('muting silences sfx and persists in the save settings and across reloads', () => {
  const storage = fakeStorage();
  const a = setup({ storage });
  a.SA.audio.unlock();
  assert.equal(a.SA.audio.isMuted(), false);
  assert.equal(a.SA.audio.toggleMute(), true);
  const before = a.stats.started;
  assert.equal(a.SA.audio.sfx('pop'), false);
  assert.equal(a.stats.started, before);
  a.SA.save.flush();
  assert.equal(JSON.parse(storage._m.get(KEY)).settings.muted, true);

  const b = setup({ storage });
  assert.equal(b.SA.audio.isMuted(), true);
  b.SA.audio.unlock();
  assert.equal(b.SA.audio.sfx('chime'), false);
  assert.equal(b.SA.audio.setMuted(false), false);
  assert.equal(b.SA.audio.sfx('chime'), true);
});

test('a missing AudioContext is a silent no-op', () => {
  const { SA, listeners } = setup({ audio: false });
  assert.equal(SA.audio.isAvailable(), false);
  assert.equal(SA.audio.unlock(), false);
  assert.equal(SA.audio.sfx('chime'), false);
  assert.equal(SA.audio.isUnlocked(), false);
  assert.equal(SA.audio.toggleMute(), true);
  assert.doesNotThrow(() => SA.audioUI.mount(undefined));
  assert.ok(listeners.pointerdown, 'gesture hooks still registered');
});

test('a throwing AudioContext constructor disables audio quietly', () => {
  const stats = { created: 0 };
  const SA = loadGame(FILES, {
    localStorage: fakeStorage(),
    AudioContext: function () { stats.created++; throw new Error('blocked'); },
  });
  assert.equal(SA.audio.unlock(), false);
  assert.equal(SA.audio.isAvailable(), false);
  assert.equal(SA.audio.unlock(), false);
  assert.equal(stats.created, 1);
  assert.equal(SA.audio.sfx('pop'), false);
});

test('a throwing node graph makes sfx return false instead of throwing', () => {
  const { SA } = setup();
  SA.audio.unlock();
  // Break the context after creation by making the oscillator factory throw.
  const Broken = class { constructor() { this.state = 'running'; this.sampleRate = 8000; this.currentTime = 0; }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() { throw new Error('boom'); } };
  const SA2 = loadGame(FILES, { localStorage: fakeStorage(), AudioContext: Broken });
  SA2.audio.unlock();
  assert.equal(SA2.audio.sfx('chime'), false);
});

function fakeDoc() {
  const made = [];
  return {
    made,
    body: { children: [], appendChild(c) { this.children.push(c); } },
    createElement() {
      const el = { style: {}, attrs: {}, handlers: {}, textContent: '',
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(n, f) { this.handlers[n] = f; } };
      made.push(el);
      return el;
    },
  };
}

test('mute button is mounted, reflects state, toggles and persists', () => {
  const { SA, storage } = setup();
  const doc = fakeDoc();
  const btn = SA.audioUI.mount(doc);
  assert.equal(doc.body.children[0], btn);
  assert.equal(btn.id, 'mute-btn');
  assert.equal(btn.attrs['aria-pressed'], 'false');
  assert.equal(btn.textContent, '🔊');
  assert.ok(parseInt(btn.style.width, 10) >= 56, 'big target');
  btn.handlers.click();
  assert.equal(btn.attrs['aria-pressed'], 'true');
  assert.equal(btn.textContent, '🔇');
  assert.equal(SA.audio.isMuted(), true);
  SA.save.flush();
  assert.equal(JSON.parse(storage._m.get(KEY)).settings.muted, true);
  btn.handlers.click();
  assert.equal(btn.textContent, '🔊');
});

test('mount reads a persisted muted flag and falls back to <body> without a target', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ version: 1, settings: { muted: true } }) });
  const { SA } = setup({ storage });
  const btn = SA.audioUI.mount(fakeDoc());
  assert.equal(btn.attrs['aria-pressed'], 'true');
});

test('the first gesture unlocks audio exactly once and removes the hooks', () => {
  const { SA, stats, listeners } = setup();
  SA.audioUI.mount(undefined);
  assert.equal(SA.audio.isUnlocked(), false);
  listeners.pointerdown();
  assert.equal(SA.audio.isUnlocked(), true);
  assert.equal(stats.created, 1);
  assert.equal(listeners.pointerdown, undefined, 'listener removed');
  assert.equal(SA.audio.sfx('sparkle'), true);
});

test('hookGestures ignores targets without addEventListener', () => {
  const { SA } = setup();
  assert.doesNotThrow(() => SA.audioUI.hookGestures(null));
  assert.doesNotThrow(() => SA.audioUI.hookGestures({}));
});
