import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/clue-levels.js', 'game/save.js', 'game/unlocks.js',
  'game/picking.js', 'game/round.js', 'game/data/foods.js', 'game/data/care.js', 'game/care.js', 'game/unlock-flow.js'];

function setup(extra = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const shown = [];
  const tracker = SA.unlocks.create({ track: (t, f) => events.push({ t, ...f }), onUnlock: (a) => shown.push(a.id), ...extra });
  return { SA, tracker, events, shown };
}

test('evaluate: stars, rounds, sameTap, all and any are data-driven', () => {
  const { SA } = setup();
  const u = SA.unlocks;
  assert.equal(u.evaluate({ type: 'stars', min: 3 }, { stars: 3 }), true);
  assert.equal(u.evaluate({ type: 'stars', min: 3 }, { stars: 2 }), false);
  assert.equal(u.evaluate({ type: 'rounds', min: 2 }, { rounds: 2 }), true);
  const taps = { tree: { '*': 5, bosque: 4 } };
  assert.equal(u.evaluate({ type: 'sameTap', target: 'tree', count: 5 }, { taps }), true);
  assert.equal(u.evaluate({ type: 'sameTap', target: 'tree', biome: 'bosque', count: 5 }, { taps }), false);
  assert.equal(u.evaluate({ type: 'sameTap', target: 'rock', count: 1 }, { taps }), false);
  const yes = { type: 'stars', min: 1 }, no = { type: 'stars', min: 99 };
  assert.equal(u.evaluate({ type: 'all', of: [yes, no] }, { stars: 1 }), false);
  assert.equal(u.evaluate({ type: 'all', of: [yes, yes] }, { stars: 1 }), true);
  assert.equal(u.evaluate({ type: 'any', of: [no, yes] }, { stars: 1 }), true);
  assert.equal(u.evaluate({ type: 'nope' }, {}), false);
  assert.equal(u.evaluate({ type: 'stars', min: 1 }), false, 'missing facts never unlock');
});

test('validate: accepts good conditions and explains bad ones', () => {
  const { SA } = setup();
  const v = SA.unlocks.validate;
  assert.ok(v({ type: 'all', of: [{ type: 'stars', min: 10 }, { type: 'sameTap', target: 'tree', biome: 'bosque', count: 5 }] }));
  assert.throws(() => v(null), /object/);
  assert.throws(() => v({ type: 'magic' }), /type must be one of/);
  assert.throws(() => v({ type: 'stars', min: 0 }), /stars\.min/);
  assert.throws(() => v({ type: 'stars', min: 1.5 }), /stars\.min/);
  assert.throws(() => v({ type: 'sameTap', count: 5 }), /sameTap\.target/);
  assert.throws(() => v({ type: 'sameTap', target: 'tree', biome: 3, count: 5 }), /sameTap\.biome/);
  assert.throws(() => v({ type: 'sameTap', target: 'tree', count: 0 }), /sameTap\.count/);
  assert.throws(() => v({ type: 'all', of: [] }), /non-empty/);
  assert.throws(() => v({ type: 'any', of: [{ type: 'stars' }] }), /stars\.min/);
});

test('data: every easter egg has a valid unlock; real animals have none; the mouse is original and built from parts', () => {
  const { SA } = setup();
  const eggs = SA.data.all('animals').filter((a) => a.easterEgg);
  assert.ok(eggs.length >= 1);
  for (const a of eggs) assert.ok(SA.unlocks.validate(a.unlock), a.id);
  const mouse = SA.data.get('animals', 'raton');
  assert.equal(mouse.name.es, 'ratón chispa');
  assert.equal(mouse.traits.color, 'amarillo');
  const builder = (part) => mouse.parts.find((p) => p.part === part).builder;
  assert.equal(builder('cola'), 'zigzag');
  assert.ok(mouse.parts.some((p) => p.part === 'mejillas') && mouse.parts.some((p) => p.part === 'orejas'));
  assert.doesNotMatch(JSON.stringify(mouse).toLowerCase(), /pika|chu|pokemon|nintendo/);
  assert.throws(() => SA.data.register('animals', [{ ...mouse, id: 'otro', unlock: undefined }]), /unlock/);
  assert.throws(() => SA.data.register('animals', [{ ...SA.data.get('animals', 'conejo'), id: 'liebre', unlock: { type: 'stars', min: 1 } }]), /unlock/);
  assert.throws(() => SA.data.register('animals', [{ ...mouse, id: 'otro', parts: [{ ...mouse.parts[0], builder: 'torus' }] }]), /builder/);
});

