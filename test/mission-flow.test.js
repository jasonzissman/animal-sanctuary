import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/round.js', 'game/data/foods.js',
  'game/data/items.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/scaffold.js', 'game/mission.js', 'game/mission-card.js',
  'game/hint-stage.js', 'game/level-cue.js', 'game/photo.js', 'game/ui/care-flow.js', 'game/ui/mission-flow.js', 'game/proofs.js'];

// A stub care flow: offers are recorded, a task is "active" until the test finishes it.
function stubCare(accept = true) {
  const c = { offers: [], activeTask: null, picks: [], replays: 0 };
  c.offer = (id, force, kind) => { c.offers.push([id, force, kind]); if (accept) c.activeTask = { animalId: id, kind }; return accept; };
  c.active = () => !!c.activeTask;
  c.onPick = (p) => { c.picks.push(p); return { status: 'care' }; };
  c.replay = () => { c.replays += 1; };
  return c;
}

function setup(opts = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  let t = 1000;
  const events = [], sfx = [], said = [], toasts = [], snaps = [], played = [], later = [], cues = [], shown = [];
  const saidCbs = [];
  SA.audio = { sfx: (n) => sfx.push(n), say: (k, done) => { said.push(k); if (done) saidCbs.push(done); } };
  const view = new Proxy({
    toast: (m) => toasts.push(m), snapshot: (s) => snaps.push(s), levelCue: (c) => cues.push(c),
    showRound: (r) => shown.push(r), showHint: () => shown.push('hint'),
  }, { get: (o, k) => o[k] || (() => {}) });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(5), now: () => t, level: opts.level || 1,
    track: (type, f) => events.push({ type, ...f }) });
  const care = opts.care === null ? null : opts.care || stubCare();
  const flow = SA.missionFlow.create({ mission, view, fx: { play: (id, n) => played.push([id, n]) }, care,
    later: (fn, ms) => later.push([fn, ms]), biomeFx: opts.biomeFx, ...opts.extra });
  return { SA, mission, flow, care, events, sfx, said, saidCbs, toasts, snaps, played, later, cues, shown, advance: (ms) => { t += ms; } };
}

const other = (SA, m) => SA.data.all('animals').find((a) => !m.answerIds.includes(a.id) && !a.easterEgg).id;
const cam = (animalId) => ({ animalId, part: 'cuerpo', item: 'camara' });
// Finds the animal, lets its name finish, and returns the mission (at the help step).
function find(t, item) {
  const m = t.flow.begin();
  t.flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo', item });
  t.saidCbs.forEach((fn) => fn());
  return m;
}
// Finishes the active stub care task the way care-flow's onDone does.
function finishTask(t) {
  const task = { taskId: t.mission.current().tasks.find((x) => !x.done).id };
  t.care.activeTask = null;
  t.flow.onCareDone(task);
}

test('begin shows the clue card (no camera badge) and says it', () => {
  const t = setup();
  const m = t.flow.begin();
  assert.equal(m.step, 'find');
  assert.equal(t.shown[0].text, m.clue.text);
  assert.equal(t.shown[0].camera, false);
  assert.deepEqual(t.said, [m.clue.text]);
});

test('a matching animal is found with empty hands, a tool or the camera: celebration, name, no new clue', () => {
  for (const item of [undefined, 'cepillo', 'camara']) {
    const t = setup();
    const m = t.flow.begin();
    const id = m.answerIds[0];
    const res = t.flow.onPick({ animalId: id, part: 'cuerpo', item });
    assert.equal(res.status, 'found');
    assert.ok(t.sfx.includes('chime'));
    assert.ok(t.played.some(([a, n]) => a === id && n === 'boing'));
    assert.ok(t.toasts.some((s) => s.startsWith('¡Muy bien!') && s.includes(t.SA.vocab.get('animal:' + id).es)));
    assert.ok(t.said.includes('animal:' + id));
    assert.equal(t.mission.current(), m, 'the same mission continues (no jump to the next clue)');
    assert.equal(m.animalId, id);
    assert.equal(m.done, false);
    assert.equal(t.SA.save.get().stars, 0, 'no star until the photo');
  }
});

