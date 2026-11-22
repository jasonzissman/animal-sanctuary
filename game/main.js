/* Game entry: builds the stage and runs the render loop. Loaded last by index.html. */
(function (root) {
  'use strict';
  var SA = root.SA;

  function start() {
    if (SA.audioUI) SA.audioUI.mount(root.document);
    var boot = root.document.getElementById('boot');
    var stage;
    try {
      stage = SA.render.createStage(root.THREE, root.document.getElementById('game'));
    } catch (e) {
      if (boot) boot.textContent = '🐾 Necesitas un navegador con WebGL';
      if (root.SAT) root.SAT.track('render.unavailable', { message: String(e && e.message).slice(0, 200) });
      return;
    }
    // Scout & Spot starts right away; a failure here must never stop the render loop.
    try { SA.prompt.start({ doc: root.document, fx: stage.fx }); } catch (e) {
      if (root.SAT) root.SAT.track('error', { message: String(e && e.message).slice(0, 200), source: 'prompt.start', line: 0, stack: String(e && e.stack).slice(0, 500) });
    }
    var last = null;
    function loop(now) {
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
      last = now;
      stage.render(dt);
      if (root.SAT) root.SAT.frame(dt);
      if (boot) { boot.parentNode.removeChild(boot); boot = null; }
      root.requestAnimationFrame(loop);
    }
    root.requestAnimationFrame(loop);
  }

  start();
})(window);
