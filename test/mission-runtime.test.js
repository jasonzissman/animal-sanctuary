import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/mission-runtime.js'];

const line = (es, icon) => ({ es, icon });
const ROWS = [{ id: 'm1', n: 1, es: 'Uno', en: 'One', icon: '1', reward: { stars: 2 },
  steps: [{ kind: 'find', target: 'cerdo', line: line('Busca al cerdito', '🐷') },
    { kind: 'collect', item: 'fresa', n: 2, line: line('Dos fresas', '🍓') },
    { kind: 'goTo', place: 'nido', line: line('Ve al nido', '🪺') },
    { kind: 'talk', who: 'scientist', line: line('Habla', '💬') },
    { kind: 'photo', line: line('Toma una foto', '📷') }] },
{ id: 'm2', n: 2, es: 'Dos', en: 'Two', icon: '2', reward: { stars: 1 }, steps: [{ kind: 'photo', line: line('Foto', '📷') }] }];

const unlockM2 = (SA) => SA.save.update({ missions: { done: ['m1'], active: null } });   // m2 opens once m1 is done

function setup(extra = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const tracked = [], cheers = [], said = [];
  const missions = SA.missions.create({ missions: ROWS, track: (t, f) => tracked.push([t, f]) });
  const rt = SA.missionRuntime.create({ missions, track: (t, f) => tracked.push([t, f]), celebrate: (r) => cheers.push(r), ...extra });
  const focus = SA.focus.create({ missions });
  const shown = [];
  const pill = SA.missionPill.create({ view: { showStep: (s) => shown.push(s) }, audio: { say: (t) => said.push(t) }, missions, focus });
  return { SA, missions, rt, focus, pill, tracked, cheers, said, shown };
}

test('no mission running: events are ignored and nothing is saved', () => {
  const { rt, missions } = setup();
  assert.equal(rt.report({ type: 'found', target: 'cerdo' }).status, 'none');
  assert.equal(missions.active(), null);
});

test('events advance the active mission one step at a time; wrong events are ignored', () => {
  const { rt, missions } = setup();
  missions.start('m1');
  assert.equal(rt.report({ type: 'found', target: 'gato' }).status, 'ignored');
  assert.equal(rt.report({ type: 'photo' }).status, 'ignored');
  assert.equal(JSON.stringify(rt.report({ type: 'found', target: 'cerdo' })), '{"status":"step","step":1}');
  assert.equal(missions.active().step, 1);
  assert.equal(JSON.stringify(rt.report({ type: 'collected', item: 'fresa' })), '{"status":"progress","have":1}');
  assert.equal(missions.active().step, 1);
  assert.equal(rt.report({ type: 'collected', item: 'fresa' }).status, 'step');
  assert.equal(missions.active().step, 2);
});

test('picks: a plain pick finds; a camera shot finds first and only counts as the photo when the step is photo', () => {
  const { rt, missions } = setup();
  missions.start('m1');
  assert.equal(rt.onPick({ animalId: 'cerdo', part: 'cola' }).status, 'step');
  assert.equal(rt.onPick({ animalId: 'cerdo', item: 'camara' }).status, 'ignored');   // collect step: a shot is nothing
  assert.equal(rt.onPick({}).status, 'none');
  const m = setup();
  unlockM2(m.SA);
  m.missions.start('m2');
  assert.equal(m.rt.onPick({ animalId: 'cerdo', part: 'cola' }).status, 'ignored');   // a pick is not a photo
  assert.equal(m.rt.onPick({ animalId: 'cerdo', item: 'camara' }).status, 'complete');
});

test('a shot at the find target does not also skip the photo step', () => {
  const { rt, missions } = setup();
  missions.start('m1');
  rt.onPick({ animalId: 'cerdo', item: 'camara' });
  assert.equal(missions.active().step, 1);
});

test('update(): reaching a place radius finishes a goTo step; far away does nothing', () => {
  const places = { nido: { x: 10, z: 10, r: 3 }, cerdo: { x: 0, z: 0 } };
  const { rt, missions } = setup({ locate: (id) => places[id] });
  missions.start('m1');
  assert.equal(rt.update({ x: 5, z: 0 }).status, 'none');
  assert.equal(rt.update({ x: 1, z: 1 }).status, 'step');         // find by reaching the target (default reach 2.5)
  rt.report({ type: 'collected', item: 'fresa' }); rt.report({ type: 'collected', item: 'fresa' });
  assert.equal(rt.update({ x: 0, z: 0 }).status, 'none');         // goTo: not at the nido
  assert.equal(rt.update({ x: 11, z: 11 }).status, 'step');
  assert.equal(missions.active().step, 3);
});

