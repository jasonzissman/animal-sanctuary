// AS-0194: the station building is a climb target from data; jumping works on every climb top; Space/E picks the faced target of each kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/station.js', 'game/camera.js', 'game/player.js',
  'game/perch.js', 'game/jump.js', 'game/climb.js', 'game/space-target.js', 'game/space-use.js', (sa) => { sa.pickups = { SPACE_RADIUS: 2.4 }; }]);
const K = SA.climb, S = SA.station, DT = 1 / 60;
const L = S.layout(), HOUSE = S.climbTarget();
const FWD = { forward: 1, turn: 0 };
const obstacles = S.obstacles();
const frontLeftX = L.cx - 2.2;   // left of the doorway (the door is open, so pushing at the door just walks in)

test('the station target is plain data: wall footprint, roof height, a flat rect roof with the overhang', () => {
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(HOUSE))), JSON.stringify(HOUSE), 'JSON-serialisable');
  assert.equal(HOUSE.kind, 'building');
  assert.equal(HOUSE.id, 'station');
  assert.equal(HOUSE.topY, L.roof.y + L.roof.thickness);
  assert.equal(HOUSE.top.shape, 'rect');
  assert.ok(HOUSE.top.size.w > HOUSE.footprint.w && HOUSE.top.size.d > HOUSE.footprint.d, 'the roof overhangs the walls');
  assert.equal(K.topOf(HOUSE), HOUSE.topY);
});

test('facing the front wall: prompt, E-style start and the climb up to the flat roof', () => {
  const targets = [HOUSE];
  const near = { x: frontLeftX, z: L.cz - L.halfD - 1.5, heading: 0, y: L.floorY, climb: null };
  assert.equal(K.nearest(near, targets), HOUSE);
  assert.equal(K.prompt(near, targets), 'up');
  assert.equal(K.nearest({ ...near, z: near.z - 5 }, targets), null, 'too far away');
  let s = K.start(near, K.nearest(near, targets));
  for (let i = 0; i < 200 && s.climb && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, obstacles);
  assert.ok(K.onTop(s));
  assert.equal(s.climb.mode, 'top');
  assert.equal(s.y, HOUSE.topY);
  assert.ok(Math.abs(s.x - L.cx) < L.halfW + 0.01 && Math.abs(s.z - L.cz) < L.halfD + 0.01, 'stands on the roof, inside its edge');
});

test('auto-climb: a 600 ms forward push into the wall climbs the station', () => {
  let s = { x: frontLeftX, z: L.cz - L.halfD - 3, heading: 0, y: L.floorY, climb: null }, timer = null, started = false;
  for (let i = 0; i < 400 && !started; i++) {
    const before = s;
    s = K.step(s, FWD, DT, obstacles);
    timer = K.autoStep(timer, before, s, FWD, [HOUSE], DT * 1000);
    if (timer.climb) { s = K.start(s, timer.tree); started = true; }
  }
  assert.ok(started, 'the push eventually climbs');
  assert.equal(timer.tree, HOUSE);
  assert.ok(timer.ms >= K.AUTO_CLIMB_MS);
  assert.equal(s.climb.mode, 'up');
  assert.equal(s.climb.target.kind, 'building');
});

// ---- Jumping on any climb top ----
// A tree with dry ground all round it, so every fall direction lands safely.
let spot = null;
for (let x = -36; x < -10 && !spot; x += 1) for (let z = -15; z < 12 && !spot; z += 1) {
  let ok = true;
  for (let dx = -7; dx <= 7 && ok; dx += 1) for (let dz = -7; dz <= 7 && ok; dz += 1) if (SA.map.isWater(x + dx, z + dz)) ok = false;
  if (ok) spot = { x, z };
}
const TREE = { x: spot.x, z: spot.z, y: SA.map.groundHeight(spot.x, spot.z), scale: 1, kind: 'jungle' };
const peak = SA.peaks.targets()[0];
const tops = [['tree canopy', TREE, { x: TREE.x + 1.1, z: TREE.z }], ['peak summit', peak, { x: peak.x, z: peak.z }], ['roof', HOUSE, { x: L.cx, z: L.cz }]];

