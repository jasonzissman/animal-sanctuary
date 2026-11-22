import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/items.js', 'game/map.js', 'game/save.js', 'game/perch.js',
  'game/inventory.js', 'game/data/pickups.js', 'game/pickups.js'];

function fresh() { const SA = loadGame(FILES); SA.save.reset(); return SA; }

// A few trees per biome (what scene.js derives from the decor).
function trees(SA) {
  const out = [];
  for (const [id, kind] of [['bosque', 'pine'], ['selva', 'jungle']]) {
    const r = SA.map.biomeRange(id);
    for (let i = 0; i < 8; i++) {
      const x = r.lo + 4 + i * 4, z = -15 + i * 4;
      out.push({ x, z, y: SA.map.groundHeight(x, z), scale: 1, kind });
    }
  }
  return out;
}

test('pickup data validates and every item has a spoken exclamation agreeing in gender', () => {
  const SA = fresh();
  assert.equal(SA.vocab.get('found:platano').es, '¡Un plátano!');
  assert.equal(SA.vocab.get('found:flor').es, '¡Una flor!');
  assert.equal(SA.vocab.get('found:roca').es, '¡Una roca!');
  for (const r of SA.data.all('pickups')) assert.ok(SA.vocab.get('found:' + r.item), r.id);
  assert.throws(() => SA.data.register('pickups', [{ id: 'x', item: 'nope', where: 'ground', biomes: ['selva'], count: 1, respawn: 5 }]));
  assert.throws(() => SA.data.register('pickups', [{ id: 'y', item: 'roca', where: 'sky', biomes: ['selva'], count: 1, respawn: 5 }]));
  assert.throws(() => SA.data.register('pickups', [{ id: 'z', item: 'roca', where: 'ground', biomes: ['luna'], count: 1, respawn: 5 }]));
  assert.throws(() => SA.data.register('pickups', [{ id: 'w', item: 'roca', where: 'ground', biomes: ['selva'], count: 0, respawn: 5 }]));
});

test('layout is seeded: identical for the same seed, different for another', () => {
  const SA = fresh(), t = trees(SA);
  const a = SA.pickups.layout({ trees: t, seed: 7 }), b = SA.pickups.layout({ trees: t, seed: 7 }), c = SA.pickups.layout({ trees: t, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(new Set(a.map((s) => s.id)).size, a.length, 'unique ids');
});

test('layout fills each rule per biome: canopy fruit, ground finds, bank fish', () => {
  const SA = fresh(), spots = SA.pickups.layout({ trees: trees(SA), seed: 80 });
  for (const rule of SA.data.all('pickups')) {
    for (const biome of rule.biomes) {
      const mine = spots.filter((s) => s.rule === rule.id && s.biome === biome);
      assert.equal(mine.length, rule.count, rule.id + ' in ' + biome);
    }
  }
  for (const s of spots) {
    assert.equal(SA.map.biomeAt(s.x), s.biome, s.id + ' stays in its biome');
    if (s.where !== 'tree') assert.ok(!SA.map.isWater(s.x, s.z), s.id + ' is on dry land');   // (canopy spots follow the tree)
    assert.ok(s.x >= SA.map.BOUNDS.minX && s.x <= SA.map.BOUNDS.maxX && s.z >= SA.map.BOUNDS.minZ && s.z <= SA.map.BOUNDS.maxZ);
    if (s.where === 'tree') assert.ok(s.y > SA.map.groundHeight(s.x, s.z) + 2.5, s.id + ' hangs high in a tree');
    else assert.ok(s.y < SA.map.groundHeight(s.x, s.z) + 1, s.id + ' is near the ground');
    if (s.where === 'water') assert.ok(SA.map.nearWater(s.x, s.z, 3.5), s.id + ' is by the water');
  }
  assert.ok(spots.some((s) => s.item === 'platano' && s.where === 'tree'));
  assert.ok(spots.some((s) => s.item === 'roca' && s.where === 'ground'));
  assert.ok(spots.some((s) => s.item === 'pez' && s.where === 'water'));
});

test('ground finds keep clear of decor and of each other', () => {
  const SA = fresh(), avoid = [[10, 0], [11, 2], [-20, 5]];
  const spots = SA.pickups.layout({ trees: trees(SA), avoid, seed: 3 }).filter((s) => s.where !== 'tree');
  for (const s of spots) for (const a of avoid) assert.ok(Math.hypot(s.x - a[0], s.z - a[1]) >= 1.6);
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= 1.6);
});

test('walking into a find collects it into the inventory', () => {
  const SA = fresh(), w = SA.pickups.create({ trees: trees(SA), seed: 5 });
  const rock = w.list().find((s) => s.item === 'roca');
  assert.equal(SA.inventory.count('roca'), 0);
  assert.equal(w.collectNear({ x: rock.x + 5, z: rock.z, y: 0 }), null, 'too far');
  const got = w.collectNear({ x: rock.x + 0.5, z: rock.z, y: 0 });
  assert.equal(got.item, 'roca');
  assert.equal(got.id, rock.id);
  assert.equal(SA.inventory.count('roca'), 1);
  assert.equal(w.list().find((s) => s.id === rock.id).available, false);
  assert.equal(w.collect(rock.id), null, 'cannot take it twice');
  assert.equal(SA.inventory.count('roca'), 1);
  assert.equal(w.collect('nope'), null);
  assert.equal(w.nearest(null), null);
});

test('space radius is wider than the walk radius', () => {
  const SA = fresh(), w = SA.pickups.create({ trees: trees(SA), seed: 5 });
  const flower = w.list().find((s) => s.item === 'flor');
  const p = { x: flower.x + 2, z: flower.z, y: 0 };
  assert.equal(w.nearest(p), null);
  assert.equal(w.nearest(p, SA.pickups.SPACE_RADIUS).id, flower.id);
});

test('canopy fruit needs the player up the tree', () => {
  const SA = fresh(), w = SA.pickups.create({ trees: trees(SA), seed: 5 });
  const banana = w.list().find((s) => s.item === 'platano');
  assert.equal(w.collectNear({ x: banana.x, z: banana.z, y: SA.map.groundHeight(banana.x, banana.z) }), null, 'from the ground');
  const got = w.collectNear({ x: banana.x, z: banana.z, y: banana.y });
  assert.equal(got.item, 'platano');
  assert.equal(SA.inventory.count('platano'), 1);
});

test('collected finds respawn after their time, and the world never runs dry', () => {
  const SA = fresh(), w = SA.pickups.create({ trees: trees(SA), seed: 5 });
  const rock = w.list().find((s) => s.item === 'roca'), rule = SA.data.get('pickups', rock.rule);
  const p = { x: rock.x, z: rock.z, y: 0 };
  w.collectNear(p);
  assert.equal(w.update(0.5).length, 0, 'not yet');
  assert.equal(w.list().find((s) => s.id === rock.id).available, false);
  let back = [];
  for (let t = 0; t < rule.respawn + 2 && !back.length; t++) back = w.update(1);
  assert.deepEqual(Array.from(back, (s) => s.id), [rock.id]);
  assert.equal(w.list().find((s) => s.id === rock.id).available, true);
  assert.equal(w.collectNear(p).item, 'roca');
  assert.equal(SA.inventory.count('roca'), 2);
  assert.equal(w.update(NaN).length, 0);
});

test('every collectable item is a known inventory item that can be added', () => {
  const SA = fresh();
  for (const r of SA.data.all('pickups')) assert.ok(SA.inventory.add(r.item, 1), r.item);
});

// ---- render (stub THREE) ----
function vec() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(s) { this.x = this.y = this.z = s; } }; }
function node() {
  const n = { children: [], position: vec(), rotation: vec(), scale: vec(), userData: {}, visible: true,
    add(c) { this.children.push(c); }, clone() { const c = node(); c.children = this.children.slice(); return c; } };
  return n;
}
const geo = function () { return { dispose() {} }; };
const THREE = {
  Group: function () { return node(); }, Mesh: function (g, m) { return Object.assign(node(), { geometry: g, material: m }); },
  BoxGeometry: geo, CylinderGeometry: geo, SphereGeometry: geo, ConeGeometry: geo, OctahedronGeometry: geo,
  MeshLambertMaterial: function () { return {}; }, MeshBasicMaterial: function () { return {}; },
};

