/* SA.photo: pure photo-mission logic (no THREE, no DOM; unit-tested in node:vm).
 *
 * A photo mission is the current Scout & Spot round (SA.round): the mission card shows the clue while the player roams, and the
 * find is completed by taking a picture of the matching animal with la cámara (Space / click / tap on an animal with the camera
 * equipped; SA.picking.emit carries item: 'camara').
 *
 *   SA.photo.CAMERA            item id of the camera ('camara')
 *   SA.photo.isShot(pick)      true when the pick was made with the camera in hand
 *   SA.photo.judge(round, id)  'match' (right animal) | 'other' (a different animal) | 'none' (no open mission)
 *   SA.photo.record(id)        counts the photo under save.photos[id] (kept for every animal, right or not; the album reads it)
 *                              and returns how many photos of that animal there are now
 *   SA.photo.take(game, pick)  { photo: true, verdict, saved, status, ...result } records the photo, then lets the round judge it:
 *                              a match completes the mission (stars, round.complete); a different animal is only a friendly
 *                              miss (status 'wrong'); with no open mission the photo is simply kept (status 'saved').
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var CAMERA = 'camara';
  var KEY_RE = /^[a-z0-9_-]+$/;

  function isShot(pick) { return !!pick && pick.item === CAMERA; }

  function judge(round, animalId) {
    if (!round || round.done || typeof animalId !== 'string') return 'none';
    return round.answerId === animalId ? 'match' : 'other';
  }

  function record(animalId) {
    if (typeof animalId !== 'string' || !KEY_RE.test(animalId) || !SA.save) return 0;
    var photos = SA.save.get().photos;
    photos = photos && typeof photos === 'object' && !Array.isArray(photos) ? photos : {};
    var n = (typeof photos[animalId] === 'number' && photos[animalId] >= 0 ? Math.floor(photos[animalId]) : 0) + 1;
    var patch = {};
    patch[animalId] = n;
    SA.save.update({ photos: patch });
    if (SA.album) SA.album.add(animalId);   // the first photo of a species dates its album page
    return n;
  }

  function take(game, pick) {
    if (!pick || typeof pick.animalId !== 'string') return { photo: false, status: 'ignored' };
    var verdict = judge(game && game.current && game.current(), pick.animalId);
    var saved = record(pick.animalId);
    var res = verdict === 'none' ? { status: 'saved' } : game.pick(pick);
    return Object.assign({ photo: true, verdict: verdict, saved: saved }, res);
  }

  SA.photo = { CAMERA: CAMERA, isShot: isShot, judge: judge, record: record, take: take };
})(typeof window !== 'undefined' ? window : globalThis);