test('a different animal is a gentle boing and wobble with no penalty', () => {
  const t = setup();
  const m = t.flow.begin();
  const wrong = other(t.SA, m);
  assert.equal(t.flow.onPick({ animalId: wrong, part: 'cola' }).status, 'wrong');
  assert.ok(t.sfx.includes('boing'));
  assert.ok(t.played.some(([a, n]) => a === wrong && n === 'wobble'));
  assert.equal(m.step, 'find');
  assert.equal(t.SA.save.get().stars, 0);
  assert.equal(t.care.offers.length, 0);
});

test('the first help task starts on the found animal with no random chance, once its name is said', () => {
  const t = setup();
  const m = t.flow.begin();
  const id = m.answerIds[0];
  t.flow.onPick({ animalId: id, part: 'cuerpo' });
  assert.equal(t.care.offers.length, 0, 'the name is being said first');
  t.saidCbs.forEach((fn) => fn());
  assert.deepEqual(t.care.offers.map(([a, f]) => [a, f]), [[id, true]]);
  assert.equal(t.care.offers[0][2], m.tasks[0].kind);
  t.later.forEach(([fn]) => fn());           // the fallback timer must not start a second task
  assert.equal(t.care.offers.length, 1);
});

test('the help starts after a delay even when the name never reports back', () => {
  const t = setup();
  const m = t.flow.begin();
  t.flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  const fallback = t.later.find(([, ms]) => ms === t.SA.missionFlow.HELP_WAIT_MS);
  fallback[0]();
  assert.equal(t.care.offers.length, 1);
});

test('each finished task starts the next one (level 2: two tasks), then the photo step', () => {
  const t = setup({ level: 2 });
  const m = find(t);
  assert.equal(m.tasks.length, 2);
  assert.equal(t.care.offers.length, 1);
  finishTask(t);
  assert.equal(t.care.offers.length, 2);
  assert.equal(t.care.offers[1][2], m.tasks[1].kind);
  assert.equal(m.step, 'help');
  t.shown.length = 0; t.said.length = 0;
  finishTask(t);
  assert.equal(m.step, 'photo');
  assert.deepEqual([t.shown[0].text, t.shown[0].camera], ['Tómale una foto', true]);
  assert.equal(t.shown[0].icon, t.SA.data.get('animals', m.animalId).icon);
  assert.deepEqual(t.said, ['phrase:tomalefoto']);
  t.care.activeTask = null;
  t.said.length = 0;
  t.flow.replay();
  assert.deepEqual(t.said, ['phrase:tomalefoto'], 'Replay speaks the photo step');
});

test('while a care task is active picks go to care-flow only', () => {
  const t = setup();
  const m = find(t);
  assert.deepEqual({ ...t.flow.onPick({ animalId: m.animalId, part: 'patas', item: 'esponja' }) }, { status: 'care' });
  assert.equal(t.care.picks.length, 1);
  t.flow.replay();
  assert.equal(t.care.replays, 1);
});

test('only a camera shot of the found animal after the help completes the mission', () => {
  const t = setup();
  const m = find(t);
  finishTask(t);
  assert.equal(m.step, 'photo');
  assert.equal(t.flow.onPick({ animalId: m.animalId, part: 'cuerpo' }).status, 'ignored');
  assert.equal(t.flow.onPick({ animalId: m.animalId, part: 'cuerpo', item: 'cepillo' }).status, 'ignored');
  assert.equal(m.done, false);
  const res = t.flow.onPick(cam(m.animalId));
  assert.equal(res.status, 'correct');
  assert.ok(t.sfx.includes('shutter') && t.sfx.includes('chime'));
  assert.equal(t.snaps.length, 1);
  assert.equal(t.SA.save.get().stars, 1);
  assert.equal(t.SA.save.get().photos[m.animalId], 1);
  assert.equal(t.events.filter((e) => e.type === 'round.complete').length, 1);
  assert.ok(t.said.includes('animal:' + m.animalId));
  assert.equal(t.mission.current(), m, 'the next mission waits for NEXT_MS');
  const next = t.later.find(([, ms]) => ms === t.SA.missionFlow.NEXT_MS);
  next[0]();
  assert.notEqual(t.mission.current(), m);
  assert.equal(t.mission.current().step, 'find');
});

