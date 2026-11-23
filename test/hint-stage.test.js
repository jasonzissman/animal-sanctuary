import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/clues.js', 'game/clues.js', 'game/data/clue-levels.js', 'game/clue-levels.js',
  'game/save.js', 'game/scaffold.js', 'game/map.js', 'game/picking.js', 'game/hint-stage.js', 'game/round.js',
  'game/render/biome-glow.js', 'game/ui/prompt.js'];
const load = () => { const SA = loadGame(FILES); SA.save.reset(); return SA; };

// ---- pure stage decision ----

test('hintStage.next: beginner already sees the silhouette, so the delay brings the biome (stage 2)', () => {
  const SA = load();
  const { next, initial } = SA.hintStage;
  assert.equal(initial(1), 1);
  assert.equal(next(1, 0, 1), 0);
  assert.equal(next(1, 19.9, 1), 0);
  assert.equal(next(1, 20, 1), 2);
  assert.equal(next(1, 90, 1), 2);
  assert.equal(next(1, 90, 2), 0);                 // biome already shown: nothing more, never a penalty
  assert.equal(next(1, 25, 0), 2);                 // a beginner never needs the silhouette stage
});

test('hintStage.next: higher levels get the silhouette, then the biome one delay later', () => {
  const SA = load();
  const { next, initial } = SA.hintStage;
  assert.equal(initial(2), 0);
  assert.equal(next(2, 19, 0), 0);
  assert.equal(next(2, 20, 0), 1);
  assert.equal(next(2, 25, 1), 0);
  assert.equal(next(3, 40, 1), 2);
  assert.equal(next(3, 100, 2), 0);
});

test('hintStage.next: junk input is safe', () => {
  const SA = load();
  assert.equal(SA.hintStage.next(undefined, undefined, undefined), 0);
  assert.equal(SA.hintStage.next('x', NaN, -3), 0);
  assert.equal(SA.hintStage.initial(undefined), 1);
});

// ---- round ----

test('round.biomeHint: counts one hint once and returns the target animal biome', () => {
  const SA = load();
  const events = [];
  const game = SA.round.create({ level: 1, rng: SA.clues.makeRng(3), now: () => 0, track: (t, f) => events.push({ t, ...f }) });
  assert.equal(game.biomeHint(), null);            // no round yet
  const r = game.start();
  assert.equal(r.stage, 1);
  const biome = SA.data.get('animals', r.answerId).biome;
  assert.equal(game.biomeHint(), biome);
  assert.equal(game.biomeHint(), biome);
  assert.equal(r.hints, 1);
  assert.equal(r.stage, 2);
  game.pick({ animalId: r.answerId, part: 'cuerpo' });
  assert.equal(events.find((e) => e.t === 'round.complete').hints, 1);
  assert.equal(game.biomeHint(), null);            // done round
});

// ---- controller ----

function quietView() {
  return { showRound() {}, showHint() {}, toast() {}, shake() {}, celebrate() {}, confetti() {}, clear() {} };
}

test('controller beginner: after the delay the biome glows, hints=1 in round.complete, and a correct pick hides it', () => {
  const SA = load();
  const events = [], timers = [], glow = [];
  const game = SA.round.create({ level: 1, rng: SA.clues.makeRng(4), now: () => 0, track: (t, f) => events.push({ t, ...f }) });
  const ctl = SA.prompt.createController({ game, view: quietView(), audio: {}, later: (fn, ms) => timers.push([fn, ms]),
    biomeFx: { show: (id) => glow.push(['show', id]), hide: () => glow.push(['hide']) } });
  const r = ctl.begin();
  assert.equal(timers[0][1], SA.prompt.AUTO_HINT_MS);
  assert.deepEqual(glow, [['hide']]);
  timers.shift()[0]();
  assert.deepEqual(glow[1], ['show', SA.data.get('animals', r.answerId).biome]);
  assert.equal(r.hints, 1);
  assert.equal(timers.length, 0);                  // both stages used: no more timers
  game.pick({ animalId: r.answerId, part: 'cuerpo' });
  ctl.onPick({ animalId: r.answerId, part: 'cuerpo' });
  assert.equal(events.find((e) => e.t === 'round.complete').hints, 1);
});

test('controller level 2: silhouette at 20s then biome at 40s, 2 hints; stale or finished rounds do nothing', () => {
  const SA = load();
  const timers = [], glow = [];
  const game = SA.round.create({ level: 2, rng: SA.clues.makeRng(5), now: () => 0, track() {} });
  const ctl = SA.prompt.createController({ game, view: quietView(), audio: {}, later: (fn) => timers.push(fn),
    biomeFx: { show: (id) => glow.push(id), hide() {} } });
  const r = ctl.begin();
  timers.shift()();
  assert.equal(r.hints, 1);
  assert.equal(glow.length, 0);
  timers.shift()();
  assert.equal(r.hints, 2);
  assert.equal(glow.length, 1);

  const r2 = ctl.begin();
  game.pick({ animalId: r2.answerId, part: 'cuerpo' });
  timers.shift()();                                // fires after the round is done
  assert.equal(r2.hints, 0);
});

