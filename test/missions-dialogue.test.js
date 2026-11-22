import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/data/missions.js', 'game/missions.js', 'game/missions-dialogue.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));

const row = (n, lines = 3) => ({ id: 'm' + n, n, es: 'Misión ' + n, en: 'Mission ' + n, icon: '⭐',
  intro: { es: 'Línea ' + lines + '.', icon: '🙂' },
  steps: [{ kind: 'find' }], reward: { stars: 1 } });

function setup(count = 3) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const rows = Array.from({ length: count }, (_, i) => row(i + 1));
  const missions = SA.missions.create({ missions: rows, track: () => {} });
  const dlg = SA.missionsDialogue.create({ missions: rows });
  const finish = (id) => { missions.start(id); missions.complete(); };
  return { SA, rows, missions, dlg, finish };
}

test('the shipped missions have ONE intro line of at most 4 words, with a picture', () => {
  const SA = loadGame(FILES);
  const all = SA.data.all('missions');
  assert.ok(all.length >= 1);
  for (const m of all) {
    assert.equal(Array.isArray(m.intro), false, m.id);
    assert.ok(m.intro.es.split(/\s+/).length <= 4, m.intro.es);
    assert.ok(m.intro.icon);
    assert.ok(m.intro.en, 'English toggle text');
  }
  assert.equal(all[0].intro.es, '¡Ayuda al cerdito!');
});

test('begin -> view is one card with the start button only (no next step)', () => {
  const { SA, rows } = setup();
  const D = SA.missionsDialogue;
  const v = D.view(D.begin(rows[0]));
  assert.deepEqual(plain(v), { id: 'm1', title: 'Misión 1', icon: '⭐', line: { es: 'Línea 3.', icon: '🙂' }, button: 'start', label: '¡Vamos!' });
  assert.equal(D.advance, undefined);
  assert.equal(D.SIGUIENTE, undefined);
  assert.equal(D.EMPEZAR, undefined);
});

test('a row without a line (or no row) has no talk', () => {
  const { SA } = setup();
  assert.equal(SA.missionsDialogue.begin({ id: 'x', intro: [] }), null);
  assert.equal(SA.missionsDialogue.begin({ id: 'x' }), null);
  assert.equal(SA.missionsDialogue.begin(null), null);
  assert.equal(SA.missionsDialogue.view(null), null);
});

test('no start or finish prompt in the game steps through lines with Siguiente', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.name === 'vendor' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
  for (const f of walk('game')) assert.doesNotMatch(fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /Siguiente/, f);
});

test('nothing to celebrate on a fresh save', () => {
  assert.equal(setup().dlg.celebration(), null);
});

test('the celebration names the card that unlocked, and plays once', () => {
  const { dlg, finish, SA } = setup();
  finish('m1');
  const c = dlg.celebration();
  assert.deepEqual(plain(c), { id: 'm1', unlockedId: 'm2', icon: '⭐', lines: ['¡Lo lograste!', '¡Nueva misión!'], sfx: 'fanfare' });
  dlg.markSeen();
  assert.equal(dlg.celebration(), null);
  assert.deepEqual(plain(SA.save.get().missions.celebrated), ['m1']);
  finish('m1');   // a replay never celebrates again
  assert.equal(dlg.celebration(), null);
  finish('m2');
  assert.equal(dlg.celebration().id, 'm2');
  assert.equal(dlg.celebration().unlockedId, 'm3');
});

test('finishing several before a visit celebrates the latest once; the last mission has nothing new to point at', () => {
  const { dlg, finish } = setup(2);
  finish('m1'); finish('m2');
  const c = dlg.celebration();
  assert.equal(c.id, 'm2');
  assert.equal(c.unlockedId, null);
  assert.deepEqual(plain(c.lines), ['¡Lo lograste!']);
  dlg.markSeen();
  assert.equal(dlg.celebration(), null);
});

test('the celebrated list survives the save round trip and is cleaned on load', () => {
  const { SA, dlg, finish } = setup();
  finish('m1');
  dlg.markSeen();
  SA.save.update({ missions: { celebrated: ['m1', 'm1', 'BAD ID', 3] } });
  assert.deepEqual(plain(SA.save.get().missions.celebrated), ['m1']);
  assert.deepEqual(plain(SA.save.get().missions.done), ['m1'], 'progress is untouched');
});
