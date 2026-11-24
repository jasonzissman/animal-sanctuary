// AS-0170: the day/night clock (pure), its save, the station bed target, the sleep view and the renderer (real three.js, no WebGL needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/daynight.js'];
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
const plain = (o) => JSON.parse(JSON.stringify(o));
const load = (extra = {}) => loadGame(FILES, { localStorage: fakeStorage(), ...extra });

test('phases follow the data constants: ~7 min day, 45 s dusk, 2.5 min night, 45 s dawn', () => {
  const D = load().daynight;
  assert.equal(D.DAY_MS, 420000); assert.equal(D.DUSK_MS, 45000); assert.equal(D.NIGHT_MS, 150000); assert.equal(D.DAWN_MS, 45000);
  assert.equal(D.CYCLE_MS, 660000);
  assert.equal(D.phaseAt(0), 'day'); assert.equal(D.phaseAt(419999), 'day');
  assert.equal(D.phaseAt(420000), 'dusk'); assert.equal(D.phaseAt(464999), 'dusk');
  assert.equal(D.phaseAt(465000), 'night'); assert.equal(D.phaseAt(614999), 'night');
  assert.equal(D.phaseAt(615000), 'dawn'); assert.equal(D.phaseAt(659999), 'dawn');
  assert.equal(D.phaseAt(660000), 'day', 'the cycle wraps');
  assert.equal(D.phaseAt(-1), 'dawn');
});

test('light is 1 by day, eases down through dusk to MIN_LIGHT, stays there at night and eases back up in the dawn', () => {
  const D = load().daynight;
  assert.equal(D.lightAt(1000), 1);
  assert.ok(D.MIN_LIGHT > 0 && D.MIN_LIGHT < 0.5, 'night is dim but never black');
  assert.ok(Math.abs(D.lightAt(465000) - D.MIN_LIGHT) < 1e-9);
  assert.ok(Math.abs(D.lightAt(540000) - D.MIN_LIGHT) < 1e-9);
  let prev = 1;
  for (let t = 420000; t <= 465000; t += 1000) { const l = D.lightAt(t); assert.ok(l <= prev + 1e-12, 'dusk only darkens'); prev = l; }
  prev = D.MIN_LIGHT;
  for (let t = 615000; t <= 660000; t += 1000) { const l = D.lightAt(t); assert.ok(l >= prev - 1e-12, 'dawn only brightens'); prev = l; }
  for (let t = 0; t < 660000; t += 500) { const l = D.lightAt(t); assert.ok(l >= D.MIN_LIGHT - 1e-12 && l <= 1, 'always within MIN_LIGHT..1'); }
  assert.equal(D.darkAt(1000), 0); assert.equal(D.darkAt(540000), 1);
});

test('the clock advances, wraps, reports phase/light/dark/isNight and fires onPhase once per change', () => {
  const D = load().daynight;
  const c = D.create({ t: 419000, save: false });
  const seen = [];
  const off = c.onPhase((e) => seen.push(e.from + '>' + e.to));
  assert.equal(c.phase(), 'day'); assert.equal(c.isNight(), false); assert.equal(c.light(), 1);
  c.update(0.5); assert.deepEqual(seen, []);
  c.update(1); assert.deepEqual(seen, ['day>dusk']); assert.equal(c.phase(), 'dusk');
  c.update(22); assert.equal(c.isNight(), true, 'the second half of dusk counts as night');
  c.update(30); assert.deepEqual(seen, ['day>dusk', 'dusk>night']);
  assert.ok(Math.abs(c.light() - D.MIN_LIGHT) < 1e-9); assert.equal(c.dark(), 1);
  c.update(150); c.update(46); assert.deepEqual(seen.slice(2), ['night>dawn', 'dawn>day']);
  off(); c.update(500);
  assert.equal(seen.length, 4, 'an unsubscribed listener hears nothing');
  assert.ok(c.time() >= 0 && c.time() < D.CYCLE_MS);
  c.update(-5); c.update(NaN);   // junk dt is ignored
});

test('a new clock starts in the morning; a bad time falls back to it', () => {
  const D = load().daynight;
  assert.equal(D.create({ save: false }).phase(), 'day');
  assert.equal(D.create({ t: 'x', save: false }).time(), D.START_MS);
  assert.equal(D.create({ t: NaN, save: false }).time(), D.START_MS);
  assert.equal(D.create({ t: 660000 + 40000, save: false }).time(), 40000, 'a time past one cycle wraps');
});

