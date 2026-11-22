import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { loadGame } from './helpers/vm.js';
import {
  clipName, parseVoices, pickVoice, renderClipsJs, loadManifest, generate, CLIPS_FILE, isCoreKey, MANIFEST_FILES
} from '../scripts/voices.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VOICE_LIST = [
  'Alice               it_IT    # Salve, mi chiamo Alice.',
  'Eddy (Spanish (Mexico))  es_MX    # Hola, me llamo Eddy.',
  'Mónica              es_ES    # Hola, me llamo Mónica.',
  'Paulina             es_MX    # Hola, me llamo Paulina.',
  'Samantha            en_US    # Hello, my name is Samantha.'
].join('\n');

/** Fake `say`/`afconvert`: records calls and writes the output file like the real tools. */
function fakeExec({ voices = VOICE_LIST, failAac = false } = {}) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'say' && args[0] === '-v' && args[1] === '?') return voices;
    if (cmd === 'say') {
      if (failAac && args.includes('--data-format=aac')) throw new Error('unsupported format');
      fs.writeFileSync(args[args.indexOf('-o') + 1], 'AUDIO:' + args[args.length - 1]);
      return '';
    }
    if (cmd === 'afconvert') { fs.writeFileSync(args[args.length - 1], 'AAC'); return ''; }
    throw new Error('unexpected command ' + cmd);
  };
  return { exec, calls };
}

/** A temp project root with just the files the generator reads. */
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-voices-test-'));
  for (const f of MANIFEST_FILES) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(root, f));
  }
  return root;
}

test('clipName makes ascii, collision-free file names', () => {
  assert.equal(clipName('part:orejas'), 'part-orejas');
  assert.equal(clipName('size:pequeño'), 'size-pequeno');
  assert.equal(clipName('movement:camina lento'), 'movement-camina_lento');
  const names = loadManifest(ROOT).map((e) => clipName(e.key));
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((n) => /^[A-Za-z0-9_-]+$/.test(n)));
});

test('parseVoices / pickVoice prefer Paulina, then Mónica, then any Spanish voice', () => {
  const voices = parseVoices(VOICE_LIST);
  assert.equal(voices.length, 5);
  assert.deepEqual(voices[1], { name: 'Eddy (Spanish (Mexico))', locale: 'es_MX' });
  assert.equal(pickVoice(voices), 'Paulina');
  assert.equal(pickVoice(voices.filter((v) => v.name !== 'Paulina')), 'Mónica');
  assert.equal(pickVoice(voices.filter((v) => !['Paulina', 'Mónica'].includes(v.name))), 'Eddy (Spanish (Mexico))');
  assert.equal(pickVoice(voices.filter((v) => v.locale === 'es_ES' && v.name !== 'Mónica')), null);
  assert.equal(pickVoice(parseVoices('Monica   es_ES  # hi')), 'Monica');
});

test('generate renders every manifest entry with say and writes voice-clips.js', () => {
  const root = tempRoot();
  const { exec, calls } = fakeExec();
  const r = generate({ root, exec });
  const manifest = loadManifest(root);
  assert.equal(r.voice, 'Paulina');
  assert.equal(r.rendered, manifest.length);
  assert.equal(r.failed.length, 0);
  const sayCalls = calls.filter((c) => c[0] === 'say' && c[1] === '-v' && c[2] === 'Paulina');
  assert.equal(sayCalls.length, manifest.length);
  assert.ok(sayCalls.every((c) => c.includes('--data-format=aac')));
  const rana = sayCalls.find((c) => c[c.length - 1] === 'la rana');
  assert.ok(rana, 'speaks the Spanish text of the entry');
  assert.ok(fs.existsSync(path.join(root, 'assets/voice/animal-rana.m4a')));
  assert.ok(!fs.readdirSync(path.join(root, 'assets/voice')).some((f) => f.includes('.part')));

  // The generated file maps keys to paths and, when run in a game context, sets entry.clip.
  const js = fs.readFileSync(path.join(root, CLIPS_FILE), 'utf8');
  assert.equal(Object.keys(r.clips).length, manifest.length);
  assert.match(js, /"animal:rana": "assets\/voice\/animal-rana\.m4a"/);
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/vocab.js']);
  const ctx = { SA, window: null, console };
  ctx.window = ctx;
  vm.runInNewContext(js, ctx);
  assert.equal(SA.vocab.get('animal:rana').clip, 'assets/voice/animal-rana.m4a');
  assert.equal(SA.vocab.get('size:pequeño').clip, 'assets/voice/size-pequeno.m4a');
});

