import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const KEY = 'santuario_save_v1';
const plain = (o) => JSON.parse(JSON.stringify(o));
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/inventory.js'];

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function setup(storage = fakeStorage()) {
  const SA = loadGame(FILES, { localStorage: storage });
  SA.save.load();
  return SA;
}

test('items data: starting tools, foods reusing foods.js ids, finds; articles agree with gender', () => {
  const SA = setup();
  const items = SA.data.all('items');
  const ids = items.map((i) => i.id);
  for (const id of ['camara', 'cepillo', 'esponja', 'venda', 'fresa', 'roca']) {
    assert.ok(ids.includes(id), id);
  }
  for (const id of ['flor', 'hoja']) {
    assert.ok(!ids.includes(id), id + ' is not collectible');
    assert.equal(SA.data.all('vocab').filter((v) => v.key === 'item:' + id || v.key === 'found:' + id).length, 0, id + ' has no vocab');
  }
  assert.equal(SA.data.get('items', 'camara').name.es, 'la cámara');
  assert.equal(SA.data.get('items', 'fresa').name.es, 'la fresa');
  assert.deepEqual(plain(items.filter((i) => i.kind === 'food').map((i) => i.id)), ['fresa'], 'strawberries are the only food item');
  assert.deepEqual(plain(SA.data.all('foods').map((f) => f.id)), ['fresa']);
  assert.ok(items.filter((i) => i.kind === 'food').every((i) => SA.data.get('foods', i.id)));
  assert.ok(items.filter((i) => i.kind === 'tool').every((i) => !i.stackable));
  assert.equal(SA.data.get('vocab', 'item:roca').es, 'la roca');
  assert.deepEqual(plain(SA.save.STARTING_KIT), ['camara', 'cepillo', 'esponja', 'venda']);
  assert.ok(SA.save.STARTING_KIT.every((id) => SA.data.get('items', id).kind === 'tool'));
});

test('items validation rejects bad data', () => {
  const SA = setup();
  const ok = { id: 'x', icon: '?', name: { es: 'la x', en: 'x' }, gender: 'f', kind: 'find', stackable: true };
  const bad = [
    { ...ok, id: 'X1' }, { ...ok, name: { es: 'x', en: 'x' } }, { ...ok, name: { es: 'la x', en: '' } },
    { ...ok, gender: 'm' }, { ...ok, gender: 'n' }, { ...ok, icon: '' }, { ...ok, kind: 'toy' }, { ...ok, stackable: 1 },
    { ...ok, kind: 'tool' }, { ...ok, kind: 'food', id: 'nofood' },
  ];
  for (const b of bad) assert.throws(() => SA.data.register('items', [b]), undefined, JSON.stringify(b));
  assert.doesNotThrow(() => SA.data.register('items', [ok]));
});

test('a new save starts with camera, brush, sponge and bandage; nothing equipped', () => {
  const SA = setup();
  assert.deepEqual(plain(SA.inventory.list()), ['camara', 'cepillo', 'esponja', 'venda'].map((id) => ({ id, count: 1 })));
  assert.equal(SA.inventory.equipped(), null);
  assert.equal(SA.inventory.has('camara'), true);
  assert.equal(SA.inventory.count('fresa'), 0);
});

test('add/remove/count: stackables stack, tools do not, unknown or bad amounts are refused', () => {
  const SA = setup();
  const inv = SA.inventory;
  assert.equal(inv.add('fresa'), true);
  assert.equal(inv.add('fresa', 2), true);
  assert.equal(inv.count('fresa'), 3);
  for (const gone of ['platano', 'zanahoria', 'pez']) assert.equal(inv.add(gone), false, gone + ' is no longer an item');
  assert.equal(inv.add('camara'), false);
  assert.equal(inv.count('camara'), 1);
  for (const bad of ['nope', undefined, null, 42]) assert.equal(inv.add(bad), false);
  for (const n of [0, -1, 1.5, NaN, '2']) assert.equal(inv.add('roca', n), false);
  assert.equal(inv.count('roca'), 0);
  assert.equal(inv.add('hoja'), false);
  assert.equal(inv.add('flor'), false);
  assert.equal(inv.remove('fresa'), true);
  assert.equal(inv.count('fresa'), 2);
  assert.equal(inv.remove('fresa', 3), false);
  assert.equal(inv.count('fresa'), 2);
  assert.equal(inv.remove('fresa', 2), true);
  assert.equal(inv.has('fresa'), false);
  assert.equal(inv.remove('fresa'), false);
  assert.equal(inv.remove('roca', 0), false);
});

test('list() follows items.js order and ignores unknown ids kept in the save', () => {
  const SA = setup();
  SA.inventory.add('roca');
  SA.inventory.add('fresa', 2);
  SA.save.update({ inventory: { items: [...SA.save.get().inventory.items, { id: 'mystery', count: 1 }] } });
  assert.deepEqual(plain(SA.inventory.list().map((i) => i.id)), ['camara', 'cepillo', 'esponja', 'venda', 'fresa', 'roca']);
  assert.equal(SA.inventory.list().find((i) => i.id === 'fresa').count, 2);
});

