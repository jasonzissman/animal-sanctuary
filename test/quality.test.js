import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

const fresh = () => loadGame(['game/sa.js', 'game/quality.js', 'game/render/quality-apply.js']);
// Feed n one-second samples of `fps`.
const feed = (q, fps, n, hidden = false) => { for (let i = 0; i < n; i++) q.sample(fps, hidden, 1); };

test('starts on high with a params table per level', () => {
  const { quality: q } = fresh();
  assert.equal(q.level(), 'high');
  for (const l of ['low', 'medium', 'high']) {
    const p = q.params(l);
    for (const k of ['grass', 'shadow', 'fogFar', 'pixelRatio']) assert.ok(p[k] > 0, `${l}.${k}`);
  }
  assert.ok(q.params('low').shadow < q.params('medium').shadow && q.params('medium').shadow < q.params('high').shadow);
  assert.ok(q.params('low').pixelRatio < q.params('high').pixelRatio);
  assert.equal(q.params().shadow, 2048);
});

test('measures first: no change during the settle window or before the window is full', () => {
  const { quality: q } = fresh();
  feed(q, 10, 2);   // settle seconds are ignored
  assert.equal(q.level(), 'high');
  feed(q, 10, 3);   // 3 of 4 samples
  assert.equal(q.level(), 'high');
  feed(q, 10, 1);
  assert.equal(q.level(), 'medium');
});

test('steps down one level under ~40 fps, again after the cooldown, and stops at low', () => {
  const { quality: q } = fresh();
  const seen = [];
  q.onChange((i) => seen.push([i.from, i.to, i.fps]));
  feed(q, 30, 60);
  assert.equal(q.level(), 'low');
  assert.deepEqual(seen.map((s) => s.slice(0, 2)), [['high', 'medium'], ['medium', 'low']]);
  assert.equal(seen[0][2], 30);
  feed(q, 5, 60);
  assert.equal(q.level(), 'low');
  assert.equal(seen.length, 2);
});

test('does not step down for fps just above the threshold', () => {
  const { quality: q } = fresh();
  feed(q, 42, 120);
  assert.equal(q.level(), 'high');
});

test('steps up only when well above (> 55) and sustained, never in the 40..55 dead band', () => {
  const { quality: q } = fresh();
  feed(q, 30, 40);
  assert.equal(q.level(), 'low');
  feed(q, 50, 300);   // good but not great: stays
  assert.equal(q.level(), 'low');
  feed(q, 58, 10);    // not sustained long enough yet
  assert.equal(q.level(), 'low');
  feed(q, 58, 30);
  assert.equal(q.level(), 'medium');
  feed(q, 58, 10);    // still inside the up cooldown
  assert.equal(q.level(), 'medium');
  feed(q, 58, 120);
  assert.equal(q.level(), 'high');
});

test('a dip inside a good run resets the sustain counter', () => {
  const { quality: q } = fresh();
  feed(q, 30, 40);
  assert.equal(q.level(), 'low');
  for (let i = 0; i < 8; i++) { feed(q, 60, 15); feed(q, 45, 4); }   // never 20 s in a row above 55
  assert.equal(q.level(), 'low');
});

test('fps hovering near the threshold never oscillates', () => {
  const { quality: q } = fresh();
  let changes = 0;
  q.onChange(() => changes++);
  for (let i = 0; i < 600; i++) q.sample(i % 2 ? 38 : 43, false, 1);   // averages ~40.5
  for (let i = 0; i < 600; i++) q.sample(i % 2 ? 52 : 58, false, 1);   // averages 55: not above
  assert.ok(changes <= 1, 'changes: ' + changes);
});

test('an up-step that is undone straight away is not repeated (the higher level is banned)', () => {
  const { quality: q } = fresh();
  const seen = [];
  q.onChange((i) => seen.push(i.to));
  feed(q, 30, 40);                // high -> medium -> low
  feed(q, 60, 40);                // -> medium
  assert.equal(q.level(), 'medium');
  feed(q, 30, 20);                // medium is slow too -> low, soon after the up-step
  assert.equal(q.level(), 'low');
  feed(q, 60, 600);               // the good fps came from low being light: medium stays banned
  assert.equal(q.level(), 'low');
  assert.deepEqual(seen, ['medium', 'low', 'medium', 'low']);
});

