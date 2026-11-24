import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/data/missions.js', 'game/missions.js'];

function row(n, extra = {}) {
  return { id: 'm' + n, n, es: 'Misión ' + n, en: 'Mission ' + n, icon: '⭐', intro: { es: 'Hola.', icon: '👋' },
    steps: [{ kind: 'find', line: { es: 'Busca', icon: '🔍' } }, { kind: 'photo', line: { es: 'Toma una foto', icon: '📷' } }], reward: { stars: n }, ...extra };
}

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const granted = [];
  const m = SA.missions.create({ missions: [row(3), row(1), row(2)], rng: () => 0.5,
    track: (t, f) => events.push({ t, ...f }), grant: (r) => granted.push(r), ...opts });
  return { SA, m, events, granted };
}

const plain = (o) => JSON.parse(JSON.stringify(o));
const statuses = (m) => m.list().map((r) => r.status);

test('missions are ordered by n and mission 1 is available from the start', () => {
  const { m } = setup();
  assert.deepEqual(m.list().map((r) => r.id), ['m1', 'm2', 'm3']);
  assert.deepEqual(statuses(m), ['available', 'locked', 'locked']);
  assert.equal(m.next().id, 'm1');
  assert.equal(m.status('nope'), null);
  assert.equal(m.comingSoon(), false);
});

test('missions unlock strictly in order, one after the previous is done', () => {
  const { m } = setup();
  assert.deepEqual(plain(m.start('m2')), { ok: false, reason: 'locked' });
  assert.deepEqual(plain(m.start('m3')), { ok: false, reason: 'locked' });
  assert.equal(m.start('m1').ok, true);
  assert.equal(m.advance().status, 'step');
  assert.equal(m.advance().status, 'complete');
  assert.deepEqual(statuses(m), ['done', 'available', 'locked']);
  assert.equal(m.start('m3').reason, 'locked');   // m3 still waits for m2
  m.start('m2'); m.advance(); m.advance();
  assert.deepEqual(statuses(m), ['done', 'done', 'available']);
  assert.equal(m.next().id, 'm3');
  m.start('m3'); m.advance(); m.advance();
  assert.equal(m.next(), null);
  assert.equal(m.comingSoon(), true);   // the list ends: "Próximamente"
});

test('start() refuses unknown ids and a failing station gate; nothing is saved', () => {
  let atStation = false;
  const { SA, m } = setup({ canStart: () => atStation });
  assert.equal(m.start('zzz').reason, 'unknown');
  assert.equal(m.start('m1').reason, 'not-at-station');
  assert.equal(SA.save.get().missions, undefined);
  atStation = true;
  assert.equal(m.start('m1').ok, true);
});

test('done missions can be replayed with a fresh seed and never re-grant the reward', () => {
  let r = 0.1;
  const { m, granted, events } = setup({ rng: () => r });
  const first = m.start('m1');
  assert.equal(first.replay, false);
  m.advance();
  const done = m.advance();
  assert.deepEqual(plain(done), { status: 'complete', id: 'm1', firstTime: true, reward: { stars: 1 } });
  assert.deepEqual(plain(granted), [{ stars: 1 }]);
  assert.equal(m.status('m1'), 'done');

  r = 0.9;
  const again = m.start('m1');
  assert.equal(again.ok, true);
  assert.equal(again.replay, true);
  assert.notEqual(again.seed, first.seed);
  assert.equal(m.status('m1'), 'active');
  m.advance();
  const rerun = m.advance();
  assert.deepEqual(plain(rerun), { status: 'complete', id: 'm1', firstTime: false, reward: null });
  assert.equal(granted.length, 1);
  assert.equal(m.status('m1'), 'done');
  assert.deepEqual(statuses(m), ['done', 'available', 'locked']);   // replaying changed nothing else
  assert.deepEqual(events.filter((e) => e.t === 'mission.complete').map((e) => e.replay), [false, true]);
});

test('only one mission is active at a time', () => {
  const { m } = setup();
  m.start('m1'); m.advance(); m.advance();
  assert.equal(m.start('m2').ok, true);
  assert.equal(m.start('m1').reason, 'busy');   // a replay waits too
  assert.equal(m.start('m2').reason, 'busy');
  assert.equal(m.active().id, 'm2');
});

test('progress is saved and restored by a fresh instance on the same save', () => {
  const { SA, m } = setup();
  const s = m.start('m1');
  m.advance();
  const restored = SA.missions.create({ missions: [row(1), row(2)] });
  const a = restored.active();
  assert.equal(a.id, 'm1');
  assert.equal(a.step, 1);
  assert.equal(a.seed, s.seed);
  assert.equal(a.replay, false);
  assert.deepEqual(plain(a.stepData), { kind: 'photo', line: { es: 'Toma una foto', icon: '📷' } });
  assert.deepEqual(JSON.parse(JSON.stringify(SA.save.get().missions)), { done: [], active: { id: 'm1', step: 1, seed: s.seed, replay: false } });
});