test('equip works only for items you hold; removing the equipped item unequips it', () => {
  const SA = setup();
  const inv = SA.inventory;
  assert.equal(inv.equip('fresa'), false);
  assert.equal(inv.equip('nope'), false);
  assert.equal(inv.equipped(), null);
  assert.equal(inv.equip('cepillo'), true);
  assert.equal(inv.equipped(), 'cepillo');
  assert.equal(inv.equip('fresa'), false);
  assert.equal(inv.equipped(), 'cepillo');
  inv.add('fresa', 2);
  assert.equal(inv.equip('fresa'), true);
  inv.remove('fresa');
  assert.equal(inv.equipped(), 'fresa');
  inv.add('roca');
  assert.equal(inv.equipped(), 'fresa');
  inv.remove('fresa');
  assert.equal(inv.equipped(), null);
  inv.equip('venda');
  inv.unequip();
  assert.equal(inv.equipped(), null);
});

test('inventory survives a reload (flush then load in a fresh game)', () => {
  const storage = fakeStorage();
  const a = setup(storage);
  a.inventory.add('fresa', 3);
  a.inventory.remove('esponja');
  a.inventory.equip('fresa');
  assert.equal(a.save.flush(), true);
  const b = setup(storage);
  assert.equal(b.inventory.count('fresa'), 3);
  assert.equal(b.inventory.has('esponja'), false);
  assert.equal(b.inventory.equipped(), 'fresa');
  assert.deepEqual(plain(b.inventory.list().map((i) => i.id)), ['camara', 'cepillo', 'venda', 'fresa']);
});

test('a v2 save migrates: gets the starting kit, keeps everything else', () => {
  const old = { version: 2, stars: 9, unlockedAnimals: ['conejo'], placedProps: [], rounds: { completed: 4, streak: 1 },
    settings: { muted: true, english: false, scaffold: 2 }, stats: { unlocks: { 'a|b|1': 2 } } };
  const SA = setup(fakeStorage({ [KEY]: JSON.stringify(old) }));
  assert.equal(SA.save.get().version, 5);
  assert.equal(SA.save.get().stars, 9);
  assert.deepEqual(plain(SA.inventory.list().map((i) => i.id)), ['camara', 'cepillo', 'esponja', 'venda']);
  assert.equal(SA.inventory.equipped(), null);
});

test('a v1 and an unversioned save also reach the starting kit', () => {
  for (const old of [{ version: 1, stars: 1 }, { stars: 1 }]) {
    const SA = setup(fakeStorage({ [KEY]: JSON.stringify(old) }));
    assert.equal(SA.inventory.count('venda'), 1);
  }
});

test('save normalises a damaged inventory: bad entries dropped, unowned equip cleared, missing gets the kit', () => {
  const n = (inventory) => {
    const SA = setup(fakeStorage({ [KEY]: JSON.stringify({ version: 3, inventory }) }));
    return plain(SA.save.get().inventory);
  };
  const kit = n(undefined);
  assert.equal(kit.items.length, 4);
  assert.deepEqual(n('x'), kit);
  assert.deepEqual(n({ items: 'x', equipped: 'camara' }), kit);
  assert.deepEqual(n({ items: [], equipped: 'camara' }), { items: [], equipped: null });
  assert.deepEqual(n({ items: [null, 5, { id: 'Bad' }, { id: 7, count: 1 }, { id: 'pez', count: 0 }, { id: 'pez', count: -2 },
    { id: 'roca', count: 2.7 }, { id: 'roca', count: 9 }], equipped: 'pez' }), { items: [{ id: 'roca', count: 2 }], equipped: null });
  assert.deepEqual(n({ items: [{ id: 'roca', count: 1 }], equipped: 'roca' }), { items: [{ id: 'roca', count: 1 }], equipped: 'roca' });
});

test('old saves holding flor/hoja or other foods load cleanly with them removed (also the equipped one)', () => {
  for (const equipped of ['flor', 'hoja', 'platano', 'zanahoria', 'pez', 'fresa']) {
    const inventory = { items: [{ id: 'camara', count: 1 }, { id: 'flor', count: 3 }, { id: 'platano', count: 2 }, { id: 'hoja', count: 5 },
      { id: 'zanahoria', count: 1 }, { id: 'pez', count: 4 }, { id: 'fresa', count: 2 }], equipped };
    const SA = setup(fakeStorage({ [KEY]: JSON.stringify({ version: 3, stars: 4, inventory }) }));
    assert.deepEqual(plain(SA.save.get().inventory), { items: [{ id: 'camara', count: 1 }, { id: 'fresa', count: 2 }], equipped: equipped === 'fresa' ? 'fresa' : null });
    assert.deepEqual(plain(SA.inventory.list().map((i) => i.id)), ['camara', 'fresa']);
    for (const gone of ['flor', 'hoja', 'platano', 'zanahoria', 'pez']) assert.equal(SA.inventory.count(gone), 0, gone);
    assert.equal(SA.save.get().stars, 4);
  }
});

test('inventory keeps working without localStorage (in-memory fallback)', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.inventory.add('roca'), true);
  assert.equal(SA.inventory.equip('roca'), true);
  assert.equal(SA.inventory.equipped(), 'roca');
});
