import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/map.js', 'game/animal-plan.js', 'game/wander.js', 'game/gait.js', 'game/render/ambient.js'];

test('gait.kind picks the limb motion from traits.movement', () => {
  const SA = loadGame(FILES);
  assert.equal(SA.gait.kind('vuela'), 'flap');
  assert.equal(SA.gait.kind('repta'), 'none');
  for (const m of ['corre', 'salta', 'nada', 'trepa', 'camina lento']) assert.equal(SA.gait.kind(m), 'swing');
});

test('gait.ease ramps toward 1 or 0 and never overshoots', () => {
  const SA = loadGame(FILES);
  let amp = 0;
  for (let i = 0; i < 100; i++) { amp = SA.gait.ease(amp, true, 0.02); assert.ok(amp >= 0 && amp <= 1); }
  assert.equal(amp, 1);
  for (let i = 0; i < 100; i++) amp = SA.gait.ease(amp, false, 0.02);
  assert.equal(amp, 0);
  assert.equal(SA.gait.ease(0.5, true, 0), 0.5);
});

test('flap mirrors the wings, flutters while hovering and beats wider while moving', () => {
  const SA = loadGame(FILES);
  const peak = (amp, side) => {
    let m = 0;
    for (let t = 0; t < 3; t += 0.01) m = Math.max(m, Math.abs(SA.gait.flap(t, amp, side, 0)));
    return m;
  };
  assert.ok(peak(0, 'left') > 0.1, 'hover flutter');
  assert.ok(peak(1, 'left') > peak(0, 'left') * 1.5, 'moving flaps wider');
  assert.ok(Math.abs(SA.gait.flap(0.3, 1, 'left', 0) + SA.gait.flap(0.3, 1, 'right', 0)) < 1e-12);
});

test('swing is zero at rest, alternates diagonal legs and the pivot keeps the leg top fixed', () => {
  const SA = loadGame(FILES);
  assert.equal(Math.abs(SA.gait.swing(1.234, 0, 'left', 0, 0)), 0);
  const t = 0.1;
  assert.ok(Math.abs(SA.gait.swing(t, 1, 'left', 0, 0) + SA.gait.swing(t, 1, 'right', 0, 0)) < 1e-12);
  assert.equal(SA.gait.swing(t, 1, 'left', 0, 0), SA.gait.swing(t, 1, 'right', 1, 0));
  assert.equal(Math.abs(SA.gait.pivot(1, 0).y) + Math.abs(SA.gait.pivot(1, 0).z), 0);
  const a = 0.4, h = 1, s = SA.gait.pivot(h, a);
  assert.ok(Math.abs((s.y - (h / 2) * (1 - Math.cos(a)))) < 1e-9);
  assert.ok(Math.abs(s.z + (h / 2) * Math.sin(a)) < 1e-9);
});

// ---- renderer glue with plain objects ----

function rig(SA, animalId, parts) {
  const spots = SA.animalPlan.placements(SA.data.all('animals'), {});
  const mesh = (part, extra = {}, pick = false) => ({
    userData: { animalId, part, ...extra, ...(pick ? { pick: true } : {}) },
    rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0.4, z: 0.1 }, scale: { x: 1, y: 0.8, z: 1 },
  });
  const children = SA.data.all('animals').map((a) => {
    const s = spots[a.id];
    const kids = a.id === animalId ? parts.flatMap(([part, extra]) => [mesh(part, extra), mesh(part, extra, true)]) : [];
    return {
      name: a.id, userData: { animalId: a.id }, position: { x: s.x, y: s.y, z: s.z }, rotation: { y: 0 },
      scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, children: kids,
    };
  });
  return { children };
}

test('flyers flap alas (moving or hovering) and walkers swing patas then rest when held', () => {
  const SA = loadGame(FILES);
  SA.picking = { onPick() {} };
  const group = rig(SA, 'tucan', [['alas', { side: 'left', index: 0 }], ['alas', { side: 'right', index: 1 }]]);
  const amb = SA.render.createAmbient({ animals: group, avoid: [] });
  const tucan = group.children.find((g) => g.name === 'tucan');
  const [wl, , wr, wpick] = tucan.children;
  let min = 0, max = 0, mirrored = true;
  for (let i = 0; i < 300; i++) {
    amb.update(1 / 30);
    min = Math.min(min, wl.rotation.z); max = Math.max(max, wl.rotation.z);
    if (Math.abs(wl.rotation.z + wr.rotation.z) > 1e-9) mirrored = false;
  }
  assert.ok(max - min > 0.3, 'wings flap');
  assert.ok(mirrored, 'wings are mirrored');
  assert.equal(wpick.rotation.z, 0, 'pick volumes never move');
  assert.deepEqual(wl.userData, { animalId: 'tucan', part: 'alas', side: 'left', index: 0 }, 'userData unchanged');

  const g2 = rig(SA, 'conejo', [['patas', { side: 'left', index: 0 }], ['patas', { side: 'right', index: 1 }]]);
  const amb2 = SA.render.createAmbient({ animals: g2, avoid: [] });
  const conejo = g2.children.find((g) => g.name === 'conejo');
  const leg = conejo.children[0], pick = conejo.children[1];
  let swung = 0;
  for (let i = 0; i < 900; i++) { amb2.update(1 / 30); swung = Math.max(swung, Math.abs(leg.rotation.x)); }
  assert.ok(swung > 0.2, 'legs swing while wandering');
  assert.equal(pick.rotation.x, 0);
  assert.equal(pick.position.y, 0.4);
  amb2.hold('conejo');
  for (let i = 0; i < 90; i++) amb2.update(1 / 30);          // let any hop land and the legs settle
  assert.equal(Math.abs(leg.rotation.x), 0, 'legs return to rest when stopped');
  assert.equal(leg.position.y, 0.4);
  assert.equal(leg.position.z, 0.1);
});
