/* SA.render.createReachCue(THREE, { camera, container, getPlayer }) -> { show(), update(dt) }
 * The friendly "¡Acércate!" speech bubble (SA.reach.cue(): walking icon + short Spanish phrase) that floats above the
 * avatar's head for ~1.8 s when a tap was too far away. It is only a nudge: nothing is counted wrong. Thin DOM + a
 * projection of the player's position; the rule itself lives in SA.reach.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SECONDS = 1.8, HEAD_Y = 2.3;

  SA.render.createReachCue = function (THREE, opts) {
    var el = null, left = 0, v = new THREE.Vector3();

    function build() {
      el = root.document.createElement('div');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-100%);z-index:3;pointer-events:none;' +
        'display:none;align-items:center;gap:.4em;padding:.3em .8em;background:#fff;color:#24543a;' +
        'border:.1em solid #24543a;border-radius:1em;box-shadow:0 .15em .6em rgba(0,0,0,.3);' +
        'font:700 1.8rem system-ui,sans-serif;white-space:nowrap;';
      opts.container.appendChild(el);
    }

    function place() {
      var p = opts.getPlayer && opts.getPlayer();
      if (!p) return;
      v.set(p.x, HEAD_Y, p.z).project(opts.camera);
      if (v.z > 1) return;
      el.style.left = ((v.x + 1) / 2 * 100) + '%';
      el.style.top = ((1 - v.y) / 2 * 100) + '%';
    }

    return {
      show: function () {
        var cue = SA.reach.cue();
        if (!el) build();
        el.textContent = '';
        var icon = root.document.createElement('span'), es = root.document.createElement('span');
        icon.textContent = cue.icon;
        es.textContent = cue.es;
        el.appendChild(icon);
        el.appendChild(es);
        el.style.display = 'flex';
        left = SECONDS;
        place();
      },
      update: function (dt) {
        if (left <= 0 || !el) return;
        left -= dt;
        if (left <= 0) el.style.display = 'none'; else place();
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
