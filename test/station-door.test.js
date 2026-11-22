import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/camera.js', 'game/station.js', 'game/station-door.js',
  'game/player.js', 'game/perch.js', 'game/climb.js', 'game/space-target.js', 'game/space-use.js', 'game/picking.js',
  'game/render/station-door-tap.js', 'game/ui/station-menu-view.js'];

function boot() {
  const events = [];
  const SA = loadGame(FILES.concat((sa) => { sa.pickups = { SPACE_RADIUS: 2.4 }; }), { SAT: { track: (t, f) => events.push([t, f]) } });
  return { SA, events };
}
const P = (x, z, heading = 0, extra = {}) => ({ x, z, heading, ...extra });   // heading 0 faces +z

test('the door target is the doorway centre, one stable object with a reach', () => {
  const { SA } = boot();
  const L = SA.station.layout(), d = SA.station.doorTarget();
  assert.equal(d.id, 'station-door');
  assert.equal(d.kind, 'door');
  assert.equal(d.x, L.door.x);
  assert.equal(d.z, L.door.z);
  assert.ok(d.y > L.floorY && d.y < L.floorY + L.door.height + 1e-9);
  assert.equal(SA.station.doorTarget(), d);
  assert.equal(SA.station.doorTargets().length, 1);
  assert.equal(SA.station.doorTargets()[0], d);
  assert.equal(SA.station.doorTargets(), SA.station.doorTargets(), 'a stable list: nothing allocated per frame');
});

test('the spawn is at the door: facing out, the door is not yet a target but a few steps back it is', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget(), sp = SA.station.spawn(), c = SA.spaceTarget.create();
  // The kid spawns SPAWN_GAP outside the wall, facing away from it: nothing to use yet.
  assert.equal(c.choose({ player: sp, doors: [d] }), null);
  // Standing in front of the doorway, facing it, the door is the target.
  const t = c.choose({ player: P(d.x, d.z - 1.5, 0), doors: [d] });
  assert.deepEqual([t.kind, t.ref], ['door', d]);
});

test('door selection by proximity: in reach yes, just beyond no (any direction)', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget(), c = SA.spaceTarget.create(), R = SA.station.DOOR_REACH;
  assert.equal(c.choose({ player: P(d.x, d.z - (R - 0.1), 0), doors: [d] }).kind, 'door');
  c.reset();
  assert.equal(c.choose({ player: P(d.x, d.z - (R + 0.1), 0), doors: [d] }), null);
  c.reset();
  assert.equal(c.choose({ player: P(d.x + (R - 0.1), d.z, -Math.PI / 2), doors: [d] }).kind, 'door', 'from the side too');
  c.reset();
  assert.equal(c.choose({ player: P(NaN, 0), doors: [d] }), null);
  assert.equal(c.choose({ player: P(0, 0), doors: [null, { x: NaN, z: 0 }] }), null);
  assert.equal(c.choose({ player: P(d.x, d.z - 1, 0), doors: [{ x: d.x, z: d.z, reach: 0.5 }] }), null, 'a door can carry its own reach');
});

test('the aim part still beats the door', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget(), part = { part: 'cola' };
  const t = SA.spaceTarget.create().choose({ player: P(d.x, d.z - 1, 0), part, doors: [d] });
  assert.deepEqual([t.kind, t.ref], ['part', part]);
});

test('hands off against the station roof climb and a nearby find, by proximity and facing', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget(), roof = SA.station.climbTarget(), L = SA.station.layout(), c = SA.spaceTarget.create();
  // Right in front of the door: the door wins over the climbable building it is part of.
  assert.equal(c.choose({ player: P(d.x, d.z - 1.2, 0), trees: [roof], doors: [d] }).kind, 'door');
  // Down the wall, out of the door's reach but still at the wall: the building (climb) is the target.
  c.reset();
  const sx = L.cx + L.halfW - 0.5, sz = d.z - 1.5;
  const t = c.choose({ player: P(sx, sz, 0), trees: [roof], doors: [d] });
  assert.equal(t.kind, 'tree');
  assert.equal(t.ref, roof);
  // A find right at the player's feet beats a door that is farther away; turn to the door and walk up and it takes over.
  c.reset();
  const find = { x: d.x + 0.4, z: d.z - 2.2, id: 'f' };
  assert.equal(c.choose({ player: P(d.x + 0.4, d.z - 2.1, Math.PI), pickups: [find], doors: [d] }).kind, 'pickup');
  c.reset();
  assert.equal(c.choose({ player: P(d.x, d.z - 0.8, 0), pickups: [find], doors: [d] }).kind, 'door');
});

