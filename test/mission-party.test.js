// AS-0328: Mission 4 slice 3: the party at the monkey's tree (confetti/balloons/dancing/tune) and the party photo with its sticker. Pure logic in node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/data/badges.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/inventory.js', 'game/photo.js',
  'game/album.js', 'game/badges.js', 'game/badges-board.js', 'game/rescue-log.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js',
  'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/party-melody.js', 'game/mission-party.js', 'game/mission-runtime.js'];

const TREE = { id: 'arbol-mono', x: 40, z: 10, y: 1, monkey: 'mono' };
const near = { x: 38, z: 9 };

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], sfx = [], tracked = [], melodies = [], timers = [], photos = [], cheers = [];
  const track = (t, f) => tracked.push([t, f]);
  const audio = { say: (k) => said.push(k), sfx: (n) => sfx.push(n), melody: (n) => melodies.push(n) };
  const missions = SA.missions.create({ track });
  const friends = { current: () => (missions.active() ? { tree: TREE, friends: [{ id: 'conejo' }, { id: 'ciervo' }] } : null) };
  const rt = SA.missionRuntime.create({ missions, spawn: null, thing: { target: () => null }, celebrate: (r) => cheers.push(r), track });
  const log = SA.rescueLog.create({ track });
  const party = SA.missionParty.create({ missions, friends, runtime: rt, audio, photo: { record: (id) => photos.push(id) }, rescueLog: log, later: (fn) => fn(), track });
  const ctx = { SA, missions, rt, party, log, said, sfx, tracked, melodies, photos, cheers, timers };
  party.onSticker = (e) => (ctx.sticker = e);
  return ctx;
}

// Missions 1-3 done, mission 4 started and played up to the goTo step (everything before reported straight to the runtime).
function atTree(ctx) {
  for (const id of ['mama', 'huevo', 'rio']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  assert.equal(ctx.missions.start('fiesta').ok, true);
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  ctx.rt.report({ type: 'talked', who: 'scientist' });
  ctx.rt.report({ type: 'invited', animal: 'conejo' });
  ctx.rt.report({ type: 'invited', animal: 'ciervo' });
  assert.equal(ctx.rt.report({ type: 'arrived', place: 'arbol-mono' }).status, 'step');
  return ctx;
}
const kind = (ctx) => ctx.missions.active().stepData.kind;
const equipCamera = (SA) => assert.equal(SA.inventory.equip('camara'), true);
const play = (ctx, seconds) => { for (let t = 0; t < seconds; t += 0.1) ctx.party.tick(0.1); };

test('melody data: the Cumpleaños feliz tune is 4 lines of 6/6/7/6 notes in 3/4, all in range, with bass and chords, a few seconds long', () => {
  const { SA } = setup();
  const M = SA.partyMelody;
  assert.deepEqual(Array.from(M.LINES.map((l) => l.length)), [6, 6, 7, 6]);
  assert.equal(M.beats(), 24, '8 bars of 3 beats');
  assert.deepEqual(Array.from(M.LINES[0].map((n) => n[0])), [67, 67, 69, 67, 72, 71], 'G G A G C B');
  assert.deepEqual(Array.from(M.LINES[3].map((n) => n[0])), [77, 77, 76, 72, 74, 72], 'F F E C D C');
  assert.equal(M.BARS.length, 8);
  assert.ok(Math.abs(M.hz(69) - 440) < 1e-9);
  const notes = M.notes();
  assert.equal(notes.length, 25 + 8 + 32);
  notes.forEach((n) => { assert.ok(n.f > 60 && n.f < 1600 && n.t >= 0 && n.d > 0 && n.g > 0 && n.g <= 0.25, JSON.stringify(n)); });
  const lead = notes.filter((n) => n.w === 'triangle');
  assert.equal(lead.length, 25);
  assert.ok(lead.every((n, i) => i === 0 || n.t > lead[i - 1].t), 'the tune goes forward in time');
  assert.ok(M.duration() > 8 && M.duration() < 14, String(M.duration()));
  assert.ok(M.duration({ beat: 0.2 }) < M.duration());
  assert.ok(Math.max(...notes.map((n) => n.t + n.d)) <= M.duration() + 0.2);
});

test('data: the row ends goTo -> party -> photo of the monkey, short lines, a spoken ¡Feliz cumpleaños!, and the sticker row exists', () => {
  const { SA } = setup();
  const m = SA.data.get('missions', 'fiesta');
  assert.deepEqual(Array.from(m.steps.slice(-3).map((s) => s.kind)), ['goTo', 'party', 'photo']);
  assert.equal(m.steps[5].place, m.friends.tree);
  assert.equal(m.steps[6].target, m.friends.monkey);
  assert.equal(m.steps[6].line.es, 'Foto de la fiesta');
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4, s.line.es));
  assert.equal(SA.vocab.get(m.party.say).es, '¡Feliz cumpleaños!');
  assert.deepEqual(JSON.parse(JSON.stringify(SA.data.get('badges', 'fiesta-feliz').rule)), { kind: 'party', count: 1 });
  SA.missionRun.validate(m.steps);
});

