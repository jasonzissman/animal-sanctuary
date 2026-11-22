import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const plain = (o) => JSON.parse(JSON.stringify(o));
const FILES =['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/inventory.js', 'game/hotbar.js'];

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function setup(storage = fakeStorage()) {
  const SA = loadGame(FILES, { localStorage: storage });
  SA.save.load();
  return { SA, storage };
}

test('slots map the starting kit to 1-4 in items.js order with icons, nothing equipped', () => {
  const { SA } = setup();
  const s = SA.hotbar.slots();
  assert.deepEqual(plain(s.map((x) => [x.slot, x.id, x.count, x.equipped])),
    [[1, 'camara', 1, false], [2, 'cepillo', 1, false], [3, 'esponja', 1, false], [4, 'venda', 1, false]]);
  assert.equal(s[0].icon, '📷');
  assert.equal(SA.hotbar.slotItem(1), 'camara');
  assert.equal(SA.hotbar.slotItem(5), null);
});

test('keys 1-9 equip that slot; 0 empties hands; empty and out-of-range keys do nothing', () => {
  const { SA } = setup();
  assert.deepEqual({ ...SA.hotbar.pressKey('2') }, { action: 'equip', id: 'cepillo' });
  assert.equal(SA.inventory.equipped(), 'cepillo');
  // pressing the equipped slot's key keeps it in hand
  assert.equal(SA.hotbar.pressKey('2').action, 'equip');
  assert.equal(SA.inventory.equipped(), 'cepillo');
  assert.equal(SA.hotbar.pressKey('4').id, 'venda');
  assert.deepEqual({ ...SA.hotbar.pressKey('0') }, { action: 'unequip', id: 'venda' });
  assert.equal(SA.inventory.equipped(), null);
  assert.equal(SA.hotbar.pressKey('0').action, 'none');   // already empty-handed
  for (const k of ['5', '9', 'a', '10', '', ' ', undefined, null, 3, 'Digit1']) {
    SA.hotbar.pressKey('1');
    assert.equal(SA.hotbar.pressKey(k).action, 'none', String(k));
    assert.equal(SA.inventory.equipped(), 'camara', `${k} left hands alone`);
  }
});

test('tapping a slot equips it, tapping it again unequips, other slots switch, bad slots are ignored', () => {
  const { SA } = setup();
  assert.equal(SA.hotbar.tapSlot(3).action, 'equip');
  assert.equal(SA.inventory.equipped(), 'esponja');
  assert.equal(SA.hotbar.tapSlot(1).id, 'camara');
  assert.deepEqual({ ...SA.hotbar.tapSlot(1) }, { action: 'unequip', id: 'camara' });
  assert.equal(SA.inventory.equipped(), null);
  for (const n of [0, 5, 10, -1, 1.5, NaN, '1', null, undefined]) assert.equal(SA.hotbar.tapSlot(n).action, 'none', String(n));
  assert.equal(SA.inventory.equipped(), null);
});

test('slots show counts, follow inventory changes and cap at nine', () => {
  const { SA } = setup();
  SA.inventory.add('platano', 3);
  SA.inventory.add('flor', 2);
  const s = SA.hotbar.slots();
  assert.equal(s.length, 6);
  assert.deepEqual(plain(s.slice(4).map((x) => [x.slot, x.id, x.count])),[[5, 'platano', 3], [6, 'flor', 2]]);
  assert.equal(SA.hotbar.pressKey('5').id, 'platano');
  assert.equal(SA.hotbar.slots()[4].equipped, true);
  // using up the equipped item empties hands and the slot closes up
  SA.inventory.remove('platano', 3);
  assert.equal(SA.inventory.equipped(), null);
  assert.equal(SA.hotbar.slotItem(5), 'flor');
  for (const id of ['roca', 'fresa', 'zanahoria', 'pez', 'hoja']) SA.inventory.add(id);
  assert.equal(SA.hotbar.slots().length, SA.hotbar.MAX_SLOTS);
  assert.equal(SA.hotbar.slotItem(10), null);
});

test('signature changes with slots, counts and the equipped item', () => {
  const { SA } = setup();
  const seen = new Set([SA.hotbar.signature()]);
  SA.hotbar.pressKey('1'); seen.add(SA.hotbar.signature());
  SA.inventory.add('pez', 1); seen.add(SA.hotbar.signature());
  SA.inventory.add('pez', 1); seen.add(SA.hotbar.signature());
  SA.hotbar.pressKey('0'); seen.add(SA.hotbar.signature());
  assert.equal(seen.size, 5);
  assert.equal(SA.hotbar.signature(), SA.hotbar.signature());
});

test('the equipped slot survives a reload through the inventory save', () => {
  const { SA, storage } = setup();
  SA.hotbar.pressKey('3');
  assert.equal(SA.save.flush(), true);
  const again = setup(storage).SA;
  assert.equal(again.inventory.equipped(), 'esponja');
  assert.equal(again.hotbar.slots()[2].equipped, true);
  again.hotbar.tapSlot(3);
  again.save.flush();
  assert.equal(setup(storage).SA.inventory.equipped(), null);
});

function fakeDoc() {
  const made = [];
  const mk = () => {
    const el = { style: {}, attrs: {}, on: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.on[t] = f; },
      appendChild(c) { this.children.push(c); },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); } };
    made.push(el);
    return el;
  };
  return { made, doc: { body: { appendChild() {} }, createElement: mk } };
}

