import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Every <script> in index.html, in order: { src } for files, { code } for inline blocks. */
function pageScripts() {
  const out = [];
  for (const m of HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (src) out.push({ src: src[1].split('?')[0] });
    else if (m[2].trim()) out.push({ code: m[2] });
  }
  return out;
}

/** A permissive stand-in for THREE / DOM objects: any property, call or `new` yields another stub. */
function stub(name = 'stub') {
  const cache = new Map();
  return new Proxy(function () {}, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === 'then' || key === 'toJSON') return undefined;
      if (key === 'length') return 0;
      if (!cache.has(key)) cache.set(key, stub(`${name}.${String(key)}`));
      return cache.get(key);
    },
    set(_t, key, value) { cache.set(key, value); return true; },
    apply: () => stub(`${name}()`),
    construct: () => stub(`new ${name}`),
  });
}

function bootGame() {
  const frames = [];
  const bootEl = { textContent: '🐾', parentNode: { removeChild() {} } };
  const doc = stub('document');
  doc.getElementById = (id) => (id === 'boot' ? bootEl : stub(`#${id}`));
  const storage = new Map();
  const ctx = vm.createContext({
    console,
    THREE: stub('THREE'),
    document: doc,
    navigator: { userAgent: 'node-test', maxTouchPoints: 0 },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
    requestAnimationFrame: (cb) => frames.push(cb),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    performance: { now: () => 0 },
  });
  ctx.window = ctx;
  const loaded = [];
  for (const s of pageScripts()) {
    if (s.src === 'game/vendor/three.min.js') continue; // the stub THREE replaces the real library
    if (s.src) {
      const abs = path.join(ROOT, s.src);
      vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: abs });
      loaded.push(s.src);
    } else {
      vm.runInContext(s.code, ctx, { filename: 'index.html (inline)' });
    }
  }
  return { ctx, SA: ctx.SA, frames, bootEl, loaded };
}

test('index.html lists game scripts and every file exists', () => {
  const srcs = pageScripts().filter((s) => s.src).map((s) => s.src);
  assert.ok(srcs.length > 20);
  for (const s of srcs) assert.ok(fs.existsSync(path.join(ROOT, s)), `missing ${s}`);
});

test('every index.html script loads in order against stubs and the game boots', () => {
  const { ctx, SA, frames, bootEl, loaded } = bootGame();
  assert.equal(loaded[loaded.length - 1], 'game/main.js');
  assert.ok(SA.map && SA.camera && SA.render.createStage);
  // main.js turns createStage failures into the boot message; a clean boot leaves it alone and starts the loop.
  assert.equal(bootEl.textContent, '🐾', 'boot did not report a stage failure');
  assert.equal(frames.length, 1, 'render loop scheduled');
  // main.js reports (rather than throws) failures in its optional startup steps; none may have happened.
  const errs = ctx.SAT.queued().filter((e) => e.type === 'error' || e.type === 'render.unavailable');
  assert.equal(errs.length, 0, `swallowed boot errors: ${JSON.stringify(errs)}`);
  frames.shift()(0);
  frames.shift()(16);
  assert.equal(frames.length, 1, 'render loop keeps rescheduling');
});

const EXTREMES = [0, 1, -1, 1e3, -1e3, 1e9, -1e9, Infinity, -Infinity, NaN];

test('camera target stays inside the map bounds for extreme pan, pinch, wheel and WASD input', () => {
  const { SA } = bootGame();
  const B = SA.map.BOUNDS;
  const C = SA.camera;
  const D = C.DEFAULTS;
  const inBounds = (s, label) => {
    assert.ok(s.x >= B.minX && s.x <= B.maxX, `${label}: x ${s.x} outside [${B.minX}, ${B.maxX}]`);
    assert.ok(s.z >= B.minZ && s.z <= B.maxZ, `${label}: z ${s.z} outside [${B.minZ}, ${B.maxZ}]`);
    assert.ok(s.dist >= D.minDist && s.dist <= D.maxDist, `${label}: dist ${s.dist}`);
    assert.ok(s.pitch >= D.minPitch && s.pitch <= D.maxPitch, `${label}: pitch ${s.pitch}`);
  };
  const starts = [
    { x: 0, z: 0, dist: 30, yaw: 0, pitch: 55 },
    { x: B.minX, z: B.minZ, dist: D.minDist, yaw: 90, pitch: 10 },
    { x: B.maxX, z: B.maxZ, dist: D.maxDist, yaw: -135, pitch: 89 },
    { x: NaN, z: Infinity, dist: NaN, yaw: NaN, pitch: NaN },
  ];
  for (const s0 of starts) {
    inBounds(C.clampState(s0, B), 'clampState');
    for (const a of EXTREMES) {
      for (const b of EXTREMES) {
        inBounds(C.panByPixels(s0, a, b, 600, B), `drag ${a},${b}`);
        inBounds(C.orbitByPixels(s0, a, b, B), `orbit ${a},${b}`);
      }
      inBounds(C.zoomByWheel(s0, a, B), `wheel ${a}`);
      inBounds(C.zoomByScale(s0, a, B), `pinch ${a}`);
      inBounds(C.orbitByKeys(s0, a, a, 1, B), `orbit keys ${a}`);
    }
  }
  // Repeated extreme input pins to the edge and never passes it.
  let s = starts[0];
  for (let i = 0; i < 50; i++) s = C.panByPixels(s, -1e6, -1e6, 600, B);
  inBounds(s, 'repeated drag');
  for (let i = 0; i < 50; i++) s = C.zoomByWheel(s, 1e6, B);
  assert.equal(s.dist, D.maxDist);
  for (let i = 0; i < 50; i++) s = C.zoomByScale(s, 1e6, B);
  assert.equal(s.dist, D.minDist);
});

test('SA.map.clamp pins values to the given range', () => {
  const { SA } = bootGame();
  const B = SA.map.BOUNDS;
  assert.equal(SA.map.clamp(1e9, B.minX, B.maxX), B.maxX);
  assert.equal(SA.map.clamp(-1e9, B.minZ, B.maxZ), B.minZ);
  assert.equal(SA.map.clamp(0, B.minX, B.maxX), 0);
});
