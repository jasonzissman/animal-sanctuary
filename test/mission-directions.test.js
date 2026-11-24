// AS-0365: Mission 11 hint pointer: the pure repeat counter (SA.missionDirections), its reset on the next step, the data threshold, the pill's 🔊 feeding it,
// and the faint compass arrow (low opacity, only after the 2nd repeat, hidden again on the next leg).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/camera.js', 'game/player.js', 'game/npc.js', 'game/forest-paths.js', 'game/forest-streams.js', 'game/fallen-logs.js', 'game/surfaces.js', 'game/lookouts.js',
  'game/inventory.js', 'game/carry.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-directions.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-letter.js', 'game/mission-runtime.js', 'game/hud.js', 'game/hint-pointer.js', 'game/compass.js', 'game/ui/compass-view.js'];

// A stub mission list: `cur` is the active mission record the counter reads.
function stub(stepData) {
  const m = { cur: { id: 'm', seed: 1, step: 1, stepData } };
  m.active = () => m.cur;
  return m;
}

test('counter: no pointer before the 2nd repeat, the pointer from the 2nd on', () => {
  const SA = loadGame(FILES), missions = stub({ kind: 'goTo', place: 'a', noArrow: true });
  const d = SA.missionDirections.create({ missions, track: () => {} });
  assert.equal(d.threshold(), 2, 'default threshold is 2');
  assert.equal(d.count(), 0);
  assert.equal(d.hint(), false);
  assert.equal(d.repeat(), 1);
  assert.equal(d.hint(), false, 'one repeat is not enough');
  assert.equal(d.repeat(), 2);
  assert.equal(d.hint(), true, 'the 2nd repeat shows the pointer');
  assert.equal(d.repeat(), 3);
  assert.equal(d.hint(), true, 'it stays while the leg lasts');
});

test('counter: the next leg resets the count and hides the pointer; a new seed does too', () => {
  const SA = loadGame(FILES), missions = stub({ kind: 'goTo', place: 'a', noArrow: true });
  const d = SA.missionDirections.create({ missions, track: () => {} });
  d.repeat(); d.repeat();
  assert.equal(d.hint(), true);
  missions.cur = { id: 'm', seed: 1, step: 2, stepData: { kind: 'goTo', place: 'b', noArrow: true } };
  assert.equal(d.count(), 0, 'reset when the next leg starts');
  assert.equal(d.hint(), false);
  assert.equal(d.repeat(), 1);
  assert.equal(d.hint(), false, 'the next leg needs its own 2 repeats');
  d.repeat();
  assert.equal(d.hint(), true);
  missions.cur = { ...missions.cur, seed: 2 };
  assert.equal(d.count(), 0, 'a replay of the mission starts fresh');
  missions.cur = null;
  assert.equal(d.hint(), false);
  assert.equal(d.repeat(), 0, 'nothing to count with no mission');
});

test('counter: only listen-only (noArrow) steps count; the threshold is data (hintAfter) and junk falls back to 2', () => {
  const SA = loadGame(FILES);
  const seen = stub({ kind: 'goTo', place: 'a' });
  const d = SA.missionDirections.create({ missions: seen, track: () => {} });
  d.repeat(); d.repeat();
  assert.equal(d.hint(), false, 'a step with an arrow of its own never gets the hint pointer');
  assert.equal(d.count(), 0);
  const three = stub({ kind: 'goTo', place: 'a', noArrow: true, hintAfter: 3 });
  const d3 = SA.missionDirections.create({ missions: three, track: () => {} });
  d3.repeat(); d3.repeat();
  assert.equal(d3.hint(), false);
  d3.repeat();
  assert.equal(d3.hint(), true, 'hintAfter: 3');
  const junk = stub({ kind: 'goTo', place: 'a', noArrow: true, hintAfter: 'x' });
  assert.equal(SA.missionDirections.create({ missions: junk }).threshold(), 2);
  assert.equal(SA.missionDirections.create({ missions: seen, threshold: 4 }).threshold(), 4, 'instance default');
  assert.equal(SA.missionDirections.DEFAULT_AFTER, 2);
});

test('counter: telemetry once when the pointer appears; a broken tracker or missions never breaks play', () => {
  const SA = loadGame(FILES), missions = stub({ kind: 'goTo', place: 'a', noArrow: true }), ev = [];
  const d = SA.missionDirections.create({ missions, track: (t, f) => ev.push([t, f.repeats]) });
  d.repeat(); d.repeat(); d.repeat();
  assert.deepEqual(ev, [['directions.hint', 2]]);
  const bad = SA.missionDirections.create({ missions, track: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => { bad.repeat(); bad.repeat(); });
  const broken = SA.missionDirections.create({ missions: { active: () => { throw new Error('x'); } } });
  assert.equal(broken.hint(), false);
  assert.equal(broken.repeat(), 0);
});

test('data: hintAfter is validated (whole number >= 1, only on a noArrow step)', () => {
  const SA = loadGame(FILES);
  let n = 0;
  const row = (extra) => ({ id: 'hint' + (n++), n: 98, es: 'X', en: 'X', icon: '✉️', intro: { es: 'Hola', icon: '✉️' },
    steps: [{ kind: 'goTo', place: 'puente', line: { es: 'Ve', icon: '🌉' }, ...extra }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ noArrow: true, hintAfter: 3 })]));
  assert.throws(() => SA.data.register('missions', [row({ noArrow: true, hintAfter: 0 })]), /hintAfter/);
  assert.throws(() => SA.data.register('missions', [row({ noArrow: true, hintAfter: 1.5 })]), /hintAfter/);
  assert.throws(() => SA.data.register('missions', [row({ hintAfter: 2 })]), /hintAfter/);
});