test('the mouse stays hidden until BOTH stars and the same-tree taps are reached, then saves and fires once', () => {
  const { SA, tracker, events, shown } = setup();
  assert.equal(tracker.isUnlocked('raton'), false);
  assert.equal(SA.unlocks.isUnlocked('conejo'), true);
  for (let i = 0; i < 5; i++) tracker.tap('tree', 7, 'bosque');         // 5 taps, but 0 stars
  assert.deepEqual(shown, []);
  SA.save.update({ stars: 10 });
  assert.deepEqual(Array.from(tracker.check(), (a) => a.id), ['raton']);
  assert.deepEqual(shown, ['raton']);
  assert.deepEqual(Array.from(SA.save.get().unlockedAnimals), ['raton']);
  assert.deepEqual(events, [{ t: 'unlock.animal', animalId: 'raton' }]);
  assert.equal(tracker.isUnlocked('raton'), true);
  assert.equal(tracker.check().length, 0, 'already unlocked');
  tracker.tap('tree', 7, 'bosque');
  assert.equal(shown.length, 1);
});

test('taps must be on the SAME tree and in the right biome', () => {
  const { SA, tracker, shown } = setup();
  SA.save.update({ stars: 12 });
  for (let i = 0; i < 6; i++) tracker.tap('tree', i, 'bosque');         // six different trees
  for (let i = 0; i < 9; i++) tracker.tap('tree', 99, 'selva');         // one jungle tree, many times
  assert.deepEqual(shown, []);
  for (let i = 0; i < 5; i++) tracker.tap('tree', 3, 'bosque');
  assert.deepEqual(shown, ['raton']);
});

test('an unlock that is already saved survives a reload and is not announced again', () => {
  const { SA, tracker, shown } = setup();
  SA.save.update({ stars: 20, unlockedAnimals: ['raton'] });
  for (let i = 0; i < 5; i++) tracker.tap('tree', 1, 'bosque');
  assert.deepEqual(shown, []);
  assert.equal(SA.unlocks.isUnlocked('raton'), true);
});

test('a throwing onUnlock or track never breaks play and the unlock stays saved', () => {
  const { SA, tracker } = setup({ track: () => { throw new Error('x'); }, onUnlock: () => { throw new Error('y'); } });
  SA.save.update({ stars: 10 });
  for (let i = 0; i < 5; i++) tracker.tap('tree', 1, 'bosque');
  assert.deepEqual(Array.from(SA.save.get().unlockedAnimals), ['raton']);
});

test('after unlocking, the mouse joins Scout & Spot clues and care tasks like any animal', () => {
  const { SA } = setup();
  const ids = (game) => { const out = new Set(); for (let i = 0; i < 60; i++) out.add(game.start().answerId); return out; };
  const before = SA.round.create({ rng: SA.clues.makeRng(5), level: 1, biome: 'bosque' });
  assert.ok(!ids(before).has('raton'));
  SA.save.update({ unlockedAnimals: ['raton'] });
  const after = SA.round.create({ rng: SA.clues.makeRng(5), level: 1, biome: 'bosque' });
  const answers = ids(after);
  assert.ok(answers.has('raton'), 'the mouse is asked for');
  const r = SA.round.create({ rng: SA.clues.makeRng(2), level: 1, biome: 'bosque', animals: ['raton', 'conejo', 'pato'] }).start();
  assert.ok(r.clue.text.startsWith('Busca el animal'));
  const care = SA.care.create({ rng: SA.clues.makeRng(3), level: 1, track: () => {} });
  for (const kind of ['limpiar', 'curar', 'alimentar']) {
    const t = care.maybeStart('raton', true, kind);
    assert.ok(t && t.animalId === 'raton', 'care task ' + kind);
  }
  SA.save.update({ unlockedAnimals: [] });
  assert.equal(care.maybeStart('raton', true), null, 'no care while the egg is hidden');
  const clean = SA.data.all('careTasks').find((t) => t.kind === 'limpiar');
  assert.ok(clean.parts.some((p) => SA.data.get('animals', 'raton').parts.some((x) => x.part === p)));
});

test('unlockFlow.reveal shows the hidden group, plays fanfare + sparkle, boings, celebrates and speaks the name', () => {
  const { SA } = setup();
  const calls = [];
  const group = { getObjectByName: (id) => (id === 'raton' ? hidden : null) };
  const hidden = { visible: false };
  const flow = SA.unlockFlow.create({
    group, fx: { play: (id, r) => calls.push(['fx', id, r]) }, celebrate: (m) => calls.push(['celebrate', m]),
    audio: { sfx: (n) => calls.push(['sfx', n]), say: (k) => calls.push(['say', k]) }, later: (fn) => fn(),
  });
  assert.equal(flow.reveal(SA.data.get('animals', 'raton')), true);
  assert.equal(hidden.visible, true);
  assert.deepEqual(calls.filter((c) => c[0] === 'sfx').map((c) => c[1]), ['fanfare', 'sparkle']);
  assert.deepEqual(calls.find((c) => c[0] === 'fx'), ['fx', 'raton', 'boing']);
  assert.match(calls.find((c) => c[0] === 'celebrate')[1], /ratón chispa/);
  assert.deepEqual(calls.find((c) => c[0] === 'say'), ['say', 'animal:raton']);
  assert.equal(flow.reveal({ id: 'nadie', name: { es: 'x' } }), false);
});

