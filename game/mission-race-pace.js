/* SA.racePace: the pure race state and the rabbit's pacing for Mission 10 (AS-0355, slice 2 of AS-0189: La carrera). No THREE, no DOM; unit-tested in node:vm.
 * A mission row may tune it with  race.pace: { speed?, stopAt?, stopFor?, beat?, wait? }  (game/data/missions.js; all optional):
 *   speed    rabbit run speed in m/s (default 8; the player walks at SA.player.SPEED = 4, so the rabbit is fast)
 *   stopAt   fraction 0.1..0.9 of the path where the rabbit stops to eat a carrot (default 0.5, "halfway")
 *   stopFor  seconds it eats (default 12). With a 42-56 m course the rabbit needs ~17-19 s, a walking kid ~11-14 s, so a walk always wins with some effort
 *   beat     seconds between countdown words (default 0.9);  wait  how close to the start line (m) the player must be before the countdown begins (default 8)
 * States: 'countdown' -> 'running' -> 'won'. When the rabbit reaches the tree first the race is "lost" for one tick (event 'lost') and resets AT ONCE to
 * 'countdown' (the rabbit back at the start, `losses` counted): no lives, no failure screen, nothing is taken away. Standing at the tree never wins:
 * only a 'running' race can be won, so nobody wins before "¡ya!", and after a reset the countdown waits (`waiting`) until the player is back at the start line.
 *
 *   SA.racePace.normalize(pace?)            -> { speed, stopAt, stopFor, beat, wait } with defaults filled and values clamped
 *   SA.racePace.measure(points)             -> { pts, cum, length }   the rabbit's path ([{x, z}, ...], at least two points)
 *   SA.racePace.finishTime(path, pace)      -> seconds the rabbit needs to reach the tree (run time + the carrot stop)
 *   SA.racePace.poseAt(path, pace, t)       -> { x, z, rotY, mode: 'run' | 'eat' | 'done', dist }   where the rabbit is t seconds after "ya"
 *   SA.racePace.carrotAt(path, pace)        -> { x, z }   the carrot (just beside the path at the stop point)
 *   SA.racePace.create({ points, pace? })   -> a race machine:
 *       .state           'countdown' | 'running' | 'won'            .t seconds since "ya"          .waiting  true until the countdown has begun
 *       .losses          how many times the rabbit won (the race restarted)
 *       .tick(dt, { atStart, atGoal }) -> [events]   events: { type: 'beat', key } (key = 'number:3' | 'number:2' | 'number:1' | 'phrase:ya'),
 *                        { type: 'go' }, { type: 'eat' }, { type: 'dash' } (the carrot stop starts / ends), { type: 'won' }, { type: 'lost' } (then it is 'countdown' again)
 *       .pose()          -> poseAt(...) now (at the start while counting down)       .eating() -> 0..1 how much of the carrot stop has passed (0 when not eating)
 *       .ate()           -> true once the carrot has been eaten (it is back after a reset)
 *       .reset()         back to the countdown (what a lost race does)
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var DEF = { speed: 8, stopAt: 0.5, stopFor: 12, beat: 0.9, wait: 8 };
  var BEATS = ['number:3', 'number:2', 'number:1', 'phrase:ya'];

  function num(v, lo, hi, d) { return typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }

  function normalize(p) {
    p = p || {};
    return { speed: num(p.speed, 1, 14, DEF.speed), stopAt: num(p.stopAt, 0.1, 0.9, DEF.stopAt), stopFor: num(p.stopFor, 0, 40, DEF.stopFor),
      beat: num(p.beat, 0.3, 3, DEF.beat), wait: num(p.wait, 2, 30, DEF.wait) };
  }

  function measure(points) {
    var pts = (points || []).map(function (q) { return { x: q.x, z: q.z }; }), cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts: pts, cum: cum, length: cum[cum.length - 1] || 0 };
  }

  function pointAt(path, d) {
    var pts = path.pts, cum = path.cum;
    if (pts.length < 2) return { x: pts.length ? pts[0].x : 0, z: pts.length ? pts[0].z : 0, rotY: 0 };
    d = Math.max(0, Math.min(path.length, d));
    for (var i = 1; i < pts.length; i++) {
      if (d <= cum[i] || i === pts.length - 1) {
        var seg = cum[i] - cum[i - 1] || 1, u = Math.min(1, Math.max(0, (d - cum[i - 1]) / seg)), a = pts[i - 1], b = pts[i];
        return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, rotY: Math.atan2(b.x - a.x, b.z - a.z) };
      }
    }
    return { x: pts[0].x, z: pts[0].z, rotY: 0 };
  }

  function finishTime(path, pace) { var p = normalize(pace); return path.length / p.speed + p.stopFor; }

  function poseAt(path, pace, t) {
    var p = normalize(pace), L = path.length, stopD = L * p.stopAt, tStop = stopD / p.speed, d, mode;
    if (t <= tStop) { d = p.speed * Math.max(0, t); mode = 'run'; }
    else if (t < tStop + p.stopFor) { d = stopD; mode = 'eat'; }
    else { d = Math.min(L, stopD + p.speed * (t - tStop - p.stopFor)); mode = d >= L ? 'done' : 'run'; }
    var pt = pointAt(path, d);
    return { x: pt.x, z: pt.z, rotY: pt.rotY, mode: mode, dist: d };
  }

  function carrotAt(path, pace) {
    var p = normalize(pace), pt = pointAt(path, path.length * p.stopAt);
    return { x: pt.x + Math.cos(pt.rotY) * 1.2, z: pt.z - Math.sin(pt.rotY) * 1.2 };      // a metre to the rabbit's right
  }

  function create(opts) {
    opts = opts || {};
    var pace = normalize(opts.pace), path = measure(opts.points), m = { state: 'countdown', t: 0, waiting: true, losses: 0, pace: pace, path: path };
    var cd = 0, began = false, tEat = pace.stopAt * path.length / pace.speed, flags = { eat: false, dash: false };

    function reset() { m.state = 'countdown'; m.t = 0; m.waiting = true; cd = 0; began = false; flags = { eat: false, dash: false }; }

    m.reset = reset;
    m.pose = function () { return poseAt(path, pace, m.state === 'countdown' ? 0 : m.t); };
    m.eating = function () {
      return m.state !== 'countdown' && pace.stopFor > 0 && m.t > tEat && m.t < tEat + pace.stopFor ? (m.t - tEat) / pace.stopFor : 0;
    };

    m.ate = function () { return m.state !== 'countdown' && m.t >= tEat + pace.stopFor; };       // the carrot is gone (until the race restarts)

    m.tick = function (dt, ctx) {
      var ev = [];
      dt = Math.max(0, dt || 0);
      ctx = ctx || {};
      if (m.state === 'countdown') {
        if (!began) {
          if (!ctx.atStart) return ev;                       // the countdown waits until the player is at the start line
          began = true; m.waiting = false; cd = 0; ev.push({ type: 'beat', key: BEATS[0] });
        } else {
          var before = Math.floor(cd / pace.beat + 1e-9);
          cd += dt;
          var after = Math.floor(cd / pace.beat + 1e-9);
          for (var b = before + 1; b <= after && b < BEATS.length; b++) ev.push({ type: 'beat', key: BEATS[b] });
          if (after >= BEATS.length - 1) { m.state = 'running'; m.t = 0; ev.push({ type: 'go' }); }
        }
        return ev;
      }
      if (m.state !== 'running') return ev;
      m.t += dt;
      if (ctx.atGoal) { m.state = 'won'; ev.push({ type: 'won' }); return ev; }       // the player wins a tie: only a running race can be won
      if (!flags.eat && pace.stopFor > 0 && m.t > tEat) { flags.eat = true; ev.push({ type: 'eat' }); }
      if (!flags.dash && m.t >= tEat + pace.stopFor) { flags.dash = true; if (pace.stopFor > 0) ev.push({ type: 'dash' }); }
      if (m.t >= finishTime(path, pace)) { m.losses++; ev.push({ type: 'lost' }); reset(); }
      return ev;
    };
    return m;
  }

  SA.racePace = { normalize: normalize, measure: measure, finishTime: finishTime, poseAt: poseAt, carrotAt: carrotAt, create: create, DEFAULTS: DEF, BEATS: BEATS };
})(typeof window !== 'undefined' ? window : globalThis);
