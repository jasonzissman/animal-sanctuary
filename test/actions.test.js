import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/foods.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/audio.js', 'game/picking.js',
  'game/data/items.js', 'game/inventory.js', 'game/data/actions.js', 'game/data/care.js', 'game/care.js', 'game/ui/care-flow.js'];

function setup(kind) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const care = SA.care.create({ rng: SA.clues.makeRng(4), level: 1, track: (type, f) => events.push({ type, ...f }) });
  const calls = [];
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const view = { showCare: rec('showCare'), celebrate: rec('celebrate'), confetti: rec('confetti'), toast: rec('toast'),
    showFeed: rec('showFeed'), updateFeed: rec('updateFeed'), hideFeed: rec('hideFeed'), bounceFood: rec('bounceFood') };
  const timers = [];
  const flow = SA.careFlow.create({ care, view, fx: { show() {}, scrub: rec('scrub'), hide() {} }, audio: { say: rec('say'), sfx: rec('sfx') },
    later: (fn, ms) => timers.push([fn, ms]), react: rec('react') });
  const only = { ...care, maybeStart: (id) => care.maybeStart(id, true, kind) };
  const forced = SA.careFlow.create({ care: only, view, fx: { show() {}, scrub: rec('scrub'), hide() {} }, audio: { say: rec('say'), sfx: rec('sfx') },
    later: (fn, ms) => timers.push([fn, ms]), react: rec('react') });
  return { SA, care, flow: kind ? forced : flow, calls, timers, events };
}

test('the action table is validated: items, parts, verbs, reactions and sounds', () => {
  const { SA } = setup();
  const ids = SA.data.all('actions').map((a) => a.id);
  assert.deepEqual([...ids], ['cepillar', 'lavar', 'curar', 'acariciar', 'desenredar', 'alimentar']);
  const tools = Object.fromEntries(SA.data.all('actions').map((a) => [a.id, a.item]));
  assert.deepEqual({ ...tools }, { cepillar: 'cepillo', lavar: 'esponja', curar: 'venda', acariciar: 'hands', desenredar: 'hands', alimentar: 'food' });
  for (const a of SA.data.all('actions')) assert.ok(a.item === 'hands' || a.item === 'food' || SA.data.get('items', a.item), a.id);
  const base = SA.data.get('actions', 'lavar');
  const bad = (patch, re) => assert.throws(() => SA.data.register('actions', [{ ...base, id: 'prueba', ...patch }]), re);
  bad({ item: 'martillo' }, /unknown item/);
  bad({ parts: ['nope'] }, /unknown part/);
  bad({ parts: [] }, /at least one part/);
  bad({ verb: { es: 'lava', imperative: 'Lava' } }, /infinitive/);
  bad({ verb: { es: 'lavar', imperative: 'lava' } }, /imperative/);
  bad({ reaction: 'explode' }, /reaction/);
  bad({ sfx: 'kaboom' }, /sfx/);
  bad({ id: 'Bad' }, /lowercase/);
});

test('el pelo and la barriga exist as parts with Spanish names, and mammals have them', () => {
  const { SA } = setup();
  assert.equal(SA.data.get('parts', 'pelo').label.es, 'el pelo');
  assert.equal(SA.data.get('parts', 'barriga').label.es, 'la barriga');
  for (const id of ['conejo', 'mono', 'camello', 'cabra']) {
    const keys = SA.data.get('animals', id).parts.map((p) => p.part);
    assert.ok(keys.includes('pelo') && keys.includes('barriga'), id);
  }
  assert.ok(SA.vocab.get('part:pelo') && SA.vocab.get('part:barriga'));
});

test('SA.actions.fits: tools match their item, hands match nothing held, food matches any food item', () => {
  const { SA } = setup();
  assert.equal(SA.actions.fits(SA.data.get('actions', 'cepillar'), 'cepillo'), true);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'cepillar'), 'esponja'), false);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'cepillar'), null), false);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'acariciar'), null), true);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'acariciar'), 'cepillo'), false);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'alimentar'), 'platano'), true);
  assert.equal(SA.actions.fits(SA.data.get('actions', 'alimentar'), 'roca'), false);
});

test('every task states its action; animals only get tasks they can do', () => {
  const { SA, care } = setup();
  for (const a of SA.data.all('animals').filter((x) => !x.easterEgg)) {
    for (let i = 0; i < 20; i++) {
      const t = care.maybeStart(a.id, true);
      assert.ok(t, a.id);
      assert.equal(t.action, SA.data.get('careTasks', t.taskId).action);
      assert.ok(t.item && t.sfx && t.reaction);
      if (t.part) assert.ok(a.parts.some((p) => p.part === t.part), a.id + ' has ' + t.part);
    }
  }
  assert.ok(!SA.data.get('animals', 'serpiente').parts.some((p) => p.part === 'pelo'));
});

