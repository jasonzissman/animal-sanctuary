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
    function report(source, e) {
      if (root.SAT) root.SAT.track('error', { message: String(e && e.message).slice(0, 200), source: source, line: 0, stack: String(e && e.stack).slice(0, 500) });
    }
    var ctl = null, unlocks = null, hintFlow = null;
    // A soft pop on every animal / body-part pick (wrong picks also get their boing from the round/care controllers).
    try { SA.pickSfx.install(); } catch (e) { report('pickSfx.start', e); }
    // Easter eggs: hidden animals appear (fanfare + sparkles) when their data-defined condition is met.
    try {
      var flow = SA.unlockFlow.create({ group: stage.animals, fx: stage.fx, celebrate: function (msg) { if (ctl && ctl.celebrate) ctl.celebrate(msg); } });
      unlocks = SA.unlocks.create({ onUnlock: flow.reveal });
      stage.onTreeTap = function (t) { unlocks.tap('tree', t.id, t.biome); };
    } catch (e) { report('unlocks.start', e); }
    var game = null;
    try { game = SA.round.create({ biome: function () { return SA.round.biomeForX(stage.rig.getState().x); } });
      ctl = SA.prompt.start({ doc: root.document, fx: stage.fx, careFx: stage.careFx,
        onProgress: function () { if (unlocks) unlocks.check(); }, game: game }); } catch (e) { report('prompt.start', e); }
    // Gentle arrow toward the target animal when it is off-screen after ~10 s (counts as a hint when tapped).
    try { if (game) hintFlow = SA.hintFlow.create({ doc: root.document, game: game, animals: stage.animals, rig: stage.rig, camera: stage.camera }); }
    catch (e) { report('hintFlow.start', e); }
    // Habitat sandbox: a big button + prop tray; saved props come back on reload. Never blocks the main loop.
    try {
      if (SA.sandbox && stage.props) {
        var box = null;
        var view = SA.sandboxView.create(root.document, { toggle: function () { box.toggle(); }, select: function (id) { box.select(id); } });
        var setStars = function (n) { if (ctl && ctl.setStars) ctl.setStars(n); view.setStars(n); };
        box = SA.sandbox.create({
          scene: stage.props,
          view: { setActive: view.setActive, select: view.select, toast: view.toast, setStars: setStars },
          onMode: function (on) {
            SA.picking.setPaused(on);
            if (ctl && ctl.setHidden) ctl.setHidden(on);
            if (!on && ctl && ctl.setStars) ctl.setStars(SA.save.get().stars);
          }
        });
        stage.props.bind({ active: box.active, selected: box.selected, onGround: box.onGround, onPropTap: box.onPropTap });
        box.restore();
        view.setStars(SA.save.get().stars);
      }
    } catch (e) { report('sandbox.start', e); }
    // Grown-up drawer (press-and-hold gear). Never blocks the main loop.
    try { if (SA.settingsView) SA.settingsView.create(root.document); } catch (e) { report('settings.start', e); }
    var last = null;
    function loop(now) {
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
      last = now;
      stage.render(dt);
      if (hintFlow) { try { hintFlow.update(dt); } catch (e) { hintFlow = null; report('hintFlow.update', e); } }
      if (root.SAT && root.SAT.frame) { try { root.SAT.frame(dt); } catch (e) { /* telemetry never stops the loop */ } }
      if (boot) { boot.parentNode.removeChild(boot); boot = null; }
      root.requestAnimationFrame(loop);
    }
    root.requestAnimationFrame(loop);
  }

  start();
})(window);
