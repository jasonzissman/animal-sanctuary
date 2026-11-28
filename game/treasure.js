/* SA.treasure: the chests hidden in the grottos behind the waterfalls (AS-0174). Pure (no THREE, no DOM; node:vm tested).
 * The geometry is SA.grottoPlan, the show is game/render/grotto.js; this module keeps what was found, once per save.
 * Save: optional `treasure: { opened: [siteId], cosmetics: [rewardId] }` (no version bump). A chest, once opened, stays open after a reload.
 *
 *   SA.treasure.rewards                 { montana, selva }: one unique original reward per chest { id, kind: 'hat'|'collar', icon, es, key? }
 *       montana -> 'sombrero-explorador' (an explorer hat for the character customizer, AS-0144)   selva -> 'collar-dorado' (a golden collar for your animal friend)
 *   SA.treasure.isOpen(siteId)          true once that chest was opened      SA.treasure.opened()  the opened site ids
 *   SA.treasure.cosmetics()             the reward ids found so far (the customizer / friend read these)     SA.treasure.has(rewardId)
 *   SA.treasure.open(siteId)            -> { first, reward, earned: [badge rows] }; first is true only the one time that grants the reward. The rare
 *                                          secret stickers ('Buscador de tesoros' at one chest, 'Cofres dorados' at both) are earned through SA.badges and
 *                                          handed to the sticker book celebration (SA.stickers.notify).
 *   SA.treasure.line                    { es: '¡Un tesoro!', key }: what is shown and spoken when the lid opens
 *   SA.treasure.riddle()                -> { es, key } the scientist's whisper once the kid has 10 rescues and a chest is still closed, else null
 *   SA.treasure.create({ save?, badges?, stickers?, rescues?, track? })   a separate instance (tests)
 * Telemetry: treasure.opened { id, reward }.
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var RESCUES_FOR_RIDDLE = 10;
  var REWARDS = {
    montana: { id: 'sombrero-explorador', kind: 'hat', icon: '🤠', es: 'el sombrero de explorador' },
    selva: { id: 'collar-dorado', kind: 'collar', icon: '📿', es: 'el collar dorado' }
  };
  var LINE = { es: '¡Un tesoro!', key: 'phrase:untesoro' };
  var RIDDLE = { es: 'Detrás del agua que cae... hay algo brillante.', key: 'phrase:tesoroadivina' };

  function create(opts) {
    opts = opts || {};
    function store() { return opts.save || SA.save; }
    function data() { var t = store().get().treasure; return { opened: t && Array.isArray(t.opened) ? t.opened.slice() : [], cosmetics: t && Array.isArray(t.cosmetics) ? t.cosmetics.slice() : [] }; }
    function track(type, fields) {
      try { if (opts.track) opts.track(type, fields); else if (root.SAT && root.SAT.track) root.SAT.track(type, fields); } catch (e) { /* telemetry never breaks play */ }
    }
    function opened() { return data().opened; }
    function isOpen(id) { return opened().indexOf(id) >= 0; }
    function cosmetics() { return data().cosmetics; }
    function has(id) { return cosmetics().indexOf(id) >= 0; }

    function open(id) {
      var reward = REWARDS[id];
      if (!reward) return { first: false, reward: null, earned: [] };
      if (isOpen(id)) return { first: false, reward: reward, earned: [] };
      var d = data();
      d.opened.push(id);
      if (d.cosmetics.indexOf(reward.id) < 0) d.cosmetics.push(reward.id);
      store().update({ treasure: d });   // the save replaces arrays wholesale, so the lists persist as written
      track('treasure.opened', { id: id, reward: reward.id });
      var ids = [], rows = [];
      try {
        var b = opts.badges || SA.badges;
        ids = b.check();
        var all = SA.data ? SA.data.all('badges') : [];
        rows = ids.map(function (bid) { return all.filter(function (r) { return r.id === bid; })[0]; }).filter(Boolean);
        var tell = opts.stickers || SA.stickers;
        if (rows.length && tell && tell.notify) tell.notify(rows);
      } catch (e) { /* the sticker pop never breaks play */ }
      return { first: true, reward: reward, earned: rows };
    }

    function rescueCount() {
      try { return opts.rescues ? opts.rescues() : (SA.rescueLog ? SA.rescueLog.list().length : 0); } catch (e) { return 0; }
    }
    function riddle() {
      if (rescueCount() < RESCUES_FOR_RIDDLE) return null;
      return Object.keys(REWARDS).every(isOpen) ? null : { es: RIDDLE.es, key: RIDDLE.key };
    }

    return { rewards: REWARDS, line: LINE, isOpen: isOpen, opened: opened, cosmetics: cosmetics, has: has, open: open, riddle: riddle, create: create,
      RESCUES_FOR_RIDDLE: RESCUES_FOR_RIDDLE };
  }

  SA.treasure = create();
})(typeof window !== 'undefined' ? window : globalThis);