test('controller: a throwing glow never breaks play', () => {
  const SA = load();
  const timers = [];
  const game = SA.round.create({ level: 1, rng: SA.clues.makeRng(6), now: () => 0, track() {} });
  const ctl = SA.prompt.createController({ game, view: quietView(), audio: {}, later: (fn) => timers.push(fn),
    biomeFx: { show() { throw new Error('boom'); }, hide() {} } });
  ctl.begin();
  assert.doesNotThrow(() => timers[0]());
});

// ---- spoken biome name (AS-0050) ----

test('SA.vocab.biomeKey: maps each biome id to its vocab key, null for junk; every biome name carries its article', () => {
  const SA = load();
  SA.data.all('biomes').forEach((b) => {
    assert.equal(SA.vocab.biomeKey(b.id), 'biome:' + b.id);
    assert.match(SA.vocab.get('biome:' + b.id).es, /^(el|la|los|las) /i);
  });
  assert.equal(SA.vocab.get('biome:selva').es, 'La selva');
  assert.equal(SA.vocab.get('biome:desierto').es, 'El desierto');
  assert.equal(SA.vocab.get('biome:montana').es, 'La montaña');
  [undefined, null, 5, '', 'nope', 'Selva', 'sel va'].forEach((x) => assert.equal(SA.vocab.biomeKey(x), null));
});

test('vocab validation rejects a biome name without an article', () => {
  const SA = load();
  assert.throws(() => SA.data.register('vocab', [{ id: 'biome:x', key: 'biome:x', es: 'selva', clip: null }]));
});

function biomeCtl(audio) {
  const SA = load();
  const timers = [], glow = [];
  const game = SA.round.create({ level: 1, rng: SA.clues.makeRng(4), now: () => 0, track() {} });
  const ctl = SA.prompt.createController({ game, view: quietView(), audio, later: (fn) => timers.push(fn),
    biomeFx: { show: (id) => glow.push(id), hide() {} } });
  const r = ctl.begin();
  return { SA, timers, glow, r };
}

test('controller: the biome glow says its vocab key once', () => {
  const said = [];
  const { SA, timers, glow, r } = biomeCtl({ say: (k) => said.push(k) });
  assert.deepEqual(said, [r.clue.text]);
  timers.shift()();
  assert.equal(glow.length, 1);
  assert.deepEqual(said.slice(1), ['biome:' + SA.data.get('animals', r.answerId).biome]);
  assert.equal(timers.length, 0);
  assert.equal(said.length, 2);
});

test('controller: biome hint is silent when muted and safe without SA.audio', () => {
  const said = [];
  const m = biomeCtl({ say: (k) => said.push(k), isMuted: () => true });
  m.timers.shift()();
  assert.equal(m.glow.length, 1);
  assert.ok(!said.some((k) => k.startsWith('biome:')));
  const n = biomeCtl({});
  assert.doesNotThrow(() => n.timers.shift()());
  assert.equal(n.glow.length, 1);
});

// ---- render (stub THREE) ----

function stubThree() {
  class Geo {
    constructor(w, h, sx, sy) {
      this.n = (sx + 1) * (sy + 1);
      this.xyz = Array.from({ length: this.n }, (_, i) => [(i % (sx + 1)) / sx * w - w / 2, 0, Math.floor(i / (sx + 1)) / sy * h - h / 2]);
      this.attributes = { position: { count: this.n,
        getX: (i) => this.xyz[i][0], getZ: (i) => this.xyz[i][2], setXYZ: (i, x, y, z) => { this.xyz[i] = [x, y, z]; } } };
      this.disposed = false;
    }
    rotateX() {}
    dispose() { this.disposed = true; }
  }
  return {
    PlaneGeometry: Geo,
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } dispose() {} },
    Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
  };
}

test('biome glow: covers just that biome strip, pulses softly and hides cleanly', () => {
  const SA = load();
  const added = [], removed = [];
  const scene = { add: (m) => added.push(m), remove: (m) => removed.push(m) };
  const glow = SA.render.createBiomeGlow(stubThree(), { scene });
  assert.equal(glow.show('nope'), false);
  assert.equal(glow.visible(), false);
  glow.update(1);                                  // no-op without a glow
  assert.equal(glow.show('desierto'), true);
  assert.equal(glow.visible(), true);
  const xs = added[0].geometry.xyz.map((p) => p[0]);
  assert.ok(Math.min(...xs) >= 56 - 1e-6 && Math.max(...xs) <= 112 + 1e-6);
  const seen = new Set();
  for (let i = 0; i < 20; i++) { glow.update(0.1); seen.add(added[0].material.opacity); }
  assert.ok(seen.size > 3);
  assert.ok([...seen].every((o) => o > 0.1 && o < 0.5));
  glow.show('selva');                              // replaces the previous glow
  assert.equal(removed.length, 1);
  assert.equal(removed[0].geometry.disposed, true);
  glow.hide();
  assert.equal(glow.visible(), false);
  assert.equal(removed.length, 2);
  glow.hide();
});
