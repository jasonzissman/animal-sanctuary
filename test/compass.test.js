import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/save.js',
  'game/map.js', 'game/peaks.js', 'game/station.js', 'game/npc.js', 'game/player.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/camera.js', 'game/hud.js', 'game/hint-pointer.js', 'game/mission-spawn.js',
  'game/mission-runtime.js', 'game/compass.js', 'game/ui/compass-view.js'];
const load = () => { const SA = loadGame(FILES); SA.save.reset(); return SA; };
const cam = (yaw = 0) => ({ x: 0, z: 0, dist: 20, yaw, pitch: 35, lookY: 1 });
const P = { x: 0, z: 0 };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

test('angle: points ahead / right / left / behind relative to the camera', () => {
  const SA = load(), A = SA.compass.angle;
  near(A(P, { x: 0, z: -20 }, 0), Math.PI / 2, 'ahead');
  near(A(P, { x: 20, z: 0 }, 0), 0, 'right');
  near(Math.abs(A(P, { x: -20, z: 0 }, 0)), Math.PI, 'left');
  near(A(P, { x: 0, z: 20 }, 0), -Math.PI / 2, 'behind points down');
});

test('angle: turning the camera turns the arrow the other way', () => {
  const SA = load(), A = SA.compass.angle, T = { x: 0, z: -20 };
  near(A(P, T, 90), 0, 'yaw 90: the target that was ahead is now to the right');
  near(A(P, { x: -20, z: 0 }, 90), Math.PI / 2, 'yaw 90 looks toward -x');
  near(A(P, T, 180), -Math.PI / 2, 'yaw 180: the target is behind, the arrow points down');
});

test('evaluate: far targets show a full-size arrow; no target, junk or reached hides it', () => {
  const SA = load(), E = SA.compass.evaluate;
  const far = E({ target: { x: 0, z: -40 }, player: P, cam: cam(), aspect: 1.6 });
  assert.equal(far.show, true);
  assert.equal(far.scale, 1);
  assert.equal(far.pulse, false);
  assert.equal(E({ target: null, player: P, cam: cam() }).show, false);
  assert.equal(E({ target: { x: NaN, z: 0 }, player: P, cam: cam() }).reason, 'none');
  const reached = E({ target: { x: 1, z: 1 }, player: P, cam: cam(), aspect: 1.6 });
  assert.equal(reached.show, false);
  assert.equal(reached.reason, 'reached');
});

test('evaluate: near and on screen hides; near but behind the camera still points; close shrinks and pulses', () => {
  const SA = load(), E = SA.compass.evaluate;
  const seen = E({ target: { x: 0, z: -6 }, player: P, cam: cam(), aspect: 1.6 });
  assert.equal(seen.show, false);
  assert.equal(seen.reason, 'near');
  const lowCam = { x: 0, z: 0, dist: 4, yaw: 0, pitch: 10, lookY: 1 };   // the camera sits 4 behind the player: a target 7 behind is behind it
  const offscreen = E({ target: { x: 0, z: 7 }, player: P, cam: lowCam, aspect: 1.6 });
  assert.equal(offscreen.show, true, 'near the player but out of the frame: the arrow stays');
  assert.equal(offscreen.reason, 'close');
  const mid = E({ target: { x: 0, z: -15 }, player: P, cam: cam(), aspect: 1.6 });
  assert.equal(mid.pulse, true);
  assert.ok(mid.scale < 1 && mid.scale >= SA.compass.MIN_SCALE);
  const closer = E({ target: { x: 0, z: -9 }, player: P, cam: cam(), aspect: 1.6 });
  assert.ok(closer.scale < mid.scale, 'smaller as it gets closer');
});

test('evaluate: hysteresis keeps a near target hidden until it is clearly farther away', () => {
  const SA = load(), E = SA.compass.evaluate;
  const t = { x: 0, z: -(SA.compass.NEAR + 1) };   // just outside NEAR
  assert.equal(E({ target: t, player: P, cam: cam(), aspect: 1.6, wasShown: true }).show, true);
  assert.equal(E({ target: t, player: P, cam: cam(), aspect: 1.6, wasShown: false }).show, false, 'was hidden: stays hidden inside NEAR + SLACK');
});