test('render: pickups are drawn, collected on contact with sound + speech, hidden, then pop back', () => {
  const log = [], listeners = {};
  const SA = loadGame([...FILES, 'game/data/hand-models.js', (sa) => {
    sa.audio = { sfx: (n) => log.push('sfx:' + n), say: (k) => log.push('say:' + k) };
  }, 'game/render/hand-item.js', 'game/render/pickups.js'], {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    document: { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {} }) },
  });
  SA.save.reset();
  const player = { x: 0, z: 0, y: 0 };
  const px = SA.render.createPickups(THREE, { getPlayer: () => player, trees: trees(SA), seed: 80 });
  const spots = px.world.list();
  assert.equal(px.group.children.length, spots.length);
  assert.ok(spots.length >= 20);
  const rock = spots.find((s) => s.item === 'roca');
  px.update(0.1);
  assert.equal(log.length, 0, 'nothing nearby');
  Object.assign(player, { x: rock.x, z: rock.z });
  px.update(0.1);
  assert.deepEqual(log, ['sfx:pop', 'say:found:roca']);
  assert.equal(SA.inventory.count('roca'), 1);
  const node1 = px.group.children[spots.indexOf(rock)];
  assert.equal(node1.visible, false);
  Object.assign(player, { x: 0, z: 0 });
  for (let i = 0; i < 60; i++) px.update(1);
  assert.equal(node1.visible, true, 'grew back');

  // Space (via SA.spaceUse) reaches a little farther than walking does.
  const flower = spots.find((s) => s.item === 'flor');
  Object.assign(player, { x: flower.x + 2, z: flower.z });
  px.update(0.1);
  assert.equal(SA.inventory.count('flor'), 0);
  assert.equal(listeners.keydown, undefined, 'no Space key of its own: SA.spaceUse dispatches');
  const near = px.world.reachable(player, SA.pickups.SPACE_RADIUS, []);
  assert.ok(near.some((n) => n.id === flower.id), 'reachable() lists finds within the Space radius');
  assert.ok(px.collectSpot(flower));
  assert.equal(SA.inventory.count('flor'), 1);
  assert.equal(px.collectSpot(flower), null, 'already collected');
  assert.equal(px.world.reachable({ x: 1e6, z: 0 }, 2.4, []).length, 0);
  assert.equal(log[log.length - 1], 'say:found:flor');
});

test('boot: index.html loads the pickup scripts in dependency order before the scene', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const at = (f) => html.indexOf('game/' + f);
  assert.ok(at('data/items.js') < at('data/pickups.js') && at('data/pickups.js') < at('pickups.js'));
  assert.ok(at('inventory.js') < at('pickups.js') && at('perch.js') < at('pickups.js'));
  assert.ok(at('render/hand-item.js') < at('render/pickups.js') && at('render/pickups.js') < at('render/scene.js'));
});