test('generate is idempotent: skips existing clips unless --force', () => {
  const root = tempRoot();
  generate({ root, exec: fakeExec().exec });
  const first = fs.readFileSync(path.join(root, CLIPS_FILE), 'utf8');

  const again = fakeExec();
  const r = generate({ root, exec: again.exec });
  assert.equal(r.rendered, 0);
  assert.equal(r.skipped, loadManifest(root).length);
  assert.deepEqual(again.calls, [], 'no say/afconvert calls at all when nothing is missing');
  assert.equal(fs.readFileSync(path.join(root, CLIPS_FILE), 'utf8'), first);

  fs.rmSync(path.join(root, 'assets/voice/animal-rana.m4a'));
  const partial = fakeExec();
  const r2 = generate({ root, exec: partial.exec });
  assert.equal(r2.rendered, 1);
  assert.equal(partial.calls.filter((c) => c[0] === 'say' && c[1] === '-v' && c[2] !== '?').length, 1);

  const forced = fakeExec();
  const r3 = generate({ root, exec: forced.exec, force: true });
  assert.equal(r3.rendered, loadManifest(root).length);
  assert.equal(fs.readFileSync(path.join(root, CLIPS_FILE), 'utf8'), first);
});

test('every feed vocab key (number:un/una, phrase:y, foodsg:*, foodpl:*) is in the core voice key list', () => {
  const keys = loadManifest(ROOT).map((e) => e.key);
  const feed = keys.filter((k) => /^(foodsg|foodpl):/.test(k));
  assert.ok(feed.length >= 18, 'food keys come from game/data/foods.js');
  const wanted = ['number:un', 'number:una', 'phrase:y', ...feed];
  const planned = generate({ root: ROOT, exec: () => { throw new Error('must not run'); }, listOnly: true, core: true });
  for (const k of wanted) {
    assert.ok(keys.includes(k), k + ' is in the manifest');
    assert.ok(isCoreKey(k), k + ' is a core key');
    assert.ok(planned.clips[k], k + ' is planned');
  }
  assert.ok(!isCoreKey('number:3'));
});

test('generate falls back to aiff + afconvert when say cannot write AAC', () => {
  const root = tempRoot();
  const { exec, calls } = fakeExec({ failAac: true });
  const r = generate({ root, exec, core: true });
  assert.equal(r.failed.length, 0);
  assert.ok(calls.some((c) => c[0] === 'afconvert' && c.includes('m4af') && c.includes('aac')));
  assert.ok(fs.existsSync(path.join(root, 'assets/voice/part-cola.m4a')));
  assert.ok(!fs.readdirSync(os.tmpdir()).some((f) => f.startsWith('sa-voices-') && fs.existsSync(path.join(os.tmpdir(), f, 'part-cola.aiff'))));
});

test('generate --core only renders core groups; --voice and listOnly work', () => {
  const root = tempRoot();
  const { exec, calls } = fakeExec();
  const r = generate({ root, exec, core: true, voice: 'Mónica' });
  assert.equal(r.voice, 'Mónica');
  assert.ok(Object.keys(r.clips).length > 10);
  assert.ok(Object.keys(r.clips).every(isCoreKey));
  assert.ok(!calls.some((c) => c[1] === '?'), 'explicit voice skips the voice lookup');

  const planned = generate({ root: tempRoot(), exec: () => { throw new Error('must not run'); }, listOnly: true });
  assert.equal(Object.keys(planned.clips).length, loadManifest(root).length);
});

