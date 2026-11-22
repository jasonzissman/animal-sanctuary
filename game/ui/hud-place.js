/* SA.hudPlace: the DOM glue between SA.hud (pure layout) and the fixed HUD elements. No THREE. Harmless without a DOM.
 *
 *   SA.hudPlace.register(id, el, opts?) -> { refresh() }
 *       Puts `el` (already position:fixed) at SA.hud.layout(viewport, visibleIds)[id] and keeps it there: on window resize and
 *       whenever a module calls SA.hudPlace.refresh() after showing/hiding something. opts.reserve keeps the slot reserved
 *       while the element is display:none (touch buttons never jump when a neighbour appears); opts.onPlace(rect, mode) lets
 *       the module size its children (font, slots, knob) from the rect.
 *   SA.hudPlace.refresh()       re-run the layout for every registered element
 *   SA.hudPlace.layout()        the last layout (rect per id); parked rects of unregistered ids are the all-visible ones
 *   SA.hudPlace.viewport()      { width, height } in CSS px
 *   SA.hudPlace.nudge(rect)     a copy of `rect` moved clear of every other HUD rect (for the roaming hint arrow)
 * Ids that are not registered here (the prompt, stars, toast, snapshot and feed tray are placed by ui/prompt.js) count as
 * visible, so what is laid out here never collides with them.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var items = {}, last = null, bound = false;

  function viewport() {
    var d = (root.document && root.document.documentElement) || {};
    return { width: root.innerWidth || d.clientWidth || 1280, height: root.innerHeight || d.clientHeight || 800 };
  }

  function shown(it) { return it.opts.reserve || it.el.style.display !== 'none'; }

  function refresh() {
    if (!SA.hud) return null;
    var vp = viewport();
    var vis = SA.hud.IDS.filter(function (id) { return !items[id] || shown(items[id]); });
    last = SA.hud.layout(vp, vis);
    var mode = SA.hud.mode(vp);
    Object.keys(items).forEach(function (id) {
      var it = items[id], r = last[id], s = it.el.style;
      s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px';
      if (it.opts.onPlace) it.opts.onPlace(r, mode);
    });
    return last;
  }

  function register(id, el, opts) {
    var none = { refresh: function () {} };
    if (!SA.hud || !el || !el.style || SA.hud.IDS.indexOf(id) < 0) return none;
    items[id] = { el: el, opts: opts || {} };
    if (!bound && typeof root.addEventListener === 'function') { bound = true; root.addEventListener('resize', refresh); }
    refresh();
    return { refresh: refresh };
  }

  function layout() { return last || refresh() || {}; }

  function nudge(rect) {
    var vp = viewport(), L = layout();
    var others = SA.hud.IDS.filter(function (id) { return SA.hud.ZONES.floating.indexOf(id) < 0 && L[id]; }).map(function (id) { return L[id]; });
    return SA.hud.nudge(rect, others, vp.width, vp.height);
  }

  SA.hudPlace = { register: register, refresh: refresh, layout: layout, viewport: viewport, nudge: nudge };
})(typeof window !== 'undefined' ? window : globalThis);