test('hotbar view: one big icon button per item, count badge, highlighted equipped slot, re-renders on change', () => {
  const { SA } = setup();
  const view = loadGame([...FILES, 'game/ui/hotbar-view.js'], { localStorage: fakeStorage() });
  view.save.load();
  const { doc } = fakeDoc();
  const v = view.hotbarView.create(doc);
  const bar = v.element;
  assert.equal(bar.children.length, 4);
  assert.deepEqual(bar.children.map((b) => b.textContent), ['📷', '🪮', '🧽', '🩹']);
  assert.equal(bar.children[0].attrs['aria-label'], 'la cámara');
  assert.ok(bar.children.every((b) => /width:72px;height:72px/.test(b.style.cssText)));
  assert.ok(bar.children.every((b) => b.children.length === 0 && b.attrs['aria-pressed'] === 'false'));

  bar.children[1].on.pointerdown({ preventDefault() {}, stopPropagation() {} });   // tap slot 2
  assert.equal(view.inventory.equipped(), 'cepillo');
  assert.equal(bar.children[1].attrs['aria-pressed'], 'true');
  assert.match(bar.children[1].style.cssText, /#ff9f1c/);
  assert.doesNotMatch(bar.children[0].style.cssText, /#ff9f1c/);

  bar.children[1].on.pointerdown({ preventDefault() {}, stopPropagation() {} });   // tap again: hands empty
  assert.equal(view.inventory.equipped(), null);
  assert.ok(bar.children.every((b) => b.attrs['aria-pressed'] === 'false'));

  view.inventory.add('platano', 4);                                                // external change, picked up by update()
  v.update();
  assert.equal(bar.children.length, 5);
  assert.equal(bar.children[4].children[0].textContent, '4');
  const before = bar.children[0];
  v.update();
  assert.equal(bar.children[0], before, 'no rebuild when nothing changed');

  view.hotbar.pressKey('5');                                                       // key press, then update()
  v.update();
  assert.equal(bar.children[4].attrs['aria-pressed'], 'true');

  v.setHidden(true); assert.equal(bar.style.display, 'none');
  v.setHidden(false); assert.equal(bar.style.display, 'flex');
  bar.children[0].on.contextmenu({ preventDefault() {} });
  assert.equal(view.hotbarView.create(null).element, null);
  assert.ok(SA);
});

test('nameChip gives every starting item its Spanish name with the right article, a vocab key and the icon', () => {
  const { SA } = setup();
  const expected = { camara: 'la cámara', cepillo: 'el cepillo', esponja: 'la esponja', venda: 'la venda' };
  for (const [id, text] of Object.entries(expected)) {
    const c = SA.hotbar.nameChip(id);
    assert.equal(c.text, text);
    assert.equal(c.key, 'item:' + id);
    assert.equal(c.icon, SA.data.get('items', id).icon);
    assert.equal(SA.vocab.get(c.key).es, text);   // what is spoken matches what is shown
  }
  assert.equal(SA.hotbar.nameChip('nope'), null);
  assert.equal(SA.hotbar.nameChip(null), null);
});

test('every item (tool, food, find) has a chip whose article agrees with its gender and a vocab entry', () => {
  const { SA } = setup();
  for (const it of SA.data.all('items')) {
    const c = SA.hotbar.nameChip(it.id);
    assert.equal(c.text, it.name.es);
    assert.match(c.text, it.gender === 'm' ? /^el / : /^la /);
    assert.ok(SA.vocab.get(c.key));
  }
});

test('hotbar view: equipping shows the name chip and speaks it, unequipping hides it, a restored item is shown but not spoken', () => {
  const said = [];
  const stub = (SA) => { SA.audio = { say: (k) => said.push(k) }; };
  const g = loadGame([...FILES, stub, 'game/ui/hotbar-view.js'], { localStorage: fakeStorage() });
  g.save.load();
  const { made, doc } = fakeDoc();
  const v = g.hotbarView.create(doc);
  const chip = made[1];
  assert.match(chip.style.cssText, /display:none/);                                       // hidden until something is equipped

  v.element.children[1].on.pointerdown({ preventDefault() {}, stopPropagation() {} });   // equip el cepillo
  assert.equal(chip.textContent, '🪮 el cepillo');
  assert.equal(chip.style.display, 'flex');
  assert.deepEqual(said, ['item:cepillo']);

  g.hotbar.pressKey('1');                                                                 // switch, then update()
  v.update();
  assert.equal(chip.textContent, '📷 la cámara');
  assert.deepEqual(said, ['item:cepillo', 'item:camara']);

  v.setHidden(true);
  assert.equal(chip.style.display, 'none');
  v.setHidden(false);
  assert.equal(chip.style.display, 'flex');

  g.hotbar.pressKey('0');
  v.update();
  assert.equal(chip.style.display, 'none');
  assert.equal(said.length, 2);                                                           // unequip is silent

  // a new view with an item already in hand: chip shows, nothing is spoken
  g.hotbar.pressKey('4');
  const before = said.length;
  const { made: made2, doc: doc2 } = fakeDoc();
  g.hotbarView.create(doc2);
  assert.equal(made2[1].textContent, '🩹 la venda');
  assert.equal(said.length, before);
});
