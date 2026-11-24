/* SA.render.instances: finds the animal GROUP of a species or of one herd instance (AS-0255). No THREE, no DOM.
 * Every group from buildAnimals is named by its instanceId ('conejo#2') and has userData { animalId, instanceId }; a story
 * animal placed by a mission keeps its animal id as name and instanceId.
 *
 *   inst.byId(animals, instanceId)     the group named instanceId, or null
 *   inst.of(animals, animalId)         every group of that species (array, may be empty)
 *   inst.get(animals, key)             the group for `key`: an instanceId, else the species' one instance. A species id resolves to
 *                                      the instance tapped last (inst.tapped, for TAPPED_MS), else the one nearest inst.near, else the first.
 *   inst.tapped(animalId, instanceId)  remember the instance the player just tapped, so species-keyed reactions play on it
 *   inst.setNear(x, z)                 the player's position (set each frame by the nearby-task gate); null clears it
 *   inst.keyOf(g)                      the instance key of a group (its name)
 *   inst.reset()                       forget taps and the player position (tests)
 * `inst.now` (default Date.now) is the clock for TAPPED_MS.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var TAPPED_MS = 8000;
  var last = {};            // animalId -> { id, at }
  var near = null;          // { x, z }

  function kids(animals) { return (animals && animals.children) || []; }

  function byId(animals, id) {
    var c = kids(animals);
    for (var i = 0; i < c.length; i++) if (c[i].name === id) return c[i];
    return null;
  }

  function of(animals, animalId) {
    return kids(animals).filter(function (g) { return g.userData && g.userData.animalId === animalId; });
  }

  function get(animals, key) {
    if (!key) return null;
    var exact = byId(animals, key);
    if (exact) return exact;
    var list = of(animals, key);
    if (!list.length) return animals && animals.getObjectByName ? animals.getObjectByName(key) || null : null;   // e.g. a story animal elsewhere in the group, or a stub
    var t = last[key];
    if (t && inst.now() - t.at < TAPPED_MS) { var g = byId(animals, t.id); if (g) return g; }
    if (near) {
      var best = list[0], bd = Infinity;
      list.forEach(function (c) {
        var d = Math.hypot(c.position.x - near.x, c.position.z - near.z);
        if (c.visible !== false && d < bd) { bd = d; best = c; }
      });
      return best;
    }
    return list[0];
  }

  var inst = SA.render.instances = {
    TAPPED_MS: TAPPED_MS, now: function () { return Date.now(); },
    byId: byId, of: of, get: get,
    tapped: function (animalId, instanceId) { if (animalId && instanceId) last[animalId] = { id: instanceId, at: inst.now() }; },
    setNear: function (x, z) { if (x === null || x === undefined) near = null; else { near = near || { x: 0, z: 0 }; near.x = x; near.z = z; } },
    keyOf: function (g) { return g ? g.name : null; },
    reset: function () { last = {}; near = null; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
