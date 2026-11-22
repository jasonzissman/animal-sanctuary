import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const LOGIC = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/hud.js', 'game/ui/hud-place.js', 'game/ui/use-button.js'];

function fakeDoc() {
  const el = { style: {}, listeners: {}, attrs: {}, textContent: '',
    addEventListener(t, f) { this.listeners[t] = f; }, setAttribute(k, v) { this.attrs[k] = v; } };
  return { el, doc: { createElement: () => el, body: { appendChild() {} } } };
}

function setup({ coarse = false, target = null } = {}) {
  const SA = loadGame(LOGIC);
  let equipped = null;
  SA.inventory = { equipped: () => equipped };
  const used = [];
  const picking = { target: () => target, useTarget: () => used.push(1) };
  const winL = {};
  const win = { matchMedia: () => ({ matches: coarse }), addEventListener: (t, f) => { winL[t] = f; } };
  const { el, doc } = fakeDoc();
  const btn = SA.useButton.create(doc, picking, win);
  return { SA, btn, el, used, winL, setEquipped: id => { equipped = id; }, setTarget: t => { target = t; picking.target = () => target; } };
}

test('mouse-only players never see the use button', () => {
  const s = setup({ target: { animalId: 'conejo' } });
  s.btn.update();
  assert.equal(s.el.style.display, 'none');
});

test('on a touch screen it shows while a part is highlighted, with the equipped item icon', () => {
  const s = setup({ coarse: true });
  s.btn.update();
  assert.equal(s.el.style.display, 'none');
  s.setTarget({ animalId: 'conejo' });
  s.btn.update();
  assert.equal(s.el.style.display, 'block');
  assert.equal(s.el.textContent, '🤚');
  s.setEquipped('venda');
  s.btn.update();
  assert.equal(s.el.textContent, '🩹');
  s.el.listeners.pointerdown({ preventDefault() {}, stopPropagation() {} });
  assert.equal(s.used.length, 1);
});

test('its rect comes from SA.hud and covers no other HUD element', () => {
  const s = setup({ coarse: true });
  const L = s.SA.hudPlace.layout(), r = L.use;
  assert.deepEqual([s.el.style.left, s.el.style.top, s.el.style.width, s.el.style.height], [r.left + 'px', r.top + 'px', r.width + 'px', r.height + 'px']);
  for (const id of s.SA.hud.IDS) if (id !== 'use') assert.ok(!s.SA.hud.overlaps(r, L[id]), `use vs ${id}`);
});

test('the first touch enables the button on a non-coarse device', () => {
  const s = setup({ target: { animalId: 'x' } });
  s.winL.pointerdown({ pointerType: 'touch' });
  s.btn.update();
  assert.equal(s.el.style.display, 'block');
});

test('without a DOM or a picking object it is a harmless no-op', () => {
  const SA = loadGame(LOGIC);
  assert.equal(SA.useButton.create(null, {}, null).element, null);
  assert.equal(SA.useButton.create({ createElement() {}, body: {} }, null, null).element, null);
  assert.equal(SA.useButton.iconFor('nada'), '🤚');
});
