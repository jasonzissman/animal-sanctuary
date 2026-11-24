// AS-0372: Mission 12 constellations: the validated data (la tortuga, el conejo, el águila), the pure aim/find maths, finding them through the telescope view
// (chime, spoken name with its article, progress, the photo step only after all three), the tap-to-aim, the progress icons and the lit lines in the view.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/data/hand-models.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js',
  'game/station.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/missions-board.js',
  'game/data/badges.js', 'game/album.js', 'game/badges.js', 'game/rescue-log.js', 'game/data/constellations.js', 'game/constellations.js', 'game/mission-sky.js', 'game/mission-runtime.js'];
const ALL = ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo', 'ladrones', 'hogar', 'carrera', 'mensaje'];
const json = (v) => JSON.parse(JSON.stringify(v));

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], found = [];
  const missions = SA.missions.create({ isNight: () => true });
  let rt = null;
  const sky = SA.missionSky.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: () => {}, report: (e) => rt.report(e),
    rescueLog: SA.rescueLog.create({}), albumPics: { shot: () => {} } });
  rt = SA.missionRuntime.create({ missions, thing: sky, spawn: null, celebrate: () => {}, track: () => {} });
  sky.onFound = (e) => found.push(e);
  for (const id of ALL) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('estrellas').ok, true);
  sky.sync();
  const t = SA.station.layout().telescope;
  sky.open({ x: t.x + 1, z: t.z, y: t.y });
  return { SA, sky, said, found, missions };
}
function aimAt(sky, c) { sky.aim(c.center.yaw - sky.view().yaw, c.center.pitch - sky.view().pitch); }

test('data: tortuga, conejo and águila load, are spoken with the right article, and every line/star is consistent', () => {
  const { SA } = setup();
  const rows = SA.data.all('constellations');
  assert.deepEqual(json(rows.map((r) => r.id)), ['tortuga', 'conejo', 'aguila']);
  const words = { tortuga: 'la tortuga', conejo: 'el conejo', aguila: 'el águila' };
  rows.forEach((r) => {
    assert.equal(SA.vocab.get(r.say).es, words[r.id], 'the spoken name carries its article');
    assert.ok(r.icon && r.stars.length >= 3 && r.lines.length >= 2);
    assert.ok(SA.constellations.segments(r).length === r.lines.length);
  });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].center, b = rows[j].center;
    assert.ok(SA.constellations.angle(a.yaw, a.pitch, b.yaw, b.pitch) > 2 * SA.constellations.DEFAULT_REACH, 'no two overlap: aiming finds one at a time');
  }
  const start = SA.constellations.nearest(0, 0.5, []);
  assert.equal(start, null, 'the view opens on empty sky');
});

test('data: bad rows are rejected with clear errors', () => {
  const { SA } = setup();
  const good = json(SA.data.get('constellations', 'tortuga'));
  let n = 0;
  const row = (extra) => ({ ...json(good), id: 'x' + (n++), ...extra });
  assert.doesNotThrow(() => SA.data.register('constellations', [row({ reach: 0.5 })]));
  const bad = (extra, re) => assert.throws(() => SA.data.register('constellations', [row(extra)]), re);
  bad({ say: 'tortuga' }, /say/);
  bad({ icon: '' }, /icon/);
  bad({ center: { yaw: 4, pitch: 0.5 } }, /center\.yaw/);
  bad({ center: { yaw: 0, pitch: -0.2 } }, /center\.pitch/);
  bad({ center: null }, /center/);
  bad({ stars: [{ x: 0, y: 0 }] }, /stars/);
  bad({ stars: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }, { x: 0, y: 0.1 }] , lines: [[0, 2], [1, 2]] }, /stars\[1\]/);
  bad({ lines: [[0, 1]] }, /lines/);
  bad({ lines: [[0, 1], [1, 99]] }, /lines\[1\]/);
  bad({ lines: [[0, 1], [2, 2]] }, /joins a star to itself/);
  bad({ lines: [[0, 1], [1, 0]] }, /repeats/);
  bad({ lines: [[0, 1], [1, 2]] }, /is on no line/);
  bad({ reach: 5 }, /reach/);
  bad({ id: 'Bad Id' }, /id/);
});

