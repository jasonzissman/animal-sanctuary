// AS-0193: the steep grey peaks are data, have a small flat summit in the terrain, and are climb targets like trees.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/player.js', 'game/perch.js', 'game/reach.js',
  'game/climb.js', 'game/space-target.js']);
const K = SA.climb, M = SA.map, P = SA.peaks;
const DT = 1 / 30;
const targets = P.targets();
const at = (x, z, extra = {}) => ({ x, z, heading: 0, y: 0, climb: null, ...extra });
const run = (s, input, secs) => { for (let t = 0; t < secs - 1e-9; t += DT) s = K.step(s, input, DT, []); return s; };

test('peak targets are plain climb data: kind peak, solid base, small circular summit at topY', () => {
  assert.equal(targets.length, P.LIST.length);
  assert.ok(targets.length >= 6);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(targets))), JSON.stringify(targets), 'JSON-serialisable');
  for (const t of targets) {
    assert.equal(t.kind, 'peak');
    assert.deepEqual(t.top.shape, 'circle');
    assert.ok(t.top.size >= 1 && t.top.size <= 2, 'summit radius 1-2 player lengths');
    assert.ok(t.radius > 0 && t.topY > t.y + 5, 'steep: well above its foot');
    assert.equal(K.topOf(t), t.topY);
  }
});

test('terrain is exactly flat at topY over the whole summit and falls away beyond it', () => {
  for (const t of targets) {
    for (let a = 0; a < 16; a++) for (const r of [0, 0.7, P.SUMMIT_R]) {
      const h = M.groundHeight(t.x + r * Math.cos(a), t.z + r * Math.sin(a));
      assert.ok(Math.abs(h - t.topY) < 1e-9, `${t.id} r=${r}`);
    }
    assert.ok(M.groundHeight(t.x + 2.5, t.z) < t.topY - 1.5, 'steep sides');
    assert.ok(Math.abs(M.groundHeight(t.x + P.BASE_R + 0.01, t.z) - M.baseHeight(t.x + P.BASE_R + 0.01, t.z)) < 1e-9, 'terrain is untouched beyond the foot');
  }
});

test('peaks stand on dry ground, off the station and the spawn, inside the map', () => {
  const B = M.BOUNDS;
  for (const t of targets) {
    assert.ok(!M.isWater(t.x + P.BASE_R, t.z) && !M.isWater(t.x - P.BASE_R, t.z) && !M.isWater(t.x, t.z + P.BASE_R) && !M.isWater(t.x, t.z - P.BASE_R));
    assert.ok(t.x - P.BASE_R > B.minX + 1 && t.z - P.BASE_R > B.minZ + 1 && t.z + P.BASE_R < B.maxZ - 1);
    assert.equal(SA.station.inFootprint(t.x, t.z, P.BASE_R), false);
    assert.equal(M.biomeAt(t.x), 'montana');
  }
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    assert.ok(Math.hypot(targets[i].x - targets[j].x, targets[i].z - targets[j].z) > 2 * P.BASE_R, 'mounds do not overlap');
  }
});

test('facing a peak: it is in the climb list, E/Enter target and the push-to-climb', () => {
  const t = targets[0], stand = at(t.x, t.z + t.radius + 0.6, { heading: Math.PI });   // south of it, facing -z (into it)
  assert.equal(K.nearest(stand, targets), t);
  assert.equal(K.prompt(stand, targets), 'up');
  assert.equal(K.prompt(at(t.x, t.z + 12), targets), null);
  const chooser = SA.spaceTarget.create();
  const pick = chooser.choose({ player: stand, trees: targets });
  assert.equal(pick.kind, 'tree');
  assert.equal(pick.ref, t, 'the outlined/used target is the peak');
  assert.equal(chooser.choose({ player: at(t.x, t.z + 12), trees: targets }), null);
  // keep pushing forward into it for 600 ms (the player is blocked at the solid base: the state does not move)
  let timer = null, climb = false;
  for (let ms = 0; ms < 700 && !climb; ms += 50) {
    timer = K.autoStep(timer, stand, stand, { forward: 1 }, targets, 50);
    climb = timer.climb;
  }
  assert.ok(climb && timer.tree === t);
  const up = K.start(stand, timer.tree);
  assert.equal(up.climb.mode, 'up');
});

test('climb up a peak, stand on the flat summit, walk off: a safe fall to dry ground and a land event', () => {
  const t = targets[1];
  let s = K.start(at(t.x, t.z + t.radius + 0.6, { y: M.groundHeight(t.x, t.z + t.radius + 0.6) }), t);
  s = run(s, {}, K.UP_TIME + 0.2);
  assert.equal(s.climb.mode, 'top');
  assert.ok(K.onTop(s));
  assert.ok(Math.abs(s.y - t.topY) < 1e-9);
  s = run(s, { forward: 1 }, 0.5);   // wander on the top: still up (it is 1.4 wide), then keep walking until over the edge
  let landed = null, fell = false;
  s = { ...s, heading: Math.PI / 2 };   // face +x
  for (let i = 0; i < 300 && !landed; i++) {
    s = K.step(s, { forward: 1 }, DT, []);
    if (s.climb && s.climb.fall) fell = true;
    if (K.landed(s)) landed = K.landed(s);
  }
  assert.ok(fell, 'walking off starts a fall');
  assert.ok(landed && landed.kind === 'peak', 'land event carries the target kind');
  assert.equal(s.climb, null);
  assert.ok(!M.isWater(s.x, s.z));
  assert.ok(Math.abs(s.y - M.groundHeight(s.x, s.z)) < 1e-6, 'on the ground, no damage');
  assert.ok(s.y < t.topY - 1);
});

test('the scene wiring shares one combined list and tracks climb.land', () => {
  const scene = fs.readFileSync('game/render/scene.js', 'utf8'), rig = fs.readFileSync('game/render/camera-rig.js', 'utf8');
  assert.match(scene, /climbables = trees\.concat\(SA\.peaks \? SA\.peaks\.targets\(\)/);
  assert.equal((scene.match(/return climbables;/g) || []).length, 2, 'the rig and the use key read the same list');
  assert.match(rig, /track\('climb\.land'/);
  for (const f of ['index.html', 'game/manifest.js']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(src.indexOf('game/peaks.js') > src.indexOf('game/map.js') && src.indexOf('game/peaks.js') < src.indexOf('game/climb.js'), f);
  }
});
