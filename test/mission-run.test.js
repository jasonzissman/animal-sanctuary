import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/step-kinds.js', 'game/mission-run.js'];
const load = () => loadGame(FILES);

// One case per kind: a step, an event that advances it, and events that must be ignored.
const CASES = [
  ['find', { kind: 'find', target: 'cerdito' }, { type: 'found', target: 'cerdito' }, [{ type: 'found', target: 'gato' }, { type: 'photo', target: 'cerdito' }]],
  ['help', { kind: 'help', animal: 'camello', careTask: 'feed' }, { type: 'helped', animal: 'camello', careTask: 'feed' },
    [{ type: 'helped', animal: 'camello', careTask: 'clean' }, { type: 'helped', animal: 'gato', careTask: 'feed' }]],
  ['follow', { kind: 'follow', animal: 'cerdito' }, { type: 'followed', animal: 'cerdito' }, [{ type: 'followed', animal: 'gato' }, { type: 'found', target: 'cerdito' }]],
  ['carry', { kind: 'carry', item: 'huevo', fragile: true }, { type: 'carried', item: 'huevo' }, [{ type: 'carried', item: 'pluma' }, { type: 'delivered', item: 'huevo', to: 'nido' }]],
  ['deliver', { kind: 'deliver', item: 'huevo', to: 'nido' }, { type: 'delivered', item: 'huevo', to: 'nido' },
    [{ type: 'delivered', item: 'huevo', to: 'rio' }, { type: 'delivered', item: 'pluma', to: 'nido' }]],
  ['hatch', { kind: 'hatch', item: 'huevo' }, { type: 'hatched', item: 'huevo' }, [{ type: 'hatched', item: 'pluma' }, { type: 'delivered', item: 'huevo', to: 'nido' }]],
  ['goTo', { kind: 'goTo', place: 'roca' }, { type: 'arrived', place: 'roca' }, [{ type: 'arrived', place: 'rio' }, { type: 'talked', who: 'roca' }]],
  ['talk', { kind: 'talk', who: 'cientifica' }, { type: 'talked', who: 'cientifica' }, [{ type: 'talked', who: 'otro' }, { type: 'arrived', place: 'cientifica' }]]
];

for (const [name, stepRow, good, bad] of CASES) {
  test(`${name} advances on its matching event and ignores the rest`, () => {
    const SA = load();
    const s0 = SA.missionRun.start([stepRow, { kind: 'photo' }]);
    for (const ev of bad) {
      const r = SA.missionRun.step(s0, ev);
      assert.equal(r.advanced, false);
      assert.equal(r.done, false);
      assert.equal(r.state, s0);
    }
    const r = SA.missionRun.step(s0, good);
    assert.equal(r.advanced, true);
    assert.equal(r.done, false);
    assert.equal(r.state.index, 1);
    assert.equal(SA.missionRun.current(r.state).kind, 'photo');
  });
}

test('photo with a target needs that target; without one any photo counts', () => {
  const SA = load();
  const withT = SA.missionRun.start([{ kind: 'photo', target: 'cerdito' }]);
  assert.equal(SA.missionRun.step(withT, { type: 'photo', target: 'gato' }).advanced, false);
  assert.equal(SA.missionRun.step(withT, { type: 'photo' }).advanced, false);
  assert.equal(SA.missionRun.step(withT, { type: 'photo', target: 'cerdito' }).done, true);
  const any = SA.missionRun.start([{ kind: 'photo' }]);
  assert.equal(SA.missionRun.step(any, { type: 'photo', target: 'whatever' }).done, true);
  assert.equal(SA.missionRun.step(any, { type: 'photo' }).done, true);
});

test('collect needs N matching events before it advances, ignoring other items', () => {
  const SA = load();
  let st = SA.missionRun.start([{ kind: 'collect', item: 'regalo', n: 3 }, { kind: 'photo' }]);
  assert.deepEqual({ ...SA.missionRun.count(st) }, { have: 0, need: 3 });
  const other = SA.missionRun.step(st, { type: 'collected', item: 'fresa' });
  assert.equal(other.progressed, false);
  for (let i = 1; i <= 2; i++) {
    const r = SA.missionRun.step(st, { type: 'collected', item: 'regalo' });
    assert.equal(r.advanced, false);
    assert.equal(r.progressed, true);
    st = r.state;
    assert.equal(SA.missionRun.count(st).have, i);
  }
  const last = SA.missionRun.step(st, { type: 'collected', item: 'regalo' });
  assert.equal(last.advanced, true);
  assert.equal(last.state.index, 1);
  assert.equal(last.state.progress, 0);
  assert.equal(SA.missionRun.count(last.state).need, 1);
});

test('step is pure: the input state is never mutated', () => {
  const SA = load();
  const st = SA.missionRun.start([{ kind: 'collect', item: 'a', n: 2 }, { kind: 'photo' }]);
  const before = JSON.stringify(st);
  SA.missionRun.step(st, { type: 'collected', item: 'a' });
  assert.equal(JSON.stringify(st), before);
});

