import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from './helpers/vm.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js',
  'game/map.js', 'game/station.js', 'game/proofs.js', 'game/photo-board.js'];
const plain = (o) => JSON.parse(JSON.stringify(o));
const proof = (i, extra = {}) => ({ id: 'rescue:conejo:' + i, kind: 'rescue', animalId: 'conejo', date: '2026-03-04', celebrated: true, ...extra });

test('slots: 4 x 2 grid inside the board, below the title, no overlaps, row-major from the reader\'s top left', () => {
  const SA = loadGame(DATA), P = SA.photoBoard, W = 3.6, H = 2.2;
  const s = P.slots(W, H);
  assert.equal(s.length, P.PAGE);
  assert.equal(P.PAGE, 8);
  assert.deepEqual(plain(s.slice(0, 5).map((c) => [c.col, c.row])), [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]]);
  for (const c of s) {
    assert.ok(c.x - c.w / 2 >= -W / 2 && c.x + c.w / 2 <= W / 2, 'inside the width');
    assert.ok(c.y + c.h / 2 <= H / 2 - P.TITLE_H + 1e-9 && c.y - c.h / 2 >= -H / 2, 'below the title, inside the height');
  }
  assert.ok(s[0].x < s[1].x && s[0].y > s[4].y);
  assert.ok(s[0].x + s[0].w / 2 <= s[1].x - s[1].w / 2 + 1e-9, 'no overlap in a row');
  assert.ok(s[4].y + s[4].h / 2 <= s[0].y - s[0].h / 2 + 1e-9, 'no overlap between rows');
  assert.equal(P.slots().length, 8, 'defaults work');
});

test('paging: pages of 8, the newest page is shown, junk is clamped', () => {
  const SA = loadGame(DATA), P = SA.photoBoard;
  assert.equal(P.pageCount(0), 1);
  assert.equal(P.pageCount(8), 1);
  assert.equal(P.pageCount(9), 2);
  assert.equal(P.lastPage(17), 2);
  const all = Array.from({ length: 10 }, (_, i) => proof(i));
  assert.deepEqual(plain(P.page(all, 0).map((p) => p.id)), all.slice(0, 8).map((p) => p.id));
  assert.deepEqual(plain(P.page(all, 1).map((p) => p.id)), ['rescue:conejo:8', 'rescue:conejo:9']);
  assert.deepEqual(plain(P.page(all, 99)), plain(P.page(all, 1)), 'clamped to the last page');
  assert.deepEqual(plain(P.page(all, -3)), plain(P.page(all, 0)));
  assert.deepEqual(plain(P.page(null, 0)), []);
  assert.equal(P.cards(all).length, 2, 'the default is the newest page');
  assert.equal(P.cards(all, 0).length, 8);
});

