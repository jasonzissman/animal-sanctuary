/* SA.render.createScientist(THREE) -> { group, update(dt, player), parts }: the station scientist NPC (AS-0203). Built from the same
 * kid avatar (SA.render.createAvatar) dressed in a white lab coat, glasses, grey-streaked hair and a clipboard; primitives and
 * flat materials only. She stands at SA.npc.scientist() on the porch, never walks, idles reading the clipboard (head bowed, pen
 * hand scribbling) and waves with her free arm when SA.npc says the player is near. Pure state lives in game/npc.js.
 * update(dt, player) takes the player's { x, z } (SA.npc decides idle or wave from the distance).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  SA.render.createScientist = function (THREE) {
    var av = SA.render.createAvatar(THREE), p = av.parts, post = SA.npc.scientist(), tracker = SA.npc.create();
    av.group.name = 'scientist';
    function box(w, h, d, c, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    }
    // Lab coat: a long white box over the shirt, a collar, two dark buttons and sleeves.
    box(0.58, 0.8, 0.36, 0xf7f7f2, 0, 0.66, 0, p.body);
    box(0.3, 0.1, 0.34, 0xe3e3dc, 0, 1.1, 0.01, p.body);
    box(0.05, 0.05, 0.03, 0x555555, 0, 0.85, 0.19, p.body);
    box(0.05, 0.05, 0.03, 0x555555, 0, 0.68, 0.19, p.body);
    box(0.17, 0.4, 0.19, 0xf7f7f2, 0, -0.2, 0, p.armL);
    box(0.17, 0.4, 0.19, 0xf7f7f2, 0, -0.2, 0, p.armR);
    box(0.52, 0.06, 0.32, 0xcfd2d6, 0, 1.52, -0.02, p.body);   // grey streak in the hair
    // Glasses: dark rims, pale lenses and a bridge in front of the eyes.
    [-0.09, 0.09].forEach(function (x) {
      box(0.13, 0.11, 0.03, 0x2a2a2a, x, 1.38, 0.265, p.body);
      box(0.09, 0.07, 0.03, 0xbfe6f2, x, 1.38, 0.28, p.body);
    });
    box(0.06, 0.03, 0.03, 0x2a2a2a, 0, 1.39, 0.265, p.body);
    // Clipboard in the left hand: a brown board, a white sheet, a clip and blue scribble lines.
    var clip = new THREE.Group();
    clip.position.set(0, -0.4, 0.1);
    clip.rotation.x = -0.5;
    p.armL.add(clip);
    box(0.3, 0.38, 0.03, 0x8a5a33, 0, 0, 0, clip);
    box(0.25, 0.32, 0.02, 0xffffff, 0, -0.01, 0.02, clip);
    box(0.1, 0.05, 0.04, 0xb0b4b8, 0, 0.18, 0.02, clip);
    [0.08, 0, -0.08].forEach(function (y) { box(0.17, 0.02, 0.025, 0x4a6fa5, 0, y, 0.035, clip); });
    box(0.025, 0.14, 0.025, 0xd23b3b, 0, -0.42, 0.04, p.armR);   // pen in the right hand

    // A generous invisible pick volume (AS-0204): a tap or click near her talks. Never drawn or outlined, but still raycast.
    var pick = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(0, 1.2, 0);
    pick.visible = false;
    pick.userData = { scientist: true, pick: true };
    av.group.add(pick);

    function update(dt, player) {
      var s = tracker.update(dt, player), w = s.wave, t = s.t, read = 1 - w;
      av.update(dt, { x: post.x, y: SA.map ? SA.map.groundHeight(post.x, post.z) : 0, z: post.z, heading: post.heading, moving: false });
      // Idle: the clipboard raised in front, the head bowed over it, the pen hand scribbling, a slow nod.
      p.armL.rotation.x = -1.15 * read - 0.4 * w;
      p.armR.rotation.x = (-1.0 + Math.sin(t * 9) * 0.06) * read - 2.7 * w;
      p.armR.rotation.z = (-0.35 + Math.sin(t * 11) * 0.45) * w;   // wave: the free arm goes up and swings side to side
      p.head.rotation.x = (0.35 + Math.sin(t * 1.3) * 0.05) * read;   // wave: the head lifts toward the kid
    }
    return { group: av.group, update: update, parts: p };
  };
})(typeof window !== 'undefined' ? window : globalThis);
