import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/camera.js', 'game/round.js',
  'game/hint-pointer.js', 'game/ui/hint-arrow.js', 'game/ui/hint-flow.js'];
const load = () => loadGame(FILES);
const ROUND_FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/round.js'];
const CAM = { x: 0, z: 0, dist: 40, yaw: 0, pitch: 55 };

test('locate: a target at the look-at point is visible and centred', () => {
  const SA = load();
  const r = SA.hintPointer.locate({ x: 0, y: 0, z: 0 }, CAM, 16 / 9);
  assert.equal(r.visible, true);
  assert.ok(Math.abs(r.ex) < 1e-6 && Math.abs(r.ey) < 1e-6);
});

test('locate: off-screen targets point toward them from the matching screen edge', () => {
  const SA = load();
  const E = SA.hintPointer.EDGE;
  const right = SA.hintPointer.locate({ x: 70, y: 0, z: 0 }, CAM, 16 / 9);
  assert.equal(right.visible, false);
  assert.ok(Math.abs(right.angle) < 0.1, 'points right');
  assert.ok(Math.abs(right.ex - E.right) < 1e-6);
  const left = SA.hintPointer.locate({ x: -70, y: 0, z: 0 }, CAM, 16 / 9);
  assert.ok(Math.abs(Math.abs(left.angle) - Math.PI) < 0.1, 'points left');
  assert.ok(Math.abs(left.ex - E.left) < 1e-6);
  const up = SA.hintPointer.locate({ x: 0, y: 0, z: -200 }, CAM, 16 / 9);   // far north (away from the camera)
  assert.equal(up.visible, false);
  assert.ok(up.angle > 1.3 && up.angle < 1.9, 'points up');
  assert.ok(Math.abs(up.ey - E.top) < 1e-6);
  const down = SA.hintPointer.locate({ x: 0, y: 0, z: 60 }, CAM, 16 / 9);   // behind/below the camera
  assert.equal(down.visible, false);
  assert.ok(down.angle < -1.3 && down.angle > -1.9, 'points down');
  assert.ok(Math.abs(down.ey - E.bottom) < 1e-6);
});

test('locate: yaw rotates the arrow with the view, and bad input never throws', () => {
  const SA = load();
  const turned = { ...CAM, yaw: 90 };   // camera on the east side looking west: screen-right is -z
  const r = SA.hintPointer.locate({ x: 0, y: 0, z: 60 }, turned, 16 / 9);
  assert.equal(r.visible, false);
  assert.ok(Math.abs(Math.abs(r.angle) - Math.PI) < 0.1, 'z+ is to the left');
  for (const v of [NaN, Infinity, -Infinity, 1e9]) {
    const o = SA.hintPointer.locate({ x: v, z: v }, { x: v, z: v, dist: v, yaw: v, pitch: v }, v);
    assert.ok(Number.isFinite(o.angle) && Number.isFinite(o.ex) && Number.isFinite(o.ey), `finite for ${v}`);
  }
  const same = SA.hintPointer.locate({ x: 0, y: 0, z: 0 }, CAM, 0);   // junk aspect falls back to 1
  assert.equal(same.visible, true);
});

test('pointer: shows only after the idle delay and only while off-screen; hides when stopped', () => {
  const SA = load();
  const p = SA.hintPointer.create();
  const far = { x: 70, y: 0, z: 0 }, near = { x: 0, y: 0, z: 0 };
  assert.equal(p.update(1, far, CAM, 1.5), null, 'inactive before start');
  p.start();
  assert.equal(SA.hintPointer.DELAY_SECONDS, 10);
  assert.equal(p.update(9.9, far, CAM, 1.5), null, 'too early');
  assert.ok(p.update(0.2, far, CAM, 1.5), 'after ~10 s the arrow appears');
  assert.equal(p.update(0.1, near, CAM, 1.5), null, 'hidden while the target is on screen');
  assert.ok(p.update(0.1, far, CAM, 1.5), 'back when it leaves the view');
  p.stop();
  assert.equal(p.update(1, far, CAM, 1.5), null, 'hidden after a correct pick');
  p.start();
  assert.equal(p.update(1, far, CAM, 1.5), null, 'a new round restarts the idle clock');
});