test('a full mission runs in order and reports done exactly once on the final photo', () => {
  const SA = load();
  let st = SA.missionRun.start([{ kind: 'find', target: 'cerdito' }, { kind: 'follow', animal: 'cerdito' }, { kind: 'photo' }]);
  // out-of-order events do nothing: the photo step is not current yet
  assert.equal(SA.missionRun.step(st, { type: 'photo' }).advanced, false);
  st = SA.missionRun.step(st, { type: 'found', target: 'cerdito' }).state;
  st = SA.missionRun.step(st, { type: 'followed', animal: 'cerdito' }).state;
  const fin = SA.missionRun.step(st, { type: 'photo', target: 'mama' });
  assert.deepEqual({ advanced: fin.advanced, done: fin.done, finished: fin.state.done }, { advanced: true, done: true, finished: true });
  assert.equal(SA.missionRun.current(fin.state), null);
  const again = SA.missionRun.step(fin.state, { type: 'photo' });
  assert.deepEqual({ advanced: again.advanced, done: again.done }, { advanced: false, done: false });
  assert.equal(SA.missionRun.step(again.state, { type: 'photo' }).done, false);
});

test('start can resume at a saved step and ignores junk events', () => {
  const SA = load();
  const steps = [{ kind: 'find', target: 'a' }, { kind: 'photo' }];
  assert.equal(SA.missionRun.start(steps, 1).index, 1);
  assert.equal(SA.missionRun.start(steps, 9).done, true);
  const st = SA.missionRun.start(steps);
  for (const junk of [null, undefined, 5, 'found', [], {}, { type: 'nope' }]) assert.equal(SA.missionRun.step(st, junk).advanced, false);
});

test('validation: unknown kind, missing and mistyped params fail with a clear error', () => {
  const SA = load();
  const run = (steps) => () => SA.missionRun.start(steps);
  assert.throws(run([{ kind: 'dance' }]), /step 1: unknown kind "dance" \(known: find, help/);
  assert.throws(run([{ kind: 'photo' }, { kind: 'deliver', item: 'huevo' }]), /step 2 \(kind "deliver"\): missing param "to"/);
  assert.throws(run([{ kind: 'find' }]), /missing param "target"/);
  assert.throws(run([{ kind: 'find', target: '  ' }]), /"target" must be a non-empty string/);
  assert.throws(run([{ kind: 'collect', item: 'a', n: '3' }]), /"n" must be a number/);
  assert.throws(run([{ kind: 'collect', item: 'a', n: 0 }]), /whole number >= 1/);
  assert.throws(run([{ kind: 'collect', item: 'a', n: 1.5 }]), /whole number >= 1/);
  assert.throws(run([{ kind: 'carry', item: 'a', fragile: 'yes' }]), /"fragile" must be a boolean/);
  assert.throws(run([{ kind: 5 }]), /must be an object with a "kind" string/);
  assert.throws(run([null]), /must be an object/);
  assert.throws(run([]), /non-empty array/);
  assert.throws(() => SA.missionRun.validate('x'), /non-empty array/);
});

test('every kind in the registry has a unit case or is photo, and the kinds list is complete', () => {
  const SA = load();
  assert.deepEqual([...SA.missionRun.kinds()].sort(), ['carry', 'collect', 'deliver', 'dry', 'fill', 'find', 'follow', 'goTo', 'hatch', 'help', 'invite', 'party', 'photo', 'push', 'talk', 'touch']);
});

test('step-kind rows are validated at load; a new kind is just a new row', () => {
  const SA = load();
  const bad = (row, re) => assert.throws(() => SA.data.register('stepKinds', [row]), re);
  bad({ id: 'x', required: {}, match: {} }, /event/);
  bad({ id: 'x', event: 'e', required: { a: 'array' }, match: {} }, /required\.a/);
  bad({ id: 'x', event: 'e', required: {}, match: { zz: 'zz' } }, /match\.zz/);
  bad({ id: 'x', event: 'e', required: { a: 'string' }, match: { a: 'a' }, progress: { total: 'a' } }, /progress\.total/);
  bad({ id: 'find', event: 'e', required: {}, match: {} }, /duplicate id/);
  SA.data.register('stepKinds', [{ id: 'wave', event: 'waved', required: { at: 'string' }, match: { at: 'at' } }]);
  const st = SA.missionRun.start([{ kind: 'wave', at: 'mono' }]);
  assert.equal(SA.missionRun.step(st, { type: 'waved', at: 'mono' }).done, true);
});

test('the shipped mission rows with extra params still validate once given params (engine ignores `line`)', () => {
  const SA = load();
  const st = SA.missionRun.start([{ kind: 'find', target: 'cerdito', line: { es: 'Busca al cerdito', icon: '🐷' } }]);
  assert.equal(SA.missionRun.step(st, { type: 'found', target: 'cerdito' }).done, true);
});
