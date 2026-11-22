import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/data/props.js', 'game/habitat.js', 'game/prop-avoid.js',
  'game/data/decor.js', 'game/player.js', 'game/blocking.js']);
const B = SA.blocking;
const DT = 1 / 30;
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));   // arrays from the vm realm differ by prototype
const fresh = () => { SA.save.reset(); SA.save.update({ stars: 50 }); };

function walkForward(obstacles, seconds = 3) {
  let s = { x: 0, z: 0, heading: 0 };   // heading 0 walks along +z
  for (let t = 0; t < seconds; t += DT) s = SA.player.step(s, { forward: true }, DT, obstacles);
  return s;
}

test('decor data: flowers are soft, trees, rocks, cacti and peaks are solid', () => {
  assert.equal(B.decorRadius('flor'), 0);
  for (const id of ['pino', 'jungle', 'roca', 'cactus', 'pinonieve', 'rocaarena', 'pico']) assert.ok(B.decorRadius(id) > 0, id);
  assert.equal(B.decorRadius(undefined), B.DEFAULT_RADIUS, 'untagged decor blocks (the safe default)');
  assert.equal(B.decorRadius('nope'), B.DEFAULT_RADIUS);
});

test('decor validator rejects a solid item without a radius and a soft item with one', () => {
  assert.throws(() => SA.data.register('decor', [{ id: 'bad', solid: true }]), /radius/);
  assert.throws(() => SA.data.register('decor', [{ id: 'bad', solid: false, radius: 1 }]), /radius/);
  assert.throws(() => SA.data.register('decor', [{ id: 'bad' }]), /solid/);
});

test('every prop declares solid; only flores is walk-through', () => {
  const props = SA.data.all('props');
  props.forEach((p) => assert.equal(typeof p.solid, 'boolean', p.id));
  same(props.filter((p) => !p.solid).map((p) => p.id), ['flores']);
});

test('animal radius comes from the size trait: small 0, medium and big push', () => {
  const R = SA.animals.BLOCK_RADIUS;
  same(Object.keys(R).sort(), [...SA.animals.SIZES].sort());
  assert.equal(R['pequeño'], 0);
  assert.ok(R['mediano'] > 0 && R['grande'] >= R['mediano']);
  for (const a of SA.data.all('animals')) assert.equal(B.animalRadius(a.id), R[a.traits.size], a.id);
  assert.equal(B.animalRadius('conejo'), 0);
  assert.equal(B.animalRadius('rana'), 0);
  assert.ok(B.animalRadius('camello') > 0);
  assert.equal(B.animalRadius('unknown'), R['grande'], 'unknown animals block (safe default)');
});

test('obstacles(): flowers and small animals are left out; trees, rocks, big animals and solid props stay', () => {
  fresh();
  const res = SA.habitat.place('arbol', -5, 14);
  const flores = SA.habitat.place('flores', -12, 14);
  assert.equal(res.status, 'placed'); assert.equal(flores.status, 'placed');
  const list = B.obstacles({
    decor: [{ x: 1, z: 1, decor: 'flor' }, { x: 2, z: 2, decor: 'pino' }, { x: 3, z: 3, decor: 'roca' }],
    props: SA.habitat.list(),
    animals: [{ x: 4, z: 4, animalId: 'conejo' }, { x: 5, z: 5, animalId: 'camello' }, { x: 6, z: 6, animalId: 'camello', perched: true }],
  });
  same(list.map((o) => o.slice(0, 2)), [[2, 2], [3, 3], [res.prop.x, res.prop.z], [5, 5]]);
  same(B.obstacles({}), []);
});

test('the player walks straight through a flower and a small animal, and is stopped by a tree, a rock and a big animal', () => {
  const soft = B.obstacles({ decor: [{ x: 0, z: 3, decor: 'flor' }], animals: [{ x: 0, z: 5, animalId: 'conejo' }] });
  const through = walkForward(soft);
  assert.ok(through.z > 7, `walked on past them (z=${through.z})`);
  assert.ok(Math.abs(through.x) < 1e-6, 'and was not pushed sideways');
  for (const [src, what] of [[{ decor: [{ x: 0, z: 3, decor: 'pino' }] }, 'tree'], [{ decor: [{ x: 0, z: 3, decor: 'roca' }] }, 'rock'],
    [{ animals: [{ x: 0, z: 3, animalId: 'camello' }] }, 'big animal']]) {
    const s = walkForward(B.obstacles(src));
    // it cannot end up on top of the obstacle: it slides around it, staying at least radius+body away
    assert.ok(Math.hypot(s.x, s.z - 3) >= 1 + SA.player.RADIUS - 0.05, `${what} blocks`);
  }
});

test('placed flores are soft but a placed tree is solid (propAvoid still lists both for wanderers)', () => {
  fresh();
  SA.habitat.place('arbol', -5, 14); SA.habitat.place('flores', -12, 14);
  assert.equal(SA.propAvoid.points(SA.habitat.list()).length, 2);
  assert.equal(B.solidProps(SA.habitat.list()).length, 1);
  same(B.solidProps(null), []);
});
