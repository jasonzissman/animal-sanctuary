import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const plain = (o) => JSON.parse(JSON.stringify(o));
const load = () => loadGame(['game/sa.js', 'game/orbit-buttons.js']);

test('four icon-only buttons map to the same axes as Q/E (yaw) and F/R (pitch)', () => {
  const OB = load().orbitButtons;
  assert.deepEqual(plain(OB.BUTTONS.map((b) => b.id)), ['rotLeft', 'rotRight', 'tiltUp', 'tiltDown']);
  assert.deepEqual(plain(OB.axesFor('rotLeft')), { yaw: -1, pitch: 0 });
  assert.deepEqual(plain(OB.axesFor('rotRight')), { yaw: 1, pitch: 0 });
  assert.deepEqual(plain(OB.axesFor('tiltUp')), { yaw: 0, pitch: 1 });
  assert.deepEqual(plain(OB.axesFor('tiltDown')), { yaw: 0, pitch: -1 });
  assert.deepEqual(plain(OB.axesFor('nope')), { yaw: 0, pitch: 0 });
  assert.ok(OB.MIN_SIZE >= 44);
  for (const b of OB.BUTTONS) assert.ok(b.icon.length === 1, 'icon only, no words');
});

test('combine: opposite buttons cancel, different axes add, junk is ignored', () => {
  const OB = load().orbitButtons;
  assert.deepEqual(plain(OB.combine(['rotLeft', 'rotRight'])), { yaw: 0, pitch: 0 });
  assert.deepEqual(plain(OB.combine(['rotRight', 'tiltDown'])), { yaw: 1, pitch: -1 });
  assert.deepEqual(plain(OB.combine(['rotRight', 'rotRight'])), { yaw: 1, pitch: 0 });
  assert.deepEqual(plain(OB.combine()), { yaw: 0, pitch: 0 });
  assert.deepEqual(plain(OB.combine(['x'])), { yaw: 0, pitch: 0 });
});

test('orbit pad: buttons are >= 44px, hold sets axes on the rig, release clears them, no DOM is a no-op', () => {
  const SA = loadGame(['game/sa.js', 'game/hud.js', 'game/ui/hud-place.js', 'game/orbit-buttons.js', 'game/ui/orbit-pad.js']);
  assert.doesNotThrow(() => SA.orbitPad.create(null, {}).release());
  const el = (tag) => ({ tag, style: {}, children: [], l: {}, attrs: {}, appendChild(c) { this.children.push(c); },
    addEventListener(t, f) { this.l[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const body = el('body');
  const doc = { createElement: el, body };
  const calls = [];
  SA.orbitPad.create(doc, { setOrbitAxes: (y, p) => calls.push([y, p]) });
  const wrap = body.children[0];
  assert.equal(wrap.children.length, 4);
  assert.ok(/pointer-events:none/.test(wrap.style.cssText), 'wrapper never blocks picking');
  for (const b of wrap.children) {
    assert.ok(parseInt(b.style.width, 10) >= 44 && parseInt(b.style.height, 10) >= 44);
    assert.equal(wrap.style.width, '120px', 'the block takes its rect from SA.hud (1280x800 fallback viewport)');
    assert.ok(b.attrs['aria-label']);
  }
  const [left, , up] = wrap.children;
  left.l.pointerdown({ pointerId: 1, preventDefault() {} });
  up.l.pointerdown({ pointerId: 2, preventDefault() {} });
  left.l.pointerup({ pointerId: 1 });
  up.l.pointerleave({ pointerId: 2 });
  assert.deepEqual(calls, [[-1, 0], [-1, 1], [0, 1], [0, 0]]);
});
