import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js',
  'game/mission-card.js', 'game/hint-stage.js', 'game/level-cue.js', 'game/album.js', 'game/photo.js', 'game/hud.js',
  'game/ui/care-flow.js', 'game/ui/mission-flow.js', 'game/ui/prompt.js'];

// A fake DOM element and a manual timer queue, so the view runs in node:vm.
function fakeDom() {
  const made = [];
  const mk = (tag) => {
    let text = '';
    const e = { tag, style: {}, children: [], attrs: {},
      get textContent() { return text; }, set textContent(v) { text = v; this.children = []; },   // like the DOM: setting text drops children
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} };
    made.push(e);
    return e;
  };
  return { made, doc: { createElement: mk, body: { appendChild() {} }, documentElement: { clientWidth: 1280, clientHeight: 800 } } };
}

function setup() {
  const timers = [];
  const SA = loadGame(FILES, { setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout() {} });
  SA.save.reset();
  const said = [], later = [], log = [];
  SA.audio = { sfx() {}, say: (k, done) => { said.push(k); if (done) done(); } };
  const view = new Proxy({
    snapshot: (s) => log.push(['snapshot', s]), snapshotHide: () => log.push(['snapshotHide']),
    showRound: () => log.push(['showRound']),
  }, { get: (o, k) => o[k] || (() => {}) });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(5), now: () => 1000, level: 1 });
  const care = { offer: () => false, active: () => false, onPick: () => ({}), replay() {} };
  const flow = SA.missionFlow.create({ mission, view, care, later: (fn, ms) => later.push([fn, ms]) });
  return { SA, mission, flow, said, later, log, timers };
}

// Plays a mission up to the photo step and returns it.
function toPhotoStep(t) {
  const m = t.flow.begin();
  t.flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  assert.equal(m.step, 'photo');
  return m;
}

test('phrase:estabien is a valid vocab entry with the accent', () => {
  const { SA } = setup();
  assert.equal(SA.vocab.get('phrase:estabien').es, '¡Está bien!');
  assert.equal(SA.missionFlow.PROOF_KEY, 'phrase:estabien');
});

test('a correct final photo shows the stamped proof card, says ¡Está bien!, and the next mission waits for NEXT_MS', () => {
  const t = setup();
  const m = toPhotoStep(t);
  t.said.length = 0; t.log.length = 0;
  const res = t.flow.onPick({ animalId: m.animalId, part: 'cuerpo', item: 'camara' });
  assert.equal(res.status, 'correct');
  const snaps = t.log.filter((l) => l[0] === 'snapshot');
  assert.equal(snaps.length, 1, 'one card: the photo itself, stamped');
  assert.equal(snaps[0][1].stamp, '¡Está bien!');
  assert.equal(snaps[0][1].hold, true);
  assert.equal(snaps[0][1].icon, t.SA.data.get('animals', m.animalId).icon);
  assert.ok(t.said.includes('phrase:estabien'));
  assert.equal(t.mission.current(), m, 'the next mission has not started yet');
  assert.ok(!t.log.some((l) => l[0] === 'snapshotHide'));
  const next = t.later.find(([, ms]) => ms === t.SA.missionFlow.NEXT_MS);
  assert.ok(next);
  next[0]();
  const hide = t.log.findIndex((l) => l[0] === 'snapshotHide');
  assert.ok(hide >= 0, 'the proof card hides');
  assert.notEqual(t.mission.current(), m);
  assert.equal(t.mission.current().step, 'find');
  assert.ok(t.log.findIndex((l, i) => i > hide && l[0] === 'showRound') > hide, 'the next clue shows after the proof card hid');
});

test('a wrong or early photo gets the plain snapshot (no stamp) and nothing is saved as proof', () => {
  const t = setup();
  const m = toPhotoStep(t);
  const wrong = t.SA.data.all('animals').find((a) => !m.answerIds.includes(a.id) && !a.easterEgg).id;
  t.log.length = 0;
  assert.equal(t.flow.onPick({ animalId: wrong, part: 'cuerpo', item: 'camara' }).status, 'wrong');
  const snap = t.log.find((l) => l[0] === 'snapshot')[1];
  assert.equal(snap.stamp, undefined);
  assert.ok(!t.said.includes('phrase:estabien'));
});

test('the final photo is saved in the album and shows in its entries', () => {
  const t = setup();
  const m = toPhotoStep(t);
  assert.equal(t.SA.album.has(m.animalId), false);
  t.flow.onPick({ animalId: m.animalId, part: 'cuerpo', item: 'camara' });
  assert.equal(t.SA.album.has(m.animalId), true);
  assert.equal(t.SA.save.get().photos[m.animalId], 1);
  assert.match(t.SA.save.get().album[m.animalId].date, /^\d{4}-\d{2}-\d{2}$/);
  const entry = t.SA.album.entries().find((e) => e.id === m.animalId);
  assert.equal(entry.seen, true);
  assert.equal(entry.icon, t.SA.data.get('animals', m.animalId).icon);
});

test('prompt view: the stamped snapshot is held until snapshotHide; a plain one slides out by itself', () => {
  const t = setup();
  const { made, doc } = fakeDom();
  const view = t.SA.prompt.createView(doc, {});
  const stampOf = () => made.find((e) => e.tag === 'div' && e.textContent === '¡Está bien!');
  view.snapshot({ icon: '🐰', text: 'el conejo', stamp: '¡Está bien!', hold: true });
  assert.ok(stampOf(), 'the stamp is drawn on the card');
  const snapEl = made.find((e) => e.children.some((c) => c.textContent === 'el conejo'));
  assert.equal(snapEl.style.display, 'flex');
  t.timers.forEach(([fn]) => fn());
  assert.equal(snapEl.style.display, 'flex', 'held: no auto-hide');
  assert.equal(stampOf().style.opacity, '1', 'the stamp thumps in');
  t.timers.length = 0;
  view.snapshotHide();
  while (t.timers.length) t.timers.shift()[0]();
  assert.equal(snapEl.style.display, 'none');

  t.timers.length = 0;
  view.snapshot({ icon: '🐰', text: 'el conejo' });
  assert.ok(!snapEl.children.some((c) => c.textContent === '¡Está bien!'), 'no stamp on a plain snapshot');
  while (t.timers.length) t.timers.shift()[0]();   // the slide-out schedules its own hide: run timers until none are left
  assert.equal(snapEl.style.display, 'none');
});

test('prompt view without a DOM has no-op snapshot and snapshotHide', () => {
  const t = setup();
  const view = t.SA.prompt.createView(null, {});
  assert.doesNotThrow(() => { view.snapshot({}); view.snapshotHide(); });
});
