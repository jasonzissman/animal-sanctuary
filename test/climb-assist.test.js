import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// AS-0166: treetop-to-treetop hopping: flat tops plus SA.climb.landAssist (pure) wired into SA.climb.step.
const SA = loadGame(['game/sa.js', 'game/map.js', 'game/player.js', 'game/perch.js', 'game/reach.js', 'game/climb.js', 'game/climb-assist.js']);
const K = SA.climb;
const DT = 1 / 30;
const deg = (d) => (d * Math.PI) / 180;
const dry = (x, z) => !SA.map.isWater(x, z);
let spot = null;
for (let x = -36; x < -4 && !spot; x += 1) for (let z = -20; z < 18 && !spot; z += 1) {
  if ([0, 1.1, 2.5, 3.5, -2.7, -3.5, -6].every((d) => dry(x, z + d)) && [2.7, -2.7].every((d) => dry(x + d, z))) spot = { x, z };
}
const tree = (dx, dz, kind = 'jungle') => ({ x: spot.x + dx, z: spot.z + dz, y: 0, scale: 1, kind });
const A = tree(0, 0), B = tree(0, 6);
const TOP = SA.perch.KINDS.jungle.height;
const run = (s, input, secs, targets) => { for (let t = 0; t < secs - 1e-9; t += DT) s = K.step(s, input, DT, [], targets); return s; };
const onA = () => run(K.start({ x: A.x, z: A.z + 2.5, heading: 0, y: 0, climb: null }, A), {}, 2);
const at = (x, z, heading, y, extra = {}) => ({ x, z, heading, y, climb: null, ...extra });

test('treetops are flat standable surfaces: turn and walk on them at the canopy height', () => {
  const s = onA();
  assert.equal(s.climb.mode, 'canopy');
  assert.equal(s.y, TOP);
  const turned = run(s, { left: 1 }, 0.5, []);
  assert.notEqual(turned.heading, s.heading);
  assert.equal(turned.y, TOP);
  assert.equal(turned.climb.mode, 'canopy');
  assert.ok(K.edgeRadius(A) >= 0.75, 'wide enough to stand on');
});

test('landAssist: a tree ahead within range is the target, at its top centre and height', () => {
  const a = K.landAssist(at(A.x, A.z + 2.5, 0, TOP), [A, B]);
  assert.equal(a.target, B);
  assert.deepEqual({ x: a.to.x, z: a.to.z, y: a.to.y }, { x: B.x, z: B.z, y: TOP });
  assert.ok(a.dur >= 0.4 && a.dur <= 1);
});

test('landAssist: ~30 degrees off-aim still counts, 50 degrees does not', () => {
  const p = (h) => at(A.x, A.z + 2.5, h, TOP);
  assert.equal(K.landAssist(p(deg(30)), [B]).target, B);
  assert.equal(K.landAssist(p(-deg(30)), [B]).target, B);
  assert.equal(K.landAssist(p(deg(50)), [B]), null);
  assert.equal(K.landAssist(p(Math.PI), [B]), null, 'facing away');
});

test('landAssist: range is about 7 units to the top centre', () => {
  const far = tree(0, 6 + 9), mid = tree(0, 6 + 3.5);
  assert.equal(K.landAssist(at(A.x, A.z + 2.5, 0, TOP), [far]), null);
  assert.equal(K.landAssist(at(A.x, A.z + 2.5, 0, TOP), [mid]).target, mid);
  assert.equal(K.ASSIST_RANGE, 7);
});

test('landAssist never pulls up to a top much higher than the jump height', () => {
  const low = at(A.x, A.z + 2.5, 0, 3.2);          // standing on a pine-height top
  assert.equal(K.landAssist(low, [B]), null);      // 5.2 is 2 units above
  assert.equal(K.landAssist(low, [B], 1.2), null); // one hop (1.2) is not enough
  assert.equal(K.landAssist(low, [B], 2.4).target, B);   // a double jump reaches it
  assert.equal(K.landAssist(at(A.x, A.z + 2.5, 0, TOP - 0.4), [B]).target, B, 'a little higher is fine');
  assert.equal(K.landAssist(at(A.x, A.z + 2.5, 0, 0), [B], 1.2), null, 'from the ground a tree top is never assisted');
});

