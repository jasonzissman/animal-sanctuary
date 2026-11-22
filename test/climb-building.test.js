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

// ---- AS-0165: the doorway never climbs; the dish and antenna are solid on the roof; the drop-off is safe ----
const DOOR = { x: L.door.x, z: L.door.z, reach: SA.spaceTarget.DOOR_REACH };

test('the doorway and the room inside are never in climb reach (walking in does not auto-climb)', () => {
  const zFront = L.door.z - 1.3;
  assert.equal(K.nearest({ x: L.cx, z: zFront, heading: 0, y: L.floorY, climb: null }, [HOUSE]), null, 'in the doorway strip');
  assert.equal(K.nearest({ x: L.cx + 0.9, z: zFront, heading: 0, y: L.floorY, climb: null }, [HOUSE]), null, 'at the door frame');
  assert.equal(K.nearest({ x: L.cx, z: L.cz, heading: 0, y: L.floorY, climb: null }, [HOUSE]), null, 'inside the room');
  assert.equal(K.edgeDistance(HOUSE, L.cx, L.cz), Infinity);
  const inside = { x: L.cx, z: L.cz, heading: 0, y: L.floorY, climb: null };
  assert.equal(K.start(inside, HOUSE), inside, 'start refuses from inside');
  assert.equal(K.nearest({ x: frontLeftX, z: zFront, heading: 0, y: L.floorY, climb: null }, [HOUSE]), HOUSE, 'but the wall beside it climbs');
});

test('pushing forward through the doorway walks in and never starts a climb', () => {
  let s = { x: L.cx, z: L.door.z - 3, heading: 0, y: L.floorY, climb: null }, timer = null;
  for (let i = 0; i < 300; i++) {
    const before = s;
    s = K.step(s, FWD, DT, obstacles);
    timer = K.autoStep(timer, before, s, FWD, [HOUSE], DT * 1000);
    assert.ok(!timer.climb, 'no auto-climb at the door');
  }
  assert.ok(s.z > L.door.z + 0.5, 'walked through the doorway into the room');
});

test('the Space chooser: the door wins in the doorway, the wall wins beside it', () => {
  const c = SA.spaceTarget.create();
  const atDoor = c.choose({ player: player(L.cx, L.door.z - 1.4, 0), trees: [HOUSE], pickups: [], doors: [DOOR] });
  assert.equal(atDoor.kind, 'door');
  c.reset();
  const atWall = c.choose({ player: player(frontLeftX, L.door.z - 1.4, 0), trees: [HOUSE], pickups: [], doors: [DOOR] });
  assert.equal(atWall.kind, 'tree', 'a wall facing is a climb');
  assert.equal(atWall.ref, HOUSE);
  c.reset();
  assert.equal(c.choose({ player: player(L.cx + L.halfW + 1.4, L.cz, -Math.PI / 2), trees: [HOUSE], pickups: [], doors: [DOOR] }).ref, HOUSE, 'side wall');
  c.reset();
  assert.equal(c.choose({ player: player(L.cx, L.cz + L.halfD + 1.4, Math.PI), trees: [HOUSE], pickups: [], doors: [DOOR] }).ref, HOUSE, 'back wall');
});

function onRoof() {
  let s = K.start({ x: frontLeftX, z: L.cz - L.halfD - 1.5, heading: 0, y: L.floorY, climb: null }, HOUSE);
  for (let i = 0; i < 200 && s.climb.mode === 'up'; i++) s = K.step(s, {}, DT, obstacles);
  assert.ok(K.onTop(s));
  return s;
}

test('on the roof you walk and turn freely, but the dish and the antenna are solid', () => {
  assert.ok(HOUSE.top.solids.length >= 2);
  let s = onRoof();
  s = { ...s, x: L.dish.x, z: L.dish.z - 3, heading: 0 };   // walk +z straight at the dish
  for (let i = 0; i < 240; i++) { s = K.step(s, FWD, DT, obstacles); assert.ok(K.onTop(s), 'stays on the roof'); }
  assert.ok(s.z < L.dish.z - L.dish.radius * 0.8 + 0.01, `stopped at the dish (z ${s.z.toFixed(2)})`);
  const turned = K.step(s, { right: 1 }, DT, obstacles);
  assert.notEqual(turned.heading, s.heading, 'turning works');
  let a = { ...onRoof(), x: L.antenna.x, z: L.antenna.z - 3, heading: 0 };
  for (let i = 0; i < 240; i++) a = K.step(a, FWD, DT, obstacles);
  assert.ok(K.onTop(a) && a.z < L.antenna.z, 'blocked by the antenna');
});

test('walking off any roof edge drops safely onto dry ground, clear of the walls', () => {
  for (const heading of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    let s = { ...onRoof(), x: L.cx + (heading === 0 || heading === Math.PI ? 0.3 : 0), z: L.cz - 0.4, heading };
    let land = null;
    for (let i = 0; i < 900 && !land; i++) { s = K.step(s, { forward: 1 }, DT, obstacles, [HOUSE]); land = K.landed(s); }
    assert.ok(land, `heading ${heading}: lands`);
    assert.ok(!s.climb, 'on the ground');
    assert.ok(Math.abs(s.y - SA.map.groundHeight(s.x, s.z)) < 1e-6);
    assert.ok(!obstacles.some(([ox, oz, r]) => Math.hypot(s.x - ox, s.z - oz) < r - 0.05), 'not inside a wall or crate');
  }
});