test('data: a bad party row is rejected with a clear error', () => {
  const { SA } = setup();
  const row = (party, friends = { animals: ['a'], tree: 't' }) => ({ id: 'x', n: 9, es: 'X', en: 'X', icon: '🎉', intro: { es: 'Hola', icon: '🎉' }, party, friends,
    steps: [{ kind: 'find', target: 'pato', line: { es: 'Busca', icon: '🎉' } }], reward: { stars: 1 } });
  assert.throws(() => SA.data.register('missions', [row({})]), /party\.say/);
  assert.throws(() => SA.data.register('missions', [row({ say: 'phrase:felizcumple', seconds: 99 })]), /party\.seconds/);
  assert.throws(() => SA.data.register('missions', [Object.assign(row({ say: 'phrase:felizcumple' }), { friends: undefined })]), /party/);
});

test('party: starts when the party step begins, plays the tune once and says ¡Feliz cumpleaños!, then moves on to the photo step', () => {
  const ctx = atTree(setup());
  assert.equal(kind(ctx), 'party');
  assert.equal(ctx.party.view(), null, 'nothing is drawn before the first tick');
  assert.equal(ctx.party.tick(0.1), 'party');
  assert.equal(ctx.melodies.length, 1);
  assert.equal(ctx.melodies[0].length, ctx.SA.partyMelody.notes().length);
  assert.deepEqual(ctx.said, ['phrase:felizcumple']);
  const v = ctx.party.view();
  assert.deepEqual([v.phase, v.monkey, v.tree.x, v.tree.z], ['party', 'mono', 40, 10]);
  assert.deepEqual(Array.from(v.animals), ['conejo', 'ciervo']);
  assert.equal(ctx.party.target({ kind: 'party' }).x, 40, 'the compass points at the tree');
  assert.equal(ctx.party.target({ kind: 'goTo' }), null);
  play(ctx, 5);
  assert.equal(kind(ctx), 'party', 'still partying');
  play(ctx, ctx.SA.partyMelody.duration());
  assert.equal(kind(ctx), 'photo');
  assert.equal(ctx.party.view().phase, 'photo', 'the party goes on until the photo');
  play(ctx, 5);
  assert.equal(ctx.melodies.length, 1, 'the tune plays once');
  assert.equal(ctx.said.length, 1);
  assert.deepEqual(ctx.tracked.filter(([t]) => t.startsWith('party.')).map(([t]) => t), ['party.start', 'party.done']);
});

test('party: a mission row seconds shortens the party; never timed against the player (it waits, nothing fails)', () => {
  const ctx = atTree(setup());
  ctx.missions.active().mission.party.seconds = 2;
  play(ctx, 2.3);
  assert.equal(kind(ctx), 'photo');
});

test('photo: needs la cámara in hand and being near the tree; a tap that is too early does nothing', () => {
  const ctx = atTree(setup());
  assert.equal(ctx.party.snap(near).status, 'none', 'still on the party step');
  play(ctx, 15);
  assert.equal(ctx.party.snap(near).status, 'nocamera');
  equipCamera(ctx.SA);
  assert.equal(ctx.party.snap({ x: 0, z: 0 }).status, 'far');
  assert.equal(kind(ctx), 'photo');
  assert.deepEqual(ctx.photos, []);
});