// ---- rendering with the real vendored three.js ----

function stage() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  ctx.self = ctx;
  const files = ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js',
    'game/data/animals.js', 'game/save.js', 'game/unlocks.js', 'game/map.js', 'game/animal-plan.js', 'game/picking.js',
    'game/render/zigzag.js', 'game/render/animals.js', 'game/render/decor-dry.js', 'game/render/decor.js', 'game/render/tree-tap.js'];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.SA.save.reset();
  return ctx;
}

test('zigzag geometry fits the unit box and has a lightning-bolt silhouette', () => {
  const ctx = stage();
  const geo = ctx.SA.render.zigzagGeometry(ctx.THREE);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  assert.ok(b.min.y > -0.6 && b.max.y < 0.6 && b.min.x > -0.6 && b.max.x < 0.6 && b.max.z <= 0.5001);
  assert.ok(b.max.y - b.min.y > 0.95, 'spans the full length');
  assert.ok(geo.attributes.position.count === geo.attributes.normal.count && geo.attributes.position.count > 100);
});

test('buildAnimals hides the egg until unlocked and the mouse tail uses the zigzag builder', () => {
  const ctx = stage();
  const { SA, THREE } = ctx;
  let group = SA.render.buildAnimals(THREE, {});
  const g = group.getObjectByName('raton');
  assert.equal(g.visible, false);
  assert.equal(group.getObjectByName('conejo').visible, true);
  const tail = g.children.find((m) => !m.userData.pick && m.userData.part === 'cola');
  assert.ok(tail.geometry.attributes.position.count > 100, 'zigzag, not a plain primitive');
  SA.save.update({ unlockedAnimals: ['raton'] });
  group = SA.render.buildAnimals(THREE, {});
  assert.equal(group.getObjectByName('raton').visible, true);
});

test('tree tap: counts taps on one tree, skips animals, drags and the sandbox, and wobbles the tree', () => {
  const ctx = stage();
  const { SA, THREE } = ctx;
  const decor = SA.render.buildDecor(THREE);
  const trees = decor.children.filter((o) => o.userData.tree);
  assert.ok(trees.length > 20);
  const tree = trees.find((t) => SA.map.biomeAt(t.position.x) === 'bosque');
  const listeners = {};
  const canvas = { addEventListener: (n, f) => { listeners[n] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  // an orthographic-ish camera looking straight down at the tree
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  camera.position.set(tree.position.x, 40, tree.position.z + 0.001);
  camera.lookAt(tree.position.x, tree.position.y, tree.position.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  decor.updateMatrixWorld(true);
  const taps = [];
  let animalHit = false;
  const tt = SA.render.createTreeTap(THREE, { canvas, camera, decor, hitsAnimal: () => animalHit, onTap: (t) => taps.push(t) });
  const tap = () => { listeners.pointerdown({ pointerId: 1, clientX: 50, clientY: 50 }); listeners.pointerup({ pointerId: 1, clientX: 50, clientY: 50 }); };
  assert.equal(tt.tapAt(50, 50).biome, 'bosque');
  tap();
  assert.equal(taps.length, 1);
  assert.equal(taps[0].biome, 'bosque');
  assert.equal(taps[0].id, decor.children.indexOf(tree));
  tap();
  assert.equal(taps[1].id, taps[0].id, 'same tree, same id');
  tt.update(0.1);
  assert.notEqual(tree.rotation.z, 0, 'wobbling');
  tt.update(2);
  assert.equal(tree.rotation.z, 0, 'back to rest');
  animalHit = true; tap();
  assert.equal(taps.length, 2, 'an animal in front wins');
  animalHit = false;
  listeners.pointerdown({ pointerId: 2, clientX: 50, clientY: 50 });
  listeners.pointermove({ pointerId: 2, clientX: 90, clientY: 90 });
  listeners.pointerup({ pointerId: 2, clientX: 90, clientY: 90 });
  assert.equal(taps.length, 2, 'drags never tap');
  SA.picking.setPaused(true); tap();
  assert.equal(taps.length, 2, 'sandbox owns taps');
  SA.picking.setPaused(false);
  listeners.pointercancel({});
  const sky = SA.render.createTreeTap(THREE, { canvas, camera: new THREE.PerspectiveCamera(30, 1, 0.5, 400), decor: new THREE.Group() });
  assert.equal(sky.tapAt(50, 50), null);
});