test('brush fur: "Cepilla el pelo" is done with the cepillo; the sponge or empty hands only give a funny reaction', () => {
  const t = setup('cepillar');
  assert.equal(t.flow.offer('conejo'), true);
  const task = t.care.current();
  assert.equal(task.text, 'Cepilla el pelo');
  assert.equal(t.calls.find((c) => c[0] === 'showCare')[1].icon, '🪮');
  const hit = (item) => t.flow.onPick({ animalId: 'conejo', part: 'pelo', item });
  assert.equal(hit('esponja').status, 'wrong');
  assert.equal(hit(undefined).status, 'wrong');
  assert.equal(t.care.current().remaining, 3);
  assert.equal(hit('cepillo').status, 'scrub');
  assert.ok(t.calls.some((c) => c[0] === 'sfx' && c[1] === 'sparkle'));
  assert.ok(t.calls.some((c) => c[0] === 'react' && c[1] === 'conejo' && c[2] === 'wiggle'));
  hit('cepillo');
  assert.equal(hit('cepillo').status, 'done');
  assert.equal(t.SA.save.get().stars, 1);
});

test('belly rub: "Acaricia la barriga" is done with empty hands, never with a tool', () => {
  const t = setup('acariciar');
  t.flow.offer('conejo');
  assert.equal(t.care.current().text, 'Acaricia la barriga');
  assert.equal(t.calls.find((c) => c[0] === 'showCare')[1].icon, '✋');
  assert.equal(t.flow.onPick({ animalId: 'conejo', part: 'barriga', item: 'cepillo' }).status, 'wrong');
  assert.ok(t.calls.some((c) => c[0] === 'say' && c[1] === 'item:cepillo'));
  for (let i = 0; i < 2; i++) assert.equal(t.flow.onPick({ animalId: 'conejo', part: 'barriga' }).status, 'scrub');
  assert.equal(t.flow.onPick({ animalId: 'conejo', part: 'barriga' }).status, 'done');
  assert.ok(t.calls.some((c) => c[0] === 'sfx' && c[1] === 'giggle'));
});

test('wash with the sponge and bandage with the venda each need their own tool', () => {
  const wash = setup('limpiar');
  wash.flow.offer('conejo');
  const wt = wash.care.current();
  assert.ok(wt.text.startsWith('Lava '));
  assert.equal(wash.flow.onPick({ animalId: 'conejo', part: wt.part, item: 'venda' }).reason, 'tool');
  assert.equal(wash.flow.onPick({ animalId: 'conejo', part: wt.part, item: 'esponja' }).status, 'scrub');
  const heal = setup('curar');
  heal.flow.offer('conejo');
  const ht = heal.care.current();
  assert.ok(ht.text.startsWith('Cura '));
  assert.equal(heal.flow.onPick({ animalId: 'conejo', part: ht.part, item: 'esponja' }).reason, 'tool');
  assert.equal(heal.flow.onPick({ animalId: 'conejo', part: ht.part, item: 'venda' }).status, 'done');
  assert.ok(heal.calls.some((c) => c[0] === 'sfx' && c[1] === 'pop'));
});

test('hand feeding: the equipped food is given with Space and used up; wrong foods and tools are not consumed', () => {
  const t = setup('alimentar');
  t.flow.offer('conejo');
  const task = t.care.current();
  const inv = t.SA.inventory;
  assert.equal(inv.count(task.food), 0, 'the starting kit holds no food');
  inv.add(task.food, 4);
  const other = ['pez', 'platano', 'fresa', 'zanahoria'].find((f) => f !== task.food && !t.SA.data.get('foods', f).diets.includes('herbívoro'));
  inv.add(other, 1);
  const feedOnce = (item) => t.flow.onPick({ animalId: 'conejo', part: 'cuerpo', item });
  assert.equal(feedOnce(other).status, 'wrong');
  assert.equal(inv.count(other), 1, 'a refused food stays in the inventory');
  assert.equal(feedOnce('cepillo').status, 'wrong', 'a tool is a funny miss');
  assert.equal(feedOnce(undefined).status, 'wrong', 'empty hands are a funny miss');
  assert.equal(t.flow.onPick({ animalId: 'pato', part: 'cuerpo', item: task.food }).status, 'ignored', 'another animal');
  assert.equal(inv.count(task.food), 4);
  let before = 4, last = null;
  while (t.care.active()) {
    last = feedOnce(task.food);
    assert.ok(last.status === 'fed' || last.status === 'done');
    assert.equal(inv.count(task.food), --before, 'each accepted food leaves the inventory');
  }
  assert.equal(last.status, 'done');
  assert.equal(inv.count(task.food), 4 - task.count);
  assert.equal(t.SA.save.get().stars, 1);
});

test('hand feeding with nothing left of that food does nothing and an equipped last food unequips', () => {
  const t = setup('alimentar');
  t.flow.offer('conejo');
  const task = t.care.current();
  assert.equal(t.flow.onPick({ animalId: 'conejo', part: 'cuerpo', item: task.food }).status, 'ignored');   // none in the bag
  t.SA.inventory.add(task.food, 1);
  t.SA.inventory.equip(task.food);
  t.flow.onPick({ animalId: 'conejo', part: 'cuerpo', item: task.food });
  assert.equal(t.SA.inventory.count(task.food), 0);
  assert.equal(t.SA.inventory.equipped(), null);
});

test('the tray still feeds without using the inventory', () => {
  const t = setup('alimentar');
  t.flow.offer('conejo');
  const task = t.care.current();
  t.SA.inventory.add(task.food, 2);
  const res = t.flow.onFeed(task.food);
  assert.ok(res.status === 'fed' || res.status === 'done');
  assert.equal(t.SA.inventory.count(task.food), 2, 'tray foods are free; only held food is used up');
});