test('talk, then the final photo completes: marked done, celebrated and rewarded exactly once', () => {
  const { SA, rt, missions, cheers } = setup();
  missions.start('m1');
  rt.report({ type: 'found', target: 'cerdo' });
  rt.report({ type: 'collected', item: 'fresa' }); rt.report({ type: 'collected', item: 'fresa' });
  rt.report({ type: 'arrived', place: 'nido' });
  assert.equal(rt.report({ type: 'talked', who: 'scientist' }).status, 'step');
  const res = rt.report({ type: 'photo', target: 'cerdo' });
  assert.equal(res.status, 'complete');
  assert.equal(res.reward.stars, 2);
  assert.equal(missions.status('m1'), 'done');
  assert.equal(missions.active(), null);
  assert.equal(SA.save.get().stars, 2);
  assert.equal(cheers.length, 1);
  assert.equal(rt.report({ type: 'photo', target: 'cerdo' }).status, 'none');    // a repeated event never completes it twice
  assert.equal(SA.save.get().stars, 2);
  assert.equal(cheers.length, 1);
});

test('a replay celebrates again but grants no second reward', () => {
  const { SA, rt, missions, cheers, tracked } = setup();
  unlockM2(SA);
  missions.start('m2');
  rt.report({ type: 'photo' });
  assert.equal(SA.save.get().stars, 1);
  assert.equal(missions.start('m2').replay, true);
  const res = rt.report({ type: 'photo' });
  assert.equal(res.status, 'complete');
  assert.equal(res.firstTime, false);
  assert.equal(res.reward, null);
  assert.equal(SA.save.get().stars, 1);
  assert.equal(cheers.length, 2);
  assert.equal(tracked.filter((t) => t[0] === 'mission.complete').length, 2);
});

test('tracks mission.step per step and mission.progress for counted steps', () => {
  const { rt, missions, tracked } = setup();
  missions.start('m1');
  rt.report({ type: 'found', target: 'cerdo' });
  rt.report({ type: 'collected', item: 'fresa' });
  assert.equal(JSON.stringify(tracked.filter((t) => t[0] === 'mission.step')), '[["mission.step",{"id":"m1","step":1}]]');
  assert.equal(JSON.stringify(tracked.filter((t) => t[0] === 'mission.progress')), '[["mission.progress",{"id":"m1","step":1,"have":1}]]');
});

test('the pill shows and speaks each step as it starts, and the small tasks stay paused while the mission runs', () => {
  const { rt, missions, pill, focus, shown, said } = setup();
  missions.start('m1');
  assert.equal(focus.allowsSmall(), false);
  pill.update();
  assert.equal(shown[0].text, 'Busca al cerdito');
  assert.equal(shown[0].icon, '🐷');
  assert.equal(said.join('|'), 'Busca al cerdito');
  rt.report({ type: 'found', target: 'cerdo' });
  assert.equal(focus.allowsSmall(), false);
  pill.update(); pill.update();
  assert.equal(shown.length, 2);
  assert.equal(shown[1].icon, '🍓');
  assert.equal(said.join('|'), 'Busca al cerdito|Dos fresas');
  for (const e of [{ type: 'collected', item: 'fresa' }, { type: 'collected', item: 'fresa' }, { type: 'arrived', place: 'nido' },
    { type: 'talked', who: 'scientist' }]) rt.report(e);
  pill.update();
  assert.equal(shown[shown.length - 1].icon, '📷');
  rt.report({ type: 'photo' });
  assert.equal(focus.allowsSmall(), true);                       // finished: free play (and its small tasks) come back
  assert.equal(pill.update(), false);
});

test('a reload resumes on the saved step', () => {
  const { SA, missions } = setup();
  missions.start('m1');
  const rt1 = SA.missionRuntime.create({ missions, celebrate() {} });
  rt1.report({ type: 'found', target: 'cerdo' });
  const rt2 = SA.missionRuntime.create({ missions, celebrate() {} });      // a fresh runtime reads the step from the save
  assert.equal(rt2.report({ type: 'found', target: 'cerdo' }).status, 'ignored');
  assert.equal(rt2.report({ type: 'collected', item: 'fresa' }).status, 'progress');
});

test('default grant adds stars to the save and calls onStars; the default cheer plays the fanfare and the hook', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  const sfx = [], stars = [];
  SA.audio = { sfx: (n) => sfx.push(n) };
  const missions = SA.missions.create({ missions: ROWS });
  const rt = SA.missionRuntime.create({ missions });
  let toasts = 0;
  rt.onStars = (n) => stars.push(n);
  rt.celebrateHook = () => toasts++;
  unlockM2(SA);
  missions.start('m2');
  rt.report({ type: 'photo' });
  assert.equal(missions.status('m2'), 'done');
  assert.equal(SA.save.get().stars, 1);
  assert.equal(stars.join(), '1');
  assert.equal(sfx.join(), 'fanfare');
  assert.equal(toasts, 1);
});

test('the shipped missions are safe: a step with missing params never throws or advances', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  SA.missions.start(SA.data.all('missions')[0].id);
  assert.doesNotThrow(() => SA.missionRuntime.report({ type: 'found', target: 'x' }));
  assert.equal(SA.missionRuntime.update({ x: 0, z: 0 }).status, 'none');
});
