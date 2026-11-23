import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/data/vocab.js', 'game/photo.js', 'game/data/step-kinds.js',
  'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/mission-runtime.js', 'game/map.js', 'game/station.js', 'game/npc.js', 'game/proofs.js',
  'game/ui/scientist-cheer.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));
const line = (es, icon) => ({ es, icon });
const ROWS = [
  { id: 'a', n: 1, es: 'Uno', en: 'One', icon: '1️⃣', reward: { stars: 1 }, steps: [{ kind: 'photo', line: line('Foto', '📷') }] },
  { id: 'b', n: 2, es: 'Dos', en: 'Two', icon: '2️⃣', reward: { stars: 1 }, steps: [{ kind: 'find', target: 'cerdo', line: line('Busca', '🔍') }] },
  { id: 'c', n: 3, es: 'Tres', en: 'Three', icon: '3️⃣', reward: { stars: 1 }, steps: [{ kind: 'photo', line: line('Foto', '📷') }] },
];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [];
  const track = (t, f) => tracked.push([t, f]);
  const missions = SA.missions.create({ missions: ROWS, track: () => {} });
  const proofs = SA.proofs.create({ missions, track, now: () => new Date('2026-03-04T10:00:00Z') });
  const rt = SA.missionRuntime.create({ missions, proofs, celebrate: () => {}, track: () => {} });
  return { SA, missions, proofs, rt, tracked };
}

test('record stores a rescue proof as sent and not celebrated; it is idempotent by key and rejects junk', () => {
  const { SA, proofs, tracked } = setup();
  assert.deepEqual(plain(proofs.list()), []);
  const r = proofs.record({ kind: 'rescue', animalId: 'conejo' });
  assert.equal(r.added, true);
  assert.deepEqual(plain(SA.save.get().proofs), [{ id: 'rescue:conejo:1', kind: 'rescue', celebrated: false, date: '2026-03-04', animalId: 'conejo' }]);
  assert.deepEqual(plain(tracked[0]), ['station.proof_sent', { kind: 'rescue', animalId: 'conejo' }]);
  assert.equal(proofs.record({ kind: 'rescue', animalId: 'conejo' }).proof.id, 'rescue:conejo:2', 'a second rescue is a new proof');
  assert.equal(proofs.record({ kind: 'mission', missionId: 'a', key: 'mission:a:x' }).added, true);
  assert.equal(proofs.record({ kind: 'mission', missionId: 'a', key: 'mission:a:x' }).added, false);
  for (const bad of [null, 5, {}, { kind: 'rescue' }, { kind: 'other', animalId: 'x' }, { kind: 'rescue', animalId: 'Bad Id' }]) {
    assert.equal(proofs.record(bad).added, false);
  }
  assert.equal(proofs.list().length, 3);
  assert.equal(proofs.pending().length, 3);
});

test('cheer: one proof at a time, oldest first, never the same proof twice', () => {
  const { SA, proofs, tracked } = setup();
  assert.equal(proofs.cheer(), null, 'nothing to cheer');
  proofs.record({ kind: 'rescue', animalId: 'conejo' });
  proofs.record({ kind: 'rescue', animalId: 'pato' });
  const c1 = proofs.cheer();
  assert.equal(c1.es, '¡Gracias! Está bien.');
  assert.equal(c1.key, 'phrase:graciasbien');
  assert.equal(c1.en, 'Thank you! It is OK.');
  assert.equal(c1.proof.animalId, 'conejo');
  assert.equal(c1.point, null, 'a rescue proof points at nothing');
  assert.deepEqual(plain(SA.save.get().proofs.map((p) => p.celebrated)), [true, false], 'marked at once');
  assert.equal(proofs.cheer().proof.animalId, 'pato');
  assert.equal(proofs.cheer(), null, 'never again');
  assert.equal(tracked.filter(([t]) => t === 'station.proof_cheer').length, 2);
  assert.deepEqual(plain(tracked.filter(([t]) => t === 'station.proof_cheer')[0][1]), { kind: 'rescue', animalId: 'conejo', point: '' });
  assert.ok(SA.vocab.get('phrase:graciasbien') && SA.vocab.get('phrase:nuevamision'), 'voice keys exist');
});

test('a mission proof points at the newly unlocked mission on the board', () => {
  const { SA, missions, proofs, rt, tracked } = setup();
  missions.start('a');
  const res = rt.report({ type: 'photo' });
  assert.equal(res.status, 'complete');
  assert.deepEqual(plain(SA.save.get().proofs.map((p) => [p.kind, p.missionId, p.celebrated])), [['mission', 'a', false]]);
  const c = proofs.cheer();
  assert.deepEqual(plain(c.point), { id: 'b', n: 2, icon: '2️⃣', es: '¡Nueva misión!', key: 'phrase:nuevamision' });
  assert.equal(plain(tracked.find(([t]) => t === 'station.proof_cheer')[1]).point, 'b');
  assert.equal(proofs.cheer(), null);
});

