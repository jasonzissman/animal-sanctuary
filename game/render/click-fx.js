/* SA.render.createClickFx({ container }) -> { ripple(clientX, clientY), update(dt) }
 * A small white ring that expands and fades where the player clicked or tapped when nothing was picked (gentle feedback,
 * never a penalty). Plain DOM, pointer-events none; the shape of the animation is SA.clickOutcome.ripplePose.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  SA.render = SA.render || {};

  var SIZE = 56;   // px at scale 1

  SA.render.createClickFx = function (opts) {
    var container = opts.container || root.document.body;
    var live = [];   // { el, t }

    function pose(r) {
      var p = SA.clickOutcome.ripplePose(r.t);
      if (!p) return false;
      r.el.style.opacity = String(p.opacity);
      r.el.style.transform = 'translate(-50%,-50%) scale(' + p.scale + ')';
      return true;
    }

    return {
      ripple: function (x, y) {
        var el = root.document.createElement('div');
        el.style.cssText = 'position:fixed;z-index:3;pointer-events:none;border-radius:50%;box-sizing:border-box;' +
          'width:' + SIZE + 'px;height:' + SIZE + 'px;border:4px solid #fff;box-shadow:0 0 .6em rgba(0,0,0,.3);' +
          'left:' + x + 'px;top:' + y + 'px;';
        container.appendChild(el);
        var r = { el: el, t: 0 };
        live.push(r);
        pose(r);
        if (live.length > 6) { var old = live.shift(); if (old.el.parentNode) old.el.parentNode.removeChild(old.el); }
      },
      update: function (dt) {
        live = live.filter(function (r) {
          r.t += dt;
          if (pose(r)) return true;
          if (r.el.parentNode) r.el.parentNode.removeChild(r.el);
          return false;
        });
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
