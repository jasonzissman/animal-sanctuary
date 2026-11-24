import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js',
  'game/mission-card.js', 'game/animal-plan.js', 'game/wander.js', 'game/map.js', 'game/gait.js', 'game/render/instances.js', 'game/render/ambient.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const mission = SA.mission.create({ rng: SA.clues.makeRng(5), level: 2 });
  return { SA, mission };
}

test('find card: the clue and the animal icon, no camera badge; a hint makes it a silhouette', () => {
  const { SA, mission } = setup();
  const m = mission.start();
  const card = SA.missionCard.find(m);
  assert.deepEqual([card.step, card.text, card.key, card.camera, card.silhouette], ['find', m.clue.text, m.clue.text, false, false]);
  assert.equal(card.icon, SA.data.get('animals', m.answerId).icon);
  m.hintShown = true;
  assert.equal(SA.missionCard.find(m).silhouette, true);
  assert.ok(card.text.split(/\s+/).length <= 8, 'short text');
});

test('help card: each care task shows its text with the tool icon, or the food icon for feeding, or an open hand', () => {
  const { SA } = setup();
  const h = (task) => SA.missionCard.help(task);
  const cepillo = SA.data.get('items', 'cepillo');
  assert.deepEqual([h({ text: 'Cepilla el pelo', kind: 'cepillar', item: 'cepillo' }).icon, h({ text: 'x', item: 'cepillo' }).step],
    [cepillo.icon, 'help']);
  assert.equal(h({ text: 'Dale dos fresas', kind: 'alimentar', item: 'food', food: 'fresa' }).icon, SA.data.get('foods', 'fresa').icon);
  assert.equal(h({ text: 'Acaricia la barriga', kind: 'acariciar', item: 'hands' }).icon, '✋');
  assert.equal(h({ text: 'Cura la pata', item: 'unknown-tool' }).icon, '✋', 'an unknown tool never blanks the card');
  assert.equal(h({ text: 'Cura la pata' }).camera, false);
  assert.equal(h(null), null);
  assert.equal(SA.missionCard.helpIcon({ item: 'hands' }), '✋');
});

test('photo card: "Tómale una foto" with the camera badge and the found animal', () => {
  const { SA, mission } = setup();
  const m = mission.start();
  mission.found(m.answerIds[0]);
  const card = SA.missionCard.photo(mission.current());
  assert.deepEqual([card.step, card.text, card.key, card.camera], ['photo', 'Tómale una foto', 'phrase:tomalefoto', true]);
  assert.equal(card.icon, SA.data.get('animals', m.answerIds[0]).icon);
  assert.equal(SA.vocab.get(card.key).es, card.text);
});

test('forStep follows the mission step find -> help -> photo and is never blank while running', () => {
  const { SA, mission } = setup();
  const m = mission.start();
  assert.equal(SA.missionCard.forStep(m).step, 'find');
  mission.found(m.answerIds[0]);
  const cur = mission.current();
  const steps = [];
  if (cur.step === 'help') {
    cur.tasks.forEach((t) => {
      const care = SA.care.create().maybeStart(cur.animalId, true, t.kind);
      const card = SA.missionCard.forStep(mission.current(), care);
      steps.push(card.step);
      assert.ok(card.text && card.icon, 'text and icon');
      mission.taskDone(t.id);
    });
    assert.equal(steps.length, 2, 'level 2 asks two help tasks');
    assert.ok(steps.every((s) => s === 'help'));
  }
  const last = SA.missionCard.forStep(mission.current());
  assert.deepEqual([last.step, last.camera], ['photo', true]);
  mission.photo(m.animalId || cur.animalId);
  assert.equal(SA.missionCard.forStep(mission.current()), null, 'a finished mission has no card');
  assert.equal(SA.missionCard.forStep(null), null);
});

test('ambient.pin keeps an animal still until unpin; release (care ending, tap holds) cannot free a pinned animal', () => {
  const { SA } = setup();
  SA.picking = { onPick() {} };
  const a = SA.data.all('animals').find((x) => x.biome === 'bosque' && !x.perch);
  const spot = SA.animalPlan.placements(SA.data.all('animals'), {})[a.id];
  const g = {
    name: a.id, userData: { animalId: a.id }, position: { x: spot.x, y: spot.y, z: spot.z }, rotation: { y: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, children: [],
  };
  const amb = SA.render.createAmbient({ animals: { children: [g] }, avoid: [] });
  const dist = () => Math.hypot(g.position.x - spot.x, g.position.z - spot.z);
  const run = (s) => { for (let t = 0; t < s; t += 1 / 30) amb.update(1 / 30); };
  amb.pin(a.id);
  run(60);
  assert.equal(dist(), 0, 'pinned: never moves');
  amb.hold(a.id, 5); amb.release(a.id); amb.release(a.id);   // a care task starting and ending, a tap hold
  run(60);
  assert.equal(dist(), 0, 'release is ignored while pinned');
  amb.unpin(a.id);
  run(90);
  assert.ok(dist() > 0.3, 'unpinned: wanders again');
  amb.pin('nobody'); amb.unpin('nobody');   // unknown ids are ignored
});
