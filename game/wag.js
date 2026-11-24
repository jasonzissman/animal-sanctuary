/* SA.wag: the data-driven happy tail-wag and mood sounds (AS-0318). Pure: no THREE, no DOM; it only reads and writes the
 * position and quaternion of the part meshes of an animal group (plain {x,y,z} / {x,y,z,w,set()} shapes), so it runs against stubs.
 *
 * An animal row may declare  wag: { part, angle, hz }  and  sounds: { sad: '<SA.audio sfx name>' }  (see game/data/animals.js).
 * Nothing here knows an animal id: a mission just calls
 *   SA.wag.apply(group, seconds)   every frame while it wants the tail going (group.userData.animalId finds the row),
 *   SA.wag.rest(group)             to put the tail back (call it when the wag stops),
 *   SA.wag.sound(animal, 'sad')    -> the sfx name to give SA.audio.sfx() (or null).
 * The wag swings the tail side to side: it turns around the animal's up axis (the parent's Y) through the tail's BASE, i.e. the
 * lower end of the tail piece (a unit primitive stretched along its local y, whatever its tilt), so the tip sweeps left and right.
 * (Spinning the tilted cylinder around its own long axis would look like nothing.) The first apply() remembers each mesh's rest
 * position and quaternion in userData.wagRest; every later apply() swings from that rest pose, never cumulatively.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function row(animalOrId) {
    var a = typeof animalOrId === 'string' ? SA.data.get('animals', animalOrId) : animalOrId;
    return a && typeof a === 'object' ? a : null;
  }

  // Swing of the tail at time t (seconds): angle * sin(2*pi*hz*t); 0 for an animal that does not wag or a bad time.
  function angle(animalOrId, t) {
    var a = row(animalOrId);
    if (!a || !a.wag || typeof t !== 'number' || !isFinite(t)) return 0;
    return a.wag.angle * Math.sin(2 * Math.PI * a.wag.hz * t);
  }

  function tailMeshes(group) {
    var a = group && group.userData ? row(group.userData.animalId) : null;
    if (!a || !a.wag) return [];
    return (group.children || []).filter(function (m) {
      return m.userData && m.userData.part === a.wag.part && !m.userData.pick && m.position && m.quaternion && m.scale;
    });
  }

  function qmul(a, b) {   // quaternion product a*b as [x, y, z, w]
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  }

  function remember(m) {
    if (m.userData.wagRest) return m.userData.wagRest;
    var q = [m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w];
    var up = qmul(qmul(q, [0, 1, 0, 0]), [-q[0], -q[1], -q[2], q[3]]);   // q * (0,1,0) * conj(q): where the piece's long axis points
    var h = 0.5 * m.scale.y;
    var p = [m.position.x, m.position.y, m.position.z];
    return (m.userData.wagRest = { p: p, q: q, pivot: [p[0] - up[0] * h, p[1] - up[1] * h, p[2] - up[2] * h] });
  }

  function pose(m, theta) {
    var r = remember(m), c = Math.cos(theta), s = Math.sin(theta);
    var dx = r.p[0] - r.pivot[0], dz = r.p[2] - r.pivot[2];
    var q = qmul([0, Math.sin(theta / 2), 0, Math.cos(theta / 2)], r.q);
    m.position.set(r.pivot[0] + dx * c + dz * s, r.p[1], r.pivot[2] - dx * s + dz * c);
    m.quaternion.set(q[0], q[1], q[2], q[3]);
  }

  // Wags the group's tail meshes (the extras tagged with the same part too) at time t. Returns true if anything moved.
  function apply(group, t) {
    var a = group && group.userData ? row(group.userData.animalId) : null;
    var meshes = tailMeshes(group);
    meshes.forEach(function (m) { pose(m, angle(a, t)); });
    return meshes.length > 0;
  }

  // Puts the tail meshes back to the pose they had before the first apply().
  function rest(group) {
    tailMeshes(group).forEach(function (m) { if (m.userData.wagRest) pose(m, 0); });
  }

  // The sfx name for a mood ('sad') of an animal row or id, or null.
  function sound(animalOrId, mood) {
    var a = row(animalOrId);
    return a && a.sounds && typeof a.sounds[mood] === 'string' ? a.sounds[mood] : null;
  }

  SA.wag = { angle: angle, apply: apply, rest: rest, sound: sound };
})(typeof window !== 'undefined' ? window : globalThis);