test('finishing by a non-photo step is no proof; a replay is a new proof but unlocks (and points at) nothing', () => {
  const { missions, proofs, rt } = setup();
  missions.start('a'); rt.report({ type: 'photo' });
  missions.start('b'); assert.equal(rt.report({ type: 'found', target: 'cerdo' }).status, 'complete');
  assert.equal(proofs.list().length, 1, 'finishing by find is not a photo proof');
  proofs.cheer();
  missions.start('a'); rt.report({ type: 'photo' });          // replay of a finished mission: opens nothing new
  assert.equal(proofs.list().length, 2);
  const c = proofs.cheer();
  assert.equal(c.proof.missionId, 'a');
  assert.equal(c.point, null, 'b was already done: the replay opens nothing new, so she points at nothing');
});

function fakeDoc() {
  const mk = () => ({ children: [], style: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); } });
  return { createElement: mk, body: mk() };
}

test('the cheer bubble shows when the kid is near the scientist, speaks once, and waits while a card is open', () => {
  const { SA, proofs } = setup();
  const said = [], sfx = [];
  SA.audio = { say: (k, done) => { said.push(k); if (done) done(); }, sfx: (n) => sfx.push(n) };
  SA.proofs = proofs;
  const sci = SA.npc.scientist();
  const doc = fakeDoc();
  let player = { x: sci.x + 30, z: sci.z }, paused = false;
  const view = SA.scientistCheer.create(doc, { player: () => player, paused: () => paused });
  proofs.record({ kind: 'mission', missionId: 'a' });
  assert.equal(view.update(0.1), false, 'far away: nothing');
  player = { x: sci.x, z: sci.z + 2 };
  paused = true;
  assert.equal(view.update(0.1), false, 'a card is open: she waits');
  paused = false;
  assert.equal(view.update(0.1), true);
  assert.deepEqual(said, ['phrase:graciasbien']);
  assert.ok(sfx.includes('chime'));
  assert.equal(view.isShowing(), true);
  assert.equal(proofs.pending().length, 0);
  const el = view.element;
  assert.equal(el.style.display, 'flex');
  assert.match(view.bubble.children[0].textContent, /¡Gracias! Está bien\./);
  for (let i = 0; i < 40; i++) view.update(0.25);
  assert.equal(view.isShowing(), false);
  assert.equal(el.style.display, 'none');
  assert.equal(view.update(0.1), false, 'no proof left: no second cheer');
  assert.deepEqual(said, ['phrase:graciasbien']);
});

test('the bubble points at the unlocked mission with a second spoken line, and is inert without a DOM', () => {
  const { SA, missions, proofs, rt } = setup();
  const said = [];
  SA.audio = { say: (k, done) => { said.push(k); if (done) done(); } };
  SA.proofs = proofs;
  SA.missions = missions;
  missions.start('a'); rt.report({ type: 'photo' });
  const sci = SA.npc.scientist();
  const view = SA.scientistCheer.create(fakeDoc(), { player: () => ({ x: sci.x, z: sci.z + 1 }) });
  assert.equal(view.update(0.1), true);
  assert.deepEqual(said, ['phrase:graciasbien', 'phrase:nuevamision']);
  assert.equal(view.bubble.children.length, 2);
  assert.match(view.bubble.children[1].textContent, /2️⃣ ¡Nueva misión!/);
  const none = SA.scientistCheer.create(null);
  assert.equal(none.update(1), false);
  assert.equal(none.isShowing(), false);
});

test('save migration: v5 saves keep everything and have no proofs; proofs normalize on load', () => {
  const SA = loadGame(['game/sa.js', 'game/save.js']);
  const old = { version: 5, stars: 9, album: { conejo: { date: '2026-01-02', pics: [] } }, missions: { done: ['mama'], active: null }, extra: 'keep' };
  const m = plain(SA.save.migrate(old));
  assert.equal(m.version, 6);
  assert.equal(m.stars, 9);
  assert.equal(m.extra, 'keep');
  assert.deepEqual(m.album, old.album);
  assert.deepEqual(m.missions, old.missions);
  assert.equal(m.proofs, undefined, 'absent means empty');
  const rows = [
    { id: 'rescue:1', kind: 'rescue', animalId: 'conejo', date: '2026-02-03', celebrated: true },
    { id: 'rescue:1', kind: 'rescue', animalId: 'pato' },
    { id: 'm:mama', kind: 'mission', missionId: 'mama', celebrated: 'yes' },
    { id: 'x', kind: 'weird' }, { id: 'BAD ID', kind: 'rescue' }, 7, null,
  ];
  assert.deepEqual(plain(SA.save.migrate({ version: 5, proofs: rows }).proofs), [
    { id: 'rescue:1', kind: 'rescue', celebrated: true, animalId: 'conejo', date: '2026-02-03' },
    { id: 'm:mama', kind: 'mission', celebrated: false, missionId: 'mama' },
  ]);
  const many = Array.from({ length: 130 }, (_, i) => ({ id: 'r:' + i, kind: 'rescue', animalId: 'pato' }));
  const t = plain(SA.save.migrate({ version: 6, proofs: many }).proofs);
  assert.equal(t.length, 100);
  assert.equal(t[99].id, 'r:129');
  assert.deepEqual(plain(SA.save.migrate({ version: 6, proofs: 'nope' }).proofs), []);
});
