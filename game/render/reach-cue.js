/* SA.render.createReachCue(THREE, { container }) -> { show(), update(dt) }
 * The friendly "¡Acércate!" bubble (SA.reach.cue(): walking icon + short Spanish phrase) shown for ~1.8 s in the HUD's
 * transient zone (SA.hud 'reachCue') when a tap was too far away. It is only a nudge: nothing is counted wrong. Thin DOM;
 * the rule itself lives in SA.reach.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SECONDS = 1.8;

  SA.render.createReachCue = function (THREE, opts) {
    var el = null, left = 0;

    function build() {
      el = root.document.createElement('div');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('data-sa-message', '1');
      el.style.cssText = 'position:fixed;z-index:3;pointer-events:none;box-sizing:border-box;justify-content:center;overflow:hidden;' +
        'display:none;align-items:center;gap:.4em;padding:0 .8em;background:#fff;color:#24543a;' +
        'border:.1em solid #24543a;border-radius:1em;box-shadow:0 .15em .6em rgba(0,0,0,.3);' +
        'font:700 1.8rem system-ui,sans-serif;white-space:nowrap;';
      opts.container.appendChild(el);
      // Rect from SA.hud 'reachCue' (transient zone). It is a HUD bubble now, not anchored above the avatar's head.
      if (SA.hudPlace) SA.hudPlace.register('reachCue', el, { onPlace: function (r) { el.style.fontSize = Math.round(r.height * 0.55) + 'px'; } });
    }

    function refresh() { if (SA.hudPlace) SA.hudPlace.refresh(); }

    return {
      // show(cue?): the "¡Acércate!" nudge, or another short { icon, es } cue (AS-0171: "¡Shh! Está durmiendo", spoken by its sender).
      show: function (custom) {
        var cue = custom || SA.reach.cue();
        if (!el) build();
        el.textContent = '';
        var icon = root.document.createElement('span'), es = root.document.createElement('span');
        icon.textContent = cue.icon;
        es.textContent = cue.es;
        el.appendChild(icon);
        el.appendChild(es);
        el.style.display = 'flex';
        left = SECONDS;
        refresh();
        if (!custom && SA.reach.speakCue) SA.reach.speakCue();   // spoken once per cue (throttled in SA.reach)
      },
      update: function (dt) {
        if (left <= 0 || !el) return;
        left -= dt;
        if (left <= 0) { el.style.display = 'none'; refresh(); }
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
