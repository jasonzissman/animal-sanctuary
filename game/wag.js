/* SA.wag: the data-driven happy tail-wag and mood sounds (AS-0318). Pure: no THREE, no DOM; it only reads and writes
 * `rotation.y` of the part meshes of an animal group, so it runs against stubs in node:vm.
 *
 * An animal row may declare  wag: { part, angle, hz }  and  sounds: { sad: '<SA.audio sfx name>' }  (see game/data/animals.js).
 * Nothing here knows an animal id: a mission just calls
 *   SA.wag.apply(group, seconds)   every frame while it wants the tail going (group.userData.animalId finds the row),
 *   SA.wag.rest(group)             to put the tail back (call it when the wag stops),
 *   SA.wag.sound(animal, 'sad')    -> the sfx name to give SA.audio.sfx() (or null).
 * The first apply() remembers each wagging mesh's own rotation.y in userData.restY, and the wag swings around it.
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
      return m.userData && m.userData.part === a.wag.part && !m.userData.pick && m.rotation;
    });
  }

  // Wags the group's tail meshes (the extras tagged with the same part too) at time t. Returns true if anything moved.
  function apply(group, t) {
    var a = group && group.userData ? row(group.userData.animalId) : null;
    var meshes = tailMeshes(group);
    meshes.forEach(function (m) {
      if (typeof m.userData.restY !== 'number') m.userData.restY = m.rotation.y;
      m.rotation.y = m.userData.restY + angle(a, t);
    });
    return meshes.length > 0;
  }

  // Puts the tail meshes back to the rotation they had before the first apply().
  function rest(group) {
    tailMeshes(group).forEach(function (m) {
      if (typeof m.userData.restY === 'number') m.rotation.y = m.userData.restY;
    });
  }

  // The sfx name for a mood ('sad') of an animal row or id, or null.
  function sound(animalOrId, mood) {
    var a = row(animalOrId);
    return a && a.sounds && typeof a.sounds[mood] === 'string' ? a.sounds[mood] : null;
  }

  SA.wag = { angle: angle, apply: apply, rest: rest, sound: sound };
})(typeof window !== 'undefined' ? window : globalThis);