test('sun and moon arcs: the sun rises in the east at dawn and sets in the west at the end of dusk; the moon is up from dusk to dawn', () => {
  const D = load().daynight;
  const at = (t) => D.create({ t, save: false });
  const dawn = at(615000).sun(), noon = at(210000).sun();
  assert.equal(dawn.up, true); assert.ok(dawn.x < -0.9 && dawn.y < 0.05, 'low in the east at the start of dawn');
  assert.ok(noon.y > 0.95 && Math.abs(noon.x) < 0.2, 'high in the middle of the day');
  const dusk = at(464000).sun();
  assert.ok(dusk.x > 0.9 && dusk.y < 0.1, 'low in the west as dusk ends');
  assert.equal(at(540000).sun().up, false, 'no sun at night');
  assert.equal(at(1000).moon().up, false, 'no moon by day');
  const m = at(540000).moon();
  assert.equal(m.up, true); assert.ok(m.y > 0.5);
  assert.ok(at(430000).moon().x < 0, 'the moon rises in the east');
});

test('the bed: sleep() jumps from dusk or night to the start of dawn and says so; by day or at dawn it does nothing', () => {
  const D = load().daynight;
  const events = [];
  const c = D.create({ t: 500000, save: false, track: (t, f) => events.push(t) });
  const seen = [];
  c.onPhase((e) => seen.push(e.to));
  assert.equal(c.sleep(), true);
  assert.equal(c.phase(), 'dawn'); assert.equal(c.time(), 615000);
  assert.deepEqual(seen, ['dawn']);
  assert.ok(events.includes('daynight.sleep') && events.includes('daynight.phase'));
  assert.equal(c.sleep(), false, 'nothing to sleep through at dawn');
  const day = D.create({ t: 1000, save: false });
  assert.equal(day.sleep(), false); assert.equal(day.time(), 1000);
  const dusk = D.create({ t: 430000, save: false });
  assert.equal(dusk.sleep(), true); assert.equal(dusk.phase(), 'dawn');
});

test('the clock time is saved (every few seconds and on sleep) and restored by the shared instance', () => {
  const storage = fakeStorage();
  const SA = loadGame(FILES, { localStorage: storage });
  SA.save.load();
  const c = SA.daynight.create({ t: 100000 });
  c.update(2); assert.equal(SA.save.get().daynight, undefined, 'not saved on every frame');
  c.update(4); assert.deepEqual(plain(SA.save.get().daynight), { t: 106000 });
  c.save(); SA.save.flush();
  assert.equal(JSON.parse(storage._m.get('santuario_save_v1')).daynight.t, 106000);
  // A new page load: the shared instance starts from the saved time.
  const SA2 = loadGame(FILES, { localStorage: storage });
  SA2.save.load();
  assert.equal(SA2.daynight.instance().time(), 106000);
  assert.equal(SA2.daynight.instance(), SA2.daynight.instance());
});

test('the save keeps a good daynight value and drops a bad one without touching the rest', () => {
  const SA = load();
  SA.save.load();
  assert.equal(SA.save.get().daynight, undefined, 'absent until the clock first saves');
  SA.save.update({ stars: 3, daynight: { t: 12345.9 } });
  assert.deepEqual(plain(SA.save.get().daynight), { t: 12345 });
  SA.save.update({ daynight: { t: -4 } });
  assert.deepEqual(plain(SA.save.get().daynight), {});
  assert.equal(SA.save.get().stars, 3);
  assert.equal(SA.daynight.instance().time(), SA.daynight.START_MS, 'an empty saved value starts in the morning');
  assert.equal(SA.daynight.isNight(), false);
});

