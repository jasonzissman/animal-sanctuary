/* SA.render.blockText(THREE, material, text, px) -> { group, width }: a word in 3x5 block letters made of small boxes (px = one block),
 * readable from -z (the reader's left is +x), centred on the group's origin. Shared by the station sign and the missions board.
 * Letters: A B C D E G I L M N O S T (accented Ó is drawn as O plus a tick); any other character is a gap. Pure geometry, no textures.
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
  };

  /** Number of block columns a text spans (letters are 3 wide with a 1 gap; unknown characters are a 2-wide gap). */
  function widthInBlocks(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) w += FONT[text[i].toUpperCase().replace('Ó', 'O')] ? 4 : 2;
    return Math.max(0, w - 1);
  }

  function blockText(THREE, material, text, px) {
    var g = new THREE.Group(), x = 0, word = String(text).toUpperCase().replace('Ó', 'O');
    for (var i = 0; i < word.length; i++) {
      var rows = FONT[word[i]];
      if (!rows) { x += 2 * px; continue; }
      for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) {
        if (rows[r][c] !== '1') continue;
        var b = new THREE.Mesh(new THREE.BoxGeometry(px, px, px * 0.6), material);
        b.position.set(-(x + c * px), (2 - r) * px, 0);   // -x: the text faces -z, so the reader's left is +x
        g.add(b);
      }
      if (text[i] === 'Ó') { var tick = new THREE.Mesh(new THREE.BoxGeometry(px, px, px * 0.6), material); tick.position.set(-(x + 2 * px), 3.4 * px, 0); g.add(tick); }
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
