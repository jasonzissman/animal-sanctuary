import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/data/foods.js', 'game/data/items.js',
  'game/data/actions.js', 'game/data/care.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js',
  'game/nearby-task.js', 'game/data/needs.js', 'game/encounters.js', 'game/data/badges.js', 'game/badges.js', 'game/rescue-log.js',
  'game/task-gate.js', 'game/ui/encounter-flow.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const allowed = { v: true };
  const focus = { allowsSmall: () => allowed.v };
  SA.focus = focus;
  const clock = { t: 1000 };
  const enc = SA.encounters.create({ rng: SA.clues.makeRng(7), now: () => clock.t, focus });
  const said = [], sfx = [], offers = [], events = [], earned = [];
  const careState = { active: false, cancels: 0, replays: 0, fail: false };
  const care = {
    offer: (...a) => { if (careState.fail) return false; offers.push(a); careState.active = true; return true; },
    active: () => careState.active, cancel: () => { careState.active = false; careState.cancels++; },
    replay: () => { careState.replays++; },
  };
  const audio = { say: (k, done) => { said.push(k); if (done) done(); }, sfx: (...a) => sfx.push(a) };
  const ef = SA.encounterFlow.create({ encounters: enc, care, audio, track: (t, f) => events.push({ t, ...f }),
    onEarned: (rows) => earned.push(...rows) });
  const ids = SA.data.all('animals').filter((a) => !a.easterEgg).slice(0, 8);
  // eight animals in a row: the scheduler gives about two of them a need
  const place = ids.map((a, i) => ({ id: a.id, x: i * 30, z: 0 }));
  ef.update(place);
  const needy = ef.tasks()[0];
  return { SA, ef, enc, care, careState, allowed, clock, said, sfx, offers, events, earned, place, needy };
}

test('update gives some animals a need and needs() lists their floating icons', () => {
  const t = setup();
  assert.equal(t.ef.needs().length, 2);
  for (const n of t.ef.needs()) assert.ok(n.icon && typeof n.animalId === 'string');
  t.allowed.v = false;
  assert.equal(t.ef.needs().length, 0, 'no icons while a story mission runs');
});

test('start offers the matching care task (forced, quiet), then speaks the call and the hint, then the prompt', () => {
  const t = setup();
  const id = t.needy.animalId, need = t.needy.need;
  assert.equal(t.ef.start(id), true);
  assert.equal(t.ef.active(), id);
  const [animalId, force, kind, quiet] = t.offers[0];
  assert.equal(animalId, id);
  assert.equal(force, true);
  assert.equal(kind, t.SA.data.get('careTasks', need.care).kind);
  assert.equal(quiet, true);
  assert.deepEqual(t.said, [...t.enc.hint(id).keys],'the animal name and the hint phrase, in order');
  assert.ok(t.said[0].startsWith('animal:') || t.said[0].startsWith('phrase:'));
  assert.equal(t.careState.replays, 1, 'then the care prompt is spoken');
  assert.ok(t.events.some((e) => e.t === 'encounter.called'));
});

test('the call and hint play at most once per 20 s per animal; the prompt alone is repeated', () => {
  const t = setup();
  const id = t.needy.animalId;
  t.ef.start(id);
  const spoken = t.said.length, played = t.sfx.length + (t.said.length ? 0 : 0);
  t.clock.t += 5000;
  t.ef.announce(id);
  assert.equal(t.said.length, spoken, 'no second call inside 20 s');
  assert.equal(t.sfx.length, played);
  assert.equal(t.careState.replays, 2);
  t.clock.t += 20000;
  t.ef.announce(id);
  assert.ok(t.said.length > spoken, 'after 20 s it calls again');
});

test('an animal with no voice word gets a procedural call', () => {
  const t = setup();
  const noVoice = t.place.map((p) => t.SA.data.get('animals', p.id)).find((a) => !a.voice && t.enc.need(a.id));
  if (!noVoice) return;
  t.ef.start(noVoice.id);
  assert.equal(t.sfx.length, 1);
  assert.ok(['chirp', 'squeak', 'whimper'].includes(t.sfx[0][0]));
});

test('helping logs a save.rescues entry of kind encounter that badges count, and clears the need', () => {
  const t = setup();
  const { SA } = t;
  const id = t.needy.animalId, need = t.needy.need;
  t.ef.start(id);
  assert.equal(t.ef.onCareDone({ animalId: 'someone-else' }), false, 'another animal\'s task is not ours');
  assert.equal(t.ef.onCareDone({ animalId: id, taskId: 'x' }), true);
  const rows = SA.rescueLog.list().filter((e) => e.kind === 'encounter');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].animalId, id);
  assert.equal(rows[0].need, need.word);
  assert.equal(rows[0].biome, SA.data.get('animals', id).biome);
  assert.equal(SA.rescueLog.count('encounter'), 1);
  const species = SA.badges.progress().find((p) => p.id.indexOf('amigo-' + id) === 0);
  if (species) assert.equal(species.have, 1, 'the species badge counts the encounter');
  assert.equal(t.enc.need(id), null, 'the scheduler resolved it');
  assert.equal(t.ef.active(), null);
  assert.ok(t.events.some((e) => e.t === 'encounter.helped'));
  // the cooldown passes: a new need appears later
  t.clock.t += SA.encounters.COOLDOWN_MS + 1;
  t.ef.update(t.place);
  assert.equal(t.ef.tasks().length, 2);
});