test('the rescue log records "night" from the clock when the caller does not say', () => {
  const SA = loadGame(FILES.concat(['game/data/badges.js', 'game/badges.js', 'game/rescue-log.js']), { localStorage: fakeStorage() });
  SA.save.load();
  const inst = SA.daynight.instance();
  assert.equal(SA.rescueLog.record({ kind: 'x', animalId: 'conejo', key: 'a' }).added, true);
  inst.update(500);   // 30 s -> 530 s: night
  assert.equal(inst.isNight(), true);
  SA.rescueLog.record({ kind: 'x', animalId: 'pato', key: 'b' });
  SA.rescueLog.record({ kind: 'x', animalId: 'mono', key: 'c', night: false });
  const rows = SA.save.get().rescues;
  assert.deepEqual(plain(rows.map((r) => r.night)), [false, true, false]);
});

// --- station bed, sleep view, renderer ------------------------------------------------------------------------------

const STATION = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/camera.js', 'game/station.js', 'game/station-board.js'];

test('the station has a bed inside and a porch lamp; the bed is a solid low box and a Use target that sleeps (source "bed")', () => {
  const SA = loadGame(STATION);
  const L = SA.station.layout();
  assert.ok(L.bed.x > L.cx - L.halfW && L.bed.x < L.cx + L.halfW && L.bed.z > L.cz - L.halfD && L.bed.z < L.cz + L.halfD, 'inside the room');
  assert.ok(L.lamp.z < L.door.z, 'the lamp is on the outer face of the front wall');
  const t = SA.station.bedTarget();
  assert.equal(t.id, 'station-bed'); assert.equal(t.kind, 'board'); assert.equal(t.source, 'bed');
  assert.equal(SA.station.bedTarget(), t); assert.ok(SA.station.boardTargets().includes(t));
  const box = SA.station.collisionBoxes().filter((b) => Math.abs((b.x0 + b.x1) / 2 - L.bed.x) < 1e-9 && Math.abs((b.z0 + b.z1) / 2 - L.bed.z) < 1e-9);
  assert.equal(box.length, 1); assert.ok(box[0].y1 - box[0].y0 <= 0.6, 'low enough to jump');
  // Nothing else blocks the way from the doorway to the bed's side: the room has space around it.
  assert.ok(L.bed.x + L.bed.w / 2 < L.cx + L.halfW - L.wallT / 2 + 1e-9, 'the bed is not inside the east wall');
  assert.ok(L.bed.z + L.bed.d / 2 < L.cz + L.halfD - L.wallT / 2 + 1e-9, 'nor inside the back wall');
});

test('sleep view: at night it fades, skips to dawn and says the word; by day it only says el sol', () => {
  const SA = load();
  const said = [];
  SA.audio = { say: (k) => said.push(k) };
  const timers = [];
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, textContent: '' });
  const doc = { createElement: el, body: el() };
  const run = () => { while (timers.length) timers.shift()(); };
  const ctx = vm.createContext({ console }); ctx.window = ctx;
  ctx.SA = SA;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'game/ui/sleep-view.js'), 'utf8'), ctx);
  const clock = SA.daynight.create({ t: 500000, save: false });
  const view = ctx.SA.sleepView.create(doc, { clock, setTimeout: (f) => timers.push(f) });
  assert.equal(ctx.SA.sleepView.use(), true);
  assert.equal(clock.phase(), 'night', 'the skip happens behind the fade, not at once');
  run();
  assert.equal(clock.phase(), 'dawn');
  assert.ok(said.includes('thing:noche'));
  assert.equal(view.go(), false, 'dawn: nothing to sleep through');
  assert.ok(said.includes('thing:sol'));
});

function threeCtx(files) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/station.js', 'game/daynight.js'].concat(files)) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