test('generate --core prunes non-core clips left by a full run', () => {
  const root = tempRoot();
  const { exec } = fakeExec();
  const full = generate({ root, exec });
  const nonCore = Object.keys(full.clips).filter((k) => !isCoreKey(k));
  assert.ok(nonCore.length > 0);
  const r = generate({ root, exec, core: true });
  assert.equal(r.rendered, 0);
  assert.ok(Object.keys(r.clips).every(isCoreKey));
  for (const k of nonCore) assert.ok(!fs.existsSync(path.join(root, full.clips[k])), k + ' pruned');
});

test('generate reports failed clips, and errors without a Spanish voice', () => {
  const root = tempRoot();
  const exec = (cmd, args) => {
    if (args[1] === '?') return VOICE_LIST;
    throw new Error('say crashed');
  };
  const r = generate({ root, exec, core: true });
  assert.equal(r.rendered, 0);
  assert.ok(r.failed.length > 10);
  assert.equal(Object.keys(r.clips).length, 0);
  assert.throws(() => generate({ root: tempRoot(), exec: () => 'Samantha en_US # hi' }), /no Spanish voice/);
});

test('renderClipsJs is deterministic and valid for an empty map', () => {
  assert.equal(renderClipsJs({}), renderClipsJs({}));
  assert.match(renderClipsJs({}), /applyClips\(\{\}\)/);
  assert.equal(fs.readFileSync(path.join(ROOT, CLIPS_FILE), 'utf8').startsWith('/* GENERATED by scripts/voices.js'), true);
});

test('committed voice-clips.js only names real vocab keys and existing clip files', () => {
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/vocab.js']);
  let applied = null;
  const orig = SA.vocab.applyClips;
  SA.vocab.applyClips = (m) => { applied = m; return orig(m); };
  const ctx = { SA, console };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, CLIPS_FILE), 'utf8'), ctx);
  for (const [key, p] of Object.entries(applied)) {
    assert.ok(SA.vocab.get(key), key);
    assert.ok(fs.existsSync(path.join(ROOT, p)), p);
  }
});

test('SA.vocab.applyClips sets clips, ignores unknown keys, and say() then plays the clip', () => {
  const spoken = [];
  const played = [];
  const SA = loadGame(
    ['game/sa.js', 'game/save.js', 'game/data-registry.js', 'game/data/vocab.js', 'game/audio.js', 'game/speech.js'],
    {
      Audio: class { constructor(p) { played.push(p); } play() { return Promise.resolve(); } },
      speechSynthesis: { getVoices: () => [], speak: (u) => spoken.push(u.text), cancel() {} },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } }
    }
  );
  assert.equal(SA.vocab.applyClips({ 'animal:rana': 'assets/voice/animal-rana.m4a', 'nope:x': 'a.m4a', 'animal:pato': 3 }), 1);
  assert.equal(SA.vocab.applyClips(null), 0);
  assert.equal(SA.audio.say('animal:rana'), 'clip');
  assert.deepEqual(played, ['assets/voice/animal-rana.m4a']);
  assert.equal(SA.audio.say('animal:pato'), 'speech');
  assert.deepEqual(spoken, ['el pato']);
});

test('a clip that fails to load falls back to speech; blocked autoplay does not', async () => {
  const spoken = [];
  const mk = (rejectWith) => loadGame(
    ['game/sa.js', 'game/save.js', 'game/data-registry.js', 'game/data/vocab.js', 'game/audio.js', 'game/speech.js'],
    {
      Audio: class { play() { return Promise.reject(rejectWith); } },
      speechSynthesis: { getVoices: () => [], speak: (u) => spoken.push(u.text), cancel() {} },
      SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } }
    }
  );
  const SA = mk(Object.assign(new Error('missing'), { name: 'NotSupportedError' }));
  SA.vocab.applyClips({ 'animal:rana': 'assets/voice/animal-rana.m4a' });
  assert.equal(SA.audio.say('animal:rana'), 'clip');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(spoken, ['la rana']);

  const SA2 = mk(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  SA2.vocab.applyClips({ 'animal:rana': 'x.m4a' });
  SA2.audio.say('animal:rana');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(spoken, ['la rana']);
});