test('Mission 1: the arrow points at the piglet, then at mamá; the arrow follows the camera', () => {
  const SA = load();
  SA.missions.start('mama');
  const cur = SA.missionSpawn.sync({ solids: () => [] });
  const rt = SA.missionRuntime.create({ celebrate: () => {}, grant: () => {}, track: () => {} });
  const player = { x: cur.baby.x + 30, z: cur.baby.z + 10 };
  let t = rt.target();
  assert.equal(t.role, 'baby');
  for (const yaw of [0, 75, 200, -120]) {
    const r = SA.compass.evaluate({ target: t, player, cam: { ...cam(yaw), x: player.x, z: player.z }, aspect: 1.6 });
    near(r.angle, SA.compass.angle(player, cur.baby, yaw), `piglet at yaw ${yaw}`);
  }
  const a0 = SA.compass.angle(player, t, 0), a1 = SA.compass.angle(player, t, 30);
  assert.ok(Math.abs(a0 - a1) > 0.3, 'turning the camera 30 degrees turns the arrow');
  assert.equal(rt.update({ x: cur.baby.x + 1, z: cur.baby.z }).status, 'step');   // the piglet is found, it follows
  t = rt.target();
  assert.equal(t.role, 'mama');
  const r2 = SA.compass.evaluate({ target: t, player, cam: { ...cam(0), x: player.x, z: player.z }, aspect: 1.6 });
  near(r2.angle, SA.compass.angle(player, cur.mama, 0), 'now mamá');
  const done = SA.compass.evaluate({ target: t, player: { x: cur.mama.x + 1, z: cur.mama.z }, cam: cam(), aspect: 1.6 });
  assert.equal(done.show, false, 'reached mamá: hidden');
  SA.missions.abandon();
  SA.missionSpawn.sync();
  assert.equal(rt.target(), null, 'no mission: no target, no arrow');
});

test('place: never overlaps the prompt pill, star badge, menu items, hotbar, joystick or the fixed buttons', () => {
  const SA = load();
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const [width, height] of [[1280, 800], [1024, 768], [800, 600], [412, 800], [360, 640], [1920, 1080]]) {
    const s = SA.compass.place({ width, height });
    const box = { left: s.left, top: s.top, right: s.left + s.size, bottom: s.top + s.size };
    assert.ok(box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height, `${width}x${height}: on screen`);
    const lay = SA.hud.layout({ width, height });
    for (const id of ['prompt', 'stars', 'menu', 'audioUi', 'sandbox', 'album', 'settings', 'hotbar', 'feedTray', 'joystick', 'orbitPad', 'use', 'jump', 'climb']) {
      const r = lay[id];
      assert.equal(hit(box, { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height }), false, `${width}x${height}: clear of ${id}`);
    }
    for (const r of SA.hintPointer.controlRects({ w: width, h: height })) assert.equal(hit(box, r), false, `${width}x${height}: clear of a fixed button`);
  }
});

test('tracker: compass.shown / compass.hidden fire on changes, not every frame', () => {
  const SA = load(), ev = [];
  const tr = SA.compass.create({ track: (t, f) => ev.push([t, f]) });
  const far = { target: { x: 0, z: -40, role: 'baby' }, player: P, cam: cam(), aspect: 1.6 };
  const reached = { target: { x: 0, z: -1, role: 'baby' }, player: P, cam: cam(), aspect: 1.6 };
  tr.update(0.1, far); tr.update(0.1, far);
  assert.equal(JSON.stringify(ev), JSON.stringify([['compass.shown', { role: 'baby' }]]));
  tr.update(0.1, reached);
  assert.equal(ev.length, 1, 'a flicker inside the gap is not reported');
  tr.update(4, far);
  tr.update(4, reached);
  assert.equal(JSON.stringify(ev.slice(-1)), JSON.stringify([['compass.hidden', { reason: 'reached' }]]));
  assert.equal(tr.shown(), false);
  const quiet = SA.compass.create({ track: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => quiet.update(0.1, far));
});

function fakeDoc() {
  const el = { style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '' };
  return { el, createElement: () => el, body: { appendChild() {} } };
}

test('view: shows and rotates the arrow, hides when reached, and is a no-op without a DOM', () => {
  const SA = load();
  assert.equal(SA.compassView.create({}).update(0.1), null);
  SA.missions.start('mama');
  const cur = SA.missionSpawn.sync({ solids: () => [] });
  const rt = SA.missionRuntime.create({ celebrate: () => {}, grant: () => {}, track: () => {} });
  const doc = fakeDoc();
  let player = { x: cur.baby.x + 30, z: cur.baby.z }, yaw = 0;
  const rig = { getPlayer: () => player, getState: () => ({ ...cam(yaw), x: player.x, z: player.z }) };
  const v = SA.compassView.create({ doc, runtime: rt, rig, camera: { aspect: 1.6 }, track: () => {} });
  v.update(0.016);
  assert.equal(doc.el.style.display, 'block');
  assert.match(doc.el.style.cssText, /pointer-events:none/, 'taps go through the arrow');
  const before = doc.el.style.transform;
  yaw = 60; v.update(0.016);
  assert.notEqual(doc.el.style.transform, before, 'turning the camera rotates the arrow');
  assert.equal(doc.el.attrs['aria-hidden'], 'true');
  assert.ok(!/text|<text/i.test(doc.el.innerHTML), 'no text in the arrow');
  player = { x: cur.baby.x + 0.5, z: cur.baby.z }; v.update(0.016);
  assert.equal(doc.el.style.display, 'none');
});

test('index.html loads the compass after hint-pointer and the hud', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf(`game/${f}`);
  assert.ok(at('compass.js') > at('hint-pointer.js') && at('compass.js') > at('hud.js') && at('ui/compass-view.js') > at('compass.js'));
});
