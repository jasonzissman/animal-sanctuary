import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js',
  'game/mission-card.js', 'game/hint-stage.js', 'game/level-cue.js', 'game/photo.js', 'game/data/missions.js', 'game/missions.js',
  'game/focus.js', 'game/mission-pill.js', 'game/ui/care-flow.js', 'game/ui/mission-flow.js', 'game/ui/prompt.js'];

// A tiny fake DOM: every created element remembers its text; the pill is the first element the view builds, its text span is the 4th.
function fakeDoc() {
  const made = [];
  const mk = (tag) => { const e = { tag, style: {}, textContent: '', attrs: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }; made.push(e); return e; };
  return { made, doc: { createElement: mk, body: { appendChild() {} } } };
}

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [];
  SA.audio = { sfx() {}, say: (k) => said.push(k) };
  const { made, doc } = fakeDoc();
  const view = SA.prompt.createView(doc, {});
  const pillText = () => made[3].textContent;
  const pillIcon = () => made[1].textContent;
  const pill = SA.missionPill.create({ view, audio: SA.audio });
  const frame = () => { SA.focus.update(); pill.update(); };
  return { SA, said, view, pill, pillText, pillIcon, frame };
}

test('mission 1 has a short line + icon on every step (the AS-0223 examples)', () => {
  const { SA } = setup();
  const lines = JSON.parse(JSON.stringify(SA.data.get('missions', 'mama').steps.map((s) => [s.line.es, s.line.icon])));
  assert.deepEqual(lines, [['Busca al cerdito', '🐷'], ['Llévalo con mamá', '🐖'], ['Toma una foto', '📷']]);
});

test('every mission step line is at most 4 words', () => {
  const { SA } = setup();
  for (const m of SA.data.all('missions')) for (const s of m.steps) assert.ok(s.line.es.split(/\s+/).length <= 4, s.line.es);
});

test('the pill shows only the current step line + icon, updates and speaks on each step change', () => {
  const { SA, said, pillText, pillIcon, frame } = setup();
  SA.missions.start('mama');
  frame();
  assert.equal(pillText(), 'Busca al cerdito');
  assert.equal(pillIcon(), '🐷');
  assert.deepEqual(said, ['Busca al cerdito']);
  frame();
  assert.equal(said.length, 1, 'no repeat while the step stays the same');
  SA.missions.advance();
  frame();
  assert.equal(pillText(), 'Llévalo con mamá');
  assert.equal(pillIcon(), '🐖');
  SA.missions.advance();
  frame();
  assert.equal(pillText(), 'Toma una foto');
  assert.deepEqual(said, ['Busca al cerdito', 'Llévalo con mamá', 'Toma una foto']);
});

test('Replay speaks the current step line again', () => {
  const { SA, said, pill, frame } = setup();
  assert.equal(pill.replay(), false, 'nothing to replay outside a mission: the free-roam replay handles it');
  SA.missions.start('mama');
  frame();
  assert.equal(pill.replay(), true);
  assert.deepEqual(said, ['Busca al cerdito', 'Busca al cerdito']);
});

test('after the mission ends the pill goes back to its free-roam text', () => {
  const { SA, view, pill, pillText, frame } = setup();
  // The same wiring as main.js: on 'free' the prompt controller begins a round (showRound with the clue text).
  const round = SA.round.create();
  SA.focus.onChange((mode) => {
    if (mode === 'mission') view.clear();
    else { const r = round.start(); view.showRound({ text: r.clue.text, icon: '❓', hintShown: false, stars: 0, camera: false }); }
  });
  SA.missions.start('mama');
  frame();
  assert.equal(pillText(), 'Busca al cerdito');
  SA.missions.complete();
  frame();
  assert.notEqual(pillText(), 'Toma una foto');
  assert.equal(pillText(), round.current().clue.text);
  assert.equal(pill.showing(), false);
  assert.equal(pill.replay(), false);
});

test('a mission without a line, a broken view or a missing audio never throws', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.missionPill.lineFor(null), null);
  assert.equal(SA.missionPill.lineFor({ stepData: { kind: 'find' } }), null);
  const pill = SA.missionPill.create({ view: { showStep() { throw new Error('x'); } }, audio: { say() { throw new Error('y'); } },
    focus: { active: () => 'mission' }, missions: { active: () => ({ id: 'a', seed: 1, step: 0, stepData: { line: { es: 'Hola', icon: '👋' } } }) } });
  assert.equal(pill.update(), true);
  const none = SA.missionPill.create({ focus: { active: () => { throw new Error('z'); } } });
  assert.equal(none.update(), false);
});

test('the step view is a harmless no-op without a DOM', () => {
  const { SA } = setup();
  assert.doesNotThrow(() => SA.prompt.createView(null).showStep({ text: 'Hola', icon: '👋' }));
});