test('the renderer: sky, fog, lights, sun, moon, stars, fireflies and the station lamps follow the clock', () => {
  const ctx = threeCtx(['game/render/station-night.js', 'game/render/daynight.js']);
  const { THREE, SA } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe6f5); scene.fog = new THREE.Fog(0xbfe6f5, 70, 150);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 0.75), sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
  scene.add(hemi, sun);
  const clears = [];
  const renderer = { setClearColor: (c) => clears.push(c.getHex()) };
  const night = SA.render.buildStationNight(THREE, { layout: SA.station.layout(), glass: new THREE.MeshPhongMaterial({ color: 0x9fd8ea }) });
  const station = { userData: { night } };
  scene.add(night.group);
  const clock = SA.daynight.create({ t: 100000, save: false });
  const v = SA.render.createDaynight(THREE, { scene, renderer, hemi, sun, getPlayer: () => ({ x: 5, y: 0, z: 5 }), station, clock });
  const snap = () => ({ sky: scene.background.getHex(), fog: scene.fog.far, hemi: hemi.intensity, sun: sun.intensity, rim: v.rim.intensity });
  v.update(1 / 60);
  const day = snap();
  assert.equal(day.sky, 0xbfe6f5); assert.equal(day.sun, 0.85); assert.equal(day.rim, 0); assert.equal(day.hemi, 0.75);
  assert.equal(night.group.children.some((c) => c.isLight && c.intensity > 0), false, 'the porch light is off by day');
  // Dusk: warm and darker, smoothly.
  clock.update(333); v.update(1 / 60);
  const dusk = snap();
  assert.ok(dusk.sun < day.sun && dusk.sun > 0, 'the sun is fading in the dusk'); assert.notEqual(dusk.sky, day.sky);
  // Night: dark blue sky, no sun, a soft rim light, readable ambient, lamps on.
  clock.update(100); v.update(1 / 60);
  const dark = snap();
  assert.equal(dark.sun, 0); assert.ok(dark.rim > 0.4 && dark.rim <= 0.55);
  assert.ok(dark.hemi >= 0.2 * SA.daynight.MIN_LIGHT + 0.2 - 1e-9 && dark.hemi < day.hemi, 'dim but readable');
  assert.ok(dark.fog < day.fog);
  assert.equal(scene.background.getHex(), clears[clears.length - 1], 'background and clear colour agree');
  const sky = new THREE.Color(0x131f4a);
  assert.ok(Math.abs(scene.background.b - sky.b) < 1e-6, 'deep blue');
  const lights = night.group.children.filter((c) => c.isLight);
  assert.ok(lights.length === 1 && lights[0].intensity > 1, 'the porch lamp glows at night');
  const pts = scene.children.filter((c) => c.isPoints);
  assert.ok(pts.length >= 1, 'fireflies are in the scene');
  assert.ok(pts[0].material.opacity > 0.3 && pts[0].material.visible !== false, 'fireflies show at night');
  const sky3d = scene.children.filter((c) => c.isGroup && c.children.some((k) => k.isPoints));
  assert.equal(sky3d.length, 1); assert.equal(sky3d[0].position.x, 5);
  const stars = sky3d[0].children.filter((k) => k.isPoints);
  assert.equal(stars.length, 2); assert.ok(stars.every((s) => s.material.opacity > 0.2), 'stars are out');
  const moon = sky3d[0].children.filter((k) => k.isMesh)[1];
  assert.equal(moon.visible, true); assert.ok(moon.material.opacity > 0.9);
  // Morning: back to bright, lamps off.
  assert.equal(clock.sleep(), true);
  clock.update(60); v.update(1 / 60);
  const morning = snap();
  assert.ok(morning.sun > 0.8 && morning.rim === 0 && morning.hemi > 0.7);
  assert.equal(lights[0].intensity, 0);
});

test('the shadow sun follows the clock: the offset the shadow light uses moves with the sun', () => {
  const ctx = threeCtx(['game/render/station-night.js', 'game/render/daynight.js', 'game/render/sun-shadow.js']);
  const { THREE, SA } = ctx;
  const scene = new THREE.Scene(), hemi = new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 0.75), sun = new THREE.DirectionalLight(0xfff2d6, 0.85);
  scene.add(hemi, sun);
  const clock = SA.daynight.create({ t: 100000, save: false });
  const v = SA.render.createDaynight(THREE, { scene, renderer: {}, hemi, sun, clock });
  v.update(0.1);
  const a = Object.assign({}, SA.render.SUN_SHADOW.offset);
  clock.update(340); v.update(0.1);   // the dusk, the sun low in the west
  const b = SA.render.SUN_SHADOW.offset;
  assert.ok(b.x > a.x, 'the sun moved west');
  assert.ok(b.y < a.y, 'and lower');
  const shadow = SA.render.createSunShadow(THREE, { renderer: { shadowMap: {} }, sun, scene, getPlayer: () => ({ x: 0, z: 0 }), world: scene, casters: [] });
  const before = sun.position.x;
  clock.update(30); v.update(0.1); shadow.update();   // the player has not moved
  assert.notEqual(sun.position.x, before, 'a standing player still gets the new sun direction');
});