test('completed progress survives a save round trip through migrate()', () => {
  const { SA, m } = setup();
  m.start('m1'); m.advance(); m.advance();
  const saved = JSON.parse(JSON.stringify(SA.save.get()));
  const back = SA.save.migrate(saved);
  assert.deepEqual(plain(back.missions), { done: ['m1'], active: null, completions: 1 });
});

test('abandon() returns the mission to available (or done) without completing it', () => {
  const { m, granted, events } = setup();
  assert.deepEqual(plain(m.abandon()), { ok: false });
  m.start('m1');
  m.advance();
  assert.deepEqual(plain(m.abandon()), { ok: true, id: 'm1' });
  assert.equal(m.active(), null);
  assert.deepEqual(statuses(m), ['available', 'locked', 'locked']);
  assert.equal(granted.length, 0);
  assert.ok(events.some((e) => e.t === 'mission.abandon'));
  m.start('m1'); m.advance(); m.advance();
  m.start('m1');   // replay, then give up: still done
  m.abandon();
  assert.equal(m.status('m1'), 'done');
  assert.equal(m.start('m1').step, undefined);
  assert.equal(m.active().step, 0);   // restarts from step 0
});

test('advance/complete with nothing active do nothing', () => {
  const { m } = setup();
  assert.deepEqual(plain(m.advance()), { status: 'none' });
  assert.deepEqual(plain(m.complete()), { status: 'none' });
});

test('ids that left the list are ignored; bad saved data is normalised', () => {
  const { SA } = setup();
  SA.save.update({ missions: { done: ['m1', 'gone', 'm1', 'BAD'], active: { id: 'gone', step: 1 } } });
  assert.deepEqual(JSON.parse(JSON.stringify(SA.save.get().missions)), { done: ['m1', 'gone'], active: { id: 'gone', step: 1, seed: 0, replay: false } });
  const m = SA.missions.create({ missions: [row(1), row(2)] });
  assert.equal(m.active(), null);
  assert.deepEqual(statuses(m), ['done', 'available']);
  SA.save.update({ missions: 'junk' });
  assert.deepEqual(JSON.parse(JSON.stringify(SA.save.get().missions)), { done: [], active: null });
});

test('the default instance reads the shipped data: contiguous n from 1, valid rows', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const rows = SA.data.all('missions');
  assert.ok(rows.length >= 1);
  rows.slice().sort((a, b) => a.n - b.n).forEach((r, i) => assert.equal(r.n, i + 1));
  assert.equal(SA.missions.list()[0].status, 'available');
  assert.equal(SA.missions.start(rows[0].id).ok, true);
  assert.equal(SA.missions.active().id, rows[0].id);
});

test('mission rows are validated with clear errors', () => {
  const SA = loadGame(FILES);
  const bad = (patch, field) => assert.throws(() => SA.data.register('missions', [{ ...row(9), ...patch }]), new RegExp('field "' + field.replace(/[[\]]/g, '\\$&') + '"'));
  bad({ id: 'Bad Id' }, 'id');
  bad({ n: 0 }, 'n');
  bad({ es: '' }, 'es');
  bad({ en: 3 }, 'en');
  bad({ icon: '' }, 'icon');
  bad({ intro: [] }, 'intro');
  bad({ intro: [{ es: 'Hola.', icon: '👋' }] }, 'intro');
  bad({ intro: [{ es: 'Hola.', icon: '👋' }, { es: 'Vamos.', icon: '🚶' }] }, 'intro');
  bad({ intro: 'Hola.' }, 'intro');
  bad({ intro: undefined }, 'intro');
  bad({ intro: { es: '', icon: '👋' } }, 'intro.es');
  bad({ intro: { es: 'Uno dos tres cuatro cinco.', icon: '👋' } }, 'intro.es');
  bad({ intro: { es: 'Hola.', icon: '' } }, 'intro.icon');
  bad({ intro: { es: 'Hola.', icon: '👋', en: '' } }, 'intro.en');
  bad({ steps: [] }, 'steps');
  bad({ steps: [{}] }, 'steps[0]');
  // AS-0223: every step needs ONE short line for the prompt pill.
  bad({ steps: [{ kind: 'find' }] }, 'steps[0].line');
  bad({ steps: [{ kind: 'find', line: 'Busca' }] }, 'steps[0].line');
  bad({ steps: [{ kind: 'find', line: { es: '', icon: '🔍' } }] }, 'steps[0].line.es');
  bad({ steps: [{ kind: 'find', line: { es: 'Busca al cerdito de la granja', icon: '🔍' } }] }, 'steps[0].line.es');
  bad({ steps: [{ kind: 'find', line: { es: 'Busca', icon: '' } }] }, 'steps[0].line.icon');
  bad({ steps: [{ kind: 'find', line: { es: 'Busca', icon: '🔍', en: '' } }] }, 'steps[0].line.en');
  assert.doesNotThrow(() => SA.data.register('missions', [{ ...row(10), steps: [{ kind: 'find', line: { es: 'Uno dos tres cuatro', icon: '🔍', en: 'Find' } }] }]));
  bad({ reward: { stars: -1 } }, 'reward');
  bad({ reward: null }, 'reward');
});
