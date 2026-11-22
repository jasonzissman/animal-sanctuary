import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/camera.js', 'game/station.js', 'game/station-board.js',
  'game/player.js', 'game/perch.js', 'game/climb.js', 'game/space-target.js', 'game/space-use.js', 'game/picking.js',
  'game/render/station-board-tap.js', 'game/ui/station-menu-view.js'];

function boot() {
  const events = [];
  const SA = loadGame(FILES.concat((sa) => { sa.pickups = { SPACE_RADIUS: 2.4 }; }), { SAT: { track: (t, f) => events.push([t, f]) } });
  return { SA, events };
}
const P = (x, z, heading = 0, extra = {}) => ({ x, z, heading, ...extra });   // heading 0 faces +z

test('the board target is the board centre, one stable object with a reach', () => {
  const { SA } = boot();
  const L = SA.station.layout(), b = SA.station.boardTarget();
  assert.equal(b.id, 'station-board');
  assert.equal(b.kind, 'board');
  assert.equal(b.x, L.board.x);
  assert.equal(b.y, L.board.y);
  assert.equal(b.z, L.board.z);
  assert.equal(b.reach, SA.spaceTarget.BOARD_REACH);
  assert.equal(SA.station.BOARD_REACH, SA.spaceTarget.BOARD_REACH);
  assert.equal(SA.station.boardTarget(), b);
  assert.equal(SA.station.boardTargets().length, 2, 'the missions board and the Insignias board (AS-0239)');
  assert.equal(SA.station.boardTargets()[0], b);
  assert.equal(SA.station.boardTargets(), SA.station.boardTargets(), 'a stable list: nothing allocated per frame');
  assert.equal(SA.station.doorTarget, undefined, 'the door frame is no target any more');
  assert.equal(SA.station.canTapDoor, undefined);
});

test('the door frame never becomes a target: at the spawn, in front of the door and walking in nothing is chosen', () => {
  const { SA } = boot();
  const L = SA.station.layout(), b = SA.station.boardTarget(), c = SA.spaceTarget.create();
  assert.equal(c.choose({ player: SA.station.spawn(), boards: [b] }), null);
  assert.equal(c.choose({ player: P(L.door.x, L.door.z - 1.5, 0), boards: [b] }), null, 'facing the doorway from outside');
  assert.equal(c.choose({ player: P(L.door.x, L.door.z + 0.3, 0), boards: [b] }), null, 'standing in the doorway');
  assert.equal(c.choose({ player: P(L.door.x, L.door.z + 1.2, 0), boards: [b] }), null, 'just inside, still far from the board');
  assert.equal(SA.spaceTarget.DOOR_REACH, undefined);
});

test('facing the board within reach makes it the target (kind board); beyond reach no (any direction)', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget(), c = SA.spaceTarget.create(), R = SA.spaceTarget.BOARD_REACH;
  const t = c.choose({ player: P(b.x, b.z - (R - 0.1), 0), boards: [b] });
  assert.deepEqual([t.kind, t.ref], ['board', b]);
  c.reset();
  assert.equal(c.choose({ player: P(b.x, b.z - (R + 0.1), 0), boards: [b] }), null);
  c.reset();
  assert.equal(c.choose({ player: P(b.x + (R - 0.1), b.z, -Math.PI / 2), boards: [b] }).kind, 'board', 'from the side too');
  c.reset();
  assert.equal(c.choose({ player: P(NaN, 0), boards: [b] }), null);
  assert.equal(c.choose({ player: P(0, 0), boards: [null, { x: NaN, z: 0 }] }), null);
  assert.equal(c.choose({ player: P(b.x, b.z - 1, 0), boards: [{ x: b.x, z: b.z, reach: 0.5 }] }), null, 'a board can carry its own reach');
});

test('the scientist is her own kind (npc) with her own reach', () => {
  const { SA } = boot();
  const npc = { x: 10, z: 10, reach: 2 };
  const c = SA.spaceTarget.create();
  const t = c.choose({ player: P(10, 8.5, 0), npcs: [npc] });
  assert.deepEqual([t.kind, t.ref], ['npc', npc]);
  c.reset();
  assert.equal(c.choose({ player: P(10, 7.5, 0), npcs: [npc] }), null);
  c.reset();
  assert.equal(c.choose({ player: P(10, 8, 0), npcs: [{ x: 10, z: 10 }] }).kind, 'npc', 'default NPC_REACH');
});

test('the aim part still beats the board', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget(), part = { part: 'cola' };
  const t = SA.spaceTarget.create().choose({ player: P(b.x, b.z - 1, 0), part, boards: [b] });
  assert.deepEqual([t.kind, t.ref], ['part', part]);
});

