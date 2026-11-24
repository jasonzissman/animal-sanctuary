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
    // Every photo of an animal also keeps a small picture in IndexedDB (AS-0236); the album view that shows them comes next.
    try {
      if (SA.albumPics && SA.render.createPhotoCapture) {
        SA.albumPics.setCapture(SA.render.createPhotoCapture(root.THREE, { renderer: stage.renderer, scene: stage.scene, camera: stage.camera, animals: stage.animals }));
      }
    } catch (e) { report('photoCapture.start', e); }
    var game = null;
    // The rescue mission (SA.mission, played by SA.missionFlow): find an animal that fits, help it, then la cámara photo.
    try { game = SA.mission.create({ biome: function () { return SA.round.biomeForRig(stage.rig); } });
      ctl = SA.prompt.start({ doc: root.document, fx: stage.fx, careFx: stage.careFx, pin: stage.ambient, biomeFx: stage.biomeGlow,
        onProgress: function () { if (unlocks) unlocks.check(); }, mission: game,
        // Small tasks appear only near their animal (AS-0225): the gate reads where the player and the visible animals are.
        // AS-0255: every herd instance is listed under its species id; SA.render.instances.get resolves that id to the nearest one,
        // so the glow ring, need icon and care task land on the instance the player is walking up to.
        nearby: { player: function () { var p = stage.rig.getPlayer(); if (p && SA.render.instances) SA.render.instances.setNear(p.x, p.z); return p; }, animals: function () {
          return stage.animals.children.filter(function (g) { return g.visible; }).map(function (g) { return { id: g.userData.animalId, x: g.position.x, z: g.position.z }; });
        } } });
      if (ctl.taskShown) stage.getTask = ctl.taskShown;      // the glow ring round the current small-task animal (AS-0226)
      if (ctl.encounterNeeds) stage.getNeeds = ctl.encounterNeeds;      // floating need icons over animals that ask for help (AS-0245)
      game = ctl.game || game;     // the round-like adapter that hint arrow and biome reroll read
    } catch (e) { report('prompt.start', e); }
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
    // One focus rule (SA.focus): a story mission started at the station board puts the small task on screen away quietly;
    // when it is done or abandoned, small tasks start again. Polled once per frame in loop().
    try {
      if (SA.focus && ctl) SA.focus.onChange(function (mode) {
        if (mode === 'mission') { if (ctl.pause) ctl.pause(); } else ctl.begin();
      });
    } catch (e) { report('focus.start', e); }
    // Live game events drive the active story mission (AS-0230): picks/photos, talking to the scientist, pickups and care tasks
    // (the last two report from their own modules). The pill then shows and speaks each new step; the finish cheers once.
    var rt = SA.missionRuntime || null;
    try {
      if (rt) {
        rt.celebrateHook = function () { if (ctl && ctl.celebrate) ctl.celebrate('¡Lo lograste! ⭐'); };
        rt.onStars = function (n) { if (ctl && ctl.setStars) ctl.setStars(n); };
        // The baby reached mamá (AS-0235): one short line with an icon and confetti; SA.missionReunion speaks the family words.
        if (SA.missionReunion) SA.missionReunion.onReunion = function () { if (ctl && ctl.celebrate) ctl.celebrate('💕 ¡La familia está junta!'); };
        // The egg hatched / the family photo earned the mission sticker (AS-0315): one short line each; the call and words are spoken by SA.missionHatch.
        if (SA.missionHatch) {
          SA.missionHatch.onHatch = function () { if (ctl && ctl.celebrate) ctl.celebrate('🐥 ¡Pío pío!'); };
          SA.missionHatch.onSticker = function (r) { var b = r && r.badges && r.badges[r.badges.length - 1]; if (b && ctl && ctl.celebrate) ctl.celebrate(b.icon + ' ' + b.es); };
        }
        // The puppy's photo earned the mission 3 sticker (AS-0321).
        if (SA.missionLog) SA.missionLog.onSticker = function (r) { var b = r && r.badges && r.badges[r.badges.length - 1]; if (b && ctl && ctl.celebrate) ctl.celebrate(b.icon + ' ' + b.es); };
        // The scientist hands over the flower crown (mission 4, AS-0326); SA.missionRuntime speaks "la corona".
        rt.onGive = function (id) { if (id === 'corona' && ctl && ctl.celebrate) ctl.celebrate('👑 ¡La corona!'); };
        SA.picking.onPick(rt.onPick);
        if (SA.npc && SA.npc.onTalk) SA.npc.onTalk(function () { rt.report({ type: 'talked', who: 'scientist' }); return false; });
      }
    } catch (e) { report('missionRuntime.start', e); }
    // Mission compass (AS-0228): a big arrow toward the current step's world target (the piglet, then mamá), turning with the camera.
    var compass = null;
    try { if (SA.compassView) compass = SA.compassView.create({ doc: root.document, runtime: rt, rig: stage.rig, camera: stage.camera }); }
    catch (e) { report('compass.start', e); }
    // Icon-only rotate/tilt buttons so touch players can orbit the camera (same path as Q/E/R/F).
    try { if (SA.orbitPad) SA.orbitPad.create(root.document, stage.rig, root); } catch (e) { report('orbitPad.start', e); }
    // Virtual joystick (bottom-left, shown at the first touch) so touch players can walk without a keyboard.
    try { if (SA.joystickView) SA.joystickView.create(root.document, stage.rig, root); } catch (e) { report('joystick.start', e); }
    // Icon-only climb button: 🧗 next to a tree, ⬇️ while up one (same as Space / C).
    var climbBtn = null;
    try { if (SA.climbButton) climbBtn = SA.climbButton.create(root.document, stage.rig, root); } catch (e) { report('climbButton.start', e); }
    // Icon-only ⬆️ jump button (appears at the first touch, like the joystick): the same hop as Space.
    try { if (SA.jumpButton) SA.jumpButton.create(root.document, stage.rig, root); } catch (e) { report('jumpButton.start', e); }
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
    // Big icon-only "use" button for touch (shows while a part is highlighted; same path as Space / click / tap).
    var useBtn = null;
    try { if (SA.useButton) useBtn = SA.useButton.create(root.document, stage.picking, root); } catch (e) { report('useButton.start', e); }
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
    // Photo album (📖, an item of the 🎒 menu): every photographed animal with its name and parts. Pauses picking while open.
    try {
      if (SA.albumView) SA.albumView.create(root.document, { onToggle: function (on) { SA.picking.setPaused(on); } });
    } catch (e) { report('album.start', e); }
    // Station menu hook (AS-0146): the door opens SA.station.open(); this is the placeholder card until the customizer (AS-0144).
    try {
      var stationMenu = SA.stationMenuView ? SA.stationMenuView.create(root.document, { onToggle: function (on) { SA.picking.setPaused(on); } }) : null;
      // Misiones board (AS-0197) renders into the station card: done (replay), next (start), locked and En curso cards.
      if (stationMenu && stationMenu.body && SA.missionsBoardView) SA.missionsBoardView.create(root.document, { body: stationMenu.body });
      // Insignias board (AS-0239): the card the front-wall badges board opens (source 'badges'); the missions card hides for it.
      if (stationMenu && stationMenu.body && SA.badgesBoardView) SA.badgesBoardView.create(root.document, { body: stationMenu.body });
    } catch (e) { report('station.menu', e); }
    // The scientist's hello (AS-0213): on every load, one card with two short lines; closes on ✕ / Enter / E / a tap / walking.
    // It starts no mission: missions are chosen at the board in the station.
    var greeting = null;
    try {
      if (SA.greetingView) greeting = SA.greetingView.create(root.document, { onToggle: function (on) { SA.picking.setPaused(on); },
        player: function () { return stage.rig.getPlayer(); } });
    } catch (e) { report('greeting.start', e); }
    // Using the scientist (AS-0204): a one-line mission reminder plus the current mission (never starts a mission).
    try {
      if (SA.scientistView) SA.scientistView.create(root.document, { onToggle: function (on) { SA.picking.setPaused(on); } });
    } catch (e) { report('scientist.start', e); }
    // The scientist cheers once per proof photo sent to the station when the kid walks near her (AS-0206).
    var cheer = null;
    try {
      if (SA.scientistCheer) cheer = SA.scientistCheer.create(root.document, { player: function () { return stage.rig.getPlayer(); },
        paused: function () { return SA.picking.isPaused(); } });
    } catch (e) { report('cheer.start', e); }
    // A proof photo sent to the station: a little envelope flies to the station icon with a soft whoosh (AS-0208). Never blocks play.
    var envelope = null;
    try { if (SA.envelopeFly) envelope = SA.envelopeFly.create({ doc: root.document, rig: stage.rig, camera: stage.camera }); }
    catch (e) { report('envelope.start', e); }
    // Grown-up drawer (press-and-hold gear, an item of the 🎒 menu). Never blocks the main loop.
    var menuView = null;
    try { if (SA.settingsView) SA.settingsView.create(root.document, { onOpen: function () { if (menuView) menuView.used('settings'); } }); }
    catch (e) { report('settings.start', e); }
    // 🎒 menu (top-right): holds sound, 🏡, 📖 and ⚙️; M toggles mute, Escape / an outside tap closes it.
    try { if (SA.menuView) menuView = SA.menuView.create(root.document, root); } catch (e) { report('menu.start', e); }
    // Running or jumping with the fragile egg: a worried quack and "¡Despacio!" (AS-0314), rate-limited; never a penalty.
    var fragileWatch = null;
    try { if (SA.missionFragile) fragileWatch = SA.missionFragile.create({ toast: function (m) { if (ctl && ctl.toast) ctl.toast(m); } }); }
    catch (e) { report('missionFragile.start', e); }
    var last = null;
    function loop(now) {
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.25);
      last = now;
      // A fragile carried thing wobbles when the kid jumps (SA.carry, AS-0231); hand-item.js draws the wobble in stage.render.
      if (SA.carry) { try { SA.carry.update(dt, stage.rig.getPlayer()); } catch (e) { SA.carry = null; report('carry.update', e); } }
      if (fragileWatch) { try { fragileWatch.update(dt, stage.rig.getPlayer()); } catch (e) { fragileWatch = null; report('missionFragile.update', e); } }
      stage.render(dt);
      if (hotbar) { try { hotbar.update(); } catch (e) { hotbar = null; report('hotbar.update', e); } }
      if (useBtn) { try { useBtn.update(); } catch (e) { useBtn = null; report('useButton.update', e); } }
      if (greeting && greeting.isOpen()) { try { greeting.update(stage.rig.getPlayer()); } catch (e) { greeting = null; report('greeting.update', e); } }
      if (cheer) { try { cheer.update(dt); } catch (e) { cheer = null; report('cheer.update', e); } }
      if (envelope) { try { envelope.update(dt); } catch (e) { envelope = null; report('envelope.update', e); } }
      if (climbBtn) { try { climbBtn.update(); } catch (e) { climbBtn = null; report('climbButton.update', e); } }
      if (SA.focus) { try { SA.focus.update(); } catch (e) { report('focus.update', e); } }
      if (rt) { try { rt.update(stage.rig.getPlayer()); } catch (e) { rt = null; report('missionRuntime.update', e); } }
      if (ctl && ctl.updateTasks) { try { ctl.updateTasks(); } catch (e) { ctl.updateTasks = null; report('taskGate.update', e); } }
      if (ctl && ctl.updatePill) { try { ctl.updatePill(); } catch (e) { ctl.updatePill = null; report('missionPill.update', e); } }
      if (compass) { try { compass.update(dt); } catch (e) { compass = null; report('compass.update', e); } }
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