test('a photo of another animal, or before the help is done, is a friendly nudge and nothing is lost', () => {
  const t = setup();
  const m = find(t);
  t.toasts.length = 0;
  assert.equal(t.flow.onPick({ animalId: m.animalId, part: 'cuerpo', item: 'camara' }).status, 'care', 'a task is active: care-flow owns the pick');
  t.care.activeTask = null;                     // the gap between tasks: the shot is too early
  const early = t.flow.onPick(cam(m.animalId));
  assert.equal(early.status, 'early');
  assert.ok(t.toasts.length >= 1);
  assert.ok(t.played.some(([a, n]) => a === m.animalId && n === 'wobble'));
  finishTask(t);
  const wrong = other(t.SA, m);
  assert.equal(t.flow.onPick(cam(wrong)).status, 'wrong');
  assert.ok(t.toasts.includes('¡Qué foto! Pero busca…'));
  assert.ok(t.said.includes('phrase:quefoto'));
  assert.equal(t.SA.save.get().photos[wrong], 1, 'the photo is kept anyway');
  assert.equal(t.SA.save.get().stars, 0);
  t.said.length = 0;
  t.later.at(-1)[0]();                          // after the nudge the photo step is repeated
  assert.deepEqual(t.said, ['phrase:tomalefoto']);
});

test('an animal with no supported help task goes straight to the photo step', () => {
  const t = setup({ care: stubCare(false) });
  const m = find(t);                         // care refuses: every task is skipped so the mission never sticks
  assert.equal(m.step, 'photo');
  assert.equal(t.shown.at(-1).camera, true);
  assert.equal(t.flow.onPick(cam(m.animalId)).status, 'correct');
});

test('without a care flow the tasks are skipped to the photo', () => {
  const t = setup({ care: null });
  const m = find(t);
  assert.equal(m.step, 'photo');
});

test('onCareDone with no mission starts one', () => {
  const t = setup();
  t.flow.onCareDone({ taskId: 'curar' });
  assert.ok(t.mission.current());
});

test('Replay says the current step; hint shows the silhouette once; reroll only in the find step', () => {
  const t = setup({ level: 2 });
  const m = t.flow.begin();
  t.said.length = 0;
  t.flow.replay();
  assert.deepEqual(t.said, [m.clue.text]);
  t.flow.hint(); t.flow.hint();
  assert.equal(m.hints, 1);
  assert.equal(t.shown.at(-1), 'hint');
  assert.equal(t.flow.canReroll(), true);
  const r = t.flow.reroll();
  assert.ok(r && r !== m);
  t.flow.onPick({ animalId: r.answerIds[0], part: 'cuerpo' });
  assert.equal(t.flow.canReroll(), false, 'not while helping the found animal');
  assert.equal(t.flow.reroll(), null);
  t.saidCbs.forEach((fn) => fn());
  t.said.length = 0;
  t.flow.replay();                            // care is active: care-flow says it
  assert.equal(t.care.replays, 1);
  finishTask(t);                              // level 2 has two tasks
  finishTask(t);
  t.said.length = 0;
  t.flow.replay();
  assert.deepEqual(t.said, ['phrase:tomalefoto']);
});

test('the round-like adapter: pointer and biome hints count once, the found animal becomes the target', () => {
  const shown = [];
  const t = setup({ biomeFx: { show: (b) => shown.push(b), hide: () => shown.push('hide') } });
  const m = t.flow.begin();
  assert.equal(t.flow.game.current(), m);
  t.flow.game.pointerHint(); t.flow.game.pointerHint();
  assert.equal(m.hints, 1);
  const biome = t.flow.game.biomeHint();
  t.flow.game.biomeHint();
  assert.equal(biome, t.SA.data.get('animals', m.answerId).biome);
  assert.equal(m.hints, 2);
  assert.ok(shown.includes(biome));
  assert.equal(t.flow.game.hint(), m);
  assert.equal(typeof t.flow.game.hasBiomePool('selva'), 'boolean');
  const id = m.answerIds[m.answerIds.length - 1];
  t.flow.onPick({ animalId: id, part: 'cuerpo' });
  assert.equal(m.answerId, id);
  assert.equal(shown.at(-1), 'hide');
});

