import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './helpers/vm.js';

const SIZES = [[375, 667], [768, 1024], [1280, 800], [1920, 1080]];

test('the menu holds sound, habitat, album and settings, each on its own SA.hud slot', () => {
  const SA = loadGame(['game/sa.js', 'game/hud.js', 'game/menu.js']);
  assert.deepEqual([...SA.menu.ITEMS.map((i) => i.id)], ['sound', 'habitat', 'album', 'settings']);
  assert.deepEqual([...SA.menu.ITEMS.map((i) => i.hud)], ['audioUi', 'sandbox', 'album', 'settings']);
  for (const i of SA.menu.ITEMS) assert.ok(SA.hud.IDS.includes(i.hud) && i.icon && i.es);
  assert.equal(SA.hud.ZONES.topRight[0], 'menu');
});

test('open/close state: toggle, outside tap, Escape; onChange fires only on real changes', () => {
  const SA = loadGame(['game/sa.js', 'game/menu.js']);
  const seen = [];
  const m = SA.menu.create({ onChange: (o) => seen.push(o) });
  assert.equal(m.isOpen(), false);
  assert.equal(m.outsideTap(), false);
  assert.equal(m.key('Escape'), null, 'Escape on a closed menu does nothing');
  assert.equal(m.toggle(), true);
  assert.equal(m.open(), false, 'already open');
  assert.equal(m.outsideTap(), true);
  assert.equal(m.isOpen(), false);
  m.open();
  assert.equal(m.key('Escape'), 'close');
  assert.equal(m.isOpen(), false);
  assert.deepEqual(seen, [true, false, true, false]);
});

test('M asks for mute without opening the menu; sound keeps it open, the others close it', () => {
  const SA = loadGame(['game/sa.js', 'game/menu.js']);
  const m = SA.menu.create();
  assert.equal(m.key('m'), 'sound');
  assert.equal(m.key('M'), 'sound');
  assert.equal(m.isOpen(), false);
  assert.equal(m.key('x'), null);
  m.open();
  assert.equal(m.used('sound'), false);
  assert.equal(m.isOpen(), true);
  for (const id of ['habitat', 'album', 'settings']) {
    m.open();
    assert.equal(m.used(id), true, id);
    assert.equal(m.isOpen(), false, id);
  }
  assert.equal(m.used('nope'), false);
});

// A tiny DOM: elements keep their listeners so the test can fire them.
function fakeEl() {
  const el = { style: {}, children: [], attrs: {}, listeners: {}, setAttribute(k, v) { el.attrs[k] = v; }, appendChild(c) { el.children.push(c); },
    addEventListener(t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); }, contains: (t) => t === el,
    fire(t, e = {}) { (el.listeners[t] || []).forEach((f) => f({ target: el, stopPropagation() {}, ...e })); } };
  return el;
}
function boot(w, h) {
  const win = { innerWidth: w, innerHeight: h, listeners: {}, addEventListener(t, f) { (win.listeners[t] = win.listeners[t] || []).push(f); } };
  const doc = { listeners: {}, body: fakeEl(), createElement: fakeEl, addEventListener(t, f) { (doc.listeners[t] = doc.listeners[t] || []).push(f); } };
  const calls = [];
  const SA = loadGame(['game/sa.js', 'game/hud.js', 'game/ui/hud-place.js', 'game/menu.js', 'game/ui/menu-view.js'], { innerWidth: w, innerHeight: h, addEventListener() {} });
  SA.audio = { isMuted: () => false, unlock() {}, toggleMute() { calls.push('mute'); }, sfx() {} };
  SA.audioUI = { toggle: () => calls.push('toggle') };
  const els = {};
  for (const id of ['audioUi', 'sandbox', 'album', 'settings']) { els[id] = fakeEl(); SA.hudPlace.register(id, els[id], { reserve: true }); }
  const view = SA.menuView.create(doc, win);
  return { SA, doc, win, els, view, calls, btn: doc.body.children[0] };
}
const shown = (els) => Object.values(els).map((e) => e.style.display);
const key = (win, k, extra = {}) => win.listeners.keydown.forEach((f) => f({ key: k, target: { tagName: 'DIV' }, ...extra }));