test('hands off against a nearby find, by proximity and facing', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget(), c = SA.spaceTarget.create();
  const find = { x: b.x + 0.4, z: b.z - 2.2, id: 'f' };
  assert.equal(c.choose({ player: P(b.x + 0.4, b.z - 2.1, Math.PI), pickups: [find], boards: [b] }).kind, 'pickup');
  c.reset();
  assert.equal(c.choose({ player: P(b.x, b.z - 0.8, 0), pickups: [find], boards: [b] }).kind, 'board');
});

test('hysteresis: a board that is the target stays it against a similar rival (no flicker)', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget(), c = SA.spaceTarget.create();
  const first = c.choose({ player: P(b.x, b.z - 1.8, 0), boards: [b] });
  assert.equal(first.kind, 'board');
  const rival = { x: b.x + 0.5, z: b.z - 0.4, id: 'r' };   // a little closer to the player than the board, but not clearly
  const p = P(b.x, b.z - 1.8, 0);
  assert.equal(SA.spaceTarget.create().choose({ player: p, pickups: [rival], boards: [b] }).kind, 'pickup', 'on its own the rival would win');
  assert.equal(c.choose({ player: p, pickups: [rival], boards: [b] }).kind, 'board');
});

test('tap reach: generous, bad players refused', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget();
  assert.ok(SA.station.canTapBoard(P(b.x, b.z - 4)));
  assert.equal(SA.station.canTapBoard(P(b.x, b.z - SA.station.TAP_REACH - 1)), false);
  assert.equal(SA.station.canTapBoard(null), false);
  assert.equal(SA.station.canTapBoard({ x: NaN, z: 0 }), false);
});

test('open and close: hook state, listeners, one station.open event per opening', () => {
  const { SA, events } = boot();
  const S = SA.station, log = [];
  const offOpen = S.onOpen((src) => log.push('open:' + src));
  S.onClose(() => log.push('close'));
  S.onOpen(() => { throw new Error('a bad listener never breaks play'); });
  assert.equal(S.isOpen(), false);
  assert.equal(S.close(), false, 'closing when closed does nothing');
  assert.equal(S.open('tap'), true);
  assert.equal(S.isOpen(), true);
  assert.equal(S.open('tap'), false, 'already open');
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [['station.open', { source: 'tap' }]]);
  assert.equal(S.close(), true);
  assert.equal(S.isOpen(), false);
  assert.equal(S.toggle('board'), true);
  assert.equal(S.toggle('board'), false);
  assert.equal(log.join(), 'open:tap,close,open:board,close');
  assert.equal(events.length, 2);
  assert.equal(events[1][1].source, 'board');
  offOpen();
  S.open();
  assert.equal(log.length, 4, 'unsubscribed');
  assert.equal(events[2][1].source, 'api');
  assert.equal(S.onOpen('nope')(), undefined, 'a non-function listener is ignored');
});

