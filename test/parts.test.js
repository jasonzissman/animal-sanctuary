import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js'];
const good = () => ({
  id: 'orejitas', key: 'orejitas', label: { es: 'las orejitas', en: 'little ears' }, gender: 'f', number: 'pl',
  builder: 'cone', anchor: 'top', reaction: 'wiggle',
});

test('at least 12 parts are registered, including the required keys', () => {
  const SA = loadGame(FILES);
  const keys = SA.data.all('parts').map((p) => p.key);
  assert.ok(keys.length >= 12);
  for (const k of ['orejas', 'cola', 'patas', 'alas', 'pico', 'caparazon', 'ojos', 'hocico', 'cabeza', 'cuerpo', 'cuernos', 'aletas']) {
    assert.ok(keys.includes(k), k);
  }
});

test('Spanish labels have correct articles, accents, gender and number', () => {
  const SA = loadGame(FILES);
  const labels = {};
  for (const p of SA.data.all('parts')) labels[p.key] = p.label.es;
  assert.deepEqual(labels, {
    cabeza: 'la cabeza', cuerpo: 'el cuerpo', orejas: 'las orejas', ojos: 'los ojos', hocico: 'el hocico',
    pico: 'el pico', cola: 'la cola', patas: 'las patas', alas: 'las alas', caparazon: 'el caparazón',
    cuernos: 'los cuernos', aletas: 'las aletas', plumas: 'las plumas', nariz: 'la nariz',
    joroba: 'la joroba', mejillas: 'las mejillas',
  });
  const p = (k) => SA.data.get('parts', k);
  assert.equal(p('caparazon').gender, 'm');
  assert.equal(p('cola').gender, 'f');
  assert.equal(p('orejas').number, 'pl');
  assert.equal(p('pico').number, 'sg');
});

test('every registered part uses allowed builder/anchor/reaction', () => {
  const SA = loadGame(FILES);
  for (const p of SA.data.all('parts')) {
    assert.ok(SA.parts.BUILDERS.includes(p.builder), p.key);
    assert.ok(SA.parts.ANCHORS.includes(p.anchor), p.key);
    assert.ok(SA.parts.REACTIONS.includes(p.reaction), p.key);
  }
});

test('validator accepts a good part and rejects bad ones naming the field', () => {
  const SA = loadGame(FILES);
  const cases = [
    [(p) => { delete p.label.es; }, /field "label.es"/],
    [(p) => { p.label = undefined; }, /field "label"/],
    [(p) => { p.label.en = ''; }, /field "label.en"/],
    [(p) => { p.gender = 'x'; }, /field "gender"/],
    [(p) => { p.number = 'many'; }, /field "number"/],
    [(p) => { p.builder = 'torus'; }, /field "builder"/],
    [(p) => { p.anchor = 'nowhere'; }, /field "anchor"/],
    [(p) => { p.reaction = 'explode'; }, /field "reaction"/],
    [(p) => { p.key = 'orejás'; p.id = 'orejás'; }, /field "key"/],
    [(p) => { p.key = 'cola'; }, /field "key"/],
    [(p) => { p.label.es = 'la orejitas'; }, /field "label.es".*"las"/],
  ];
  for (const [mutate, re] of cases) {
    const p = good();
    mutate(p);
    assert.throws(() => SA.data.register('parts', [p]), re);
  }
  SA.data.register('parts', [good()]);
  assert.equal(SA.data.get('parts', 'orejitas').label.es, 'las orejitas');
});

test('index.html loads parts.js after the registry', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('game/data-registry.js') < html.indexOf('game/data/parts.js'));
});
