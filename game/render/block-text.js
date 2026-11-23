/* SA.render.blockText(THREE, material, text, px) -> { group, width }: a word in 3x5 block letters made of small boxes (px = one block),
 * readable from -z (the reader's left is +x), centred on the group's origin. Shared by the station sign and the missions board.
 * Letters: A-Z (accented Á É Í Ó Ú Ñ are drawn as the plain letter plus a tick); any other character is a gap. Pure geometry, no textures.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  // Rows top to bottom; 1 = a small box. M uses a 3-wide shape (a blocky "M").
  var FONT = {
    A: ['010', '101', '111', '101', '101'], C: ['111', '100', '100', '100', '111'], D: ['110', '101', '101', '101', '110'],
    E: ['111', '100', '111', '100', '111'], I: ['111', '010', '010', '010', '111'], L: ['100', '100', '100', '100', '111'],
    M: ['101', '111', '111', '101', '101'], N: ['101', '111', '111', '111', '101'], O: ['111', '101', '101', '101', '111'],
    S: ['111', '100', '111', '001', '111'], T: ['111', '010', '010', '010', '010'],
    B: ['110', '101', '110', '101', '110'], G: ['111', '100', '101', '101', '111'],   // for "Insignias" / "Badges" (AS-0239)
    // The rest of the alphabet, so the photo board can spell any animal name (AS-0207).
    F: ['111', '100', '110', '100', '100'], H: ['101', '101', '111', '101', '101'], J: ['001', '001', '001', '101', '111'],
    K: ['101', '101', '110', '101', '101'], P: ['111', '101', '111', '100', '100'], Q: ['111', '101', '101', '111', '001'],
    R: ['110', '101', '110', '101', '101'], U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
    W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'], Y: ['101', '101', '010', '010', '010'],
    Z: ['111', '001', '010', '100', '111'],
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['110', '001', '010', '100', '111'],
    3: ['110', '001', '010', '001', '110'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
    6: ['011', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '110'],
  };
  var TICKED = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N' };   // accented letters: the plain letter plus a tick above
  function plain(ch) { ch = ch.toUpperCase(); return TICKED[ch] || ch; }

  /** Number of block columns a text spans (letters are 3 wide with a 1 gap; unknown characters are a 2-wide gap). */
  function widthInBlocks(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += FONT[plain(text[i])] ? 4 : 2;
    return Math.max(0, w - 1);
  }

  function blockText(THREE, material, text, px) {
    var g = new THREE.Group(), x = 0, word = String(text).toUpperCase();
    for (var i = 0; i < word.length; i++) {
      var rows = FONT[plain(word[i])];
      if (!rows) { x += 2 * px; continue; }
      for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) {
        if (rows[r][c] !== '1') continue;
        var b = new THREE.Mesh(new THREE.BoxGeometry(px, px, px * 0.6), material);
        b.position.set(-(x + c * px), (2 - r) * px, 0);   // -x: the text faces -z, so the reader's left is +x
        g.add(b);
      }
      if (TICKED[word[i]]) { var tick = new THREE.Mesh(new THREE.BoxGeometry(px, px, px * 0.6), material); tick.position.set(-(x + 2 * px), 3.4 * px, 0); g.add(tick); }
      x += 4 * px;
    }
    g.position.x = (x - px) / 2;   // centre
    var holder = new THREE.Group();
    holder.add(g);
    return { group: holder, width: x - px };
  }

  SA.render.blockText = blockText;
  SA.render.blockTextFont = FONT;
  SA.render.blockTextBlocks = widthInBlocks;
})(typeof window !== 'undefined' ? window : globalThis);
