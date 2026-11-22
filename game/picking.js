/* SA.picking: pure picking logic (no THREE, no DOM; unit-tested in node:vm).
 *
 *   SA.picking.onPick(cb) -> unsubscribe fn. cb receives { animalId, part, item? } (item = equipped item id) for every confirmed tap on a part.
 *   SA.picking.emit(pick)  notifies subscribers (called by game/render/picking.js; a throwing listener never
 *                          stops the others).
 *   SA.picking.setPaused(on) while true, emit() is silent (the habitat sandbox owns taps).
 *   SA.picking.createTapTracker({ threshold }) -> { down, move, up, cancel }: tells a tap from a drag.
 *       down(id, x, y); move(id, x, y); up(id, x, y) -> { x, y } when it was a tap, else null.
 *       A pointer that moved more than `threshold` px from where it went down is a drag, never a tap, and a
 *       second pointer (pinch) cancels the tap for everyone.
 *   SA.picking.labelFor(animalId, part, english) -> { es, en|null, icon } for the label chip.
 *   SA.picking.speakPart(part) -> true when SA.audio.say('part:<key>') was called; does nothing without SA.audio.
 *   SA.picking.reactionPose(reaction, t) -> { rx, ry, rz, sx, sy, sz, py } offsets for t in [0, DURATION].
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var DRAG_THRESHOLD = 10;   // px a finger/mouse may wander and still count as a tap
  var DURATION = 0.7;        // seconds a reaction lasts

  var ICONS = {
    cabeza: '🙂', cuerpo: '🧸', orejas: '👂', ojos: '👀', hocico: '🐽', pico: '🐦', cola: '➰', patas: '🐾',
    alas: '🪶', caparazon: '🐢', cuernos: '🦌', aletas: '🐟', plumas: '🪶', nariz: '👃', joroba: '🐪', mejillas: '😊',
  };

  var listeners = [];

  function onPick(cb) {
    if (typeof cb !== 'function') throw new Error('SA.picking.onPick: callback must be a function');
    listeners.push(cb);
    return function () {
      var i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  // While paused (habitat sandbox) taps on animals are ignored by the Scout & Care loops.
  var paused = false;
  function setPaused(on) { paused = !!on; }

  function emit(pick) {
    if (paused) return;
    var out = { animalId: pick.animalId, part: pick.part };
    if (typeof pick.item === 'string' && pick.item) out.item = pick.item;   // the equipped item used on the part (Space / click / tap)
    listeners.slice().forEach(function (cb) {
      try { cb(out); } catch (e) { if (root.SAT && root.SAT.error) root.SAT.error(e); }
    });
  }

  // Rubbing: while a care task is active, dragging a pressed pointer over the target part counts as a rub.
  var rubTarget = null;
  function setRubTarget(animalId, part) { rubTarget = animalId && part ? { animalId: animalId, part: part } : null; }
  function hasRubTarget() { return !!rubTarget; }
  function isRubTarget(hit) {
    return !!(rubTarget && hit && hit.animalId === rubTarget.animalId && hit.part === rubTarget.part);
  }

  function createTapTracker(opts) {
    var threshold = (opts && opts.threshold) || DRAG_THRESHOLD;
    var active = {}, count = 0, spoiled = false;

    function ids() { return Object.keys(active); }

    return {
      down: function (id, x, y) {
        if (!count) spoiled = false;
        active[id] = { x: x, y: y };
        count = ids().length;
        if (count > 1) spoiled = true;     // two fingers = pinch/zoom, not a tap
      },
      move: function (id, x, y) {
        var p = active[id];
        if (p && Math.sqrt((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)) > threshold) spoiled = true;
      },
      up: function (id, x, y) {
        var p = active[id];
        if (!p) return null;
        this.move(id, x, y);
        delete active[id];
        count = ids().length;
        var tap = !spoiled;
        if (!count) spoiled = false;
        return tap ? { x: x, y: y } : null;
      },
      cancel: function () { active = {}; count = 0; spoiled = false; },
    };
  }

  function labelFor(animalId, part, english) {
    var def = SA.data.get('parts', part);
    if (!def) return null;
    return { es: def.label.es, en: english ? def.label.en : null, icon: ICONS[part] || '🐾', animalId: animalId };
  }

  function speakPart(part) {
    if (!part || !SA.audio || typeof SA.audio.say !== 'function') return false;
    SA.audio.say('part:' + part);
    return true;
  }

  // Decaying wave: 0 at t=0 and t=DURATION, so a reaction always ends back at rest.
  function pulse(t) {
    var k = Math.max(0, Math.min(1, t / DURATION));
    return Math.sin(k * Math.PI * 4) * (1 - k);
  }

  function reactionPose(reaction, t) {
    var w = pulse(t), pose = { rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, py: 0 };
    var k = Math.max(0, Math.min(1, t / DURATION)), hop = Math.sin(k * Math.PI);
    switch (reaction) {
      case 'wiggle': pose.rz = w * 0.5; break;
      case 'flap': pose.rz = w * 0.7; pose.rx = w * 0.2; break;
      case 'boing': pose.sy = 1 + w * 0.3; pose.sx = pose.sz = 1 - w * 0.15; pose.py = hop * 0.15; break;
      case 'sniff': pose.sx = pose.sy = pose.sz = 1 + Math.abs(w) * 0.2; break;
      case 'blink': pose.sy = 1 - Math.abs(w) * 0.8; break;
      case 'swish': pose.ry = w * 0.6; break;
      case 'stomp': pose.py = -Math.abs(w) * 0.12; pose.sy = 1 - Math.abs(w) * 0.15; break;
      case 'nod': pose.rx = w * 0.4; break;
      default: pose.rz = w * 0.3; pose.rx = w * 0.15; break;   // wobble
    }
    return pose;
  }

  SA.picking = {
    DRAG_THRESHOLD: DRAG_THRESHOLD, DURATION: DURATION, ICONS: ICONS,
    setRubTarget: setRubTarget, hasRubTarget: hasRubTarget, isRubTarget: isRubTarget, onPick: onPick, emit: emit, setPaused: setPaused, isPaused: function () { return paused; }, createTapTracker: createTapTracker, labelFor: labelFor, speakPart: speakPart, reactionPose: reactionPose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
