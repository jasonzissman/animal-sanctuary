import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/map.js', 'game/camera.js', 'game/station.js', 'game/hint-pointer.js',
  'game/proofs.js', 'game/ui/envelope-fly.js'];

function fakeEl() {
  return { style: {}, children: [], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
function fakeDoc() { return { createElement: fakeEl, body: fakeEl() }; }

function setup(extra = {}) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const sfx = [];
  const audio = { sfx: (n) => { sfx.push(n); return true; } };
  const doc = fakeDoc();
  const L = SA.station.layout();
  // The camera looks at the station from the front, so the icon projects inside the view.
  const rig = { getState: () => ({ x: L.cx, z: L.cz, dist: 14, yaw: 0, pitch: 0.5, lookY: 1 }) };
  const proofs = SA.proofs.create({ track: () => {} });
  const fx = SA.envelopeFly.create({ doc, rig, audio, proofs, viewport: () => ({ width: 1000, height: 600 }), ...extra });
  return { SA, fx, proofs, sfx, doc };
}

test('frame: the envelope eases from the start to the target, lands and hides; the chip pops then fades; done after the linger', () => {
  const { SA } = setup();
  const from = { x: 500, y: 300 }, to = { x: 100, y: 80 };
  const f0 = SA.envelopeFly.frame(0, from, to);
  assert.equal(f0.env.x, 500); assert.equal(f0.env.y, 300); assert.equal(f0.done, false);
  const mid = SA.envelopeFly.frame(SA.envelopeFly.FLY_S / 2, from, to);
  assert.ok(mid.env.x < 500 && mid.env.x > 100);
  assert.ok(mid.env.y < 190, 'it arcs above the straight line');
  const land = SA.envelopeFly.frame(SA.envelopeFly.FLY_S, from, to);
  assert.equal(Math.round(land.env.x), 100); assert.equal(land.env.opacity, 0);
  assert.ok(land.chip.opacity > 0.9);
  const pop = SA.envelopeFly.frame(SA.envelopeFly.FLY_S + 0.125, from, to);
  assert.ok(pop.chip.scale > 1.2, 'the chip pops as the envelope lands');
  const end = SA.envelopeFly.frame(SA.envelopeFly.FLY_S + SA.envelopeFly.LINGER_S, from, to);
  assert.equal(end.done, true); assert.equal(end.chip.opacity, 0);
  assert.equal(SA.envelopeFly.frame(NaN, from, to).env.x, 500, 'junk time is the start');
});

test('a newly recorded proof starts one flight with the whoosh; a repeated key does not', () => {
  const { fx, proofs, sfx } = setup();
  assert.equal(fx.isFlying(), false);
  proofs.record({ kind: 'rescue', animalId: 'conejo', key: 'r1' });
  assert.equal(fx.isFlying(), true);
  assert.deepEqual(sfx, ['whoosh']);
  proofs.record({ kind: 'rescue', animalId: 'conejo', key: 'r1' });   // ignored duplicate
  proofs.record({ kind: 'bogus' });                                    // rejected junk
  assert.deepEqual(sfx, ['whoosh']);
  proofs.record({ kind: 'mission', missionId: 'm1' });
  assert.deepEqual(sfx, ['whoosh', 'whoosh'], 'a mission proof flies too');
});

test('update moves the envelope and the station chip, never blocks (click-through) and ends by itself', () => {
  const { SA, fx, proofs } = setup();
  assert.equal(fx.update(0.016), false, 'idle frames do nothing');
  proofs.record({ kind: 'rescue', animalId: 'conejo' });
  assert.equal(fx.update(0.1), true);
  assert.equal(fx.element.style.display, 'block');
  assert.match(fx.element.style.transform, /translate\(/);
  assert.match(fx.element.style.cssText, /pointer-events:none/);
  assert.match(fx.chip.style.cssText, /pointer-events:none/);
  assert.equal(fx.element.attrs['aria-hidden'], 'true');
  let guard = 0;
  while (fx.update(0.1) && guard++ < 100);
  assert.equal(fx.isFlying(), false);
  assert.equal(fx.element.style.display, 'none');
  assert.equal(fx.chip.style.display, 'none');
  assert.ok(guard * 0.1 < SA.envelopeFly.FLY_S + SA.envelopeFly.LINGER_S + 0.3);
});

test('a second proof mid-flight restarts the flight; the proof is saved and the next mission is not delayed (record returns at once)', () => {
  const { fx, proofs } = setup();
  proofs.record({ kind: 'rescue', animalId: 'conejo' });
  fx.update(0.5);
  const r = proofs.record({ kind: 'rescue', animalId: 'zorro' });
  assert.equal(r.added, true);
  assert.equal(proofs.pending().length, 2);
  assert.equal(fx.update(0.01), true);
});

test('a throwing listener never breaks recording; without a DOM or a projectable station nothing happens', () => {
  const { SA, proofs } = setup();
  proofs.onSent(() => { throw new Error('boom'); });
  assert.equal(proofs.record({ kind: 'rescue', animalId: 'conejo' }).added, true);
  const none = SA.envelopeFly.create({});
  assert.equal(none.fly(), false); assert.equal(none.update(0.1), false); assert.equal(none.isFlying(), false);
  const nosta = setup({ rig: null });
  nosta.proofs.record({ kind: 'rescue', animalId: 'conejo' });
  assert.equal(nosta.fx.update(0.1), false, 'no station spot: it hides instead of throwing');
  assert.equal(nosta.fx.isFlying(), false);
});

test('whoosh is a real SA.audio effect that stays silent when muted', () => {
  const SA = loadGame(['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/audio.js']);
  SA.save.reset();
  assert.ok(SA.audio.NAMES.includes('whoosh'));
  assert.equal(SA.audio.sfx('whoosh'), false, 'locked until a user gesture, never throws');
  SA.audio.setMuted(true);
  assert.equal(SA.audio.sfx('whoosh'), false);
});
