/* SA bootstrap. Must be the FIRST game script loaded by index.html.
 *
 * Every game module is a classic script that attaches itself to the single global namespace
 * `window.SA` (e.g. SA.data, SA.clues, SA.save). No ES modules, no build step: the game runs
 * from file://. Modules must only use `window`, never bare `THREE`/DOM, unless they live in
 * game/render/, so they can be loaded into node:vm for tests (see test/helpers/vm.js).
 */
(function (root) {
  'use strict';
  root.SA = root.SA || {};
  root.SA.version = root.SA.version || '0.1.0';
})(typeof window !== 'undefined' ? window : globalThis);
