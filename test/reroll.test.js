import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/save.js', 'game/picking.js', 'game/round.js',
  'game/render/round-fx.js', 'game/ui/prompt.js', 'game/reroll.js'];

function setup(biomeRef) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const events = [];
  const game = SA.round.create({ rng: SA.clues.makeRng(11), track: (type, f) => events.push({ type, ...f }),
    biome: () => biomeRef.cur });
  return { SA, game, events };
}

test('shouldReroll: needs a different camera biome, ~2 s of dwell and no picks', () => {
  const { SA } = setup({ cur: 'bosque' });
  const f = SA.reroll.shouldReroll;
  const base = { roundBiome: 'bosque', cameraBiome: 'selva', dwellSeconds: 2, picks: 0 };
  assert.equal(f(base), true);
  assert.equal(f({ ...base, dwellSeconds: 5 }), true);
  assert.equal(f({ ...base, dwellSeconds: 1.9 }), false);
  assert.equal(f({ ...base, cameraBiome: 'bosque' }), false);
  assert.equal(f({ ...base, picks: 1 }), false);
  assert.equal(f({ ...base, cameraBiome: null }), false);
  assert.equal(f({ ...base, roundBiome: null }), false);
  assert.equal(f({ ...base, dwellSeconds: undefined }), false);
  assert.equal(f(null), false);
});

test('round records its biome and counts picks', () => {
  const b = { cur: 'bosque' };
  const { game } = setup(b);
  const r = game.start();
  assert.equal(r.biome, 'bosque');
  assert.equal(r.picks, 0);
  game.pick({ animalId: 'nope', part: 'cuerpo' });
  assert.equal(r.picks, 1);
  assert.equal(game.hasBiomePool('bosque'), true);
  assert.equal(game.hasBiomePool('nope'), false);
  assert.equal(game.hasBiomePool(null), false);
});

test('watcher: settling in another biome for 2 s starts a new round from that biome, with no miss or round.complete', () => {
  const b = { cur: 'bosque' };
  const { SA, game, events } = setup(b);
  let rerolls = 0;
  const first = game.start();
  const w = SA.reroll.createWatcher({ game, biome: () => b.cur, onReroll: () => { rerolls += 1; game.start(); } });
  for (let i = 0; i < 30; i++) w.update(0.1);
  assert.equal(rerolls, 0, 'same biome: nothing happens');
  b.cur = 'selva';
  for (let i = 0; i < 15; i++) w.update(0.1);   // 1.5 s
  assert.equal(rerolls, 0);
  for (let i = 0; i < 10; i++) w.update(0.1);   // now past 2 s
  assert.equal(rerolls, 1);
  const second = game.current();
  assert.notEqual(second, first);
  assert.equal(second.biome, 'selva');
  assert.equal(SA.data.get('animals', second.answerId).biome, 'selva');
  assert.equal(second.misses, 0);
  assert.equal(first.misses, 0);
  assert.equal(events.filter((e) => e.type === 'round.complete').length, 0);
  for (let i = 0; i < 40; i++) w.update(0.1);
  assert.equal(rerolls, 1, 'settled in the new biome: no repeat');
});

test('watcher: passing through a biome briefly (dwell resets) does not re-roll', () => {
  const b = { cur: 'bosque' };
  const { SA, game } = setup(b);
  let rerolls = 0;
  game.start();
  const w = SA.reroll.createWatcher({ game, biome: () => b.cur, onReroll: () => { rerolls += 1; } });
  b.cur = 'selva';
  for (let i = 0; i < 15; i++) w.update(0.1);
  b.cur = 'montana';
  for (let i = 0; i < 15; i++) w.update(0.1);
  b.cur = 'bosque';
  for (let i = 0; i < 40; i++) w.update(0.1);
  assert.equal(rerolls, 0);
});

test('watcher: no re-roll after a pick, when done, with the arrow used, or while care/sandbox owns the screen', () => {
  const b = { cur: 'bosque' };
  const { SA, game } = setup(b);
  let rerolls = 0, allowed = true;
  const w = SA.reroll.createWatcher({ game, biome: () => b.cur, canReroll: () => allowed, onReroll: () => { rerolls += 1; } });
  const run = (secs) => { for (let i = 0; i < secs * 10; i++) w.update(0.1); };

  const r1 = game.start();
  game.pick({ animalId: 'nope', part: 'cuerpo' });     // a wrong pick still counts as a pick
  b.cur = 'selva'; run(5);
  assert.equal(rerolls, 0, 'pick made');

  b.cur = 'bosque'; game.start(); run(1);
  game.current().pointerUsed = true;
  b.cur = 'selva'; run(5);
  assert.equal(rerolls, 0, 'arrow glide');

  b.cur = 'bosque'; game.start(); run(1);
  allowed = false;
  b.cur = 'selva'; run(5);
  assert.equal(rerolls, 0, 'care or sandbox');
  allowed = true; run(1);
  assert.equal(rerolls, 0, 'dwell restarts once allowed again');
  run(2);
  assert.equal(rerolls, 1);

  b.cur = 'bosque'; const r4 = game.start(); run(1);
  game.pick({ animalId: r4.answerId, part: 'cuerpo' });
  b.cur = 'selva'; run(5);
  assert.equal(rerolls, 1, 'round done');
  assert.ok(r1);
  w.update(-1);   // bad dt never throws
});

test('watcher: a camera biome with too few animals is not re-rolled into', () => {
  const b = { cur: 'bosque' };
  const { SA, game } = setup(b);
  let rerolls = 0;
  game.start();
  const w = SA.reroll.createWatcher({ game, biome: () => b.cur, onReroll: () => { rerolls += 1; } });
  b.cur = 'desierto';
  const pool = SA.data.all('animals').filter((a) => !a.easterEgg && a.biome === 'desierto');
  for (let i = 0; i < 50; i++) w.update(0.1);
  assert.equal(rerolls, pool.length >= 3 ? 1 : 0);
});

test('controller: reroll starts a new round with a soft toast, but not during care or after the answer', () => {
  const b = { cur: 'bosque' };
  const { SA, game } = setup(b);
  const log = [];
  const view = new Proxy({}, { get: (_, name) => (...a) => log.push([name, ...a]) });
  let careActive = false;
  const care = { active: () => careActive, offer: () => false };
  const ctl = SA.prompt.createController({ game, view, care, audio: { say() {}, sfx: (n) => log.push(['sfx', n]) }, later() {} });
  assert.equal(ctl.canReroll(), false, 'no round yet');
  assert.equal(ctl.reroll(), null);
  const r1 = ctl.begin();
  assert.equal(ctl.canReroll(), true);
  b.cur = 'selva'; log.length = 0;
  const r2 = ctl.reroll();
  assert.notEqual(r2, r1);
  assert.equal(r2.biome, 'selva');
  assert.ok(log.some((l) => l[0] === 'showRound'));
  assert.ok(!log.some((l) => l[0] === 'shake' || (l[0] === 'sfx' && l[1] === 'boing')), 'no negative feedback');
  careActive = true;
  assert.equal(ctl.canReroll(), false);
  assert.equal(ctl.reroll(), null);
  careActive = false;
  game.pick({ animalId: r2.answerId, part: 'cuerpo' });
  assert.equal(ctl.canReroll(), false, 'answered round is not abandoned');
});