test('maths: angle, star points, nearest within a generous reach (unfound only, nearest wins)', () => {
  const { SA } = setup();
  const C = SA.constellations, rows = SA.data.all('constellations');
  assert.ok(Math.abs(C.angle(0, 0.5, 0, 0.5)) < 1e-9);
  assert.ok(Math.abs(C.angle(0, 0, Math.PI, 0) - Math.PI) < 1e-9);
  assert.ok(Math.abs(C.angle(-3.1, 0.3, 3.1, 0.3) - C.angle(3.1, 0.3, -3.1, 0.3)) < 1e-9 && C.angle(-3.1, 0.3, 3.1, 0.3) < 0.1, 'yaw wraps');
  const t = rows[0], p = C.point(t, 0);
  assert.ok(p.yaw < t.center.yaw && p.pitch > t.center.pitch - 0.1);
  C.points({ center: { yaw: 3.1, pitch: 0.3 }, stars: [{ x: 0.5, y: 0 }, { x: -9, y: 0 }] }).forEach((q) => assert.ok(q.yaw >= -Math.PI && q.yaw <= Math.PI));
  assert.equal(C.nearest(t.center.yaw + 0.3, t.center.pitch, []).id, 'tortuga', 'a generous tolerance');
  assert.equal(C.nearest(t.center.yaw + 0.3, t.center.pitch, ['tortuga']), null, 'found ones are skipped (array)');
  assert.equal(C.nearest(t.center.yaw, t.center.pitch, { tortuga: true }), null, 'found ones are skipped (map)');
  assert.equal(C.nearest(t.center.yaw + 1.2, t.center.pitch, [], [t]), null, 'far away: nothing');
  assert.equal(C.reachOf({ reach: 0.2 }), 0.2);
  assert.equal(C.nearest(0, 0.5, [], [{ id: 'z', center: { yaw: 0.1, pitch: 0.5 }, reach: 0.2 }, { id: 'y', center: { yaw: 0.05, pitch: 0.5 } }]).id, 'y', 'the nearest of two');
});

test('find: aiming at each constellation lights it, speaks its name, counts 1/3, 2/3, 3/3; only then does the photo step open', () => {
  const { SA, sky, said, found, missions } = setup();
  assert.equal(missions.active().stepData.kind, 'stargaze');
  assert.deepEqual(json([sky.view().found, sky.view().total, sky.view().gaze]), [0, 3, true]);
  assert.equal(sky.view().constellations.every((c) => !c.lit), true);
  sky.aim(0.05, 0.05);
  assert.equal(found.length, 0, 'aiming at empty sky finds nothing (and nothing bad happens)');
  const rows = SA.data.all('constellations');
  const words = SA.vocab;
  aimAt(sky, rows[1]);
  assert.deepEqual(json(found.map((f) => [f.id, f.icon, f.found])), [['conejo', '🐰', 1]]);
  assert.equal(said.at(-2), 'sfx:chime');
  assert.equal(words.get(said.at(-1)).es, 'el conejo');
  assert.equal(sky.view().found, 1);
  assert.equal(sky.view().constellations.find((c) => c.id === 'conejo').lit, true);
  sky.aim(0.01, 0);
  assert.equal(found.length, 1, 'staying on a found one does not count it twice');
  assert.equal(sky.snap().status, 'none', 'the photo is locked at 1/3');
  aimAt(sky, rows[0]);
  assert.equal(words.get(said.at(-1)).es, 'la tortuga');
  assert.equal(missions.active().stepData.kind, 'stargaze');
  assert.equal(sky.view().photo, false);
  aimAt(sky, rows[2]);
  assert.equal(words.get(said.at(-1)).es, 'el águila');
  assert.deepEqual(json([sky.view().found, sky.view().photo, sky.view().gaze]), [3, true, false]);
  assert.equal(missions.active().stepData.kind, 'photo', 'all three found: the sky-photo step unlocks');
  assert.equal(sky.snap().status, 'complete');
});

test('find: it only counts with the view open and on the star step; a hook that throws never breaks play', () => {
  const ctx = setup();
  const { SA, sky, found } = ctx, c = SA.data.all('constellations')[0];
  sky.onFound = () => { throw new Error('boom'); };
  sky.close();
  aimAt(sky, c);
  assert.equal(sky.view().found, 0, 'closed view: no find');
  const t = SA.station.layout().telescope;
  sky.open({ x: t.x + 1, z: t.z, y: t.y });
  assert.doesNotThrow(() => aimAt(sky, c));
  assert.equal(sky.view().found, 1);
  assert.equal(found.length, 0);
});

test('tap: aimTowards centres the view on the tapped spot, so a tap can find a constellation too', () => {
  const { SA, sky, found } = setup();
  const before = sky.view();
  sky.aimTowards(0.5, 0, 1.5);
  assert.ok(sky.view().yaw > before.yaw, 'a tap on the right turns the view right');
  sky.aimTowards(0, -0.5, 1.5);
  assert.ok(sky.view().pitch > before.pitch, 'a tap above the middle looks up');
  const c = SA.data.all('constellations')[2];
  aimAt(sky, { center: { yaw: c.center.yaw + 0.9, pitch: c.center.pitch } });           // well off to the right of the eagle: too far to find
  assert.equal(found.length, 0);
  sky.aimTowards(-0.4, 0, 1.5);
  assert.equal(found.length, 1, 'a tap toward it centres it: found');
  assert.equal(sky.aimTowards('x', null, 'y').yaw !== undefined, true, 'junk input is ignored');
  assert.equal(new (loadGame(['game/sa.js', 'game/mission-sky.js']).missionSky.create)({}).aimTowards(0, 0, 1), null, 'no mission: nothing');
});

