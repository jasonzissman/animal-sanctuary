// Loads classic game scripts (game/*.js) into a node:vm context with a fake `window`,
// so pure game logic is unit-testable without a browser, THREE or a DOM.
//   const SA = loadGame(['game/sa.js', 'game/data-registry.js']);
// Paths are relative to the repo root. Each call returns a fresh, isolated SA.
// `extraGlobals` (optional) are added to the context, e.g. { localStorage: stub }.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadGame(files, extraGlobals = {}) {
  const ctx = vm.createContext({ console, ...extraGlobals });
  ctx.window = ctx;
  for (const file of files) {
    const abs = path.resolve(ROOT, file);
    vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: abs });
  }
  return ctx.window.SA;
}
