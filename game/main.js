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
      var flow = SA.unlockFlow.create({ group: stage.animals, fx: stage.fx, rig: stage.rig, celebrate: function (msg) { if (ctl && ctl.celebrate) ctl.celebrate(msg); } });
      unlocks = SA.unlocks.create({ onUnlock: flow.reveal });
      stage.onTreeTap = function (t) {
        unlocks.tap('tree', t.id, t.biome);
        if (SA.treeCue.shouldSparkle(unlocks.tapCount('tree', t.id, t.biome)) && stage.treeTap.sparkle) stage.treeTap.sparkle(t.id);
      };
    } catch (e) { report('unlocks.start', e); }
    var game = null;
    try { game = SA.round.create({ biome: function () { return SA.round.biomeForRig(stage.rig); } });
      ctl = SA.prompt.start({ doc: root.document, fx: stage.fx, careFx: stage.careFx, biomeFx: stage.biomeGlow,
        onProgress: function () { if (unlocks) unlocks.check(); }, game: game }); } catch (e) { report('prompt.start', e); }
    // Gentle arrow toward the target animal when it is off-screen after ~10 s (counts as a hint when tapped).
    try { if (game) hintFlow = SA.hintFlow.create({ doc: root.document, game: game, animals: stage.animals, rig: stage.rig, camera: stage.camera }); }
    catch (e) { report('hintFlow.start', e); }
    // Camera settles in another biome for ~2 s with no pick yet: gently start a new round from there.
    var rerollWatch = null;
    try {
      if (game && ctl && SA.reroll) {
        rerollWatch = SA.reroll.createWatcher({ game: game,
          biome: function () { return SA.round.biomeForRig(stage.rig); },
          canReroll: function () { return ctl.canReroll() && !SA.picking.isPaused(); },
          onReroll: function () { ctl.reroll(); } });
      }
    } catch (e) { report('reroll.start', e); }
    // Icon-only rotate/tilt buttons so touch players can orbit the camera (same path as Q/E/R/F).
    try { if (SA.orbitPad) SA.orbitPad.create(root.document, stage.rig); } catch (e) { report('orbitPad.start', e); }
    // Virtual joystick (bottom-left, shown at the first touch) so touch players can walk without a keyboard.
    try { if (SA.joystickView) SA.joystickView.create(root.document, stage.rig, root); } catch (e) { report('joystick.start', e); }
    // Icon-only climb button: 🧗 next to a tree, ⬇️ while up one (same as Space / C).
    var climbBtn = null;
    try { if (SA.climbButton) climbBtn = SA.climbButton.create(root.document, stage.rig); } catch (e) { report('climbButton.start', e); }
    // Icon-only hotbar (bottom centre): tap a slot or press 1-9 to equip, tap it again or press 0 to empty your hands.
    var hotbar = null;
    try {
      if (SA.hotbarView) hotbar = SA.hotbarView.create(root.document);
      // Digits are not movement/orbit/climb keys, so this never fights the camera rig's key handling.
      root.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        var t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        if (SA.hotbar.pressKey(e.key).action !== 'none' && hotbar) hotbar.update();
      });
    } catch (e) { report('hotbar.start', e); }
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
            if (hotbar) hotbar.setHidden(on);
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
      if (hotbar) { try { hotbar.update(); } catch (e) { hotbar = null; report('hotbar.update', e); } }
      if (climbBtn) { try { climbBtn.update(); } catch (e) { climbBtn = null; report('climbButton.update', e); } }
      if (hintFlow) { try { hintFlow.update(dt); } catch (e) { hintFlow = null; report('hintFlow.update', e); } }
      if (rerollWatch) { try { rerollWatch.update(dt); } catch (e) { rerollWatch = null; report('reroll.update', e); } }
      if (root.SAT && root.SAT.frame) { try { root.SAT.frame(dt); } catch (e) { /* telemetry never stops the loop */ } }
      if (boot) { boot.parentNode.removeChild(boot); boot = null; }
      root.requestAnimationFrame(loop);
    }
    root.requestAnimationFrame(loop);
  }

  start();
})(window);