test('view: once the photo step is reached every constellation is lit (a reload or a re-open), the lines and icons follow', () => {
  const { SA, sky } = setup();
  SA.data.all('constellations').forEach((c) => aimAt(sky, c));
  sky.close();
  const v = sky.view();
  assert.equal(v.constellations.every((c) => c.lit), true);
  assert.equal(v.found, v.total);
});

// ---------- rendering and UI (real three.js scene graph, scripted mission) ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/constellations.js', 'game/constellations.js', 'game/picking.js', 'game/mission-sky.js',
    'game/render/sky-view.js', 'game/ui/sky-view-ui.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
function fakeDoc() {
  const mk = () => ({ style: {}, children: [], listeners: {}, setAttribute() {}, appendChild(c) { this.children.push(c); }, addEventListener(t, f) { this.listeners[t] = f; }, set textContent(v) { this._t = v; if (v === '') this.children = []; }, get textContent() { return this._t; } });
  return { body: mk(), createElement: () => mk() };
}

test('render: the constellation lines and halo show only for lit ones', () => {
  const ctx = world(), SA = ctx.SA, THREE = ctx.THREE;
  const rows = SA.data.all('constellations');
  let lit = [false, false, false];
  const M = { MOON: SA.missionSky.MOON, stars: SA.missionSky.stars, view: () => ({ open: true, yaw: 0, pitch: 0.5, constellations: rows.map((r, i) => ({ id: r.id, lit: lit[i] })) }) };
  const canvas = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), clientWidth: 100, clientHeight: 100 };
  const v = SA.render.createSkyView(THREE, { renderer: { render() {}, domElement: canvas }, canvas, camera: new THREE.PerspectiveCamera(60, 1, 0.1, 100), station: new THREE.Group(), mission: M });
  const lines = () => { const out = []; v.scene.traverse((o) => { if (o.type === 'LineSegments') out.push(o.visible); }); return out; };
  v.render();
  assert.deepEqual(lines(), [false, false, false]);
  lit = [true, false, true];
  v.render();
  assert.deepEqual(lines(), [true, false, true]);
  const halos = []; v.scene.traverse((o) => { if (o.type === 'Mesh' && o.visible && o.geometry.parameters && o.geometry.parameters.radius === 9) halos.push(o); });
  assert.equal(halos.length, 2, 'a soft glow behind each found one');
});

test('ui: the progress row shows the three animal icons dim until found with 0/3, a tap aims, a found animal pops up', () => {
  const ctx = world(), SA = ctx.SA;
  const rows = SA.data.all('constellations');
  let lit = 0;
  const aimed = [];
  const M = { onView: null, onFound: null, view: () => ({ open: true, gaze: true, found: lit, total: 3, photo: false, constellations: rows.map((r, i) => ({ id: r.id, icon: r.icon, lit: i < lit })) }),
    aim() {}, close() {}, snap() {}, aimTowards: (...a) => aimed.push(a) };
  const timers = [];
  ctx.setTimeout = (f) => timers.push(f);
  ctx.innerWidth = 1000; ctx.innerHeight = 500; ctx.addEventListener = () => {};
  const doc = fakeDoc();
  const ui = SA.skyViewUi.create(doc, { mission: M, raf: () => 1 });
  const [layer] = doc.body.children, [, prog, pop] = layer.children;
  M.onView(true);
  assert.equal(prog.style.display, 'flex');
  assert.deepEqual(json(prog.children.map((c) => c._t)), ['🐢', '🐰', '🦅', '0/3']);
  assert.match(prog.children[0].style.cssText, /opacity:\.3/, 'dim until found');
  lit = 1;
  M.onFound({ id: 'tortuga', icon: '🐢', found: 1 });
  assert.equal(pop._t, '🐢');
  assert.deepEqual(json(prog.children.map((c) => c._t)).at(-1), '1/3');
  assert.doesNotMatch(prog.children[0].style.cssText, /opacity:\.3/);
  timers.forEach((f) => f());
  // a press that barely moves is a tap: it aims at that spot; a drag is not
  layer.listeners.pointerdown({ target: layer, pointerId: 1, clientX: 750, clientY: 250 });
  layer.listeners.pointerup({ pointerId: 1, clientX: 750, clientY: 250 });
  assert.deepEqual(json(aimed), [[0.5, 0, 2]]);
  layer.listeners.pointerdown({ target: layer, pointerId: 2, clientX: 100, clientY: 100 });
  layer.listeners.pointermove({ pointerId: 2, clientX: 160, clientY: 100 });
  layer.listeners.pointerup({ pointerId: 2, clientX: 160, clientY: 100 });
  assert.equal(aimed.length, 1, 'a drag only aims');
  ui.tapAt(500, 250);
  assert.equal(aimed.length, 2);
  M.onFound(null);
});
