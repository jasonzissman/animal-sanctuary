import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/station.js', 'game/player.js']);
const S = SA.station, L = S.layout();
const DT = 1 / 60;

function walk(state, input, seconds, obstacles) {
  for (let t = 0; t < seconds; t += DT) state = SA.player.step(state, input, DT, obstacles);
  return state;
}

test('the station sits on flat, dry ground at the bosque/selva border by the spawn', () => {
  const M = SA.map;
  assert.ok(Math.abs(L.cx - 0) <= 8, `centre x ${L.cx} is within 8 of the border at x=0`);
  assert.equal(M.biomeAt(L.cx + L.halfW + 1), 'bosque');
  let lo = Infinity, hi = -Infinity;
  for (let x = L.cx - L.halfW; x <= L.cx + L.halfW; x += 0.5) {
    for (let z = L.cz - L.halfD; z <= L.cz + L.halfD; z += 0.5) {
      const h = M.groundHeight(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
      assert.ok(!M.isWater(x, z), `wet at ${x}, ${z}`);
    }
  }
  assert.ok(hi - lo <= 0.7, `footprint is flat (spread ${(hi - lo).toFixed(2)})`);
  assert.ok(L.floorY >= hi - 0.05 && L.floorY <= hi + 0.3, 'floor sits at the highest ground so nothing floats under it');
  assert.deepEqual(L, S.layout(), 'layout is deterministic and cached');
});

test('the layout carries a door, window, roof, dish, antenna, sign with icon, bench and crates', () => {
  assert.ok(L.door.width >= 2 && L.door.height > 1.8);
  assert.ok(L.window.width > 0 && L.roof.y > L.floorY && L.dish.radius > 0 && L.antenna.height > 0);
  assert.equal(L.sign.text, 'Estación');
  assert.ok(L.sign.icon);
  assert.ok(L.bench.w > 0 && L.crates.length >= 2);
  assert.ok(L.sign.y < L.roof.y, 'sign sits under the roof');
});

test('collision boxes leave the doorway open and the walls closed', () => {
  const boxes = S.collisionBoxes();
  const hit = (x, z) => boxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  // The doorway centre line is free, all the way through the front wall and into the room.
  for (let z = L.door.z - 1; z <= L.door.z + 1; z += 0.1) assert.ok(!hit(L.door.x, z), `door blocked at z=${z}`);
  // Door gap is at least as wide as the player needs (2 x radius) and matches the declared width.
  const front = boxes.filter((b) => Math.abs((b.z0 + b.z1) / 2 - L.door.z) < 1e-9 && b.x1 - b.x0 > 1);
  assert.equal(front.length, 2);
  const [a, b] = front.sort((p, q) => p.x0 - q.x0);
  assert.ok(Math.abs((b.x0 - a.x1) - L.door.width) < 1e-9);
  assert.ok(L.door.width > 2 * SA.player.RADIUS);
  // Every other side is closed along its whole length.
  for (let x = L.cx - L.halfW; x <= L.cx + L.halfW; x += 0.2) assert.ok(hit(x, L.cz + L.halfD), `back wall gap at x=${x}`);
  for (let z = L.cz - L.halfD; z <= L.cz + L.halfD; z += 0.2) {
    assert.ok(hit(L.cx - L.halfW, z) && hit(L.cx + L.halfW, z), `side wall gap at z=${z}`);
  }
});

test('the spawn is just outside the door, clear of walls, facing the scientist and the station, on dry land', () => {
  const sp = S.spawn();
  assert.deepEqual(sp, SA.player.spawn(), 'SA.player.spawn() is the station spawn');
  assert.ok(sp.z < L.door.z, 'outside: further from the building than the front wall');
  assert.ok(Math.abs(sp.x - L.door.x) < L.halfW, 'in front of the building');
  assert.ok(L.door.z - sp.z <= 4, 'close to the door');
  // Facing in (AS-0212): the heading's forward vector points toward the building, opposite to the way the door faces.
  assert.ok(Math.abs(Math.sin(sp.heading) + L.facing.x) < 1e-9 && Math.abs(Math.cos(sp.heading) + L.facing.z) < 1e-9);
  assert.equal(SA.map.biomeAt(sp.x), 'bosque');
  assert.ok(!SA.map.isWater(sp.x, sp.z));
  for (const [x, z, r] of S.obstacles()) assert.ok(Math.hypot(sp.x - x, sp.z - z) > r + SA.player.RADIUS, 'spawn not wedged');
});

test('the player is stopped by every wall but walks through the doorway', () => {
  const obs = S.obstacles(), sp = S.spawn();
  // Straight in through the door, deep into the room.
  let s = walk({ x: L.door.x, z: sp.z, heading: 0 }, { forward: true }, 1.6, obs);   // from the spot in front of the door
  assert.ok(s.z > L.door.z + 0.5, `walked in through the door (z ${s.z.toFixed(2)} vs wall ${L.door.z})`);
  s = walk(s, { forward: true }, 3, obs);
  assert.ok(s.z < L.cz + L.halfD, 'the back wall stops them inside');
  // Running at every closed wall from outside (they may slide along it, even round to the door) never puts the player
  // inside a wall at any frame.
  const boxes = S.collisionBoxes();
  const inWall = (p) => boxes.find((b) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
  const starts = [
    { x: L.cx - L.halfW + 0.8, z: sp.z, heading: 0 },                      // at the front wall, left of the door
    { x: L.cx + L.halfW - 0.8, z: sp.z, heading: 0 },                      // at the front wall, right of the door
    { x: L.cx + L.halfW + 3, z: L.cz, heading: -Math.PI / 2 },             // east side
    { x: L.cx - L.halfW - 3, z: L.cz, heading: Math.PI / 2 },              // west side
    { x: L.cx, z: L.cz + L.halfD + 3, heading: Math.PI },                  // back
  ];
  for (const st of starts) {
    let p = st;
    for (let t = 0; t < 3; t += DT) {
      p = SA.player.step(p, { forward: true, run: true }, DT, obs);
      assert.ok(!inWall(p), `inside a wall at ${p.x.toFixed(2)}, ${p.z.toFixed(2)} (start ${st.x}, ${st.z})`);
    }
  }
  // Head-on at the solid part of the front wall: stopped before it for the first half second.
  s = walk({ x: L.cx - L.halfW + 0.8, z: sp.z, heading: 0 }, { forward: true, run: true }, 0.5, obs);
  assert.ok(s.z < L.door.z - L.wallT / 2, `blocked by the front wall (z ${s.z.toFixed(2)})`);
});

test('placement keeps clear of the station: footprint check and avoid points', () => {
  assert.ok(S.inFootprint(L.cx, L.cz));
  assert.ok(S.inFootprint(L.cx + L.halfW + 0.2, L.cz));
  assert.ok(S.inFootprint(L.bench.x, L.bench.z));
  assert.ok(S.inFootprint(L.crates[0].x, L.crates[0].z));
  assert.ok(!S.inFootprint(L.cx, L.cz + L.halfD + 6));
  assert.ok(S.inFootprint(L.cx, L.cz + L.halfD + 1.2, 1) && !S.inFootprint(L.cx, L.cz + L.halfD + 1.2, 0));
  assert.ok(S.avoidPoints().length >= 6);
});

test('player.spawn() falls back to a fixed bosque spot when the station is not loaded', () => {
  const bare = loadGame(['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/player.js']);
  const sp = bare.player.spawn();
  assert.equal(bare.map.biomeAt(sp.x), 'bosque');
  assert.deepEqual(bare.player.step(undefined, {}, 0), sp);
});

test('buildStation makes a flat-shaded model of primitives (no textures) from the layout', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/station.js', 'game/render/block-text.js', 'game/render/station-board.js', 'game/render/station.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const g = ctx.SA.render.buildStation(ctx.THREE);
  assert.ok(g.userData.station);
  assert.ok(g.children.length >= 20, `walls, roof, dish, sign, bench, crates (${g.children.length} parts)`);
  let seen = 0;
  g.traverse((o) => {
    if (!o.isMesh) return;
    seen++;
    assert.ok(o.material.flatShading && !o.material.map, 'flat colour materials only');
  });
  assert.ok(seen >= 60);
  // Everything is built inside a few units of the layout, on the ground it was placed on.
  const box = new ctx.THREE.Box3().setFromObject(g), c = ctx.SA.station.layout();
  assert.ok(box.min.x > c.cx - c.halfW - 3 && box.max.x < c.cx + c.halfW + 3);
  assert.ok(box.max.y > c.roof.y && box.max.y < c.roof.y + 4);
  assert.ok(g.userData.board && g.userData.board.group.parent === g, 'the missions board is part of the station model');
});

const overlaps = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const boardBox = (B) => ({ x0: B.x - B.width / 2, x1: B.x + B.width / 2, z0: B.z - B.depth / 2, z1: B.z + B.depth / 2 });

test('the missions board is inside the station, faces the doorway and keeps clear of door, bench, crates and the doorway noClimb strip (AS-0210)', () => {
  const B = L.board, bb = boardBox(B);
  assert.ok(B && B.width > 2 && B.height > 1 && B.depth > 0);
  // Inside the walls (the back wall's inner face is its limit) and under the wall top, above the floor.
  assert.ok(bb.x0 >= L.cx - L.halfW + L.wallT / 2 && bb.x1 <= L.cx + L.halfW - L.wallT / 2, 'inside the side walls');
  assert.ok(bb.z0 > L.door.z && bb.z1 <= L.cz + L.halfD - L.wallT / 2 + 1e-9, 'inside the room, against the back wall');
  assert.ok(B.y - B.height / 2 > L.floorY && B.y + B.height / 2 < L.floorY + L.wallH);
  // Faces the doorway: the front normal points at the front wall, and the door's centre line crosses the board.
  assert.ok(B.facing.x === 0 && B.facing.z === -1);
  assert.equal(B.facing.z, L.facing.z);
  assert.ok(Math.abs(B.x - L.door.x) <= B.width / 2, 'seen straight on from the doorway');
  // Clear of the doorway, bench, crates (those are all outside the room) and the doorway strip of noClimb.
  const d = L.door, doorBox = { x0: d.x - d.width / 2, x1: d.x + d.width / 2, z0: d.z - L.wallT / 2, z1: d.z + L.wallT / 2 };
  assert.ok(!overlaps(bb, doorBox));
  const b = L.bench;
  assert.ok(!overlaps(bb, { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }));
  for (const c of L.crates) assert.ok(!overlaps(bb, { x0: c.x - c.size / 2, x1: c.x + c.size / 2, z0: c.z - c.size / 2, z1: c.z + c.size / 2 }));
  const strip = S.climbTarget().noClimb[0];
  assert.ok(!overlaps(bb, strip), 'the doorway strip of noClimb stays clear of the board');
  // The board stands out from the wall, so it is an obstacle.
  assert.ok(S.collisionBoxes().some((c) => Math.abs(c.z0 - bb.z0) < 1e-9 && Math.abs(c.x1 - bb.x1) < 1e-9));
  assert.ok(S.obstacles().some(([x, z]) => Math.abs(z - B.z) < 1e-9 && Math.abs(x - B.x) <= B.width / 2));
});

test('the missions board model has a title that switches Spanish <-> English with the scaffold toggle (AS-0210)', () => {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', 'game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/station.js', 'game/render/block-text.js', 'game/render/station-board.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  let english = false;
  ctx.SA.save = { get: () => ({ settings: { english } }) };
  const board = ctx.SA.render.createStationBoard(ctx.THREE), B = ctx.SA.station.layout().board;
  const meshes = (o) => { let n = 0; o.traverse((x) => { if (x.isMesh) n++; }); return n; };
  assert.equal(board.english, false);
  const es = board.title, esBlocks = meshes(es);
  assert.ok(esBlocks > 40 && es.parent === board.group, 'a block-letter title is on the board');
  assert.ok(meshes(board.group) > esBlocks + 15, 'frame, panel, scribble lines and doodles besides the title');
  board.update();
  assert.equal(board.title, es, 'unchanged toggle keeps the same title group');
  english = true;
  board.update();
  assert.equal(board.english, true);
  assert.notEqual(board.title, es);
  assert.equal(es.parent, null, 'the Spanish title is removed');
  assert.notEqual(meshes(board.title), esBlocks, 'a different word');
  english = false;
  board.update();
  assert.equal(meshes(board.title), esBlocks, 'back to "Lista de misiones"');
  // Flat colours only, placed at the layout's board.
  board.group.traverse((o) => { if (o.isMesh) assert.ok(o.material.flatShading && !o.material.map); });
  assert.equal(board.group.position.x, B.x);
  assert.equal(board.group.position.z, B.z);
  // Missing save (no storage) is fine: Spanish.
  delete ctx.SA.save;
  assert.doesNotThrow(() => board.update());
  assert.equal(board.english, false);
});

test('block-text knows every letter of both board titles', () => {
  const SA2 = loadGame(['game/sa.js', 'game/render/block-text.js']);
  for (const word of ['Lista de misiones', 'Mission list', 'Estación']) {
    for (const ch of word.toUpperCase().replace('Ó', 'O')) if (ch !== ' ') assert.ok(SA2.render.blockTextFont[ch], `glyph ${ch}`);
    assert.ok(SA2.render.blockTextBlocks(word) > 0);
  }
  assert.equal(SA2.render.blockTextBlocks(''), 0);
});
