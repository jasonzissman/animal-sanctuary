/* SA.carry: what the kid is carrying for a mission, the fragile wobble, and dropping it off (AS-0231, slice 3 of AS-0178).
 * Pure logic (no THREE, no DOM; unit-tested in node:vm). A carried thing is either an inventory item in hand (SA.inventory,
 * SA.hotbar, render/hand-item.js show it) or an animal / mission thing held in the carry slot. The mission steps are data rows
 * in game/data/step-kinds.js: 'carry' {item, fragile?} is satisfied while the player holds `item`; 'deliver' {item, to} when the
 * player brings it within range of `to` and drops it there. SA.missionRuntime.update() polls this each frame.
 *
 *   SA.carry.pickUp(id, { fragile? })   hold id: a known item is added and equipped (hand model), anything else (an animal) fills
 *                                       the slot. -> true when now held
 *   SA.carry.holds(id?)                 true when id (or, with no id, anything) is held: the slot or the equipped item
 *   SA.carry.mark(id, fragile)          flag the held id as fragile (a carry step with fragile: true does this); false when not held
 *   SA.carry.fragile()                  the held thing is fragile
 *   SA.carry.jumped()                   the kid jumped: starts the wobble when carrying a fragile thing. It is only a reaction:
 *                                       it never drops the item, fails or resets a step.
 *   SA.carry.update(dt, player?)        advance the wobble; player.jump 'takeoff' | 'double' (SA.jump events) triggers jumped()
 *   SA.carry.wobble()                   -> { active, angle, tilt, t } pure animation state (radians) for render/hand-item.js
 *   SA.carry.drop()                     let go of it (removes an inventory item) -> the dropped id or null
 *   SA.carry.deliver(player, step, locate)  step is a deliver step; locate(id) -> { x, z, r? }. When the held item is within range
 *                                       of the target it is dropped there -> { item, to } (the event to report), else null.
 *   SA.carry.create(opts)               a separate instance (tests): { inventory?, track? }
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var REACH = 2.5;             // default drop-off radius when locate() gives none
  var DURATION = 0.9;          // seconds the wobble lasts
  var FREQ = 16;               // wobble speed (rad/s)
  var MAX = 0.55;              // peak swing (radians)

  function create(opts) {
    opts = opts || {};
    var slot = null;                       // { id, fragile } for the held thing
    var t = DURATION;                      // seconds since the wobble started (>= DURATION: still)
    var prevJump = null;
    function inv() { return opts.inventory || SA.inventory || null; }
    function known(id) { return !!(SA.data && SA.data.get && SA.data.get('items', id)); }
    function equipped() { var i = inv(); try { return i ? i.equipped() : null; } catch (e) { return null; } }
    function track(type, f) {
      try { if (opts.track) opts.track(type, f); else if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ }
    }

    function holds(id) {
      if (id === undefined) return !!slot || !!equipped();
      return typeof id === 'string' && ((!!slot && slot.id === id) || equipped() === id);
    }

    function pickUp(id, o) {
      if (typeof id !== 'string' || !id) return false;
      var i = inv();
      if (i && known(id)) { if (!i.has(id)) i.add(id); i.equip(id); }
      slot = { id: id, fragile: !!(o && o.fragile) };
      return holds(id);
    }

    function mark(id, fragile) {
      if (!holds(id)) return false;
      slot = { id: id, fragile: !!fragile };
      return true;
    }

    function fragile() { return !!slot && slot.fragile && holds(slot.id); }

    function jumped() {
      if (!fragile()) return false;
      t = 0;
      track('carry.wobble', { item: slot.id });
      return true;
    }

    function update(dt, player) {
      var ev = player ? player.jump : null;
      if (ev && ev !== prevJump && (ev === 'takeoff' || ev === 'double')) jumped();
      prevJump = ev || null;
      if (t < DURATION) t = Math.min(DURATION, t + Math.max(0, Math.min(0.1, dt || 0)));
    }

    function wobble() {
      if (t >= DURATION) return { active: false, angle: 0, tilt: 0, t: t };
      var fade = 1 - t / DURATION;
      return { active: true, angle: Math.sin(t * FREQ) * MAX * fade, tilt: Math.cos(t * FREQ * 0.7) * MAX * 0.4 * fade, t: t };
    }

    function drop() {
      var id = slot ? slot.id : equipped();
      if (!id) return null;
      var i = inv();
      if (i && known(id) && i.has(id)) i.remove(id);
      slot = null;
      t = DURATION;
      return id;
    }

    function deliver(player, step, locate) {
      if (!player || !step || typeof locate !== 'function' || !holds(step.item)) return null;
      var at = locate(step.to);
      if (!at || Math.hypot(player.x - at.x, player.z - at.z) > (at.r || REACH)) return null;
      drop();
      track('carry.deliver', { item: step.item, to: step.to });
      return { item: step.item, to: step.to };
    }

    return { pickUp: pickUp, holds: holds, mark: mark, fragile: fragile, jumped: jumped, update: update, wobble: wobble, drop: drop,
      deliver: deliver, create: create, REACH: REACH, DURATION: DURATION };
  }

  SA.carry = create();
})(typeof window !== 'undefined' ? window : globalThis);
