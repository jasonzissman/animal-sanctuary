// AS-0364: Mission 11 core (Mensaje perdido): the data row and the new `letter` field / `noArrow` flag validation, the leg waypoints along the way to the lookout tower,
// the letter in hand, the spoken leg lines (mission pill), no compass target on the legs, the tower-top handover and the photo that ends the mission with the sticker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/camera.js', 'game/player.js', 'game/npc.js', 'game/forest-paths.js', 'game/forest-streams.js', 'game/fallen-logs.js', 'game/surfaces.js', 'game/lookouts.js',
  'game/inventory.js', 'game/carry.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-letter.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const log = SA.rescueLog.create({});
  const letter = SA.missionLetter.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), rescueLog: log, carry: SA.carry, inventory: SA.inventory });
  rt = SA.missionRuntime.create({ missions, thing: letter, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  const out = { SA, missions, letter, rt, said, tracked, cheers, log };
  letter.onSticker = (e) => (out.sticker = e);
  return out;
}

function startMensaje(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones', 'hogar', 'carrera']) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); }
  const r = ctx.missions.start('mensaje');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.letter.sync();
  return ctx;
}
const step = (ctx) => ctx.missions.active().stepData;
const frame = (ctx, p) => { ctx.letter.update(p); return ctx.rt.update(p); };
const json = (v) => JSON.parse(JSON.stringify(v));

test('data: mission 11 follows mission 10, one intro line of <= 4 words, spoken legs, no-arrow steps; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[10];
  assert.equal(m.n, 11);
  assert.equal(m.id, 'mensaje');
  assert.ok(m.intro.es.split(/\s+/).length <= 4 && m.intro.icon);
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['talk', 'goTo', 'goTo', 'goTo', 'goTo', 'give', 'photo']);
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon, s.line.es));
  assert.deepEqual(Array.from(m.steps.slice(1).map((s) => s.noArrow)), [true, true, true, true, true, true], 'every step after the letter has no compass arrow');
  assert.equal(m.steps[1].line.es, 'Ve al puente');
  assert.equal(m.steps[2].line.es, 'Cruza el río');
  assert.equal(m.steps[4].place, m.letter.place);
  assert.equal(m.steps[5].to, m.letter.box);
  assert.equal(m.steps[6].target, m.letter.place, 'a place, so a photo of an animal never completes it');
  m.letter.legs.forEach((g) => assert.ok(m.steps.some((s) => s.kind === 'goTo' && s.place === g.place)));
  SA.missionRun.validate(m.steps);
  for (const k of ['phrase:izquierda', 'phrase:derecha', 'phrase:cerca', 'phrase:lejos', 'phrase:cruzar', 'thing:puente', 'thing:torre', 'thing:carta', 'item:carta', ...Object.values(m.letter.say)]) assert.ok(SA.vocab.get(k), k);
  assert.equal(SA.vocab.get('thing:puente').es, 'el puente');
  assert.equal(SA.vocab.get('thing:torre').es, 'la torre');
  assert.ok(SA.data.get('badges', 'cartero-valiente'));
  assert.ok(SA.data.get('handmodels', 'carta'));
});

test('data: the letter field and the noArrow flag are validated with clear errors', () => {
  const { SA } = setup();
  const good = { item: 'carta', place: 'torre', box: 'buzon', legs: [{ place: 'puente', at: 0.4 }] };
  let n = 0;
  const row = (letter, extra = {}) => ({ id: 'x11' + (n++), n: 99, es: 'X', en: 'X', icon: '✉️', intro: { es: 'Hola', icon: '✉️' }, letter,
    steps: [{ kind: 'goTo', place: 'puente', line: { es: 'Ve', icon: '🌉' }, ...extra }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, biome: 'bosque', say: { give: 'thing:carta', photo: 'thing:torre' } })]));
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, legs: [{ place: 'puente', at: 0.4, side: -1, near: 'water' }] }, { noArrow: true })]));
  assert.throws(() => SA.data.register('missions', [row({ ...good, item: 'Carta' })]), /letter\.item/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, legs: [] })]), /letter\.legs/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, legs: [{ place: 'puente', at: 1.5 }] })]), /legs\[0\]\.at/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, legs: [{ place: 'puente', at: 0.4, near: 'moon' }] })]), /near/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, legs: [{ place: 'otro', at: 0.4 }] })]), /matching goTo/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: { give: '' } })]), /letter\.say\.give/);
  assert.throws(() => SA.data.register('missions', [row(good, { noArrow: 'yes' })]), /noArrow/);
});