test('a badge earned by the help is reported once', () => {
  const t = setup();
  const need = t.needy.need;
  t.SA.save.update({ rescues: Array.from({ length: 4 }, () => ({ kind: 'encounter', mission: '', need: need.word, animalId: t.needy.animalId, night: false })) });
  t.ef.start(t.needy.animalId);
  t.ef.onCareDone({ animalId: t.needy.animalId });
  assert.equal(t.SA.rescueLog.count('encounter'), 5);
  const hasRule = t.SA.data.all('badges').some((b) => b.rule.need === need.word && b.rule.count === 5);
  assert.equal(t.earned.length > 0, hasRule);
});

test('walking away mid-help puts the care task away quietly and keeps the need', () => {
  const t = setup();
  const id = t.needy.animalId;
  t.ef.start(id);
  assert.equal(t.ef.release(), true);
  assert.equal(t.careState.cancels, 1);
  assert.equal(t.ef.active(), null);
  assert.ok(t.enc.need(id), 'the need is still there');
  assert.equal(t.SA.rescueLog.count('encounter'), 0, 'nothing logged');
});

test('a task that cannot be shown is not started', () => {
  const t = setup();
  t.careState.fail = true;
  assert.equal(t.ef.start(t.needy.animalId), false);
  assert.equal(t.ef.active(), null);
  t.ef.dismiss(t.needy.animalId);
  assert.equal(t.enc.need(t.needy.animalId), null);
});

test('during a story mission nothing is announced', () => {
  const t = setup();
  t.allowed.v = false;
  const id = t.needy.animalId;
  assert.equal(t.enc.shouldCall(id), false);
  t.ef.start(id);
  assert.deepEqual(t.said, [], 'no call and no hint while a mission runs');
});

// --- through the task gate -------------------------------------------------------------------------------------------------------------
function gateSetup() {
  const t = setup();
  const pills = [], begins = [];
  const view = { setPill: (on) => pills.push(on) };
  const flow = { begin: (id) => { begins.push(id); return null; }, replay: () => { t.said.push('clue-replay'); } };
  const world = { player: { x: -50, z: 0, heading: 0 } };
  const game = { current: () => null };
  const gate = t.SA.taskGate.create({ flow, game, view, player: () => world.player, animals: () => t.place,
    encounters: t.ef, nearby: t.SA.nearbyTask.create({ focus: { allowsSmall: () => t.allowed.v } }), track: () => {} });
  const spot = t.place.find((p) => p.id === t.needy.animalId);
  return { ...t, gate, pills, begins, world, spot };
}

test('gate: the prompt shows only within NEAR of the needy animal, the call comes with it, and it comes back after leaving', () => {
  const g = gateSetup();
  assert.equal(g.gate.update(), null, 'far away: nothing');
  assert.deepEqual(g.said, []);
  g.world.player = { x: g.spot.x + 3, z: 0, heading: 0 };
  const shown = g.gate.update();
  assert.equal(shown.kind, 'encounter');
  assert.equal(shown.animalId, g.needy.animalId);
  assert.equal(g.pills.at(-1), true);
  assert.equal(g.ef.active(), g.needy.animalId);
  assert.ok(g.said.length >= 2, 'call + hint spoken');
  assert.equal(g.careState.replays, 1);
  g.world.player = { x: g.spot.x + 40, z: 0, heading: 0 };
  assert.equal(g.gate.update(), null, 'walked away: hidden');
  assert.equal(g.pills.at(-1), false);
  assert.equal(g.ef.active(), null, 'the help in progress was put away quietly');
  assert.ok(g.enc.need(g.needy.animalId), 'the need waits');
});

test('gate: no encounter prompt or call during an active mission', () => {
  const g = gateSetup();
  g.allowed.v = false;
  g.world.player = { x: g.spot.x + 2, z: 0, heading: 0 };
  assert.equal(g.gate.update(), null);
  assert.deepEqual(g.said, []);
  assert.deepEqual(g.offers, []);
  assert.deepEqual(g.pills, []);
});

test('gate: a need whose care task cannot be shown is dropped, not retried every frame', () => {
  const g = gateSetup();
  g.careState.fail = true;
  g.world.player = { x: g.spot.x + 2, z: 0, heading: 0 };
  g.gate.update();
  assert.equal(g.enc.need(g.needy.animalId), null);
  assert.equal(g.ef.active(), null);
});