test('pointer: tap glides toward the target and counts one hint per round', () => {
  const SA = load();
  const hints = [], glides = [];
  const p = SA.hintPointer.create({ onHint: () => hints.push(1), glide: (x, z) => glides.push([x, z]) });
  assert.equal(p.tap({ x: 1, z: 2 }), false, 'ignored when inactive');
  p.start();
  assert.equal(p.tap(null), false);
  p.tap({ x: 5, z: -3 });
  p.tap({ x: 6, z: -3 });
  assert.equal(hints.length, 1);
  assert.deepEqual(glides, [[5, -3], [6, -3]]);
  p.start();
  p.tap({ x: 1, z: 1 });
  assert.equal(hints.length, 2);
});

test('round.pointerHint counts a hint once and only while the round is live', () => {
  const SA = loadGame([...ROUND_FILES]);
  SA.save.reset();
  const events = [];
  const game = SA.round.create({ rng: SA.clues.makeRng(7), level: 1, track: (type, f) => events.push({ type, ...f }) });
  assert.equal(game.pointerHint(), null, 'no round yet');
  const r = game.start();
  game.pointerHint();
  game.pointerHint();
  assert.equal(r.hints, 1);
  game.pick({ animalId: r.answerId, part: 'cuerpo' });
  assert.equal(game.pointerHint(), null, 'done round');
  const done = events.find((e) => e.type === 'round.complete');
  assert.equal(done.hints, 1, 'round.complete reports the arrow use as a hint');
});

function fakeDom() {
  const made = [];
  const doc = { body: { appendChild() {} }, createElement() {
    const e = { style: {}, attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.listeners[t] = f; } };
    made.push(e);
    return e;
  } };
  return { doc, made };
}

test('hint arrow: DOM button is positioned from NDC and taps call back; no DOM is a no-op', () => {
  const SA = load();
  const { doc, made } = fakeDom();
  let taps = 0;
  const a = SA.hintArrow.create(doc, () => taps++);
  a.show(1, 0, 0);
  assert.equal(made[0].style.display, 'block');
  assert.match(made[0].style.left, /100%/);
  a.hide();
  assert.equal(made[0].style.display, 'none');
  made[0].listeners.click();
  assert.equal(taps, 1);
  const n = SA.hintArrow.create(null);
  n.show(0, 0, 0); n.hide();
});

test('hint flow: arrow appears after the delay, tap glides + records a hint in round.complete, correct pick hides it', () => {
  const SA = load();
  const hints = [];
  let round = { id: 'r1', answerId: 'zorro', done: false, hints: 0 };
  const game = { current: () => round, pointerHint: () => { round.hints += 1; hints.push(1); } };
  const glides = [];
  const rig = { getState: () => ({ ...CAM }), glideTo: (x, z) => glides.push([x, z]) };
  const animals = { getObjectByName: (id) => (id === 'zorro' ? { position: { x: 70, y: 0, z: 0 } } : null) };
  const { doc, made } = fakeDom();
  const flow = SA.hintFlow.create({ doc, game, animals, rig, camera: { aspect: 1.5 } });
  assert.equal(flow.update(5), null);
  assert.equal(made[0].style.display, undefined, 'still hidden before the delay');
  assert.ok(flow.update(5.1), 'visible after 10 s');
  assert.equal(made[0].style.display, 'block');
  made[0].listeners.click();
  made[0].listeners.click();
  assert.equal(round.hints, 1, 'one hint per round');
  assert.deepEqual(glides[0], [70, 0]);
  round.done = true;
  assert.equal(flow.update(1), null);
  assert.equal(made[0].style.display, 'none', 'hidden on a correct pick');
  round = { id: 'r2', answerId: 'zorro', done: false, hints: 0 };
  assert.equal(flow.update(9), null, 'new round restarts the idle clock');
  assert.ok(flow.update(1.5));
  round = null;
  assert.equal(flow.update(1), null);
  assert.equal(made[0].style.display, 'none');
});

const hits = (x, y, r, half = 36) => x + half > r.left && x - half < r.right && y + half > r.top && y - half < r.bottom;
const VIEWPORTS = [{ w: 1024, h: 768 }, { w: 1280, h: 720 }];
const TARGETS = { right: [70, -0], left: [-70, 0], up: [0, -200], down: [0, 60],
  'up-right': [70, -200], 'up-left': [-70, -200], 'down-right': [70, 60], 'down-left': [-70, 60] };