test('only the 🎒 button shows at first; tapping it fans out the four items, a second tap folds them', () => {
  const { els, btn } = boot(1280, 800);
  assert.equal(btn.textContent, '🎒');
  assert.deepEqual(shown(els), ['none', 'none', 'none', 'none']);
  btn.fire('click');
  assert.deepEqual(shown(els), ['', '', '', '']);
  assert.equal(btn.attrs['aria-expanded'], 'true');
  btn.fire('click');
  assert.deepEqual(shown(els), ['none', 'none', 'none', 'none']);
});

test('outside tap and Escape close it; a tap on an item or the button does not', () => {
  const { doc, win, els, btn, view } = boot(1280, 800);
  const press = (target) => doc.listeners.pointerdown.forEach((f) => f({ target }));
  btn.fire('click');
  press(els.album); press(btn);
  assert.equal(view.isOpen(), true);
  press({});
  assert.equal(view.isOpen(), false);
  btn.fire('click');
  key(win, 'Escape');
  assert.equal(view.isOpen(), false);
  assert.deepEqual(shown(els), ['none', 'none', 'none', 'none']);
});

test('habitat and album close the menu after use, sound keeps it open, settings closes when its hold opens the drawer', () => {
  const { els, btn, view } = boot(1280, 800);
  btn.fire('click'); els.audioUi.fire('click');
  assert.equal(view.isOpen(), true);
  els.sandbox.fire('click');
  assert.equal(view.isOpen(), false);
  btn.fire('click'); els.album.fire('click');
  assert.equal(view.isOpen(), false);
  btn.fire('click'); els.settings.fire('click');
  assert.equal(view.isOpen(), true, 'a quick tap on the gear does not close it (the hold guard decides)');
  view.used('settings');
  assert.equal(view.isOpen(), false);
});

test('M toggles mute without opening the menu, but not while typing; modifiers are ignored', () => {
  const { win, calls, view } = boot(1280, 800);
  key(win, 'm'); key(win, 'M');
  assert.deepEqual(calls, ['toggle', 'toggle']);
  assert.equal(view.isOpen(), false);
  key(win, 'm', { target: { tagName: 'TEXTAREA' } });
  key(win, 'm', { ctrlKey: true });
  key(win, 'm', { repeat: true });
  assert.equal(calls.length, 2);
});

test('the open fan, the 🎒 button and the snapshot card, pill and stars never overlap at the 4 sizes', () => {
  for (const [w, h] of SIZES) {
    const { SA, els, btn } = boot(w, h);
    const L = SA.hud.layout({ width: w, height: h });
    const rect = (e) => ({ left: parseInt(e.style.left, 10), top: parseInt(e.style.top, 10), width: parseInt(e.style.width, 10), height: parseInt(e.style.height, 10) });
    btn.fire('click');
    const mine = [btn, ...Object.values(els)].map(rect);
    for (const r of mine) {
      assert.ok(SA.hud.onScreen(r, w, h), `${w}x${h} on-screen`);
      for (const other of ['prompt', 'stars', 'snapshot', 'toast', 'hotbar', 'joystick', 'orbitPad', 'use', 'jump', 'climb']) assert.ok(!SA.hud.overlaps(r, L[other]), `${w}x${h} vs ${other}`);
    }
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) assert.ok(!SA.hud.overlaps(mine[i], mine[j]), `${w}x${h} ${i}/${j}`);
    for (const r of mine) assert.ok(r.width >= 44 && r.height >= 44, 'big touch targets');
  }
});

test('the view is a harmless no-op without a DOM', () => {
  const SA = loadGame(['game/sa.js', 'game/menu.js', 'game/ui/menu-view.js']);
  const v = SA.menuView.create(null);
  assert.equal(v.isOpen(), false);
  assert.doesNotThrow(() => { v.open(); v.close(); v.used('album'); });
});

test('index.html and the manifest load menu.js and menu-view.js after the views they hold', () => {
  for (const f of ['index.html', 'game/manifest.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const at = (m) => src.indexOf('game/' + m);
    assert.ok(at('menu.js') > at('ui/settings-view.js') && at('ui/menu-view.js') > at('menu.js') && at('ui/menu-view.js') < at('main.js'), f);
  }
});