test('place: dry waypoints along the way to the tower, apart from each other, deterministic, left of the way for side -1', () => {
  const { SA } = setup();
  const spec = SA.data.get('missions', 'mensaje').letter;
  const a = SA.missionLetter.place(spec, 7), b = SA.missionLetter.place(spec, 7);
  assert.ok(a, 'a layout exists');
  assert.deepEqual(json(a), json(b));
  assert.equal(a.legs.length, 3);
  const tw = SA.lookouts.towers().find((t) => t.id === a.tower.id);
  assert.equal(tw.biome, 'bosque');
  const pts = [SA.station.spawn(), ...a.legs, a.tower];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) >= 9, `points ${i} and ${j} are apart`);
  a.legs.forEach((g) => assert.ok(!SA.map.isWater(g.x, g.z), g.place + ' is on dry ground'));
  // The box stands on the platform, away from the ladder.
  assert.ok(Math.abs(a.box.x - tw.x) <= 2 && Math.abs(a.box.z - tw.z) <= 2);
  assert.ok((a.box.x - tw.x) * tw.face.x + (a.box.z - tw.z) * tw.face.z < 0);
  assert.equal(SA.missionLetter.place({ legs: [] }, 1) && 0, 0);
  assert.equal(SA.missionLetter.place(null, 1), null);
});

test('onTop: only on the platform and high enough', () => {
  const { SA } = setup();
  const t = { x: 10, z: 10, topY: 5, r: 2 };
  assert.equal(SA.missionLetter.onTop(t, { x: 10.5, z: 9, y: 5 }), true);
  assert.equal(SA.missionLetter.onTop(t, { x: 10.5, z: 9, y: 0.5 }), false, 'standing under the tower is not on top');
  assert.equal(SA.missionLetter.onTop(t, { x: 14, z: 10, y: 5 }), false);
  assert.equal(SA.missionLetter.onTop(t, { x: 10, z: 10 }), false, 'no height: not on top');
});

