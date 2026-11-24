// AS-0255: every herd instance is built, found by id, reacts on its own and wanders independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/spacing.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/picking.js', 'game/render/zigzag.js',
  'game/render/instances.js', 'game/render/animals.js', 'game/render/ambient.js', 'game/render/round-fx.js'];

function world() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const { SA, THREE } = ctx;
  SA.render.instances.reset();
  return { SA, THREE, animals: SA.render.buildAnimals(THREE, {}) };
}

test('instances: byId, of and get resolve an instanceId, a tapped instance, the nearest one, else the first', () => {
  const { SA, animals } = world();
  const I = SA.render.instances;
  const rabbits = I.of(animals, 'conejo');
  assert.ok(rabbits.length >= 3, 'a herd');
  assert.equal(I.byId(animals, 'conejo#1'), rabbits[1]);
  assert.equal(I.get(animals, 'conejo#2'), rabbits[2], 'an instanceId is exact');
  assert.equal(I.get(animals, 'conejo'), rabbits[0], 'a species id with no hints is the first instance');
  const far = rabbits[rabbits.length - 1];
  I.setNear(far.position.x + 0.1, far.position.z);
  assert.equal(I.get(animals, 'conejo'), far, 'else the instance nearest the player');
  I.tapped('conejo', 'conejo#1');
  assert.equal(I.get(animals, 'conejo'), rabbits[1], 'the tapped instance wins');
  let t = 0;
  I.now = () => t;
  I.tapped('conejo', 'conejo#1');
  t = I.TAPPED_MS + 1;
  assert.equal(I.get(animals, 'conejo'), far, 'a stale tap is forgotten');
  assert.equal(I.get(animals, 'nada'), null);
  assert.equal(I.get(animals, null), null);
});

test('round fx: a reaction on an instanceId (or a tapped species) moves only that instance', () => {
  const { SA, animals } = world();
  const I = SA.render.instances;
  const [a, b] = I.of(animals, 'conejo');
  const fx = SA.render.createRoundFx({ animals });
  const sy = b.scale.y;
  assert.equal(fx.play('conejo#1', 'boing'), true);
  fx.update(0.2);
  assert.notEqual(b.scale.y, sy, 'the tapped instance reacts');
  assert.equal(a.scale.y, 1, 'its herd mate stays still');
  fx.update(5);
  assert.equal(b.scale.y, sy, 'back to rest');
  I.tapped('conejo', 'conejo#1');
  fx.play('conejo', 'wobble');
  fx.update(0.2);
  assert.ok(b.rotation.z !== 0 || b.rotation.x !== 0, 'a species-keyed play lands on the tapped instance');
  assert.equal(a.rotation.z, 0);
});

test('ambient: every instance wanders on its own from its own home, and species ids resolve to one instance', () => {
  const { SA, animals } = world();
  const amb = SA.render.createAmbient({ animals, avoid: [] });
  const keys = animals.children.map((g) => g.name);
  assert.equal(JSON.stringify(Object.keys(amb.rigs).sort()), JSON.stringify(keys.slice().sort()), 'one rig per instance');
  const start = {};
  animals.children.forEach((g) => { start[g.name] = [g.position.x, g.position.z]; });
  for (let i = 0; i < 600; i++) amb.update(0.05);
  const moved = animals.children.filter((g) => Math.hypot(g.position.x - start[g.name][0], g.position.z - start[g.name][1]) > 0.3);
  assert.ok(moved.length > animals.children.length / 2, 'most instances walked away from their homes');
  const rabbits = SA.render.instances.of(animals, 'conejo').map((g) => [g.position.x, g.position.z].join());
  assert.equal(new Set(rabbits).size, rabbits.length, 'the rabbits are not in lockstep');
  // A species id holds one instance only (the tapped one); the others keep walking.
  SA.render.instances.tapped('conejo', 'conejo#1');
  amb.hold('conejo', 30);
  const held = amb.rigs['conejo#1'].w.state().held, other = amb.rigs['conejo#0'].w.state().held;
  assert.equal(held, true);
  assert.equal(other, false);
  amb.pin('conejo');
  SA.render.instances.tapped('conejo', 'conejo#0');
  amb.unpin('conejo');
  assert.equal(amb.rigs['conejo#1'].pinned, false, 'unpin frees the instance that was pinned');
});
