/* SA.missionCard: pure step -> prompt-card mapping for the rescue mission (no THREE, no DOM; unit-tested in node:vm).
 * One place says what the card shows on each step, so it is never blank while a mission runs:
 *
 *   SA.missionCard.find(mission)   the clue text + the animal icon (a silhouette once a hint is showing), no camera badge
 *   SA.missionCard.help(task)      a care task ("Cura la pata", "Dale dos fresas") with its tool icon or the food icon
 *   SA.missionCard.photo(mission)  "Tómale una foto" (vocab phrase:tomalefoto) + the found animal's icon + the camera badge 📷
 *   SA.missionCard.forStep(mission, task?)  the card for the mission's current step (help needs the active care task)
 *
 * Every card is { step, text, key, icon, silhouette, camera }: `key` is what Replay says (a vocab key or the clue/task text),
 * `camera` shows the 📷 badge. The view shows it with showRound (find, photo) or showCare (help).
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var PHOTO_KEY = 'phrase:tomalefoto';
  var PHOTO_TEXT = 'Tómale una foto';
  var DEFAULT_ICON = '🐾';

  function animalIcon(id) {
    var a = null;
    try { a = SA.data && id ? SA.data.get('animals', id) : null; } catch (e) { a = null; }
    return (a && a.icon) || DEFAULT_ICON;
  }

  function find(m) {
    if (!m || !m.clue) return null;
    return { step: 'find', text: m.clue.text, key: m.clue.text, icon: animalIcon(m.answerId), silhouette: !!m.hintShown, camera: false };
  }

  function photo(m) {
    if (!m) return null;
    var phrase = null;
    try { phrase = SA.vocab && SA.vocab.get(PHOTO_KEY); } catch (e) { phrase = null; }
    return { step: 'photo', text: phrase ? phrase.es : PHOTO_TEXT, key: PHOTO_KEY, icon: animalIcon(m.animalId), silhouette: true, camera: true };
  }

  /** The tool icon that fits a care task (🪮 🧽 🩹), the food icon for feeding, or an open hand. */
  function helpIcon(task) {
    var def = null;
    try {
      if (task.kind === 'alimentar' && task.food) def = SA.data.get('foods', task.food);
      else if (task.item && task.item !== 'hands' && task.item !== 'food') def = SA.data.get('items', task.item);
    } catch (e) { def = null; }
    return (def && def.icon) || '✋';
  }

  function help(task) {
    if (!task || typeof task.text !== 'string') return null;
    return { step: 'help', text: task.text, key: task.text, icon: helpIcon(task), silhouette: false, camera: false };
  }

  function forStep(m, task) {
    if (!m || m.done) return null;
    if (m.step === 'find') return find(m);
    if (m.step === 'help') return help(task);
    if (m.step === 'photo') return photo(m);
    return null;
  }

  SA.missionCard = { PHOTO_KEY: PHOTO_KEY, find: find, help: help, photo: photo, helpIcon: helpIcon, forStep: forStep };
})(typeof window !== 'undefined' ? window : globalThis);
