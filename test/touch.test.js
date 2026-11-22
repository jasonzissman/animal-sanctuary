import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/hud.js', 'game/ui/hud-place.js', 'game/joystick.js', 'game/touch.js', 'game/orbit-buttons.js',
  'game/ui/joystick-view.js', 'game/ui/orbit-pad.js', 'game/ui/jump-button.js', 'game/ui/climb-button.js'];

const el = (tag) => ({ tag, style: {}, children: [], l: {}, attrs: {}, appendChild(c) { this.children.push(c); },
  addEventListener(t, f) { this.l[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; },
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
const fakeWin = (coarse) => { const w = { l: {}, matchMedia: () => ({ matches: coarse }), addEventListener(t, f) { w.l[t] = f; } }; return w; };

test('detection: coarse pointer or the first touch / pen pointerdown; a mouse never counts', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.touch.get(null).is(), false, 'no window = not touch');
  assert.equal(SA.touch.get(fakeWin(true)).is(), true, 'coarse pointer');
  const throwing = { matchMedia() { throw new Error('nope'); }, addEventListener() {} };
  assert.equal(SA.touch.get(throwing).is(), false);
  const w = fakeWin(false), t = SA.touch.get(w);
  assert.equal(SA.touch.get(w), t, 'one shared tracker per window');
  const seen = [];
  t.onChange((v) => seen.push(v));
  w.l.pointerdown({ pointerType: 'mouse' });
  assert.equal(t.is(), false);
  w.l.pointerdown({ pointerType: 'pen' });
  w.l.pointerdown({ pointerType: 'touch' });
  assert.equal(t.is(), true);
  assert.deepEqual(seen, [true], 'listeners hear the change once');
});

test('visibility rule: touch only; context buttons also need canAct', () => {
  const { visible } = loadGame(FILES).touch;
  assert.equal(visible(false), false);
  assert.equal(visible(false, true), false);
  assert.equal(visible(true), true);
  assert.equal(visible(true, true), true);
  assert.equal(visible(true, false), false);
});

function mount(coarse) {
  const SA = loadGame(FILES), body = el('body'), doc = { createElement: el, body }, win = fakeWin(coarse);
  let prompt = null;
  const rig = { setStick() {}, setOrbitAxes() {}, jump() {}, toggleClimb() {}, climbPrompt: () => prompt };
  SA.joystickView.create(doc, rig, win); SA.orbitPad.create(doc, rig, win);
  SA.jumpButton.create(doc, rig, win);
  const climb = SA.climbButton.create(doc, rig, win);
  const [pad, orbit, jump, climbEl] = body.children;
  return { win, pad, orbit, jump, climbEl, climb, setPrompt: (p) => { prompt = p; } };
}

test('with a mouse and keyboard no touch control ever shows, even next to a tree', () => {
  const m = mount(false);
  m.setPrompt('up'); m.climb.update();
  for (const e of [m.pad, m.orbit, m.jump, m.climbEl]) assert.equal(e.style.display, 'none');
  m.win.l.pointerdown({ pointerType: 'mouse' });
  for (const e of [m.pad, m.orbit, m.jump, m.climbEl]) assert.equal(e.style.display, 'none');
});

test('after the first touch the controls appear; climb still waits until it can act', () => {
  const m = mount(false);
  m.win.l.pointerdown({ pointerType: 'touch' });
  assert.deepEqual([m.pad.style.display, m.orbit.style.display, m.jump.style.display], ['block', 'grid', 'block']);
  m.climb.update();
  assert.equal(m.climbEl.style.display, 'none', 'nothing climbable in reach');
  m.setPrompt('up'); m.climb.update();
  assert.equal(m.climbEl.style.display, 'block');
  m.setPrompt(null); m.climb.update();
  assert.equal(m.climbEl.style.display, 'none');
});

test('a coarse pointer shows the touch controls straight away', () => {
  const m = mount(true);
  assert.deepEqual([m.pad.style.display, m.orbit.style.display, m.jump.style.display], ['block', 'grid', 'block']);
});