test('card: a rescue shows the animal name on its body colour; a mission shows "Misión N" on gold; unknown animals fall back', () => {
  const SA = loadGame(DATA), P = SA.photoBoard;
  const rabbit = SA.data.get('animals', 'conejo');
  const body = rabbit.parts.find((x) => x.part === 'cuerpo').color;
  const c = P.card(proof(1));
  assert.equal(c.label, 'conejo');
  assert.equal(c.color, body);
  assert.equal(c.icon, rabbit.icon);
  assert.equal(c.kind, 'rescue');
  const first = SA.missions.list()[0];
  const m = P.card({ id: 'mission:' + first.id + ':1', kind: 'mission', missionId: first.id, celebrated: true });
  assert.equal(m.label, 'Misión ' + first.n);
  assert.equal(m.color, '#ffd24a');
  assert.equal(m.icon, first.icon);
  const ghost = P.card(proof(2, { animalId: 'nope' }));
  assert.equal(ghost.label, '');
  assert.match(ghost.color, /^#[0-9a-f]{6}$/);
  assert.equal(P.card(null), null);
});

test('cards come from SA.proofs / the save, each in its slot; signature changes when a proof arrives', () => {
  const SA = loadGame(DATA);
  SA.save.reset();
  const P = SA.photoBoard;
  assert.deepEqual(plain(P.cards()), []);
  const s0 = P.signature();
  assert.equal(SA.proofs.record({ kind: 'rescue', animalId: 'conejo' }).added, true);
  const s1 = P.signature();
  assert.notEqual(s0, s1);
  assert.equal(P.signature(), s1, 'stable while nothing changes');
  SA.proofs.record({ kind: 'rescue', animalId: 'tortuga' });
  const list = P.cards();
  assert.deepEqual(plain(list.map((c) => c.label)), ['conejo', 'tortuga']);
  assert.deepEqual(plain(list.map((c) => [c.slot.col, c.slot.row])), [[0, 0], [1, 0]]);
  assert.notEqual(P.signature(), s1);
});

test('the station layout has a photo board on the inside of the west wall, solid, clear of the other boards and the bench', () => {
  const SA = loadGame(DATA), L = SA.station.layout(), B = L.photoBoard;
  assert.deepEqual(plain(B.facing), { x: 1, z: 0 });
  assert.ok(B.x - B.depth / 2 >= L.cx - L.halfW + L.wallT / 2 - 1e-9, 'against the inner face of the west wall');
  assert.ok(B.z - B.width / 2 > L.cz - L.halfD + L.wallT / 2 && B.z + B.width / 2 < L.cz + L.halfD - L.wallT / 2, 'inside the room');
  assert.ok(B.y - B.height / 2 > L.floorY && B.y + B.height / 2 < L.floorY + L.wallH);
  const bx = { x0: B.x - B.depth / 2, x1: B.x + B.depth / 2, z0: B.z - B.width / 2, z1: B.z + B.width / 2 };
  const flat = (o) => ({ x0: o.x - o.width / 2, x1: o.x + o.width / 2, z0: o.z - o.depth / 2, z1: o.z + o.depth / 2 });
  const over = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
  assert.ok(!over(bx, flat(L.badgesBoard)) && !over(bx, flat(L.board)));
  assert.ok(SA.station.collisionBoxes().some((c) => Math.abs(c.x0 - bx.x0) < 1e-9 && Math.abs(c.z1 - bx.z1) < 1e-9), 'solid');
});

function bootRender() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx; ctx.self = ctx;
  for (const f of ['game/vendor/three.min.js', ...DATA, 'game/render/block-text.js', 'game/render/station-board.js', 'game/render/photo-board.js', 'game/render/station.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  ctx.SA.save.reset();
  return ctx;
}

test('the photo board model loads proofs from the save at boot and adds a card when a new proof arrives', () => {
  const ctx = bootRender(), SA = ctx.SA;
  SA.proofs.record({ kind: 'rescue', animalId: 'conejo' });
  SA.proofs.record({ kind: 'rescue', animalId: 'tortuga' });
  const st = SA.render.buildStation(ctx.THREE);
  const pb = st.userData.photoBoard;
  assert.ok(pb && pb.group.parent === st, 'the photo board is part of the station');
  assert.equal(pb.cardCount(), 2, 'cards from the save on boot');
  let meshes = 0;
  pb.group.traverse((o) => { if (o.isMesh) { meshes++; assert.ok(o.material.flatShading && !o.material.map, 'flat colours, no textures'); } });
  SA.proofs.record({ kind: 'rescue', animalId: 'pato' });
  pb.update();
  assert.equal(pb.cardCount(), 3, 'a new proof appears without a reload');
  let after = 0;
  pb.group.traverse((o) => { if (o.isMesh) after++; });
  assert.ok(after > meshes);
  const n = pb.group.children.length;
  pb.update(); pb.update();
  assert.equal(pb.group.children.length, n, 'nothing is rebuilt while the proofs are unchanged');
  // The board faces +x: its front (-z locally) points into the room.
  const dir = new ctx.THREE.Vector3(0, 0, -1).applyQuaternion(pb.group.quaternion);
  assert.ok(dir.x > 0.99);
});

test('an empty save gives a board with a title and no cards; the 9th proof moves to a fresh page of the newest ones', () => {
  const ctx = bootRender(), SA = ctx.SA;
  const pb = SA.render.createPhotoBoard(ctx.THREE);
  assert.equal(pb.cardCount(), 0);
  for (let i = 0; i < 9; i++) SA.proofs.record({ kind: 'rescue', animalId: 'conejo', key: 'rescue:conejo:k' + i });
  pb.update();
  assert.equal(pb.cardCount(), 1, 'page 2 holds the newest one');
});

test('block letters: the whole alphabet, digits and accents are drawn (the photo board spells any name)', () => {
  const ctx = bootRender(), SA = ctx.SA;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(SA.render.blockTextFont[ch], ch);
  assert.equal(SA.render.blockTextBlocks('ñandú'), 4 * 5 - 1);
  const plainWord = SA.render.blockText(ctx.THREE, new ctx.THREE.MeshBasicMaterial(), 'nandu', 0.1);
  const accented = SA.render.blockText(ctx.THREE, new ctx.THREE.MeshBasicMaterial(), 'ñandú', 0.1);
  assert.equal(accented.group.children[0].children.length, plainWord.group.children[0].children.length + 2, 'one tick per accent');
});
