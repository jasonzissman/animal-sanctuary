/* SA.album: the photo album's pure logic (no THREE, no DOM; unit-tested in node:vm). The view is game/ui/album-view.js.
 *
 * What is stored (save.album): { '<animalId>': { date: 'YYYY-MM-DD', pics: [{ id, date }] } } = the date of the first photo of each
 * species plus the kept picture entries (SA.albumPics owns `pics`). Ids and dates only, never image data (AS-0236).
 * Animals photographed before the album existed (save.photos from AS-0084, no date) still count as found, with no date.
 *
 *   SA.album.add(animalId, now?)  records the first photo of a species; true when it is new. Unknown ids are ignored.
 *                                 `now` (a Date) is only for tests.
 *   SA.album.addSky(now?)         the night-sky photo's page 'cielo' (AS-0371); true when new. entries() then ends with { id: 'cielo', icon: '🌙', es: 'el cielo', parts: [] }
 *   SA.album.has(animalId)      true once photographed
 *   SA.album.entries()            one card per species (data order). Photographed card:
 *                                 { id, seen: true, icon, es: 'el conejo', en, date, key: 'animal:conejo',
 *                                   parts: [{ key, icon, es: 'las orejas', speak: 'part:orejas' }] }.
 *                                 Not yet photographed: { id, seen: false, icon: '❓', es: '?', parts: [], silhouette: <animal icon> }
 *                                 (the view draws the silhouette). An easter-egg creature stays hidden until you photograph it.
 *   SA.album.progress()           { found, total } over the real (non easter-egg) animals
 *   SA.album.speakKey(entry)      vocab key to say when a card is tapped (null for a silhouette: it stays a surprise)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var DOT = '•';

  function all() { return SA.data && SA.data.all ? SA.data.all('animals') : []; }
  function animals() { return all().filter(function (a) { return !a.story; }); }   // story animals (pigs) get no album page yet
  function find(id) { return typeof id === 'string' ? all().filter(function (a) { return a.id === id; })[0] || null : null; }

  function stored() {
    var s = SA.save ? SA.save.get() : {};
    return { album: s.album || {}, photos: s.photos && typeof s.photos === 'object' ? s.photos : {} };
  }

  function has(id) {
    var s = stored();
    return typeof id === 'string' && (Object.prototype.hasOwnProperty.call(s.album, id) ||
      (Object.prototype.hasOwnProperty.call(s.photos, id) && s.photos[id] > 0));
  }

  function add(id, now) {
    // Only a dated page counts as "already added": an animal photographed before the album (save.photos) still gets its date.
    if (!find(id) || !SA.save || Object.prototype.hasOwnProperty.call(stored().album, id)) return false;
    var patch = {};
    patch[id] = { date: (now && typeof now.toISOString === 'function' && isFinite(now) ? now : new Date()).toISOString().slice(0, 10), pics: [] };
    SA.save.update({ album: patch });
    return true;
  }

  // AS-0371: the night-sky photo of Mission 12 is one extra page, 'el cielo' (save.album.cielo, the same { date, pics } shape as an animal).
  var SKY = 'cielo';
  function addSky(now) {
    if (!SA.save || Object.prototype.hasOwnProperty.call(stored().album, SKY)) return false;
    var patch = {};
    patch[SKY] = { date: (now && typeof now.toISOString === 'function' && isFinite(now) ? now : new Date()).toISOString().slice(0, 10), pics: [] };
    SA.save.update({ album: patch });
    return true;
  }

  function nameEs(a) {
    var v = SA.vocab && SA.vocab.get ? SA.vocab.get('animal:' + a.id) : null;
    return v && v.es ? v.es : a.name.es;
  }

  function partCards(a) {
    var seen = {};
    var out = [];
    (a.parts || []).forEach(function (p) {
      var def = SA.data.get('parts', p.part);
      if (seen[p.part] || !def) return;
      seen[p.part] = true;
      out.push({ key: p.part, icon: def.icon || DOT, es: def.label.es, speak: 'part:' + p.part });
    });
    return out;
  }

  function entries() {
    var s = stored();
    var out = [];
    animals().forEach(function (a) {
      var seen = has(a.id);
      if (a.easterEgg && !seen) return;
      if (!seen) { out.push({ id: a.id, seen: false, icon: '❓', es: '?', date: null, parts: [], silhouette: a.icon }); return; }
      out.push({ id: a.id, seen: true, icon: a.icon, es: nameEs(a), en: a.name.en, date: s.album[a.id] && s.album[a.id].date || null,
        key: 'animal:' + a.id, parts: partCards(a) });
    });
    if (Object.prototype.hasOwnProperty.call(s.album, SKY)) {
      out.push({ id: SKY, seen: true, icon: '🌙', es: 'el cielo', en: 'the sky', date: s.album[SKY] && s.album[SKY].date || null, key: 'thing:cielo', parts: [] });
    }
    return out;
  }

  function progress() {
    var real = animals().filter(function (a) { return !a.easterEgg; });
    return { found: real.filter(function (a) { return has(a.id); }).length, total: real.length };
  }

  function speakKey(entry) { return entry && entry.seen ? entry.key : null; }

  SA.album = { add: add, addSky: addSky, has: has, entries: entries, progress: progress, speakKey: speakKey };
})(typeof window !== 'undefined' ? window : globalThis);
