import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../game/main.js', import.meta.url), 'utf8');

/** Runs game/main.js with stubs; returns the captured rAF callbacks and stage render calls. */
function boot(SAT) {
  const frames = [];
  const renders = [];
  const ctx = {
    SA: {
      render: { createStage: () => ({ render: (dt) => renders.push(dt), fx: {}, careFx: {} }) },
      prompt: { start() {} },
    },
    THREE: {},
    document: { getElementById: () => null },
    requestAnimationFrame: (cb) => frames.push(cb),
  };
  if (SAT) ctx.SAT = SAT;
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { frames, renders };
}

test('render loop calls SAT.frame(dt) once per rendered frame', () => {
  const dts = [];
  const { frames, renders } = boot({ frame: (dt) => dts.push(dt), track() {} });
  frames.shift()(1000);
  frames.shift()(1016);
  frames.shift()(5000); // a long stall is clamped to 0.25s
  assert.equal(renders.length, 3);
  assert.equal(dts.length, 3);
  assert.equal(dts[0], 0);
  assert.ok(Math.abs(dts[1] - 0.016) < 1e-9);
  assert.equal(dts[2], 0.25);
});

test('render loop runs fine when SAT is missing or its frame() throws', () => {
  const a = boot(null);
  a.frames.shift()(0);
  a.frames.shift()(16);
  assert.equal(a.renders.length, 2);
  const b = boot({ frame() { throw new Error('boom'); }, track() {} });
  b.frames.shift()(0);
  b.frames.shift()(16);
  assert.equal(b.renders.length, 2);
});
