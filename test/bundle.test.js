import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildBundle, writeBundle } from '../scripts/bundle.js';

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-bundle-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const PAGE = `<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body>
<script src="one.js"></script>
<script>inline();</script>
<script src='two.js?v=1'></script></body></html>`;

test('inlines scripts and css in order, flag first', () => {
  const dir = fixture({
    'index.html': PAGE,
    'a.css': 'body{color:red}\r\n',
    'one.js': 'var a = "</script>";\n',
    'two.js': 'var b = 2;\n',
  });
  const html = buildBundle({ root: dir });
  assert.ok(!/\bsrc\s*=/.test(html) && !/\bhref\s*=/.test(html), 'no external references');
  assert.ok(html.includes('<style>\nbody{color:red}\n</style>'));
  const order = ['SA_CLASSROOM', 'var a =', 'inline();', 'var b = 2;'].map((s) => html.indexOf(s));
  assert.ok(order.every((n) => n >= 0) && order.join() === [...order].sort((x, y) => x - y).join());
  assert.equal(html.match(/<\/script>/g).length, 4, 'an inlined "</script>" string must not close the element');
  assert.ok(!buildBundle({ root: dir, classroom: false }).includes('SA_CLASSROOM'));
});

test('rejects external, missing, escaping and module references', () => {
  const bad = (tag, re) => assert.throws(() => buildBundle({ root: fixture({ 'index.html': `<body>${tag}</body>` }) }), re);
  bad('<script src="https://cdn.example/x.js"></script>', /external/);
  bad('<script src="//cdn.example/x.js"></script>', /external/);
  bad('<script src="nope.js"></script>', /missing/);
  bad('<script src="../x.js"></script>', /escapes/);
  bad('<script type="module" src="m.js"></script>', /modules/);
  bad('<link rel="icon" href="x.png">', /unsupported/);
  assert.throws(() => buildBundle({ root: fixture({ 'index.html': '<body>none</body>' }) }), /no scripts/);
});

test('the real project bundles into one self-contained file, byte-identical across runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-out-'));
  const a = path.join(dir, 'a', 'santuario.html');
  const b = path.join(dir, 'b', 'santuario.html');
  writeBundle({ out: a });
  writeBundle({ out: b });
  const bufA = fs.readFileSync(a);
  assert.ok(bufA.equals(fs.readFileSync(b)), 'two runs are byte-identical');
  const html = bufA.toString('utf8');
  assert.ok(!/<script[^>]*\bsrc\s*=/i.test(html), 'no <script src>');
  assert.ok(!/<link\b/i.test(html), 'no <link>');
  assert.ok(html.includes('window.SA_CLASSROOM = true'));
  assert.ok(html.indexOf('SA_CLASSROOM') < html.indexOf('santuario_telemetry_q_v1'));
  assert.ok(html.includes('REVISION'), 'three.js is inlined');
  // every inline script is valid JavaScript
  for (const m of html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)) new vm.Script(m[1]);
});

test('classroom bundle: telemetry never calls fetch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-cls-'));
  const out = path.join(dir, 'santuario.html');
  writeBundle({ out });
  const html = fs.readFileSync(out, 'utf8');
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
  const flag = /<script>(window\.SA_CLASSROOM = true;)<\/script>/.exec(html)?.[1];
  assert.ok(flag, 'the flag script is in the bundle');
  const tele = scripts.find((s) => s.includes('santuario_telemetry_q_v1'));
  const sa = scripts.find((s) => s.includes('root.SA = root.SA') || /window\.SA\s*=/.test(s));
  const calls = [];
  const intervals = [];
  const ctx = vm.createContext({
    console,
    fetch: (...a) => (calls.push(a), Promise.resolve({ ok: true, json: async () => ({ accepted: [] }) })),
    setInterval: (f, ms) => intervals.push(ms),
  });
  ctx.window = ctx;
  for (const code of [flag, sa, tele].filter(Boolean)) vm.runInContext(code, ctx);
  const SAT = ctx.window.SAT;
  SAT.startSession();
  SAT.track('part.tap', { part: 'orejas', correct: true });
  assert.equal(await SAT.flush(), false);
  assert.equal(await SAT.feedback('hola', 'idea', {}) !== null, true);
  assert.equal(await SAT.flush({ unloading: true }), false);
  assert.equal(calls.length, 0, 'fetch was never called');
  assert.deepEqual(intervals, [15000], 'only the local tick timer, no flush timer');
  assert.ok(SAT.queued().length >= 2, 'events are still queued locally');
});