// Mission 11 running for real: the letter has been handed over and the first leg ("Ve al puente") is current.
function mensaje() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [];
  const missions = SA.missions.create({ track: () => {} });
  let rt = null;
  const letter = SA.missionLetter.create({ missions, audio: { say: () => {}, sfx: () => {} }, track: () => {}, report: (e) => rt.report(e), carry: SA.carry, inventory: SA.inventory });
  rt = SA.missionRuntime.create({ missions, thing: letter, spawn: null, celebrate: () => {}, track: () => {} });
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones', 'hogar', 'carrera']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('mensaje').ok, true);
  letter.sync();
  rt.report({ type: 'talked', who: 'scientist' });
  const directions = SA.missionDirections.create({ missions, track: () => {} });
  const pill = SA.missionPill.create({ view: { showStep() {} }, audio: { say: (k) => said.push(k) }, missions, focus: { active: () => 'mission' }, directions });
  pill.update();
  return { SA, missions, letter, rt, directions, pill, said };
}

test('pill: each 🔊 tap on a spoken leg is counted; the hint target is that leg\'s waypoint and the compass target stays null', () => {
  const { missions, letter, rt, directions, pill, said } = mensaje();
  assert.equal(missions.active().stepData.place, 'puente');
  assert.equal(rt.target(), null, 'no arrow on a spoken leg');
  assert.equal(rt.hintTarget() && rt.hintTarget().id, 'puente');
  const leg = letter.current().legs[0];
  assert.deepEqual([rt.hintTarget().x, rt.hintTarget().z], [leg.x, leg.z]);
  assert.equal(pill.replay(), true);
  assert.equal(directions.hint(), false);
  assert.ok(said.length >= 2, 'it still speaks');
  pill.replay();
  assert.equal(directions.hint(), true);
  // Reaching the bridge starts the next leg: the count resets and the target is the new leg.
  assert.equal(rt.report({ type: 'arrived', place: 'puente' }).status, 'step');
  assert.equal(directions.hint(), false);
  assert.equal(rt.hintTarget().id, 'rio');
});

test('hintTarget: only a listen-only step answers; the tower step points at the tower', () => {
  const { SA, missions, letter, rt } = mensaje();
  for (const p of ['puente', 'rio', 'izquierda']) rt.report({ type: 'arrived', place: p });
  assert.equal(missions.active().stepData.place, 'torre');
  const t = letter.current().tower;
  assert.deepEqual([rt.hintTarget().x, rt.hintTarget().z], [t.x, t.z]);
  assert.equal(letter.hintTarget({ kind: 'photo', target: 'torre' }), null);
  assert.equal(letter.hintTarget({ kind: 'goTo', place: 'nope' }), null);
  assert.ok(SA.missionLetter.hintTarget, 'exported');
  const idle = SA.missionRuntime.create({ missions: { active: () => null }, thing: null, spawn: null, celebrate: () => {}, track: () => {} });
  assert.equal(idle.hintTarget(), null);
});

function fakeDoc() {
  const els = [];
  const mk = () => { const el = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '' }; els.push(el); return el; };
  return { els, createElement: mk, body: { appendChild() {} } };
}

test('faint pointer: hidden before the 2nd repeat, faint after it, hidden again when the next leg starts', () => {
  const { SA, letter, rt, directions, pill } = mensaje();
  const doc = fakeDoc(), S = SA.station.spawn();
  const player = { x: S.x, z: S.z };
  const rig = { getPlayer: () => player, getState: () => ({ x: player.x, z: player.z, dist: 20, yaw: 0, pitch: 35, lookY: 1 }) };
  const mk = (faint) => SA.compassView.create({ doc, runtime: rt, directions, rig, camera: { aspect: 1.6 }, track: () => {}, faint });
  const main = mk(false), faint = mk(true);
  const [mainEl, faintEl] = doc.els;
  const frame = () => { main.update(0.016); faint.update(0.016); };
  assert.ok(Math.hypot(letter.current().legs[0].x - S.x, letter.current().legs[0].z - S.z) > 10, 'the first leg is far enough for an arrow');
  frame();
  assert.notEqual(faintEl.style.display, 'block', 'no pointer before any repeat');
  assert.notEqual(mainEl.style.display, 'block', 'the normal compass stays hidden on a spoken leg');
  pill.replay(); frame();
  assert.notEqual(faintEl.style.display, 'block', 'no pointer after the 1st repeat');
  pill.replay(); frame();
  assert.equal(faintEl.style.display, 'block', 'the 2nd repeat shows it');
  assert.ok(Number(faintEl.style.opacity) > 0 && Number(faintEl.style.opacity) < 0.6, 'faint, low opacity');
  assert.match(faintEl.style.cssText, /pointer-events:none/);
  assert.ok(faintEl.style.transform.startsWith('rotate('), 'it points somewhere');
  assert.notEqual(mainEl.style.display, 'block');
  rt.report({ type: 'arrived', place: 'puente' }); frame();
  assert.equal(faintEl.style.display, 'none', 'the next leg hides it');
  pill.replay(); frame();
  assert.equal(faintEl.style.display, 'none', 'one repeat on the new leg is not enough');
});
