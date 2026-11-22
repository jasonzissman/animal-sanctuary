import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/data/missions.js', 'game/missions.js', 'game/missions-dialogue.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));

const row = (n, lines = 3) => ({ id: 'm' + n, n, es: 'Misión ' + n, en: 'Mission ' + n, icon: '⭐',
  intro: Array.from({ length: lines }, (_, i) => ({ es: 'Línea ' + (i + 1) + '.', icon: '🙂' })),
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

test('the shipped missions have 2-3 short intro lines, each with a picture', () => {
  const SA = loadGame(FILES);
  const all = SA.data.all('missions');
  assert.ok(all.length >= 1);
  for (const m of all) {
    assert.ok(m.intro.length >= 2 && m.intro.length <= 3, m.id);
    for (const l of m.intro) {
      assert.ok(l.es.split(/\s+/).length <= 6, l.es);
      assert.ok(l.icon);
    }
  }
});

test('begin / view / advance walk the lines and end on a start button', () => {
  const { SA, rows } = setup();
  const D = SA.missionsDialogue;
  let s = D.begin(rows[0]);
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const v = D.view(s);
    seen.push([v.index, v.line.es, v.button, v.label, v.last]);
    s = D.advance(s);
  }
  assert.deepEqual(seen.slice(0, 3), [
    [0, 'Línea 1.', 'next', 'Siguiente', false],
    [1, 'Línea 2.', 'next', 'Siguiente', false],
    [2, 'Línea 3.', 'start', 'Empezar', true]]);
  assert.equal(seen[4][0], 2, 'stays on the last line');
  assert.equal(D.view(D.begin(rows[0])).total, 3);
});

test('a row without lines (or no row) has no talk', () => {
  const { SA } = setup();
  assert.equal(SA.missionsDialogue.begin({ id: 'x', intro: [] }), null);
  assert.equal(SA.missionsDialogue.begin(null), null);
  assert.equal(SA.missionsDialogue.view(null), null);
  assert.equal(SA.missionsDialogue.advance(null), null);
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
