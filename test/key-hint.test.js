import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const load = () => loadGame(['game/sa.js', 'game/key-hint.js', 'game/ui/key-hint-view.js']);

test('hidden until a real keydown: touch and mouse-only sessions never show it', () => {
  const h = load().keyHint.create();
  assert.equal(h.visible(), false);
  h.pointer();
  h.pointer();
  assert.equal(h.visible(), false, 'pointer use alone never shows it');
});

test('shows after the first keydown and hides once cycling starts, for good', () => {
  const h = load().keyHint.create();
  h.keydown('ArrowRight');
  assert.equal(h.visible(), true);
  h.cycling();
  assert.equal(h.visible(), false);
  h.keydown('Enter');
  assert.equal(h.visible(), false, 'does not come back after cycling began');
});

test('modifier-only keys, shortcuts and junk do not count as keyboard use', () => {
  const g = load().keyHint.create();
  ['Shift', 'Control', 'Alt', 'Meta', '', undefined].forEach((k) => g.keydown(k));
  g.keydown('c', { ctrlKey: true });
  g.keydown('r', { metaKey: true });
  assert.equal(g.visible(), false);
  g.keydown('toString');
  assert.equal(g.visible(), true, 'an ordinary key still counts');
});

test('a touch/click after the keys dismisses it; the next key brings it back until cycling starts', () => {
  const h = load().keyHint.create();
  h.keydown('Tab');
  h.pointer();
  assert.equal(h.visible(), false);
  h.keydown('Tab');
  assert.equal(h.visible(), true);
});

function makeEl() {
  return { style: {}, children: [], textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}

test('view: nothing in the DOM until a key, icon-only glyphs, fades out on cycling', () => {
  const SA = load();
  const doc = { createElement: makeEl, body: makeEl() };
  const v = SA.keyHintView.create(doc, doc.body);
  v.pointer();
  assert.equal(doc.body.children.length, 0, 'no element for touch/mouse use');
  v.keydown({ key: 'ArrowLeft' });
  assert.equal(doc.body.children.length, 1);
  const el = doc.body.children[0];
  assert.equal(el.style.opacity, '.9');
  assert.equal(el.attrs['aria-hidden'], 'true');
  assert.ok(el.children.length >= 1);
  for (const k of el.children) assert.ok(!/[A-Za-z0-9]/.test(k.textContent), 'glyphs only, no words: ' + k.textContent);
  assert.match(el.style.cssText, /pointer-events:none/);
  v.cycling();
  assert.equal(el.style.opacity, '0');
  v.keydown({ key: 'Enter' });
  assert.equal(el.style.opacity, '0');
  assert.equal(doc.body.children.length, 1, 'never duplicated');
});

test('view: does not overlap the mute, replay, habitat or gear controls at 1024x768', () => {
  const SA = load();
  const doc = { createElement: makeEl, body: makeEl() };
  SA.keyHintView.create(doc, doc.body).keydown({ key: 'a' });
  const css = doc.body.children[0].style.cssText;
  const left = Number(/left:(\d+)px/.exec(css)[1]);
  const bottom = Number(/bottom:(\d+)px/.exec(css)[1]);
  const width = 44 * 2 + 6, height = 44;
  const rect = { l: left, r: left + width, t: 768 - bottom - height, b: 768 - bottom };
  const W = 1024, H = 768;
  const others = {
    mute: { l: W - 12 - 64, r: W - 12, t: 12, b: 76 },
    promptBar: { l: 12, r: W - 90, t: 12, b: 12 + 90 },   // includes Replay and the hint button
    habitat: { l: W - 12 - 76, r: W - 12, t: 84, b: 84 + 76 },
    gear: { l: W - 12 - 48, r: W - 12, t: H - 12 - 48, b: H - 12 },
    orbitPad: { l: W - 12 - 120, r: W - 12, t: H - 72 - 120, b: H - 72 },
    stars: { l: 12, r: 12 + 120, t: H - 12 - 52, b: H - 12 },
  };
  for (const [name, o] of Object.entries(others)) {
    const overlap = rect.l < o.r && rect.r > o.l && rect.t < o.b && rect.b > o.t;
    assert.equal(overlap, false, 'overlaps ' + name);
  }
});
