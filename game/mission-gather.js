/* SA.missionGather: Mission 9's building materials (AS-0351, slice 2 of AS-0188: Construir un hogar). Pure (no THREE, no DOM; unit-tested in node:vm).
 * A mission row declares `home.gather: [{ item, n, say? }, ...]` (game/data/missions.js) and one 'collect' step { item, n } per entry. Each entry
 * is its own SA.missionBananas instance (the same pickup machinery as Mission 4's plátanos and Mission 8's fresas, with `bag: true`): `n` pickups
 * lie on dry ground in a ring around the build spot (SA.missionHome), exist ONLY while that mission runs, stand (and can be picked up) ONLY while
 * their own collect step is current, go into the inventory and speak the item's word ('item:palo' = "el palo"; `say` overrides the key).
 * Nothing here knows a mission id or an item id.
 *
 *   SA.missionGather.update(player)  polled each frame (SA.missionRuntime calls it): every instance syncs and picks up
 *   SA.missionGather.locate(id)      -> { x, z, r } | null    the nearest untaken pickup of that item
 *   SA.missionGather.target(step)    -> { x, z, role, id } | null   compass: the next pickup of the current collect step
 *   SA.missionGather.things()        the instances (the renderer draws one group per instance, each draws only while its step is current)
 *   SA.missionGather.visible()       -> every untaken pickup on the map that is standing right now (shown() instances only)
 *   SA.missionGather.create({ missions?, audio?, report?, track?, solids?, inventory?, home? })   a separate instance (tests)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var POOL = 4;           // matches the validator's cap on home.gather
  var REACH = 2.6;        // a generous walk-over radius (small hands, big targets); the bananas use 1.6

  function create(opts) {
    opts = opts || {};
    var things = [], solidsSrc = opts.solids || null;
    function home() { return opts.home || SA.missionHome; }
    // The build spot, plus the spots of the kinds before this one (so walking off a finished kind never auto-picks the next kind up).
    function anchorOf(i) {
      return function () {
        var h = home(), c = h && h.sync ? h.sync() : null;
        if (!c || !c.spot) return null;
        var avoid = [];
        for (var k = 0; k < i; k++) { var cur = things[k].current(); if (cur) avoid = avoid.concat(cur.items); }
        return { x: c.spot.x, z: c.spot.z, avoid: avoid };
      };
    }
    function specOf(i) {
      return function (m) {
        var g = m && m.home && m.home.gather && m.home.gather[i];
        return g ? { item: g.item, n: g.n, biome: m.home.biome || 'bosque', bag: true, reach: REACH, say: g.say || 'item:' + g.item } : null;
      };
    }
    for (var i = 0; i < POOL; i++) {
      things.push(SA.missionBananas.create({ missions: opts.missions, audio: opts.audio, report: opts.report, track: opts.track, inventory: opts.inventory,
        solids: function () { return typeof solidsSrc === 'function' ? solidsSrc() : solidsSrc || []; }, specOf: specOf(i), anchor: anchorOf(i) }));
    }

    function first(fn, arg) {
      for (var k = 0; k < things.length; k++) { var r = things[k][fn](arg); if (r) return r; }
      return null;
    }
    function update(player, o) { things.forEach(function (t) { t.update(player, o); }); }
    function visible() {
      return things.reduce(function (all, t) { return all.concat(t.shown() ? t.visible() : []); }, []);
    }

    return { update: update, locate: function (id) { return first('locate', id); }, target: function (s, from) { return things.reduce(function (r, t) { return r || t.target(s, from); }, null); },
      things: function () { return things.slice(); }, visible: visible, sync: function () { things.forEach(function (t) { t.sync(); }); },
      setSolids: function (s) { solidsSrc = s; }, create: create };
  }

  var api = create();
  SA.missionGather = api;
})(typeof window !== 'undefined' ? window : globalThis);