const toPx = (vp, r) => [(r.ex + 1) / 2 * vp.w, (1 - r.ey) / 2 * vp.h];

test('avoid: arrow box clears mute/habitat/gear/orbit rects, stays on-screen and keeps its angle (all edges + corners)', () => {
  const SA = load();
  for (const vp of VIEWPORTS) {
    const rects = SA.hintPointer.controlRects(vp);
    assert.equal(rects.length, 4);
    for (const [name, [x, z]] of Object.entries(TARGETS)) {
      const p = SA.hintPointer.create({ delaySeconds: 0 });
      p.start();
      const raw = SA.hintPointer.locate({ x, y: 0, z }, CAM, vp.w / vp.h);
      const r = p.update(0.1, { x, y: 0, z }, CAM, vp.w / vp.h, vp);
      assert.ok(r, `${name} ${vp.w}x${vp.h}: arrow shown`);
      assert.equal(r.angle, raw.angle, `${name}: still points toward the target`);
      const [px, py] = toPx(vp, r);
      assert.ok(px >= 36 && px <= vp.w - 36 && py >= 36 && py <= vp.h - 36, `${name} ${vp.w}x${vp.h}: on-screen`);
      for (const rc of rects) assert.ok(!hits(px, py, rc), `${name} ${vp.w}x${vp.h}: clear of ${JSON.stringify(rc)}`);
    }
  }
});

test('avoid: sweeping the whole edge never lands in a reserved rect; clear spots are left alone', () => {
  const SA = load();
  const E = SA.hintPointer.EDGE;
  for (const vp of VIEWPORTS) {
    const rects = SA.hintPointer.controlRects(vp);
    for (let deg = 0; deg < 360; deg += 3) {
      const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const k = Math.min(Math.abs(c) < 1e-9 ? Infinity : (c > 0 ? E.right : -E.left) / Math.abs(c),
        Math.abs(s) < 1e-9 ? Infinity : (s > 0 ? E.top : -E.bottom) / Math.abs(s));
      const ex = c * k, ey = s * k;
      const o = SA.hintPointer.avoid(vp, rects, ex, ey);
      const [px, py] = toPx(vp, o);
      for (const rc of rects) assert.ok(!hits(px, py, rc), `${deg} deg ${vp.w}x${vp.h}`);
      const [ox, oy] = toPx(vp, { ex, ey });
      if (!rects.some((rc) => hits(ox, oy, rc, 36 + 8))) assert.ok(o.ex === ex && o.ey === ey, 'unchanged when already clear');
    }
  }
});

test('avoid: a right-edge arrow on the habitat button slides off it; degenerate input is returned as-is', () => {
  const SA = load();
  const vp = VIEWPORTS[0], E = SA.hintPointer.EDGE;
  const o = SA.hintPointer.avoid(vp, SA.hintPointer.controlRects(vp), E.right, 0.55);
  assert.ok(o.ey < 0.55 && o.ex > 0.8, 'moved down along the right edge');
  const same = (r) => assert.ok(r.ex === 0.5 && r.ey === 0.5);
  same(SA.hintPointer.avoid(null, [], 0.5, 0.5));
  same(SA.hintPointer.avoid(vp, null, 0.5, 0.5));
  same(SA.hintPointer.avoid(vp, [{ left: -10, top: -10, right: 2000, bottom: 2000 }], 0.5, 0.5));   // nowhere free
  assert.equal(SA.hintPointer.controlRects(null).length, 4);
});

test('hint flow: passes the window size so the arrow clears the controls', () => {
  const SA = loadGame(FILES, { innerWidth: 1024, innerHeight: 768 });
  const round = { id: 'r1', answerId: 'zorro', done: false, hints: 0 };
  const game = { current: () => round, pointerHint() {} };
  const animals = { getObjectByName: () => ({ position: { x: 70, y: 0, z: -200 } }) };
  const { doc } = fakeDom();
  const flow = SA.hintFlow.create({ doc, game, animals, rig: { getState: () => ({ ...CAM }), glideTo() {} }, camera: { aspect: 4 / 3 } });
  flow.update(0.1);
  const r = flow.update(10.1);
  const [px, py] = toPx({ w: 1024, h: 768 }, r);
  for (const rc of SA.hintPointer.controlRects({ w: 1024, h: 768 })) assert.ok(!hits(px, py, rc));
});