test('auto hint after 20 s only on the find step', () => {
  const t = setup({ level: 2 });
  const m = t.flow.begin();
  const [fn, ms] = t.later.at(-1);
  assert.equal(ms, t.SA.missionFlow.AUTO_HINT_MS);
  assert.equal(m.hintShown, false);
  fn();
  assert.equal(m.hintShown, true);
  t.flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  const before = m.hints;
  t.later.at(-1)[0]();
  assert.equal(m.hints, before, 'no auto hints once the animal is found');
});

test('picks before a mission or with junk are ignored; audio and view errors never break play', () => {
  const t = setup();
  assert.equal(t.flow.onPick({ animalId: 'conejo' }).status, 'ignored');
  t.flow.begin();
  assert.equal(t.flow.onPick(null).status, 'ignored');
  assert.equal(t.flow.onPick({ part: 'cola' }).status, 'ignored');
  const SA = loadGame(FILES);
  SA.save.reset();
  const mission = SA.mission.create({ rng: SA.clues.makeRng(2), level: 1 });
  const flow = SA.missionFlow.create({ mission, care: null, audio: { say() { throw new Error('x'); }, sfx() { throw new Error('y'); } },
    view: new Proxy({}, { get: () => () => {} }), later: () => {} });
  const m = flow.begin();
  assert.doesNotThrow(() => flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' }));
  assert.equal(m.step, 'photo');
});

test('equipCamera puts the camera in hand and says its name', () => {
  const t = setup();
  assert.equal(t.flow.equipCamera(), false, 'no inventory module: nothing happens');
  t.SA.inventory = { equip: (id) => id === 'camara' };
  assert.equal(t.flow.equipCamera(), true);
  assert.ok(t.said.includes('item:camara'));
});

// ---- integration with the real care flow: a forced task of the asked kind, onDone carries the finished task ----
test('care-flow.offer(force, kind) starts that kind with no random chance and onDone hands over the finished task', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const timers = [];
  let done = null;
  const care = SA.care.create({ rng: () => 0.99 });          // 0.99 would fail every `chance` roll
  const view = new Proxy({}, { get: () => () => {} });
  const flow = SA.careFlow.create({ care, view, audio: { say() {}, sfx() {} }, later: (fn) => timers.push(fn), onDone: (t) => { done = t; } });
  assert.equal(flow.offer('tortuga'), false, 'a plain offer still rolls the chance');
  assert.equal(flow.offer('tortuga', true, 'curar'), true);
  const task = care.current();
  assert.equal(task.kind, 'curar');
  flow.onPick({ animalId: 'tortuga', part: task.part, item: 'venda' });
  assert.equal(care.active(), false);
  timers.forEach((fn) => fn());
  assert.equal(done.taskId, 'curar');
  assert.equal(done.animalId, 'tortuga');
});

test('with the real care flow the found animal is helped right away and the camera cannot skip the help', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const timers = [];
  SA.audio = { say: (k, done) => { if (done) done(); }, sfx() {} };
  const view = new Proxy({}, { get: () => () => {} });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(9), level: 1, track() {} });
  let flow;
  const careFlow = SA.careFlow.create({ care: SA.care.create({ rng: SA.clues.makeRng(3) }), view, audio: SA.audio, later: (fn) => timers.push(fn),
    onDone: (t) => flow.onCareDone(t) });
  flow = SA.missionFlow.create({ mission, view, care: careFlow, later: (fn) => timers.push(fn) });
  const m = flow.begin();
  flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  assert.equal(careFlow.active(), true, 'the help started right away');
  assert.equal(m.step, 'help');
  const cur = careFlow.active() && flow.onPick(cam(m.animalId));
  assert.ok(cur && cur.status !== 'correct', 'while helping, a camera shot is only a care pick and never finishes the mission');
  assert.equal(m.done, false);
  assert.equal(timers.length >= 0, true);
});

// A stub pin target (the render ambient system): records pin/unpin calls.
const stubPin = () => { const p = { calls: [] }; p.pin = (id) => p.calls.push(['pin', id]); p.unpin = (id) => p.calls.push(['unpin', id]); return p; };