test('E and Enter on the outlined board open the missions; Space does not; away from the board nothing happens', () => {
  const { SA, events } = boot();
  let player = P(0, 0), keydown = null;
  const root = { addEventListener: (t, f) => { if (t === 'keydown') keydown = f; } };
  const use = SA.spaceUse.create({ getPlayer: () => player, trees: () => [], boards: SA.station.boardTargets, root,
    openBoard: () => { SA.station.toggle('board'); return true; } });
  const b = SA.station.boardTarget();
  const key = (k, extra = {}) => { let prevented = false; keydown({ key: k, preventDefault: () => { prevented = true; }, ...extra }); return prevented; };
  assert.equal(use.update(), null);
  assert.equal(key('e'), false, 'no target: the key is left alone');
  assert.equal(SA.station.isOpen(), false);
  player = P(b.x, b.z - 1.5, 0);
  assert.equal(use.update().kind, 'board');
  assert.equal(key(' ', { code: 'Space' }), false);
  assert.equal(SA.station.isOpen(), false, 'Space is the jump key');
  assert.equal(key('e'), true);
  assert.equal(SA.station.isOpen(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [['station.open', { source: 'board' }]]);
  assert.equal(key('Enter', { repeat: true }), true, 'a held key is swallowed but does not toggle again');
  assert.equal(SA.station.isOpen(), true);
  assert.equal(key('Enter'), true);
  assert.equal(SA.station.isOpen(), false, 'E / Enter again closes it');
  assert.equal(use.use(), true);
  assert.equal(SA.station.isOpen(), true);
});

test('spaceUse routes the npc kind to talk, and does nothing without the handlers', () => {
  const { SA } = boot();
  const b = SA.station.boardTarget();
  const bare = SA.spaceUse.create({ getPlayer: () => P(b.x, b.z - 1, 0), boards: SA.station.boardTargets, root: {} });
  assert.equal(bare.use(), false, 'a board target without an openBoard handler');
  const npc = { x: 3, z: 3 }, talked = [];
  const use = SA.spaceUse.create({ getPlayer: () => P(3, 2, 0), npcs: () => [npc], talk: (n) => { talked.push(n); return true; }, root: {} });
  assert.equal(use.use(), true);
  assert.deepEqual(talked, [npc]);
  assert.equal(SA.spaceUse.create({ getPlayer: () => P(3, 2, 0), npcs: () => [npc], root: {} }).use(), false);
});

// --- placeholder view and tap (DOM / THREE stubs) ---------------------------------------------------------------------------

function fakeDom() {
  const mk = () => ({ style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
    appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { this.listeners[t] = f; } });
  const docL = {};
  const body = mk();
  return { docL, body, doc: { createElement: mk, body, addEventListener: (t, f) => { docL[t] = f; } } };
}

test('placeholder menu: shows a phrase and icon on open, hides on close button, backdrop, Escape and SA.station.close', () => {
  const { SA } = boot();
  const { doc, docL, body } = fakeDom();
  const toggles = [];
  const view = SA.stationMenuView.create(doc, { onToggle: (on) => toggles.push(on) });
  const shade = body.children[0], card = shade.children[0];
  assert.equal(card.children[0].textContent, '⚛️');
  assert.match(card.children[1].textContent, /estación/i);
  const close = card.children[3];
  assert.equal(close.attrs['aria-label'], 'Cerrar');
  assert.equal(view.body, card.children[2], 'a room for the customizer');

  SA.station.open('board');
  assert.equal(shade.style.display, 'flex');
  assert.equal(view.isOpen(), true);
  close.listeners.click();
  assert.equal(shade.style.display, 'none');
  assert.equal(SA.station.isOpen(), false);

  SA.station.open('tap');
  shade.listeners.click({ target: card });
  assert.equal(view.isOpen(), true, 'a click inside the card keeps it open');
  shade.listeners.click({ target: shade });
  assert.equal(view.isOpen(), false, 'a tap outside the card closes');

  SA.station.open('tap');
  docL.keydown({ key: 'a' });
  assert.equal(view.isOpen(), true);
  docL.keydown({ key: 'Escape' });
  assert.equal(view.isOpen(), false);

  SA.station.open('tap');
  SA.station.close();
  assert.equal(view.isOpen(), false);
  assert.equal(toggles.join(), 'true,false,true,false,true,false,true,false');
});

test('placeholder menu is a no-op without a DOM', () => {
  const { SA } = boot();
  const v = SA.stationMenuView.create(null);
  assert.equal(v.isOpen(), false);
  assert.equal(v.element, null);
});

test('tapping the board pick volume opens the missions; misses, far taps, animals in front and paused taps do not', () => {
  const { SA, events } = boot();
  const b = SA.station.boardTarget();
  let hit = true, player = P(b.x, b.z - 2, 0), animalHit = false;
  const canvasL = {};
  const canvas = { addEventListener: (t, f) => { canvasL[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const THREE = { Raycaster: function () { this.setFromCamera = () => {}; this.intersectObject = () => (hit ? [{ object: { userData: { stationBoardPick: true, pick: true } } }] : []); },
    Vector2: function () { this.set = () => {}; } };
  const tap = SA.render.createStationBoardTap(THREE, { canvas, camera: {}, node: {}, getPlayer: () => player, hitsAnimal: () => animalHit });
  assert.equal(tap.tapAt(50, 50), true);
  assert.equal(SA.station.isOpen(), true);
  assert.equal(events[0][0], 'station.open');
  assert.equal(events[0][1].source, 'tap');
  SA.station.close();
  hit = false;
  assert.equal(tap.tapAt(50, 50), false, 'missed the board');
  hit = true; animalHit = true;
  assert.equal(tap.tapAt(50, 50), false, 'an animal in front wins');
  animalHit = false; player = P(b.x, b.z - 30, 0);
  assert.equal(tap.tapAt(50, 50), false, 'too far away');
  player = P(b.x, b.z - 2, 0);
  SA.picking.setPaused(true);
  assert.equal(tap.tapAt(50, 50), false, 'taps paused');
  SA.picking.setPaused(false);
  assert.equal(SA.station.isOpen(), false);
  // A real pointer sequence (down + up in place) is a tap.
  canvasL.pointerdown({ pointerId: 1, clientX: 50, clientY: 50 });
  canvasL.pointerup({ pointerId: 1, clientX: 50, clientY: 50 });
  assert.equal(SA.station.isOpen(), true);
  SA.station.close();
  canvasL.pointerdown({ pointerId: 1, clientX: 50, clientY: 50 });
  canvasL.pointermove({ pointerId: 1, clientX: 90, clientY: 90 });
  canvasL.pointerup({ pointerId: 1, clientX: 90, clientY: 90 });
  canvasL.pointerdown({ pointerId: 2, clientX: 50, clientY: 50 });
  canvasL.pointercancel({});
  canvasL.pointerup({ pointerId: 2, clientX: 50, clientY: 50 });
  assert.equal(SA.station.isOpen(), false, 'a drag or a cancelled press is not a tap');
});