test('hidden-tab and invalid samples are ignored', () => {
  const { quality: q } = fresh();
  feed(q, 5, 200, true);
  q.sample(0, false, 1); q.sample(NaN, false, 1); q.sample(-3, false, 1);
  assert.equal(q.level(), 'high');
  assert.equal(q.average(), 0);
  feed(q, 60, 10);
  feed(q, 5, 100, true);
  assert.equal(q.level(), 'high');
});

test('frame(dt) folds frames into one-second samples and skips hidden frames', () => {
  const { quality: q } = fresh();
  for (let i = 0; i < 20 * 60; i++) q.frame(1 / 20, true);   // 60 s hidden at 20 fps: nothing
  assert.equal(q.level(), 'high');
  for (let i = 0; i < 20 * 30; i++) q.frame(1 / 20, false);  // 30 s visible at 20 fps
  assert.equal(q.level(), 'low');
  q.frame(0, false); q.frame(-1, false);                      // bad dt ignored
});

test('pin() overrides auto changes; pin(null) hands control back', () => {
  const { quality: q } = fresh();
  const seen = [];
  q.onChange((i) => seen.push(i));
  q.pin('low');
  assert.equal(q.level(), 'low');
  assert.equal(q.isPinned(), true);
  assert.equal(seen[0].pinned, true);
  feed(q, 90, 300);               // great fps would raise it, but it is pinned
  assert.equal(q.level(), 'low');
  q.pin('high');
  feed(q, 5, 100);                // awful fps would lower it, but it is pinned
  assert.equal(q.level(), 'high');
  assert.equal(q.pin('bogus'), 'high');
  q.pin(null);
  assert.equal(q.isPinned(), false);
  feed(q, 5, 40);
  assert.notEqual(q.level(), 'high');
});

test('onChange passes from/to/fps/params and can be unsubscribed; a throwing listener is harmless', () => {
  const { quality: q } = fresh();
  q.onChange(() => { throw new Error('boom'); });
  let info = null, n = 0;
  const off = q.onChange((i) => { info = i; n++; });
  feed(q, 30, 6);
  assert.equal(info.from, 'high'); assert.equal(info.to, 'medium'); assert.equal(info.fps, 30);
  assert.equal(info.params.shadow, 1024);
  off();
  feed(q, 30, 20);
  assert.equal(n, 1);
  assert.equal(q.level(), 'low');
  assert.equal(typeof q.onChange(null), 'function');
});

test('applyQuality caps the pixel ratio and resizes the shadow map only when it changed', () => {
  const SA = fresh();
  const calls = [];
  let pr = 2;
  const renderer = { getPixelRatio: () => pr, setPixelRatio: (v) => { pr = v; calls.push(v); } };
  let disposed = 0;
  const sun = { shadow: { mapSize: { width: 2048, height: 2048 }, map: { dispose: () => disposed++ } } };
  let r = SA.render.applyQuality({ renderer, sun, params: SA.quality.params('low'), dpr: 3 });
  assert.equal(r.pixelRatio, 1); assert.equal(r.shadow, 512);
  assert.equal(sun.shadow.mapSize.width, 512); assert.equal(sun.shadow.mapSize.height, 512);
  assert.equal(sun.shadow.map, null); assert.equal(disposed, 1);
  r = SA.render.applyQuality({ renderer, sun, params: SA.quality.params('low'), dpr: 3 });
  assert.equal(calls.length, 1); assert.equal(disposed, 1);   // nothing changed: nothing redone
  r = SA.render.applyQuality({ renderer, sun, params: SA.quality.params('high'), dpr: 1 });
  assert.equal(r.pixelRatio, 1);   // a 1x screen is never upscaled
  assert.equal(sun.shadow.mapSize.width, 2048);
});

test('scene.js applies the level on creation and on every change, and tracks quality.change', () => {
  const src = fs.readFileSync(new URL('../game/render/scene.js', import.meta.url), 'utf8');
  assert.match(src, /SA\.quality\.params\(\)\.pixelRatio|SA\.quality \? SA\.quality\.params\(\)\.pixelRatio/);
  assert.match(src, /SA\.render\.applyQuality\(/);
  assert.match(src, /SA\.quality\.onChange\(/);
  assert.match(src, /track\('quality\.change', \{ from: info\.from, to: info\.to, fps: info\.fps \}\)/);
});