test('flow: letter -> three spoken legs -> climb -> handover -> photo completes it, sticker, no compass arrow on the legs', () => {
  const ctx = startMensaje(setup());
  const { SA, missions, letter, rt, said } = ctx;
  const cur = letter.current();
  const ground = (p) => ({ x: p.x, z: p.z, y: SA.map.groundHeight(p.x, p.z) });
  assert.equal(missions.active().id, 'mensaje');
  assert.equal(step(ctx).kind, 'talk');
  assert.equal(SA.inventory.has('carta'), false);
  // The scientist hands over the letter: the next step starts and the letter is in the hand.
  assert.equal(rt.report({ type: 'talked', who: 'scientist' }).status, 'step');
  frame(ctx, ground(SA.station.spawn()));
  assert.equal(SA.inventory.has('carta'), true);
  assert.equal(SA.carry.holds('carta'), true, 'carried like other mission items');
  // The pill shows and speaks each leg's line; its replay says it again.
  const pillSaid = [];
  const shown = [];
  const pill = SA.missionPill.create({ view: { showStep: (s) => shown.push(s.text) }, audio: { say: (t) => pillSaid.push(t) }, missions, focus: { active: () => 'mission' } });
  const legs = cur.legs;
  const lines = ['Ve al puente', 'Cruza el río', 'A la izquierda', 'Sube la torre'];
  for (let i = 0; i < legs.length; i++) {
    assert.equal(step(ctx).place, legs[i].place);
    assert.equal(step(ctx).noArrow, true);
    assert.equal(rt.target(), null, 'no compass arrow on a leg');
    pill.update();
    assert.equal(shown[shown.length - 1], lines[i]);
    assert.equal(pillSaid[pillSaid.length - 1], lines[i], 'spoken when the leg starts');
    assert.equal(pill.replay(), true);
    assert.equal(pillSaid[pillSaid.length - 1], lines[i]);
    assert.equal(pillSaid.length, i * 2 + 2, 'the replay speaks it once more, nothing else');
    // Standing far away does nothing; reaching the waypoint moves on.
    const far = { x: legs[i].x + 30, z: legs[i].z, y: 0 };
    assert.equal(frame(ctx, far).status, 'none');
    assert.equal(step(ctx).place, legs[i].place);
    frame(ctx, ground(legs[i]));
  }
  // The tower: reaching its foot is not enough, you have to be on top.
  assert.equal(step(ctx).place, 'torre');
  pill.update();
  assert.equal(pillSaid[pillSaid.length - 1], 'Sube la torre');
  assert.equal(rt.target(), null);
  frame(ctx, { x: cur.tower.x, z: cur.tower.z, y: SA.map.groundHeight(cur.tower.x, cur.tower.z) });
  assert.equal(step(ctx).place, 'torre', 'standing under the tower does not count');
  const face = SA.lookouts.towers().find((t) => t.id === cur.tower.id).face;
  const ladderSide = { x: cur.tower.x + 1.7 * face.x, z: cur.tower.z + 1.7 * face.z, y: cur.tower.topY };    // where you step off the ladder
  frame(ctx, ladderSide);
  assert.equal(step(ctx).kind, 'give', 'on top: the next step is the handover');
  // Handover: near the mailbox on top; the letter leaves the hand.
  frame(ctx, ladderSide);
  assert.equal(step(ctx).kind, 'give', 'too far from the mailbox');
  assert.equal(SA.inventory.has('carta'), true);
  frame(ctx, { x: cur.box.x, z: cur.box.z, y: cur.tower.topY });
  assert.equal(step(ctx).kind, 'photo');
  assert.equal(SA.inventory.has('carta'), false);
  assert.equal(SA.carry.holds('carta'), false);
  assert.ok(said.includes('thing:carta'));
  assert.equal(letter.view().given, true);
  assert.equal(letter.view().photo, true);
  // The photo: needs la cámara in hand and the tower top.
  assert.equal(letter.snap({ x: cur.box.x, z: cur.box.z, y: cur.tower.topY }).status, 'nocamera');
  SA.inventory.add('camara'); SA.inventory.equip('camara');
  assert.equal(letter.snap({ x: cur.box.x, z: cur.box.z, y: 0.5 }).status, 'far', 'from the ground it is too far');
  assert.equal(step(ctx).kind, 'photo');
  const done = letter.snap({ x: cur.box.x, z: cur.box.z, y: cur.tower.topY });
  assert.equal(done.status, 'complete');
  assert.equal(done.id, 'mensaje');
  assert.equal(missions.active(), null);
  assert.equal(ctx.cheers.length, 1);
  assert.equal(missions.status('mensaje'), 'done');
  assert.ok(json(ctx.sticker.badges.map((b) => b.id)).includes('cartero-valiente'));
  assert.equal(SA.save.get().stars >= 2, true, 'the reward is granted');
  assert.equal(letter.snap().status, 'none', 'a second photo does nothing');
  assert.ok(ctx.tracked.some(([t]) => t === 'letter.photo'));
});

test('resume: the letter is back in hand after a reload on a leg; a stray photo or far handover never skips ahead', () => {
  const ctx = startMensaje(setup());
  const { SA, missions, letter, rt } = ctx;
  rt.report({ type: 'talked', who: 'scientist' });
  SA.inventory.remove('carta');
  assert.equal(SA.inventory.has('carta'), false);
  letter.update({ x: 0, z: 0, y: 0 });
  assert.equal(SA.inventory.has('carta'), true, 'put back in the hand');
  // The letter is not re-given after it was handed over.
  assert.equal(rt.report({ type: 'photo', target: 'torre' }).status, 'ignored', 'a photo before the handover does nothing');
  assert.equal(step(ctx).kind, 'goTo');
  assert.equal(letter.snap({ x: 0, z: 0, y: 0 }).status, 'none');
  assert.equal(missions.active().id, 'mensaje');
});

test('runtime: noArrow hides the compass target only on flagged steps; nothing exists unless the mission runs', () => {
  const ctx = setup();
  assert.equal(ctx.letter.sync(), null);
  assert.equal(ctx.letter.view(), null);
  assert.equal(ctx.letter.locate('puente'), null);
  assert.equal(ctx.letter.update({ x: 0, z: 0, y: 0 }), null);
  startMensaje(ctx);
  assert.equal(ctx.letter.locate('puente') !== null, true);
  assert.equal(ctx.letter.locate('torre'), null, 'the tower counts only once you are on top');
  // A step without the flag still asks the world for a target (the scientist's post for the talk step).
  assert.equal(ctx.rt.target() !== null, true);
  assert.equal(ctx.rt.target().id, 'scientist');
});