test('hysteresis: a door that is the target stays it against a similar rival (no flicker)', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget(), c = SA.spaceTarget.create();
  const first = c.choose({ player: P(d.x, d.z - 1.8, 0), doors: [d] });
  assert.equal(first.kind, 'door');
  const rival = { x: d.x + 0.5, z: d.z - 0.4, id: 'r' };   // a little closer to the player than the door, but not clearly
  const p = P(d.x, d.z - 1.8, 0);
  assert.equal(SA.spaceTarget.create().choose({ player: p, pickups: [rival], doors: [d] }).kind, 'pickup', 'on its own the rival would win');
  assert.equal(c.choose({ player: p, pickups: [rival], doors: [d] }).kind, 'door');
});

test('tap reach: generous, bad players refused', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget();
  assert.ok(SA.station.canTapDoor(P(d.x, d.z - 4)));
  assert.equal(SA.station.canTapDoor(P(d.x, d.z - SA.station.TAP_REACH - 1)), false);
  assert.equal(SA.station.canTapDoor(null), false);
  assert.equal(SA.station.canTapDoor({ x: NaN, z: 0 }), false);
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
  assert.equal(S.toggle('use'), true);
  assert.equal(S.toggle('use'), false);
  assert.equal(log.join(), 'open:tap,close,open:use,close');
  assert.equal(events.length, 2);
  offOpen();
  S.open();
  assert.equal(log.length, 4, 'unsubscribed');
  assert.equal(events[2][1].source, 'api');
  assert.equal(S.onOpen('nope')(), undefined, 'a non-function listener is ignored');
});

test('E and Enter on the outlined door open the menu; Space does not; away from the door nothing happens', () => {
  const { SA } = boot();
  let player = P(0, 0), keydown = null;
  const root = { addEventListener: (t, f) => { if (t === 'keydown') keydown = f; } };
  const use = SA.spaceUse.create({ getPlayer: () => player, trees: () => [], doors: SA.station.doorTargets, root,
    openDoor: () => { SA.station.toggle('use'); return true; } });
  const d = SA.station.doorTarget();
  const key = (k, extra = {}) => { let prevented = false; keydown({ key: k, preventDefault: () => { prevented = true; }, ...extra }); return prevented; };
  assert.equal(use.update(), null);
  assert.equal(key('e'), false, 'no target: the key is left alone');
  assert.equal(SA.station.isOpen(), false);
  player = P(d.x, d.z - 1.5, 0);
  assert.equal(use.update().kind, 'door');
  assert.equal(key(' ', { code: 'Space' }), false);
  assert.equal(SA.station.isOpen(), false, 'Space is the jump key');
  assert.equal(key('e'), true);
  assert.equal(SA.station.isOpen(), true);
  assert.equal(key('Enter', { repeat: true }), true, 'a held key is swallowed but does not toggle again');
  assert.equal(SA.station.isOpen(), true);
  assert.equal(key('Enter'), true);
  assert.equal(SA.station.isOpen(), false, 'E / Enter again closes it');
  assert.equal(use.use(), true);
  assert.equal(SA.station.isOpen(), true);
});

test('spaceUse without an openDoor handler does nothing on a door target', () => {
  const { SA } = boot();
  const d = SA.station.doorTarget();
  const use = SA.spaceUse.create({ getPlayer: () => P(d.x, d.z - 1, 0), doors: SA.station.doorTargets, root: {} });
  assert.equal(use.use(), false);
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

  SA.station.open('use');
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

test('tapping the door pick volume opens the menu; misses, far taps, animals in front and paused taps do not', () => {
  const { SA, events } = boot();
  const d = SA.station.doorTarget(), L = {};
  let hit = true, player = P(d.x, d.z - 2, 0), animalHit = false;
  const canvasL = {};
  const canvas = { addEventListener: (t, f) => { canvasL[t] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const THREE = { Raycaster: function () { this.setFromCamera = () => {}; this.intersectObject = () => (hit ? [{ object: { userData: { stationDoor: true, pick: true } } }] : []); },
    Vector2: function () { this.set = () => {}; } };
  const tap = SA.render.createStationDoorTap(THREE, { canvas, camera: {}, node: {}, getPlayer: () => player, hitsAnimal: () => animalHit });
  assert.equal(tap.tapAt(50, 50), true);
  assert.equal(SA.station.isOpen(), true);
  assert.equal(events[0][0], 'station.open');
  assert.equal(events[0][1].source, 'tap');
  SA.station.close();
  hit = false;
  assert.equal(tap.tapAt(50, 50), false, 'missed the door');
  hit = true; animalHit = true;
  assert.equal(tap.tapAt(50, 50), false, 'an animal in front wins');
  animalHit = false; player = P(d.x, d.z - 30, 0);
  assert.equal(tap.tapAt(50, 50), false, 'too far away');
  player = P(d.x, d.z - 2, 0);
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
