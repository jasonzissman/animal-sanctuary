import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/reach.js']);
const R = SA.reach;

test('ground animal: close is reachable, far is not', () => {
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 2, z: 1 }, null), true);
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 4.9, z: 0 }, { y: 0.5 }), true);
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 12, z: 0 }, null), false);
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 0, z: -5.5 }, null), false);
});

test('raised animal needs the player to be up high too', () => {
  const bird = { x: 1, y: 6, z: 1 };
  assert.equal(R.canReach({ x: 0, z: 0 }, bird, null), false);          // standing under the tree
  assert.equal(R.canReach({ x: 0, z: 0, y: 5 }, bird, null), true);     // climbed up
  assert.equal(R.canReach({ x: 0, z: 0, y: 5 }, { x: 20, y: 6, z: 0 }, null), false);  // high but far sideways
  assert.equal(R.canReach({ x: 0, z: 0, y: 5 }, { x: 1, y: 0, z: 0 }, null), false);   // up a tree, animal far below
});

test('part height wins over the animal height', () => {
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 1, z: 0 }, { y: 1.2 }), true);
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 1, z: 0 }, { y: 8 }), false);
});

test('options, junk input and the numbers behind the answer', () => {
  assert.equal(R.canReach({ x: 0, z: 0 }, { x: 8, z: 0 }, null, { horizontal: 9 }), true);
  assert.equal(R.canReach(null, { x: 0, z: 0 }), false);
  assert.equal(R.canReach({ x: 0, z: 0 }, undefined), false);
  assert.equal(R.canReach({ x: NaN, z: 0 }, { x: 1, z: 0 }), true);   // junk numbers fall back to 0
  const c = R.check({ x: 0, z: 0 }, { x: 3, z: 4 }, null);
  assert.equal(c.dist, 5);
  assert.equal(c.ok, true);
});

test('a too-far tap nudges the hint pointer to show right away', () => {
  const S = loadGame(['game/sa.js', 'game/map.js', 'game/camera.js', 'game/reach.js', 'game/hint-pointer.js']);
  const p = S.hintPointer.create({});
  const cam = { x: 0, z: 40, dist: 10, yaw: 0, pitch: 0.6 };
  const off = { x: 40, y: 0, z: 40 };
  p.nudge();                                       // inactive: no effect
  p.start();
  assert.equal(p.update(0.1, off, cam, 1.6), null);   // idle delay not over yet
  p.nudge();
  assert.ok(p.update(0.1, off, cam, 1.6));             // off-screen target: the arrow shows now
});

test('index.html and the bundle manifest load reach.js and its cue before the picking layer', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const man = fs.readFileSync(new URL('../game/manifest.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('game/reach.js') > 0 && html.indexOf('game/reach.js') < html.indexOf('game/render/picking.js'));
  assert.ok(html.indexOf('game/render/reach-cue.js') > 0 && html.indexOf('game/render/reach-cue.js') < html.indexOf('game/render/scene.js'));
  assert.ok(man.indexOf("'game/reach.js'") > 0 && man.indexOf("'game/reach.js'") < man.indexOf("'game/render/picking.js'"));
  assert.ok(man.indexOf("'game/render/reach-cue.js'") > 0);
});

test('cue is the friendly walking prompt; far listeners are notified safely', () => {
  assert.deepEqual({ ...R.cue() }, { es: '¡Acércate!', icon: '🚶' });
  const seen = [];
  const off = R.onFar((i) => seen.push(i));
  R.onFar(() => { throw new Error('boom'); });
  R.notifyFar({ animalId: 'a' });
  off();
  R.notifyFar({ animalId: 'b' });
  assert.deepEqual(seen, [{ animalId: 'a' }]);
  assert.throws(() => R.onFar(null));
});
