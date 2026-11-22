import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js'];

function fresh() {
  const SA = loadGame(FILES);
  SA.data.defineKind('animals', (a) => {
    if (typeof a.legs !== 'number') SA.data.fail('legs', 'must be a number');
  });
  return SA;
}

test('register/get/all work and preserve order', () => {
  const SA = fresh();
  SA.data.register('animals', [{ id: 'fox', legs: 4 }, { id: 'bird', legs: 2 }]);
  assert.equal(SA.data.get('animals', 'fox').legs, 4);
  assert.equal(SA.data.get('animals', 'nope'), null);
  // Arrays from the vm realm have a different prototype, so copy before deep-comparing.
  assert.deepEqual([...SA.data.all('animals').map((a) => a.id)], ['fox', 'bird']);
  SA.data.all('animals').pop();
  assert.equal(SA.data.all('animals').length, 2, 'all() returns a copy');
});

test('invalid item error names kind, id and field; nothing is stored', () => {
  const SA = fresh();
  assert.throws(
    () => SA.data.register('animals', [{ id: 'ok', legs: 4 }, { id: 'fox', legs: 'four' }]),
    /kind "animals", id "fox", field "legs": must be a number/
  );
  assert.equal(SA.data.all('animals').length, 0);
});

test('duplicate ids are rejected (stored and within one batch)', () => {
  const SA = fresh();
  SA.data.register('animals', [{ id: 'fox', legs: 4 }]);
  assert.throws(() => SA.data.register('animals', [{ id: 'fox', legs: 4 }]), /id "fox", field "id": duplicate id/);
  assert.throws(() => SA.data.register('animals', [{ id: 'a', legs: 1 }, { id: 'a', legs: 1 }]), /duplicate id/);
});

test('bad ids, non-objects, unknown kinds and bad arguments are rejected', () => {
  const SA = fresh();
  assert.throws(() => SA.data.register('animals', [{ legs: 4 }]), /field "id": must be a non-empty string/);
  assert.throws(() => SA.data.register('animals', [null]), /item must be an object/);
  assert.throws(() => SA.data.register('animals', {}), /must be an array/);
  assert.throws(() => SA.data.register('birds', []), /unknown kind "birds"/);
  assert.throws(() => SA.data.get('birds', 'x'), /unknown kind/);
  assert.throws(() => SA.data.defineKind('', () => {}), /non-empty string/);
  assert.throws(() => SA.data.defineKind('x'), /validate function/);
  assert.throws(() => SA.data.defineKind('animals', () => {}), /already defined/);
});

test('validators that throw plain errors are still wrapped with kind and id', () => {
  const SA = loadGame(FILES);
  SA.data.defineKind('parts', () => { throw new Error('boom'); });
  assert.throws(() => SA.data.register('parts', [{ id: 'cola' }]), /kind "parts", id "cola", field "\?": boom/);
});

test('sa.js bootstraps the namespace', () => {
  const SA = loadGame(FILES);
  assert.equal(typeof SA.version, 'string');
  assert.equal(typeof SA.data.register, 'function');
});
