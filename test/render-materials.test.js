import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'render');

// three.js r128: MeshLambertMaterial has no `flatShading` (it logs a console warning per material).
// Faceted looks must use MeshPhongMaterial (or Standard) with flatShading:true.
test('no render module passes flatShading to MeshLambertMaterial (r128 warns)', () => {
  const bad = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const re = /MeshLambertMaterial\(\s*\{[^}]*flatShading/g;
    if (re.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test('flatShading materials use MeshPhongMaterial', () => {
  for (const f of ['animals.js', 'decor.js', 'decor-dry.js', 'world.js']) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.match(src, /MeshPhongMaterial\([^)]*flatShading: true/, f);
  }
});
