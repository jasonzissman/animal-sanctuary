/* Intro data: registers kind "intro" (SA.data): the scientist's first conversation on a new game (AS-0202). Pure data.
 * One row per spoken line, in order (n = 1, 2, ...). Logic is game/intro-dialogue.js, the overlay is game/ui/intro-view.js.
 *   id        unique lowercase key
 *   n         1-based position; rows are contiguous
 *   es        the short Spanish subtitle, at most 6 words (the same text as the vocab entry, so it is spoken as written)
 *   icon      the picture card (emoji, up to 10 UTF-16 units)
 *   vocabKey  key in game/data/vocab.js that SA.audio.say plays (clip, else speechSynthesis)
 * Order of ideas: who you are, the problem, what to do (busca / ayuda / foto), then ¡Vamos! to the Misiones board.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var MAX_WORDS = 6;

  function validateIntro(l) {
    if (!/^[a-z][a-z0-9-]*$/.test(l.id)) fail('id', 'must be lowercase ASCII letters, digits or "-"');
    if (typeof l.n !== 'number' || l.n < 1 || l.n !== Math.floor(l.n)) fail('n', 'must be a whole number >= 1');
    if (typeof l.es !== 'string' || !l.es.trim()) fail('es', 'must be a non-empty string');
    if (l.es.trim().split(/\s+/).length > MAX_WORDS) fail('es', 'must be at most ' + MAX_WORDS + ' words (kids do not read walls of text)');
    if (typeof l.icon !== 'string' || !l.icon.trim() || l.icon.length > 10) fail('icon', 'must be a short emoji string for the picture card');
    if (typeof l.vocabKey !== 'string' || !/^[a-z]+:\S+$/.test(l.vocabKey)) fail('vocabKey', 'must be a vocab key like "phrase:introhola"');
  }

  SA.data.defineKind('intro', validateIntro);
  SA.data.register('intro', [
    { id: 'hola', n: 1, es: '¡Hola! Eres mi ayudante.', icon: '👋', vocabKey: 'phrase:introhola' },
    { id: 'ayuda', n: 2, es: 'Los animales necesitan ayuda.', icon: '🐰🩹', vocabKey: 'phrase:introayuda' },
    { id: 'plan', n: 3, es: 'Busca, ayuda y toma una foto.', icon: '🔍🩹🍎📷', vocabKey: 'phrase:introplan' },
    { id: 'vamos', n: 4, es: '¡Vamos a las misiones!', icon: '👉📋', vocabKey: 'phrase:introvamos' }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
