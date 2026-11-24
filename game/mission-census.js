/* SA.missionCensus: the 'census' step of Mission 7, "Censo de animales" (AS-0341, slice 2 of AS-0186). Pure wiring (no THREE, no DOM;
 * unit-tested in node:vm). The list itself is SA.census (game/census.js); the step kind is a data row (game/data/step-kinds.js).
 *
 *   SA.missionCensus.sync()        while the active mission's current step is 'census', makes sure this run (mission id + seed) has its list:
 *                                  a fresh SA.census.generate, different from the previous one (a replay never repeats a list). Called by
 *                                  update() and photo(); leaving the step drops the state.
 *   SA.missionCensus.update(p)     per frame (SA.missionRuntime calls it for every world piece): just sync().
 *   SA.missionCensus.photo(animalId)   a la cámara shot of an animal (main.js wires SA.picking). It goes into the album, then SA.census.tick:
 *        { status: 'none' }                    no census step running (or not an animal)
 *        { status: 'tick', entry, done }       a fitting photo ticked an entry: chime + the trait word ('color:gris', 'movement:nada') spoken;
 *                                              when that finished the list the step is reported ('censused'): { status: 'done', entry, result }
 *        { status: 'again' }                   a fitting animal already counted: a soft pop, nothing lost
 *        { status: 'miss' }                    fits nothing: a gentle boing (never punishing; the list stays as it was)
 *   SA.missionCensus.view()        -> { list, progress, done } | null for a list card (the list text is list.es, spoken with list.vocabKeys)
 *   Hooks: onTick(e) / onMiss(e) (toasts), onSticker({ mission, badges }) (the finish cheer; main.js sets it).
 *   The finish logs one rescue row { kind: 'census' } -> the sticker 'censo-completo'. Telemetry: census.start, census.tick, census.miss, census.done.
 *   SA.missionCensus.create({ missions?, census?, audio?, report?, rescueLog?, photo?, rng?, track? })   a separate instance (tests).
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(opts) {
    opts = opts || {};
    var cur = null;            // { key, list, state }
    var lastKey = null;        // the previous list's key, so a replay differs from it
    function missions() { return opts.missions || SA.missions; }
    function census() { return opts.census || SA.census; }
    function audio() { return opts.audio || SA.audio; }
    function track(type, fields) {
      try {
        if (opts.track) opts.track(type, fields);
        else if (root.SAT && root.SAT.track) root.SAT.track(type, fields);
      } catch (e) { /* telemetry never breaks play */ }
    }
    function sfx(name) { try { var a = audio(); if (a && a.sfx) a.sfx(name); } catch (e) { /* sound is best effort */ } }
    function say(key) { try { var a = audio(); if (a && a.say) a.say(key); } catch (e) { /* sound is best effort */ } }

    function activeCensus() {
      try { var a = missions().active(); return a && a.stepData && a.stepData.kind === 'census' ? a : null; } catch (e) { return null; }
    }

    function sync() {
      var a = activeCensus();
      if (!a) { cur = null; return null; }
      var key = a.id + ':' + a.seed;
      if (cur && cur.key === key) return cur;
      var c = census(), list = null;
      try { list = c.generate(opts.rng || Math.random, { avoid: lastKey }); } catch (e) { list = null; }
      if (!list) { cur = null; return null; }
      cur = { key: key, list: list, state: c.newState(list) };
      lastKey = list.key;
      track('census.start', { id: a.id, key: list.key });
      return cur;
    }

    function finish(a, animalId) {
      var r = { status: 'none' };
      try { r = (opts.report || SA.missionRuntime.report)({ type: 'censused' }) || r; } catch (e) { r = { status: 'none' }; }
      if (r.status !== 'complete' && r.status !== 'step') return r;
      track('census.done', { id: a.id });
      var rec = { earned: [] };
      try { rec = (opts.rescueLog || SA.rescueLog).record({ kind: 'census', mission: a.id, animal: animalId, key: a.id }) || rec; } catch (e) { /* the log never blocks play */ }
      if (api.onSticker) { try { api.onSticker({ mission: a.id, badges: rec.earned || [] }); } catch (e) { /* the view never breaks play */ } }
      return r;
    }

    function photo(animalId) {
      var run = sync();
      var a = run && activeCensus();
      if (!run || !a || typeof animalId !== 'string') return { status: 'none' };
      var animal = null;
      try { animal = SA.data.get('animals', animalId); } catch (e) { animal = null; }
      if (!animal) return { status: 'none' };
      try { (opts.photo || SA.photo).record(animalId); } catch (e) { /* the album never blocks play */ }
      var c = census();
      var entry = c.tick(run.state, animal);
      if (!entry) {
        var fits = run.list.entries.some(function (e) { return c.matches(animal, e); });
        sfx(fits ? 'pop' : 'boing');          // gentle either way: the round simply goes on
        track('census.miss', { animal: animalId, fits: fits });
        var miss = { status: fits ? 'again' : 'miss', animal: animalId };
        if (api.onMiss) { try { api.onMiss(miss); } catch (e) { /* a toast never breaks play */ } }
        return miss;
      }
      sfx('chime');
      say(entry.trait + ':' + entry.value);
      track('census.tick', { animal: animalId, trait: entry.trait, value: entry.value });
      var out = { status: 'tick', entry: entry, animal: animalId, done: c.isDone(run.state) };
      if (api.onTick) { try { api.onTick(out); } catch (e) { /* a toast never breaks play */ } }
      if (out.done) { out.status = 'done'; out.result = finish(a, animalId); }
      return out;
    }

    function update() { sync(); return { status: 'none' }; }

    function view() {
      var run = sync();
      return run ? { list: run.list, progress: census().progress(run.state), done: census().isDone(run.state) } : null;
    }

    var api = { sync: sync, update: update, photo: photo, view: view, onTick: null, onMiss: null, onSticker: null, create: create };
    return api;
  }

  SA.missionCensus = create();
})(typeof window !== 'undefined' ? window : globalThis);