test('photo: completes the mission once, puts the picture in the album, awards the sticker and the stars', () => {
  const ctx = atTree(setup());
  play(ctx, 15);
  equipCamera(ctx.SA);
  const r = ctx.party.snap(near);
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'fiesta');
  assert.equal(r.firstTime, true);
  assert.deepEqual(ctx.photos, ['mono']);
  assert.ok(ctx.sfx.includes('shutter'));
  assert.equal(ctx.missions.status('fiesta'), 'done');
  assert.equal(ctx.sticker.mission, 'fiesta');
  assert.equal(ctx.sticker.badges[ctx.sticker.badges.length - 1].id, 'fiesta-feliz', 'the party sticker is the one shown (any first rescue also earns its own)');
  assert.ok(Array.from(ctx.SA.save.get().badges).includes('fiesta-feliz'));
  assert.equal(ctx.log.count('party'), 1);
  assert.equal(ctx.party.snap(near).status, 'none', 'no second photo once done');
  assert.equal(ctx.party.tick(0.1), 'none');
  assert.equal(ctx.party.view(), null);
  assert.ok(ctx.tracked.some(([t]) => t === 'party.photo'));
});

test('replay: the mission can be played again from the board; the party runs again, no second reward or sticker', () => {
  const ctx = atTree(setup());
  play(ctx, 15); equipCamera(ctx.SA);
  assert.equal(ctx.party.snap(near).status, 'complete');
  const again = ctx.missions.start('fiesta');
  assert.equal(again.replay, true);
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  ctx.rt.report({ type: 'talked', who: 'scientist' });
  ctx.rt.report({ type: 'invited', animal: 'conejo' }); ctx.rt.report({ type: 'invited', animal: 'ciervo' });
  ctx.rt.report({ type: 'arrived', place: 'arbol-mono' });
  ctx.sticker = null;
  play(ctx, 15);
  assert.equal(ctx.melodies.length, 2, 'the tune plays again');
  const r = ctx.party.snap(near);
  assert.equal(r.status, 'complete');
  assert.equal(r.firstTime, false);
  assert.equal(r.reward, null);
  assert.deepEqual(Array.from(ctx.sticker.badges), [], 'the sticker is earned once');
  assert.equal(ctx.log.count('party'), 1);
});

test('a reload on the photo step goes straight to the party photo without the show (no tune, no speech)', () => {
  const ctx = atTree(setup());
  play(ctx, 15);
  const sf = ctx.melodies.length;
  const fresh = ctx.SA.missionParty.create({ missions: ctx.missions, friends: { current: () => ({ tree: TREE, friends: [] }) }, runtime: ctx.rt, audio: { say() { throw new Error('no'); },
    melody() { throw new Error('no'); } }, photo: { record() {} }, rescueLog: ctx.log });
  assert.equal(fresh.tick(0.1), 'photo');
  assert.equal(fresh.view().phase, 'photo');
  assert.equal(ctx.melodies.length, sf);
});

test('party without a tree or without the party row stays off (the other missions are untouched)', () => {
  const ctx = setup();
  assert.equal(ctx.party.tick(0.1), 'none');
  assert.equal(ctx.party.view(), null);
  ctx.missions.start('mama');
  assert.equal(ctx.party.tick(0.1), 'none');
  assert.equal(ctx.party.snap(near).status, 'none');
  assert.equal(ctx.party.target({ kind: 'party' }), null);
});

test('the badge board describes the sticker goal in Spanish', () => {
  const { SA } = setup();
  const b = SA.badgesBoard.create ? SA.badgesBoard.create({}) : SA.badgesBoard;
  assert.equal(b.goal({ kind: 'party', count: 1 }), 'Haz 1 fiesta');
  assert.equal(b.goal({ kind: 'party', count: 3 }), 'Haz 3 fiestas');
});
