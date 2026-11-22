/* SA.albumPics: the pictures behind the photo album (AS-0236, slice 1 of the photobook). Pure logic (no THREE, no DOM; unit-tested in node:vm).
 *
 * Every photo of an animal captures a small JPEG (game/render/photo-capture.js) that SA.photoStore keeps in IndexedDB under a picture id.
 * The save only ever holds ids and dates: save.album[animalId].pics = [{ id, date }], oldest first. Per species only the FIRST picture
 * ever and the NEWEST 3 are kept; older ones are reported for deletion. A photo always counts for the album and the badges even when no
 * picture could be captured or stored (no IndexedDB, quota, private mode): nothing here throws or waits for the photo flow.
 *
 *   SA.albumPics.keep(entries, entry)   { keep: [{id,date}], drop: [id] }: `entries` oldest first, `entry` the new one (appended).
 *   SA.albumPics.cropRect(box, cw, ch, aspect)  the source rectangle { sx, sy, sw, sh } (canvas pixels, `aspect` = width / height) that
 *                                       frames a screen box { x0, y0, x1, y1 } with some margin, clamped inside the canvas.
 *   SA.albumPics.setCapture(fn)         fn(animalId) -> 'data:image/jpeg;base64,...' | null, called synchronously when a photo is taken
 *   SA.albumPics.setStore(store)        a SA.photoStore-shaped { put, del } (default SA.photoStore)
 *   SA.albumPics.shot(animalId, now?)   Promise<pictureId | null>, never rejects. Captures now, stores in the background and only then
 *                                       adds the entry to the save and deletes the dropped pictures (a failed store leaves the save alone).
 *   SA.albumPics.list(animalId)         the saved [{ id, date }] of a species (oldest first)
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var NEWEST = 3;
  var capture = null;
  var store = null;
  var seq = 0;

  function keep(entries, entry) {
    var all = (Array.isArray(entries) ? entries : []).filter(function (e) { return e && typeof e.id === 'string' && e.id !== (entry && entry.id); });
    if (entry && typeof entry.id === 'string') all.push({ id: entry.id, date: entry.date });
    var kept = all.filter(function (e, i) { return i === 0 || i >= all.length - NEWEST; });
    var ids = kept.map(function (e) { return e.id; });
    return { keep: kept, drop: all.filter(function (e) { return ids.indexOf(e.id) < 0; }).map(function (e) { return e.id; }) };
  }

  function cropRect(box, cw, ch, aspect) {
    var a = aspect > 0 ? aspect : 4 / 3;
    var cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    var w = Math.max((box.x1 - box.x0) * 1.3, (box.y1 - box.y0) * 1.3 * a, 48);   // margin round the animal, never a tiny crop
    var h = w / a;
    if (w > cw) { w = cw; h = w / a; }
    if (h > ch) { h = ch; w = h * a; }
    var sx = Math.min(Math.max(cx - w / 2, 0), cw - w);
    var sy = Math.min(Math.max(cy - h / 2, 0), ch - h);
    return { sx: sx, sy: sy, sw: w, sh: h };
  }

  function row(animalId) {
    var a = SA.save && SA.save.get().album;
    return a && Object.prototype.hasOwnProperty.call(a, animalId) ? a[animalId] : null;
  }

  function list(animalId) { var r = row(animalId); return r && Array.isArray(r.pics) ? r.pics.slice() : []; }

  function today(now) { return (now instanceof Date && isFinite(now) ? now : new Date()).toISOString().slice(0, 10); }

  function shot(animalId, now) {
    try {
      var st = store || SA.photoStore;
      if (!capture || !st || !row(animalId)) return Promise.resolve(null);
      var data = capture(animalId);
      if (typeof data !== 'string' || data.indexOf('data:image/') !== 0) return Promise.resolve(null);
      var id = animalId + '-' + Date.now().toString(36) + (seq++).toString(36);
      var entry = { id: id, date: today(now) };
      return Promise.resolve(st.put(id, data)).then(function (ok) {
        if (!ok || !row(animalId)) return null;
        var res = keep(list(animalId), entry);
        var patch = {};
        patch[animalId] = { pics: res.keep };
        SA.save.update({ album: patch });
        res.drop.forEach(function (d) { try { Promise.resolve(st.del(d)).catch(function () {}); } catch (e) { /* ignore */ } });
        return id;
      }).catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  SA.albumPics = {
    NEWEST: NEWEST, keep: keep, cropRect: cropRect, list: list, shot: shot,
    setCapture: function (fn) { capture = typeof fn === 'function' ? fn : null; },
    setStore: function (s) { store = s || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