for (const [name, target, at] of tops) {
  test(`jump on the ${name}: the arc is relative to topY and lands back exactly on it`, () => {
    // Climb for real so the state is the genuine on-top state.
    let s = { x: at.x, z: at.z + (target === HOUSE ? -(L.halfD + 1.5) : -2.2), heading: 0, y: SA.map.groundHeight(at.x, at.z), climb: null };
    if (target === HOUSE) s = { ...s, x: frontLeftX, y: L.floorY };
    s = K.start(s, target);
    assert.ok(s.climb, `${name} can be started`);
    for (let i = 0; i < 300 && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, []);
    assert.ok(K.onTop(s));
    const top = K.topOf(target);
    let hop = SA.jump.create(), peakLift = 0, took = false, landed = false;
    for (let i = 0; i < 120; i++) {
      s = K.step(s, {}, DT, []);   // standing still on top
      hop = SA.jump.step(hop, { jump: i === 0 }, DT, true, 0);   // what the rig does while the player is on top (not climbing)
      if (hop.event === 'takeoff') took = true;
      if (hop.event === 'land') landed = true;
      peakLift = Math.max(peakLift, hop.lift);
      assert.equal(s.y, top, 'the standing height stays topY the whole jump');
      assert.ok(K.onTop(s), 'still on top');
    }
    assert.ok(took && landed, 'takes off and lands');
    assert.ok(peakLift > 0.9 && peakLift <= SA.jump.HEIGHT + 0.01, `peak lift ${peakLift} follows the normal arc`);
    assert.equal(hop.lift, 0, 'back at topY');
  });

  test(`jumping off the edge of the ${name} leads into the safe fall and lands on the ground`, () => {
    let s = { x: at.x, z: at.z + (target === HOUSE ? -(L.halfD + 1.5) : -2.2), heading: 0, y: target === HOUSE ? L.floorY : 0, climb: null };
    if (target === HOUSE) s = { ...s, x: frontLeftX };
    s = K.start(s, target);
    for (let i = 0; i < 300 && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, []);
    s = { ...s, heading: Math.PI };   // face -z, toward the open side for all three
    let hop = SA.jump.create(), fell = false, land = null;
    for (let i = 0; i < 900 && (s.climb || !land); i++) {
      hop = SA.jump.step(hop, { jump: i < 3 }, DT, true, 0);
      s = K.step(s, { forward: 1, run: true }, DT, []);
      if (s.climb && s.climb.mode === 'down' && s.climb.fall) { fell = true; hop = SA.jump.cancel(hop); }
      if (K.landed(s)) land = K.landed(s);
      if (!s.climb) break;
    }
    assert.ok(fell, 'walking off the edge mid-jump starts the fall');
    assert.ok(!s.climb, 'back on the ground');
    assert.ok(land, 'reports the land event');
    assert.equal(land.kind, target === TREE ? 'tree' : target.kind);
    assert.ok(Math.abs(s.y - SA.map.groundHeight(s.x, s.z)) < 1e-6, 'standing on the terrain');
    assert.ok(!SA.map.isWater(s.x, s.z), 'dry ground');
  });
}

// ---- The outline / E target is the faced climb target of each kind ----
const player = (x, z, heading) => ({ x, z, heading });
const faced = [
  ['tree', TREE, player(TREE.x - 2.2, TREE.z, Math.PI / 2)],
  ['peak', peak, player(peak.x, peak.z - (peak.radius + 1), 0)],
  ['building', HOUSE, player(frontLeftX, L.cz - L.halfD - 1.4, 0)],
];
const ALL = [TREE, peak, HOUSE];

for (const [kind, target, p] of faced) {
  test(`space-target picks the faced ${kind} (no kind-specific branch) and E climbs it`, () => {
    const c = SA.spaceTarget.create();
    const t = c.choose({ player: p, trees: ALL, pickups: [] });
    assert.ok(t, 'something is targeted');
    assert.equal(t.kind, 'tree', 'every climb target is the one "tree" slot kind');
    assert.equal(t.ref, target);
    // spaceUse routes it to rig.climbTree untouched
    const climbed = [];
    const use = SA.spaceUse.create({ getPlayer: () => p, trees: () => ALL, picking: { target: () => null }, rig: { climbTree: (r) => climbed.push(r), climbPrompt: () => null },
      pickups: null, root: { addEventListener() {} } });
    assert.equal(use.use(), true);
    assert.deepEqual(climbed, [target]);
  });
}

test('standing between two kinds, the one you face wins; turning round flips it', () => {
  const t1 = { kind: 'peak', id: 'a', x: 0, z: 3.4, radius: 2.5, topY: 5, top: { shape: 'circle', size: 1.4 } };
  const t2 = { kind: 'building', id: 'b', x: 0, z: -3.4, radius: 2.5, topY: 5, top: { shape: 'rect', size: 3 } };
  const c = SA.spaceTarget.create();
  assert.equal(c.choose({ player: player(0, 0, 0), trees: [t1, t2] }).ref, t1);
  c.reset();
  assert.equal(c.choose({ player: player(0, 0, Math.PI), trees: [t1, t2] }).ref, t2);
});
