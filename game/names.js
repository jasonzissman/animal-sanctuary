/* SA.names: names for the animals you rescued, 'Luna la rápida' (AS-0169). Pure (no THREE, no DOM; node:vm tested).
 * Data: game/data/names.js (kinds 'names', 'nameAdjectives'). An individual animal is told apart by its instance id ('conejo#2', the same id the
 * herd planner gives, stable across reloads); a story animal keeps its animal id. save.names = { '<individualId>': { animalId, name, adj? } }.
 *
 *   SA.names.article(gender)             'el' | 'la'
 *   SA.names.compose(name, adj, gender)  'Luna la rápida' / 'Coco el rápido': name is a name id or text, adj an adjective id / row (optional),
 *                                        gender 'f' | 'm' (the ANIMAL's). Article and ending agree; invariant adjectives (valiente, grande) do not change.
 *   SA.names.offerNames(animalId, rng?)  3 name rows (those fitting the animal's gender first, no repeats)
 *   SA.names.offerAdjectives(animalId, rng?)  3 adjective rows: up to two that fit its traits (rápida for a hopper, pequeña for a small one), then fun extras
 *   SA.names.give(individualId, nameId, adjId?)  saves the name; false for an unknown id / adjective
 *   SA.names.get(individualId)           { id, animalId, name, adj, gender, icon, text } or null     SA.names.has(id)
 *   SA.names.text(id)                    'Luna la rápida' or ''      SA.names.greeting(id)   '¡Hola, Luna la rápida!' or ''
 *   SA.names.friends()                   every named animal [{ id, animalId, icon, text }] (what the album lists)
 *   SA.names.session(individualId, rng?) the two-card flow: { step: 'name'|'adj'|'done', options(), choose(i), skip(), text(), result }
 *       choose(i) on 'name' moves to 'adj'; on 'adj' it saves and finishes. skip() ends at once; a name already chosen is kept alone.
 *   SA.names.rescued(animalId)           tells the listeners that a rescue photo was just taken (mission-flow); onRescued(fn) subscribes
 *   SA.names.animalOf(individualId)      the species id ('conejo#2' -> 'conejo')
 * Telemetry: names.given { animalId, name, adj } and names.skipped { animalId }.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var ID = /^[a-z0-9_-]+(#\d+)?$/;
  var listeners = [];

  function animalOf(id) { return typeof id === 'string' ? id.split('#')[0] : ''; }
  function article(g) { return g === 'f' ? 'la' : 'el'; }
  function nameRow(n) { return typeof n === 'string' ? (SA.data.get('names', n) || { id: '', es: n, g: 'x' }) : n; }
  function adjRow(a) { return typeof a === 'string' ? SA.data.get('nameAdjectives', a) : a || null; }
  function genderOf(animalId) {
    var a = SA.data.get('animals', animalId);
    return a && a.name && a.name.gender === 'f' ? 'f' : 'm';
  }
  function track(type, f) { try { if (root.SAT && root.SAT.track) root.SAT.track(type, f); } catch (e) { /* telemetry never breaks play */ } }

  function compose(name, adj, gender) {
    var n = nameRow(name), a = adjRow(adj);
    if (!n || !n.es) return '';
    if (!a) return n.es;
    return n.es + ' ' + article(gender) + ' ' + (gender === 'f' ? a.f : a.m);
  }

  function shuffled(list, rng) {
    var r = typeof rng === 'function' ? rng : Math.random, a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)) % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function offerNames(animalId, rng) {
    var g = genderOf(animalId), all = shuffled(SA.data.all('names'), rng);
    var fit = all.filter(function (n) { return n.g === g || n.g === 'x'; });
    var rest = all.filter(function (n) { return fit.indexOf(n) < 0; });
    return fit.concat(rest).slice(0, 3);
  }

  function fits(a, traits) {
    return !!a.traits && !!traits && Object.keys(a.traits).some(function (k) { return a.traits[k].indexOf(traits[k]) >= 0; });
  }

  function offerAdjectives(animalId, rng) {
    var animal = SA.data.get('animals', animalId), all = shuffled(SA.data.all('nameAdjectives'), rng);
    var own = all.filter(function (a) { return animal && fits(a, animal.traits); });
    var extra = all.filter(function (a) { return !a.traits; });     // the fun extras (valiente, dormilón, curiosa, juguetona)
    var other = all.filter(function (a) { return own.indexOf(a) < 0 && extra.indexOf(a) < 0; });
    // at most two trait words, so there is always a funny one too
    return own.slice(0, 2).concat(extra, own.slice(2), other).slice(0, 3);
  }

  function store() { var s = SA.save ? SA.save.get().names : null; return s && typeof s === 'object' ? s : {}; }
  function has(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(store(), id); }

  function build(id, row) {
    if (!row || !SA.data.get('names', row.name)) return null;
    var animalId = row.animalId || animalOf(id), g = genderOf(animalId), animal = SA.data.get('animals', animalId);
    var adj = row.adj ? SA.data.get('nameAdjectives', row.adj) : null;
    return { id: id, animalId: animalId, name: row.name, adj: adj ? adj.id : '', gender: g, icon: animal && animal.icon || '🐾',
      text: compose(row.name, adj, g) };
  }
  function get(id) { return has(id) ? build(id, store()[id]) : null; }
  function text(id) { var e = get(id); return e ? e.text : ''; }
  function greeting(id) { var t = text(id); return t ? '¡Hola, ' + t + '!' : ''; }

  function give(id, nameId, adjId) {
    if (typeof id !== 'string' || !ID.test(id) || !SA.save || !SA.data.get('names', nameId)) return false;
    if (adjId && !SA.data.get('nameAdjectives', adjId)) return false;
    var row = { animalId: animalOf(id), name: nameId };
    if (adjId) row.adj = adjId;
    var patch = { names: {} };
    patch.names[id] = row;
    SA.save.update(patch);
    track('names.given', { animalId: row.animalId, name: nameId, adj: adjId || '' });
    return true;
  }

  function friends() {
    return Object.keys(store()).map(get).filter(Boolean);
  }

  function session(id, rng) {
    var animalId = animalOf(id), g = genderOf(animalId);
    var st = { step: 'name', result: null }, chosen = null, opts = offerNames(animalId, rng);
    function options() {
      if (st.step === 'name') return opts.map(function (n) { return { id: n.id, icon: '🏷️', es: n.es, speak: n.es }; });
      if (st.step === 'adj') return opts.map(function (a) { return { id: a.id, icon: a.icon, es: g === 'f' ? a.f : a.m, speak: compose(chosen, a, g) }; });
      return [];
    }
    function choose(i) {
      if (st.step === 'name' && opts[i]) { chosen = opts[i].id; st.step = 'adj'; opts = offerAdjectives(animalId, rng); return st.step; }
      if (st.step === 'adj' && opts[i] && give(id, chosen, opts[i].id)) { st.result = get(id); st.step = 'done'; }
      return st.step;
    }
    function skip() {
      if (st.step === 'adj' && chosen && give(id, chosen)) st.result = get(id);   // a name alone is still a name
      else if (st.step === 'name') track('names.skipped', { animalId: animalId });
      st.step = 'done';
      return st.step;
    }
    return { get step() { return st.step; }, get result() { return st.result; }, options: options, choose: choose, skip: skip,
      text: function () { return chosen ? compose(chosen, null, g) : ''; }, individualId: id, animalId: animalId };
  }

  function onRescued(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function rescued(animalId) {
    listeners.slice().forEach(function (fn) { try { fn(animalId); } catch (e) { /* the offer never breaks play */ } });
  }

  SA.names = { article: article, compose: compose, offerNames: offerNames, offerAdjectives: offerAdjectives, give: give, get: get, has: has,
    text: text, greeting: greeting, friends: friends, session: session, rescued: rescued, onRescued: onRescued, animalOf: animalOf };
})(typeof window !== 'undefined' ? window : globalThis);