test('landAssist ignores the top you stand on, junk and empty lists; prefers the better-aimed tree', () => {
  const s = onA();
  assert.equal(K.landAssist(s, [A]), null);
  assert.equal(K.landAssist(s, []), null);
  assert.equal(K.landAssist(s, null), null);
  assert.equal(K.landAssist(null, [B]), null);
  assert.equal(K.landAssist(s, [null, { x: 'a' }, { x: NaN, z: 1 }]), null);
  const side = tree(4, 4.5), ahead = tree(0, 6);
  assert.equal(K.landAssist(at(A.x, A.z + 2.5, 0, TOP), [side, ahead]).target, ahead);
});

function walkOff(heading, targets, extra = {}) {
  let s = onA();
  s = { ...s, heading };
  const out = [s];
  for (let t = 0; t < 4; t += DT) { s = K.step(s, { forward: 1, ...extra }, DT, [], targets); out.push(s); if (!K.active(s)) break; }
  return out;
}

test('walking off a treetop toward another lands ON it (a land event, standing at its top)', () => {
  const frames = walkOff(0, [A, B]);
  const flying = frames.find((s) => s.climb && s.climb.assist);
  assert.ok(flying, 'the assist hop starts');
  assert.equal(flying.climb.mode, 'down');
  assert.ok(flying.y >= TOP - 1e-9, 'never dips below the tops on the way');
  let s = flying;
  const lands = [];
  for (let i = 0; i < 60 && !(s.climb && s.climb.mode === 'canopy' && s.climb.target.x === B.x && s.climb.target.z === B.z); i++) {
    s = K.step(s, {}, DT, [], [A, B]);
    if (K.landed(s)) lands.push(K.landed(s));
  }
  assert.equal(s.climb.mode, 'canopy');
  assert.equal(s.y, TOP);
  assert.equal(lands.length, 1);
  assert.equal(lands[0].kind, 'tree');
  assert.equal(lands[0].y, TOP);
  // the new top is a normal top: stand, turn, and a later walk-off falls to the ground (no more trees to hop to)
  const turned = run(s, { right: 1 }, 0.3, [A, B]);
  assert.equal(turned.y, TOP);
  const drop = run({ ...turned, heading: Math.PI }, { forward: 1 }, 3, [B]);
  assert.equal(drop.climb, null);
  assert.ok(Math.abs(drop.y - SA.map.groundHeight(drop.x, drop.z)) < 0.5, 'back on the (eased) ground height');
});

test('a running jump (lift on the input) aimed ~30 degrees off the line to the neighbour still lands on the neighbour', () => {
  let s = { ...onA(), heading: deg(20) };
  let flew = false;
  for (let t = 0; t < 4; t += DT) {
    s = K.step(s, { forward: 1, run: true, lift: 1.0 }, DT, [], [A, B]);
    if (s.climb && s.climb.assist) flew = true;
    if (flew && s.climb && s.climb.mode === 'canopy') break;
  }
  assert.ok(flew);
  assert.equal(s.climb.mode, 'canopy');
  assert.equal(s.climb.target.x, B.x);
  assert.equal(s.y, TOP);
});

test('jumping away from every tree still falls to the ground safely', () => {
  const frames = walkOff(Math.PI, [A, B]);
  assert.ok(!frames.some((s) => s.climb && s.climb.assist), 'no assist behind you');
  const last = frames[frames.length - 1];
  assert.equal(last.climb, null);
  assert.equal(last.y, SA.map.groundHeight(last.x, last.z));
  assert.ok(!SA.map.isWater(last.x, last.z));
});

test('without a targets list the old safe fall is unchanged', () => {
  const frames = walkOff(0, undefined);
  assert.ok(!frames.some((s) => s.climb && s.climb.assist));
  assert.equal(frames[frames.length - 1].climb, null);
});

test('the assist never lifts you onto a much taller tree: a pine top walking toward a jungle tree falls', () => {
  const pine = tree(0, 0, 'pine'), tall = tree(0, 6, 'jungle');
  let s = run(K.start({ x: pine.x, z: pine.z + 2.5, heading: 0, y: 0, climb: null }, pine), {}, 2);
  s = { ...s, heading: 0 };
  let assisted = false;
  for (let t = 0; t < 4 && K.active(s); t += DT) { s = K.step(s, { forward: 1 }, DT, [], [pine, tall]); if (s.climb && s.climb.assist) assisted = true; }
  assert.ok(!assisted);
  assert.equal(s.climb, null);
});
