import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Loads game/manifest.js with no THREE, window or DOM: an empty context is enough.
function readManifest(file = path.join(ROOT, 'game', 'manifest.js')) {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return JSON.parse(JSON.stringify(ctx.SA_MANIFEST));
}

function pageScripts(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => m[1].split('?')[0])
    .filter((src) => src.startsWith('game/'));
}

test('manifest loads without THREE or a DOM and is a list of unique game paths', () => {
  const { scripts } = readManifest();
  assert.ok(Array.isArray(scripts) && scripts.length > 0);
  assert.ok(scripts.every((s) => typeof s === 'string' && /^game\/[\w\-./]+\.js$/.test(s)));
  assert.equal(new Set(scripts).size, scripts.length, 'no duplicates');
});

test('every manifest file exists', () => {
  for (const s of readManifest().scripts) {
    assert.ok(fs.existsSync(path.join(ROOT, s)), `missing file listed in manifest: ${s}`);
  }
});

test('index.html game script tags match the manifest in content and order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.deepEqual(pageScripts(html), readManifest().scripts);
});

test('every game script file on disk is listed in the manifest', () => {
  const listed = new Set(readManifest().scripts);
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'vendor' ? [] : walk(`${dir}/${e.name}`)) : [`${dir}/${e.name}`]);
  const unlisted = walk('game').filter((f) => f.endsWith('.js') && f !== 'game/manifest.js' && !listed.has(f));
  assert.deepEqual(unlisted, [], 'game scripts missing from manifest/index.html');
});

test('script tag extraction ignores inline and non-game scripts and detects reordering', () => {
  const html = '<script src="game/b.js"></script><script src="game/a.js"></script>';
  assert.notDeepEqual(pageScripts(html), ['game/a.js', 'game/b.js']);
  assert.deepEqual(pageScripts('<script src="x/y.js"></script><script>1</script>'), []);
});
