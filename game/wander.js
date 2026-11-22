/* SA.wander: pure, seeded ambient movement for one animal (no THREE, no DOM; unit-tested in node:vm).
 * Needs SA.map (bounds, biomeAt, water, rng).
 *
 *   var w = SA.wander.create({ id?, movement, biome, home: {x, z}, seed, radius?, avoid?: [[x,z,r?],...] })
 *   w.update(dt) -> { x, z, heading, lift, moving, hop }   advances the walk/pause state machine
 *       heading is the rotation.y that points the animal (+z forward) along its path; lift is extra height above the
 *       ground (hops for 'salta', a gentle float for 'vuela'); moving is false while paused, turning or held.
 *   w.hold(seconds?)  stop moving (seconds omitted = until release()); renewed taps keep the longest hold
 *   w.release()       let the animal wander again
 *   w.setAvoid(list)  replace the avoid points at any time (e.g. when a prop is placed or removed)
 *   w.state()         current { x, z, heading, lift, moving, mode, held }
 *
 * The animal stays inside its biome (SA.map.biomeAt, a margin from the border and the map edge), within `radius` of
 * home, off the water and clear of `avoid` points (each keeps clear by its optional radius r, default 1.3; an animal that
 * already stands inside one may still walk out of it). Movement trait only changes the style/speed (never an animal id).
 * `others` (optional function -> [[x,z],...], the other animals' current positions) and `minSeparation` (default 2) make
 * target selection softly avoid other animals; if every candidate is too close it takes the one with most clearance.
 * Speed is capped at MAX_SPEED world units/second so a 7-year-old can always tap it.
 *
 *   SA.wander.idle(t, phase) -> { breath, wiggle, blink }   idle animation factors for the renderer:
 *       breath ~1 (scale), wiggle in [-1, 1] (ears/tail, in short bursts), blink 0..1 (eyes closing).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var MAX_SPEED = 1.8;          // hard cap, world units per second (the map is 80 wide; animals are ~1 unit big)
  var MAX_DT = 0.1;
  var MIN_SEPARATION = 2;       // wander targets stay at least this far from other animals (soft: see pickTarget)
  var AVOID_RADIUS = 1.3;       // default keep-clear distance of an avoid point without its own radius
  var EDGE = 1.5;             // keep this far from the biome border and the map edge
  var STYLES = {                // speed = average walking speed; hop = hop height (0: none); float = hover height
    salta: { speed: 0.9, turn: 3.5, pause: [1.2, 3.2], hop: 0.55, hopRate: 1.6, float: 0 },
    nada: { speed: 0.8, turn: 2.5, pause: [1.5, 4], hop: 0, hopRate: 0, float: 0 },
    vuela: { speed: 1.1, turn: 2.5, pause: [1, 2.5], hop: 0, hopRate: 0, float: 1.2 },
    trepa: { speed: 0.7, turn: 3, pause: [1.5, 3.5], hop: 0, hopRate: 0, float: 0 },
    'camina lento': { speed: 0.3, turn: 1.6, pause: [3, 6], hop: 0, hopRate: 0, float: 0 },
    corre: { speed: 1.4, turn: 4, pause: [1.5, 3.5], hop: 0, hopRate: 0, float: 0 },
    repta: { speed: 0.6, turn: 2, pause: [2, 4.5], hop: 0, hopRate: 0, float: 0 },
  };
  var DEFAULT_STYLE = STYLES.nada;

  // Distance from (x, z) to the nearest of the [x, z] points (Infinity when there are none).
  function clearance(x, z, pts) {
    var m = Infinity;
    for (var i = 0; i < pts.length; i++) m = Math.min(m, Math.hypot(pts[i][0] - x, pts[i][1] - z));
    return m;
  }

  function angleDiff(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function create(opts) {
    var M = SA.map;
    var style = STYLES[opts.movement] || DEFAULT_STYLE;
    var rand = M.rng(opts.seed === undefined ? 1 : opts.seed);
    var home = { x: opts.home.x, z: opts.home.z };
    var radius = opts.radius === undefined ? 3 : opts.radius;
    var avoid = opts.avoid || [];
    var others = typeof opts.others === 'function' ? opts.others : null;
    var minSep = opts.minSeparation === undefined ? MIN_SEPARATION : opts.minSeparation;
    var B = M.BOUNDS, biome = opts.biome;
    var s = { x: home.x, z: home.z, heading: rand() * Math.PI * 2 - Math.PI, mode: 'pause', timer: 0.5 + rand() * 2 };
    var target = null, held = 0, phase = 0, t = 0, lift = 0;

    function clearOfAvoid(x, z) {
      for (var i = 0; i < avoid.length; i++) if (Math.hypot(avoid[i][0] - x, avoid[i][1] - z) < (avoid[i][2] || AVOID_RADIUS)) return false;
      return true;
    }

    function inBounds(x, z) {
      if (x < B.minX + EDGE || x > B.maxX - EDGE || z < B.minZ + EDGE || z > B.maxZ - EDGE) return false;
      if (M.biomeAt(x - EDGE) !== biome || M.biomeAt(x + EDGE) !== biome) return false;
      return M.groundHeight(x, z) >= M.WATER_LEVEL + 0.45;
    }

    function allowed(x, z) { return inBounds(x, z) && clearOfAvoid(x, z); }

    function pause() {
      s.mode = 'pause';
      s.timer = style.pause[0] + rand() * (style.pause[1] - style.pause[0]);
      target = null;
    }

    // Soft avoidance: a candidate must be allowed() and at least minSep from every other animal. If no candidate keeps
    // that separation, fall back to the allowed one with the most clearance (so the animal is never stuck), and only
    // pause when nothing is allowed at all.
    function pickTarget() {
      var near = others ? others() : [], best = null, bestClear = -1;
      for (var i = 0; i < 12; i++) {
        var a = rand() * Math.PI * 2, d = 1 + rand() * (radius - 1);
        var x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
        if (!allowed(x, z)) continue;
        var clear = clearance(x, z, near);
        if (clear >= minSep) { best = { x: x, z: z }; break; }
        if (clear > bestClear) { bestClear = clear; best = { x: x, z: z }; }
      }
      if (!best) return pause();
      target = best; s.mode = 'turn';
    }

    function walk(dt) {
      var dx = target.x - s.x, dz = target.z - s.z, dist = Math.hypot(dx, dz);
      if (dist < 0.15) return pause();
      var v = style.speed;
      if (style.hop) v *= 1.5 * Math.sin(Math.PI * (phase % 1));
      var step = Math.min(v * dt, MAX_SPEED * dt, dist);
      var nx = s.x + (dx / dist) * step, nz = s.z + (dz / dist) * step;
      // An animal a new prop landed on may walk out of it (only the avoid zone is waived, never water or edges).
      if (!allowed(nx, nz) && !(inBounds(nx, nz) && !clearOfAvoid(s.x, s.z))) return pause();
      s.x = nx; s.z = nz;
    }

    function update(dt) {
      dt = Math.max(0, Math.min(dt, MAX_DT));
      t += dt;
      var moving = false;
      if (held === Infinity || held > 0) {
        if (held !== Infinity) held = Math.max(0, held - dt);
      } else if (s.mode === 'pause') {
        s.timer -= dt;
        if (s.timer <= 0) pickTarget();
      } else if (s.mode === 'turn') {
        var want = Math.atan2(target.x - s.x, target.z - s.z), diff = angleDiff(s.heading, want);
        var maxTurn = style.turn * dt;
        s.heading += Math.abs(diff) <= maxTurn ? diff : (diff > 0 ? maxTurn : -maxTurn);
        if (Math.abs(diff) <= maxTurn) s.mode = 'walk';
      } else {
        walk(dt);
        moving = s.mode === 'walk';
      }
      if (style.hop) {                       // hop while walking; finish the current hop so it lands (also when held)
        if (moving || phase % 1 > 0) {
          var next = phase + dt * style.hopRate;
          phase = (!moving && Math.floor(next) > Math.floor(phase)) ? Math.floor(next) : next;
        }
        lift = style.hop * Math.abs(Math.sin(Math.PI * (phase % 1)));
      } else if (style.float) {
        lift = style.float + 0.15 * Math.sin(t * 2 + home.x);
      }
      return { x: s.x, z: s.z, heading: s.heading, lift: lift, moving: moving, hop: !!style.hop };
    }

    return {
      update: update,
      hold: function (seconds) {
        if (seconds === undefined) held = Infinity;
        else if (held !== Infinity) held = Math.max(held, seconds);
      },
      release: function () { held = 0; },
      setAvoid: function (list) { avoid = list || []; },
      state: function () { return { x: s.x, z: s.z, heading: s.heading, lift: lift, moving: s.mode === 'walk' && !held, mode: s.mode, held: held > 0 }; },
    };
  }

  function idle(t, phase) {
    phase = phase || 0;
    var env = Math.max(0, Math.sin(t * 0.7 + phase * 3));
    var u = (t + phase) % 3.7;
    return {
      breath: 1 + 0.025 * Math.sin(t * 2.2 + phase),
      wiggle: Math.sin(t * 9 + phase) * env * env,
      blink: u < 0.16 ? Math.sin(Math.PI * u / 0.16) : 0,
    };
  }

  SA.wander = { MAX_SPEED: MAX_SPEED, MIN_SEPARATION: MIN_SEPARATION, STYLES: STYLES, create: create, idle: idle };
})(typeof window !== 'undefined' ? window : globalThis);