test('the found animal is pinned from the find until the photo, then released; a wrong pick pins nothing', () => {
  const pin = stubPin();
  const t = setup({ extra: { pin } });
  const m = t.flow.begin();
  t.flow.onPick({ animalId: other(t.SA, m), part: 'cuerpo' });
  assert.deepEqual(pin.calls, [], 'a wrong pick does not pin');
  const id = m.answerIds[0];
  t.flow.onPick({ animalId: id, part: 'cuerpo' });
  assert.deepEqual(pin.calls, [['pin', id]]);
  t.saidCbs.forEach((fn) => fn());
  finishTask(t);
  assert.deepEqual(pin.calls, [['pin', id]], 'still pinned between help tasks');
  assert.equal(m.step, 'photo');
  assert.equal(t.flow.onPick(cam(other(t.SA, m))).status, 'wrong');
  assert.deepEqual(pin.calls, [['pin', id]], 'a photo of another animal does not release it');
  assert.equal(t.flow.onPick(cam(id)).status, 'correct');
  assert.deepEqual(pin.calls, [['pin', id], ['unpin', id]]);
});

test('a replaced mission (begin again) releases the pinned animal, and pin errors never break play', () => {
  const pin = stubPin();
  const t = setup({ extra: { pin } });
  const id = find(t).answerIds[0];
  t.flow.begin();
  assert.deepEqual(pin.calls, [['pin', id], ['unpin', id]]);
  t.flow.begin();
  assert.equal(pin.calls.length, 2, 'nothing left to release');
  const bad = setup({ extra: { pin: { pin() { throw new Error('x'); }, unpin() { throw new Error('y'); } } } });
  assert.doesNotThrow(() => { find(bad); bad.flow.begin(); });
});

test('the card shows find, then each help task with its icon, then the photo card with the camera badge; Replay follows the step', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const timers = [], said = [], cards = [];
  SA.audio = { say: (k, done) => { said.push(k); if (done) done(); }, sfx() {} };
  const view = new Proxy({ showRound: (r) => cards.push(['round', r]), showCare: (r) => cards.push(['care', r]) }, { get: (o, k) => o[k] || (() => {}) });
  const mission = SA.mission.create({ rng: SA.clues.makeRng(9), level: 2, track() {} });
  let flow;
  const careFlow = SA.careFlow.create({ care: SA.care.create({ rng: SA.clues.makeRng(3) }), view, audio: SA.audio, later: (fn) => timers.push(fn),
    onDone: (t) => flow.onCareDone(t) });
  flow = SA.missionFlow.create({ mission, view, care: careFlow, later: (fn) => timers.push(fn) });
  const m = flow.begin();
  flow.onPick({ animalId: m.answerIds[0], part: 'cuerpo' });
  assert.equal(cards[0][0], 'round');
  assert.equal(cards[1][0], 'care', 'the first help task has its own card');
  assert.ok(cards[1][1].text && cards[1][1].icon);
  assert.equal(cards[1][1].camera, undefined);
  assert.ok(said.includes(cards[1][1].text), 'its text is spoken');
  for (let i = 0; i < 2; i++) {          // finish both help tasks the way the care flow does
    careFlow.active() && flow.onCareDone({ taskId: mission.current().tasks.find((x) => !x.done).id });
  }
  assert.equal(m.step, 'photo');
  const last = cards.at(-1);
  assert.deepEqual([last[0], last[1].text, last[1].camera], ['round', 'Tómale una foto', true]);
});

test('the correct final photo is sent to the station as a proof, and the next mission still starts without returning (AS-0206)', () => {
  const t = setup();
  const m = find(t);
  finishTask(t);
  assert.equal(t.SA.save.get().proofs, undefined);
  t.flow.onPick(cam(m.animalId));
  const rows = JSON.parse(JSON.stringify(t.SA.save.get().proofs));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'rescue');
  assert.equal(rows[0].animalId, m.animalId);
  assert.equal(rows[0].celebrated, false);
  t.later.find(([, ms]) => ms === t.SA.missionFlow.NEXT_MS)[0]();
  assert.equal(t.mission.current().step, 'find', 'the next mission begins by itself');
  assert.equal(t.SA.proofs.pending().length, 1, 'still waiting for the scientist');
});
