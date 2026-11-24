/* Missions data: registers kind "missions" (SA.data). Pure data; no THREE, no DOM. Logic is game/missions.js.
 *
 * Mission row (JSON-serialisable):
 *   id      unique lowercase key ('mama')
 *   n       1-based position in the ordered list; rows are contiguous (1, 2, 3...). Mission n unlocks when n-1 is done.
 *   es, en  short title ('¿Dónde está mamá?'); en is scaffolding only
 *   icon    short emoji
 *   intro   ONE line on the start card (AS-0220): { es, icon, en? }; es <= 4 words with correct gender/number, icon is the
 *           picture shown with it, en is the optional English toggle text. One press of "¡Vamos!" starts the mission.
 *   steps   ordered step objects { kind: 'find'|'help'|'follow'|..., line, ... }; the runner (AS-0178) owns the kinds' fields.
 *           line (required, AS-0223): { es, icon, en? } the ONE short line the prompt pill shows and speaks on that step;
 *           es <= 4 words with correct gender/number ('Llévalo con mamá'), icon is the picture beside it.
 *           at (optional, AS-0233): 'baby' | 'mama', which spawned animal is this step's world target (game/mission-spawn.js).
 *   spawn   optional { baby, mama, minApart? }: animal ids (game/data/animals.js) the mission places in the mamá's biome when it
 *           starts, at least minApart (default 14) apart. A replay can name another species' baby.
 *   carry   optional { item, to, near? } (AS-0313): the thing a 'carry' / 'deliver' step moves and its drop-off ids; game/mission-carry.js
 *           places both on dry ground near `near` ('pond', the default) when the mission starts. `hatch: { baby, mama, seconds? }`
 *           (AS-0315, optional): the egg placed in the nest hatches `baby` next to `mama` after `seconds` (default 5, 1..30)
 *   river   optional { animal, rock, log } (AS-0319): the stranded animal's id and the ids of the river rock and the fallen log; game/mission-log.js
 *           places them in the river and slides the log across ('push' step: item = the log id; 'goTo' step: place = the rock id)
 *   bananas optional { item, n, biome? } (AS-0326): the `n` pickups of `item` that game/mission-bananas.js scatters in `biome` (default 'selva')
 *           while this mission runs; a 'collect' step { item, n } counts them. A step may carry `gives` (a vocab 'thing' id, e.g. 'corona'):
 *           what the scientist hands over on a 'talk' step; it is spoken and cheered when that step is met.
 *   friends optional { animals, tree, monkey?, biome?, friendBiome?, say? } (AS-0327): the animal ids that 'invite' steps name (each
 *           { kind: 'invite', animal }), the id of the monkey's tree (a 'goTo' step's place), the monkey standing by it, the biome of the
 *           tree (default 'selva') and of the friends (default 'bosque'), and `say`: vocab keys spoken one per invite ('thing:fiesta').
 *           game/mission-friends.js places them while the mission runs; invited friends follow you, and the goTo to the tree only counts
 *           with them all there.
 *   party   optional { say, seconds? } (AS-0328): the party at the tree once the 'party' step starts (game/mission-party.js): confetti,
 *           balloons, dancing, the tune (SA.partyMelody) and the vocab key `say` spoken; `seconds` overrides the tune's length.
 *   doctor  optional { animal, part, item, say? } (AS-0331): the sick animal (its id), the body part a 'touch' step taps ('frente'), and the
 *           bucket id a 'carry' / 'fill' / 'deliver' sequence moves; `say` { touch?, fill?, give?, med?, shade?, rest? } vocab keys spoken on
 *           those steps. game/mission-doctor.js places the animal by the oasis and the bucket at the pool's edge only while the mission runs.
 *           AS-0332: `medicine` / `shade` (optional item ids) are the medicine and the umbrella lying on the station bench; `shade` is also
 *           the props row (game/data/props.js) planted beside the animal when it is delivered, after which the animal lies down and rests.
 *           `say.shade` is spoken at the shade, `say.rest` is the animal's one line afterwards ('¡Mañana estaré mejor!').
 *           AS-0333: a 'recover' step (the mission waits: it moves on at the next session or once another mission is finished, SA.missions.settle)
 *           and a 'photo' step of the healthy animal; `say.healthy` is spoken when it is well again ('¡Estoy sano!').
 *   nest    optional { item, summit, peak, summitPlace, nestPlace, chick, mama, say? } (AS-0336): `item` is the feather lying near the mountain
 *           trail (a 'collect' step { item, n: 1 } picks it up into the inventory), `summit` the peak id (game/peaks.js) a 'goTo' step
 *           { place: summitPlace } climbs, `peak` the nest peak across the rope bridge (a 'goTo' { place: nestPlace } that only counts after
 *           you crossed the bridge), `chick` / `mama` the animal ids sitting in the nest. `say` { feather?, summit?, bridge?, nest?, give?, fly? }: vocab
 *           key(s) spoken at each moment (a string or a list). AS-0337: a 'give' step { item, to } (tap the chick with the feather near it) takes the
 *           item out of the bag and plays the chick's first flight (game/flight.js); `say.give` is spoken at the gift, `say.fly` ('volar') during the flight.
 *           game/mission-nest.js owns it; nothing special-cases the animal id.
 *   pantry  optional { tree, place, family: { mama, papa, baby, babies }, say?: { arrive?, photo? } } (AS-0346): the mission prop `tree` (props.js,
 *           the hollow tree) stands hidden in the bosque with the mouse family inside (animal ids; `babies` = 1..5 of `baby`); a 'goTo' step
 *           { place } walks up to it and a 'photo' step { target: place } photographs the family. `say.arrive` / `say.photo` are vocab keys spoken once.
 *           game/mission-pantry.js owns it; nothing special-cases the animal id.
 *           AS-0347: `pantry.trail` { id, say?: { start } } is the footprint-and-crumb trail from the empty basket at the station to the tree;
 *           a 'trail' step { trail: id } finishes when you reach the tree's doorstep (game/mission-trail.js). `say.start` = vocab key(s) spoken at the step.
 *           AS-0348: `pantry.gift` (an item id, items.js) is what the family hands back for a 'give' step { item, to, n? } (tap the mice near the tree with the
 *           strawberries in the bag); `say.give` / `say.gift` (vocab key or list) are spoken at the share and the gift. A mission's `bananas` may carry
 *           `bag: true` (AS-0348): each pickup also goes into the inventory (and the pickups only stand while their 'collect' step is current).
 *   home    optional { place, family: { adult, baby, babies }, biome?, say?: { arrive?, photo? } } (AS-0350): the build spot the scientist chose
 *           (game/mission-home.js marks it on dry flat ground of `biome`, default 'bosque', with a ground marker and a glow ring) and the new
 *           rabbit family waiting beside it (animal ids; `babies` = 1..5 of `baby`). A 'goTo' step { place } walks to the spot and a 'photo'
 *           step { target: place } photographs the family. `say.arrive` / `say.photo` are vocab keys spoken once. Neither the spot nor the
 *           family exists unless this mission is the active one; nothing special-cases the animal id.
 *           AS-0351: `home.gather` (optional, 1..4 of { item, n, say? }) are the mission-only pickups lying 8-16 m around the spot (item ids from
 *           items.js, `say` a vocab key, default 'item:<id>'); each needs its own 'collect' step { item, n } and goes into the inventory.
 *           game/mission-gather.js owns them; they exist only while this mission runs and only while their collect step is current.
 *           AS-0352: 'place' steps { item, n?, layer: 'abajo'|'encima'|'dentro', place } (place = home.place) put the gathered item on the build spot
 *           (a tap with it in hand, game/mission-home.js put()); `home.say.built` is spoken when the last layer is on and the family moves in.
 *   reward  one-time reward { stars: whole number >= 0 }; never granted again on a replay
 * Missions not built yet are simply absent: the list ends and the board shows "Próximamente".
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var fail = SA.data.fail;
  var MAX_WORDS = 4;

  function validateMission(m) {
    if (!/^[a-z][a-z0-9-]*$/.test(m.id)) fail('id', 'must be lowercase ASCII letters, digits or "-"');
    if (typeof m.n !== 'number' || m.n < 1 || m.n !== Math.floor(m.n)) fail('n', 'must be a whole number >= 1');
    if (typeof m.es !== 'string' || !m.es.trim()) fail('es', 'must be a non-empty string');
    if (typeof m.en !== 'string' || !m.en.trim()) fail('en', 'must be a non-empty string');
    if (typeof m.icon !== 'string' || !m.icon.trim() || m.icon.length > 8) fail('icon', 'must be a short non-empty emoji string');
    var l = m.intro;
    if (!l || typeof l !== 'object' || Array.isArray(l)) fail('intro', 'must be ONE spoken line { es, icon }, not a list');
    if (typeof l.es !== 'string' || !l.es.trim()) fail('intro.es', 'must be a non-empty Spanish phrase');
    if (l.es.trim().split(/\s+/).length > MAX_WORDS) fail('intro.es', 'must be at most ' + MAX_WORDS + ' words (kids do not read walls of text)');
    if (typeof l.icon !== 'string' || !l.icon.trim() || l.icon.length > 8) fail('intro.icon', 'must be a short emoji for the picture card');
    if (l.en !== undefined && (typeof l.en !== 'string' || !l.en.trim())) fail('intro.en', 'must be a non-empty string when present');
    if (!Array.isArray(m.steps) || !m.steps.length) fail('steps', 'must be a non-empty array');
    m.steps.forEach(function (s, i) {
      var f = 'steps[' + i + ']';
      if (!s || typeof s !== 'object' || Array.isArray(s) || typeof s.kind !== 'string' || !s.kind) fail(f, 'must be an object with a "kind" string');
      var t = s.line;      // the one short line the prompt pill shows (and speaks) while this step is current (AS-0223)
      if (!t || typeof t !== 'object' || Array.isArray(t)) fail(f + '.line', 'is required: ONE short line { es, icon } for the prompt pill');
      if (typeof t.es !== 'string' || !t.es.trim()) fail(f + '.line.es', 'must be a non-empty Spanish phrase');
      if (t.es.trim().split(/\s+/).length > MAX_WORDS) fail(f + '.line.es', 'must be at most ' + MAX_WORDS + ' words (kids do not read walls of text)');
      if (typeof t.icon !== 'string' || !t.icon.trim() || t.icon.length > 8) fail(f + '.line.icon', 'must be a short emoji for the pill');
      if (t.en !== undefined && (typeof t.en !== 'string' || !t.en.trim())) fail(f + '.line.en', 'must be a non-empty string when present');
      if (s.at !== undefined && s.at !== 'baby' && s.at !== 'mama') fail(f + '.at', 'must be "baby" or "mama" when present');
      if (s.at !== undefined && !m.spawn) fail(f + '.at', 'needs the mission to declare a spawn');
    });
    if (m.spawn !== undefined) {
      var sp = m.spawn;
      if (!sp || typeof sp !== 'object' || Array.isArray(sp)) fail('spawn', 'must be { baby, mama, minApart? }');
      ['baby', 'mama'].forEach(function (k) { if (typeof sp[k] !== 'string' || !sp[k]) fail('spawn.' + k, 'must be an animal id string'); });
      if (sp.minApart !== undefined && (typeof sp.minApart !== 'number' || !(sp.minApart > 0))) fail('spawn.minApart', 'must be a number > 0');
    }
    if (m.carry !== undefined) {
      var c = m.carry;
      if (!c || typeof c !== 'object' || Array.isArray(c)) fail('carry', 'must be { item, to, near? }');
      ['item', 'to'].forEach(function (k) { if (typeof c[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c[k])) fail('carry.' + k, 'must be a lowercase id string'); });
      if (c.near !== undefined && c.near !== 'pond') fail('carry.near', 'must be a known anchor ("pond")');
      if (c.hatch !== undefined) {
        var h = c.hatch;
        if (!h || typeof h !== 'object' || Array.isArray(h)) fail('carry.hatch', 'must be { baby, mama, seconds? }');
        ['baby', 'mama'].forEach(function (k) { if (typeof h[k] !== 'string' || !h[k]) fail('carry.hatch.' + k, 'must be an animal id string'); });
        if (h.seconds !== undefined && (typeof h.seconds !== 'number' || !(h.seconds >= 1 && h.seconds <= 30))) fail('carry.hatch.seconds', 'must be a number from 1 to 30');
      }
    }
    if (m.river !== undefined) {
      var rv = m.river;
      if (!rv || typeof rv !== 'object' || Array.isArray(rv)) fail('river', 'must be { animal, rock, log }');
      ['animal', 'rock', 'log'].forEach(function (k) { if (typeof rv[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rv[k])) fail('river.' + k, 'must be a lowercase id string'); });
      ['bank', 'action'].forEach(function (k) { if (rv[k] !== undefined && (typeof rv[k] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rv[k]))) fail('river.' + k, 'must be a lowercase id string'); });
      if (rv.rubs !== undefined && (!Number.isInteger(rv.rubs) || rv.rubs < 1 || rv.rubs > 8)) fail('river.rubs', 'must be a whole number from 1 to 8');
    }
    if (m.bananas !== undefined) {
      var b = m.bananas;
      if (!b || typeof b !== 'object' || Array.isArray(b)) fail('bananas', 'must be { item, n, biome? }');
      if (typeof b.item !== 'string' || !/^[a-z][a-z0-9-]*$/.test(b.item)) fail('bananas.item', 'must be a lowercase id string');
      if (!Number.isInteger(b.n) || b.n < 1 || b.n > 6) fail('bananas.n', 'must be a whole number from 1 to 6');
      if (b.biome !== undefined && (typeof b.biome !== 'string' || !b.biome)) fail('bananas.biome', 'must be a biome id string');
      if (b.bag !== undefined && typeof b.bag !== 'boolean') fail('bananas.bag', 'must be true or false');
    }
    if (m.friends !== undefined) {
      var fr = m.friends, idRe = /^[a-z][a-z0-9-]*$/;
      if (!fr || typeof fr !== 'object' || Array.isArray(fr)) fail('friends', 'must be { animals, tree, monkey?, biome?, friendBiome?, say? }');
      if (!Array.isArray(fr.animals) || fr.animals.length < 1 || fr.animals.length > 3 || fr.animals.some(function (a) { return typeof a !== 'string' || !idRe.test(a); })) fail('friends.animals', 'must be 1 to 3 animal id strings');
      if (typeof fr.tree !== 'string' || !idRe.test(fr.tree)) fail('friends.tree', 'must be a lowercase id string');
      ['monkey', 'biome', 'friendBiome'].forEach(function (k) { if (fr[k] !== undefined && (typeof fr[k] !== 'string' || !idRe.test(fr[k]))) fail('friends.' + k, 'must be a lowercase id string'); });
      if (fr.say !== undefined && (!Array.isArray(fr.say) || fr.say.some(function (k) { return typeof k !== 'string' || !k; }))) fail('friends.say', 'must be a list of vocab keys');
    }
    if (m.party !== undefined) {
      var py = m.party;
      if (!py || typeof py !== 'object' || Array.isArray(py)) fail('party', 'must be { say, seconds? }');
      if (typeof py.say !== 'string' || !py.say) fail('party.say', 'must be a vocab key');
      if (py.seconds !== undefined && (typeof py.seconds !== 'number' || !(py.seconds >= 2 && py.seconds <= 30))) fail('party.seconds', 'must be a number from 2 to 30');
      if (!m.friends) fail('party', 'needs the mission to declare friends (the tree and the monkey)');
    }
    if (m.doctor !== undefined) {
      var d = m.doctor, did = /^[a-z][a-z0-9-]*$/;
      if (!d || typeof d !== 'object' || Array.isArray(d)) fail('doctor', 'must be { animal, part, item, say? }');
      ['animal', 'part', 'item'].forEach(function (k) { if (typeof d[k] !== 'string' || !did.test(d[k])) fail('doctor.' + k, 'must be a lowercase id string'); });
      ['medicine', 'shade'].forEach(function (k) { if (d[k] !== undefined && (typeof d[k] !== 'string' || !did.test(d[k]))) fail('doctor.' + k, 'must be a lowercase id string'); });
      if (d.say !== undefined) {
        var SAYS = ['touch', 'fill', 'give', 'med', 'shade', 'rest', 'healthy'];
        if (!d.say || typeof d.say !== 'object' || Array.isArray(d.say)) fail('doctor.say', 'must be { touch?, fill?, give?, med?, shade?, rest?, healthy? } vocab keys');
        Object.keys(d.say).forEach(function (k) { if (SAYS.indexOf(k) < 0 || typeof d.say[k] !== 'string' || !d.say[k]) fail('doctor.say.' + k, 'must be a vocab key for ' + SAYS.join(', ')); });
      }
    }
    if (m.nest !== undefined) {
      var n = m.nest, nid = /^[a-z][a-z0-9-]*$/;
      if (!n || typeof n !== 'object' || Array.isArray(n)) fail('nest', 'must be { item, summit, peak, summitPlace, nestPlace, chick, mama, say? }');
      ['item', 'summit', 'peak', 'summitPlace', 'nestPlace', 'chick', 'mama'].forEach(function (k) { if (typeof n[k] !== 'string' || !nid.test(n[k])) fail('nest.' + k, 'must be a lowercase id string'); });
      if (n.summit === n.peak) fail('nest.peak', 'must be a different peak from the summit');
      if (n.say !== undefined) {
        var NS = ['feather', 'summit', 'bridge', 'nest', 'give', 'fly'];
        if (!n.say || typeof n.say !== 'object' || Array.isArray(n.say)) fail('nest.say', 'must be { feather?, summit?, bridge?, nest?, give?, fly? } vocab keys');
        Object.keys(n.say).forEach(function (k) {
          var v = n.say[k], list = Array.isArray(v) ? v : [v];
          if (NS.indexOf(k) < 0 || !list.length || list.some(function (x) { return typeof x !== 'string' || !x; })) fail('nest.say.' + k, 'must be a vocab key (or list) for ' + NS.join(', '));
        });
      }
    }
    if (m.pantry !== undefined) {
      var pa = m.pantry, pid = /^[a-z][a-z0-9-]*$/;
      if (!pa || typeof pa !== 'object' || Array.isArray(pa)) fail('pantry', 'must be { tree, place, family, say? }');
      ['tree', 'place'].forEach(function (k) { if (typeof pa[k] !== 'string' || !pid.test(pa[k])) fail('pantry.' + k, 'must be a lowercase id string'); });
      var pf = pa.family;
      if (!pf || typeof pf !== 'object' || Array.isArray(pf)) fail('pantry.family', 'must be { mama, papa, baby, babies }');
      ['mama', 'papa', 'baby'].forEach(function (k) { if (typeof pf[k] !== 'string' || !pid.test(pf[k])) fail('pantry.family.' + k, 'must be an animal id string'); });
      if (!Number.isInteger(pf.babies) || pf.babies < 1 || pf.babies > 5) fail('pantry.family.babies', 'must be a whole number from 1 to 5');
      if (pa.gift !== undefined && (typeof pa.gift !== 'string' || !pid.test(pa.gift))) fail('pantry.gift', 'must be an item id string');
      if (pa.say !== undefined) {
        var PS = ['arrive', 'photo', 'give', 'gift'];
        if (!pa.say || typeof pa.say !== 'object' || Array.isArray(pa.say)) fail('pantry.say', 'must be { arrive?, photo?, give?, gift? } vocab keys');
        Object.keys(pa.say).forEach(function (k) {
          var v = pa.say[k], list = Array.isArray(v) ? v : [v];
          if (PS.indexOf(k) < 0 || !list.length || list.some(function (x) { return typeof x !== 'string' || !x; })) fail('pantry.say.' + k, 'must be a vocab key (or list) for ' + PS.join(', '));
        });
      }
    }
    if (m.pantry && m.pantry.trail !== undefined) {
      var tr = m.pantry.trail, ts = tr && tr.say && tr.say.start;
      if (!tr || typeof tr !== 'object' || Array.isArray(tr) || typeof tr.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(tr.id)) fail('pantry.trail', 'must be { id, say? } with a lowercase id');
      if (tr.say !== undefined && (!tr.say || typeof tr.say !== 'object' || [].concat(ts || []).some(function (x) { return typeof x !== 'string' || !x; }))) fail('pantry.trail.say', 'must be { start: vocab key or list }');
    }
    if (m.home !== undefined) {
      var ho = m.home, hid = /^[a-z][a-z0-9-]*$/;
      if (!ho || typeof ho !== 'object' || Array.isArray(ho)) fail('home', 'must be { place, family, biome?, say? }');
      if (typeof ho.place !== 'string' || !hid.test(ho.place)) fail('home.place', 'must be a lowercase id string (the id a goTo step names)');
      if (ho.biome !== undefined && (typeof ho.biome !== 'string' || !ho.biome)) fail('home.biome', 'must be a biome id string');
      var hf = ho.family;
      if (!hf || typeof hf !== 'object' || Array.isArray(hf)) fail('home.family', 'must be { adult, baby, babies }');
      ['adult', 'baby'].forEach(function (k) { if (typeof hf[k] !== 'string' || !hid.test(hf[k])) fail('home.family.' + k, 'must be an animal id string'); });
      if (!Number.isInteger(hf.babies) || hf.babies < 1 || hf.babies > 5) fail('home.family.babies', 'must be a whole number from 1 to 5');
      if (ho.say !== undefined) {
        if (!ho.say || typeof ho.say !== 'object' || Array.isArray(ho.say)) fail('home.say', 'must be { arrive?, built?, photo? } vocab keys');
        Object.keys(ho.say).forEach(function (k) { if (['arrive', 'built', 'photo'].indexOf(k) < 0 || typeof ho.say[k] !== 'string' || !ho.say[k]) fail('home.say.' + k, 'must be a vocab key for arrive, built, photo'); });
      }
      if (ho.gather !== undefined) {
        if (!Array.isArray(ho.gather) || ho.gather.length < 1 || ho.gather.length > 4) fail('home.gather', 'must be 1 to 4 { item, n } entries');
        ho.gather.forEach(function (g, gi) {
          var gf = 'home.gather[' + gi + ']';
          if (!g || typeof g !== 'object' || typeof g.item !== 'string' || !hid.test(g.item)) fail(gf + '.item', 'must be an item id string');
          if (!Number.isInteger(g.n) || g.n < 1 || g.n > 6) fail(gf + '.n', 'must be a whole number from 1 to 6');
          if (g.say !== undefined && (typeof g.say !== 'string' || !g.say)) fail(gf + '.say', 'must be a vocab key');
          if (!m.steps.some(function (s) { return s.kind === 'collect' && s.item === g.item && s.n === g.n; })) fail(gf, 'needs a matching collect step { item, n }');
        });
      }
    }
    m.steps.forEach(function (s, i) {
      if (s.kind !== 'place') return;
      var pf = 'steps[' + i + ']';
      if (['abajo', 'encima', 'dentro'].indexOf(s.layer) < 0) fail(pf + '.layer', 'must be "abajo", "encima" or "dentro"');
      if (!m.home || m.home.place !== s.place) fail(pf + '.place', 'must name the mission\'s home.place (the build spot)');
      if (s.n !== undefined && (!Number.isInteger(s.n) || s.n < 1 || s.n > 6)) fail(pf + '.n', 'must be a whole number from 1 to 6');
    });
    m.steps.forEach(function (s, i) {
      if (s.gives !== undefined && (typeof s.gives !== 'string' || !/^[a-z][a-z0-9-]*$/.test(s.gives))) fail('steps[' + i + '].gives', 'must be a lowercase vocab id string');
    });
    var r = m.reward;
    if (!r || typeof r !== 'object' || typeof r.stars !== 'number' || r.stars < 0 || r.stars !== Math.floor(r.stars)) fail('reward', 'must be { stars: whole number >= 0 }');
  }

  SA.data.defineKind('missions', validateMission);
  SA.data.register('missions', [
    // Mission 1 (AS-0173 builds it): a lost piglet follows you to mamá cerda. Later rows are added by their own tickets.
    { id: 'mama', n: 1, es: '¿Dónde está mamá?', en: 'Where is mama?', icon: '🐷',
      intro: { es: '¡Ayuda al cerdito!', en: 'Help the piglet!', icon: '🐷' },
      spawn: { baby: 'cerdito', mama: 'cerda', minApart: 24 },   // the map is 2x (AS-0249): finding mamá takes a longer walk
      steps: [{ kind: 'find', target: 'cerdito', at: 'baby', line: { es: 'Busca al cerdito', icon: '🐷', en: 'Find the piglet' } },
        { kind: 'follow', animal: 'cerdito', at: 'mama', line: { es: 'Llévalo con mamá', icon: '🐖', en: 'Take him to mama' } },
        { kind: 'photo', at: 'mama', line: { es: 'Toma una foto', icon: '📷', en: 'Take a photo' } }],
      reward: { stars: 2 } },
    // Mission 2 (AS-0313, slice 1 of AS-0181): a lost egg lies near a duck's nest by the pond; pick it up and set it in the nest.
    // The egg and nest are placed by game/mission-carry.js from `carry`; the steps are the generic carry / deliver kinds.
    { id: 'huevo', n: 2, es: 'El huevo perdido', en: 'The lost egg', icon: '🥚',
      intro: { es: '¡Salva el huevo!', en: 'Save the egg!', icon: '🥚' },
      // AS-0315: `hatch` = the placed egg cracks after `seconds` and `baby` appears next to `mama` (game/mission-hatch.js).
      carry: { item: 'huevo', to: 'nido', near: 'pond', hatch: { baby: 'patito', mama: 'pato', seconds: 5 } },
      steps: [{ kind: 'carry', item: 'huevo', fragile: true, line: { es: 'Recoge el huevo', icon: '🥚', en: 'Pick up the egg' } },
        { kind: 'deliver', item: 'huevo', to: 'nido', line: { es: 'Llévalo al nido', icon: '🪺', en: 'Take it to the nest' } },
        { kind: 'hatch', item: 'huevo', line: { es: 'Espera un poquito', icon: '⏳', en: 'Wait a little' } },
        { kind: 'photo', target: 'patito', line: { es: 'Foto de la familia', icon: '📷', en: 'Family photo' } }],
      reward: { stars: 2 } },
    // Mission 3 (AS-0319, slice 2 of AS-0182): a puppy is stranded on a rock in the river. Push the fallen log across the water so it
    // locks as a bridge, then walk over it to the rock. game/mission-log.js places the rock, puppy and log from `river`.
    { id: 'rio', n: 3, es: 'Rescate en el río', en: 'River rescue', icon: '🐶',
      intro: { es: '¡Salva al perrito!', en: 'Save the puppy!', icon: '🐶' },
      // AS-0320: `bank` is where the puppy is set down (a towel lies there), `rubs` the sponge taps that dry it, `action` the care action used.
      river: { animal: 'perrito', rock: 'roca', log: 'tronco', bank: 'orilla', rubs: 3, action: 'lavar' },
      steps: [{ kind: 'push', item: 'tronco', line: { es: 'Empuja el tronco', icon: '🪵', en: 'Push the log' } },
        { kind: 'goTo', place: 'roca', line: { es: 'Cruza el río', icon: '🌊', en: 'Cross the river' } },
        { kind: 'carry', item: 'perrito', line: { es: 'Recoge al perrito', icon: '🐶', en: 'Pick up the puppy' } },
        { kind: 'deliver', item: 'perrito', to: 'orilla', line: { es: 'Llévalo a la orilla', icon: '🏞️', en: 'Take it to the bank' } },
        { kind: 'dry', item: 'perrito', line: { es: 'Sécalo', icon: '🧽', en: 'Dry it off' } },
        // AS-0321: the dry puppy wags its tail; a photo of it ends the mission (and earns the sticker).
        { kind: 'photo', target: 'perrito', line: { es: 'Foto del perrito', icon: '📷', en: 'Puppy photo' } }],
      reward: { stars: 2 } },
    // Mission 4 (AS-0326, slice 1 of AS-0183): the monkey's birthday. Collect 3 bananas in the selva (game/mission-bananas.js scatters them
    // only while this mission runs), then ask the scientist for the flower crown. Inviting friends, the party and the photo come later.
    { id: 'fiesta', n: 4, es: 'La fiesta del mono', en: "The monkey's party", icon: '🎂',
      intro: { es: '¡Feliz cumpleaños, mono!', en: 'Happy birthday, monkey!', icon: '🐵' },
      bananas: { item: 'platano', n: 3, biome: 'selva' },
      friends: { animals: ['conejo', 'ciervo'], tree: 'arbol-mono', monkey: 'mono', biome: 'selva', friendBiome: 'bosque', say: ['thing:fiesta', 'thing:regalo'] },
      steps: [{ kind: 'collect', item: 'platano', n: 3, line: { es: 'Recoge 3 plátanos', icon: '🍌', en: 'Pick up 3 bananas' } },
        { kind: 'talk', who: 'scientist', gives: 'corona', line: { es: 'Pide la corona', icon: '👑', en: 'Ask for the crown' } },
        // AS-0327 (slice 2): walk up to two friends (each then follows you), then take them both to the monkey's tree.
        { kind: 'invite', animal: 'conejo', line: { es: 'Invita al conejo', icon: '🐰', en: 'Invite the rabbit' } },
        { kind: 'invite', animal: 'ciervo', line: { es: 'Invita al ciervo', icon: '🦌', en: 'Invite the deer' } },
        { kind: 'goTo', place: 'arbol-mono', line: { es: 'Al árbol del mono', icon: '🌳', en: "To the monkey's tree" } },
        // AS-0328 (slice 3): the party plays by itself (confetti, balloons, dancing, the tune), then a photo of it ends the mission.
        { kind: 'party', place: 'arbol-mono', line: { es: '¡A bailar!', icon: '🎉', en: 'Dance!' } },
        { kind: 'photo', target: 'mono', line: { es: 'Foto de la fiesta', icon: '📷', en: 'Party photo' } }],
      party: { say: 'phrase:felizcumple' },
      reward: { stars: 2 } },
    // Mission 5 (AS-0331, slice 1 of AS-0184): the camel by the oasis is sick. Touch its forehead ('tiene fiebre'), then bring it water:
    // pick up the bucket at the pool, fill it, and take it to the camel. game/mission-doctor.js places the camel and the bucket from `doctor`.
    { id: 'doctor', n: 5, es: 'Doctor del santuario', en: 'Sanctuary doctor', icon: '🩺',
      intro: { es: '¡El camello está enfermo!', en: 'The camel is sick!', icon: '🤒' },
      doctor: { animal: 'camello', part: 'frente', item: 'cubo', medicine: 'medicina', shade: 'sombrilla',
        say: { touch: 'phrase:tienefiebre', fill: 'thing:agua', give: 'thing:agua', med: 'thing:medicina', shade: 'thing:sombra', rest: 'phrase:mananamejor', healthy: 'phrase:estoysano' } },
      steps: [{ kind: 'touch', animal: 'camello', part: 'frente', line: { es: 'Toca la frente', icon: '🤒', en: 'Touch the forehead' } },
        { kind: 'carry', item: 'cubo', line: { es: 'Recoge el cubo', icon: '🪣', en: 'Pick up the bucket' } },
        { kind: 'fill', item: 'cubo', line: { es: 'Llénalo de agua', icon: '💧', en: 'Fill it with water' } },
        { kind: 'deliver', item: 'cubo', to: 'camello', line: { es: 'Dale agua al camello', icon: '🐫', en: 'Give the camel water' } },
        // AS-0332 (slice 2): the medicine from the station bench, given to the camel; then the umbrella from the bench, put up beside it.
        { kind: 'carry', item: 'medicina', line: { es: 'Busca la medicina', icon: '💊', en: 'Get the medicine' } },
        { kind: 'deliver', item: 'medicina', to: 'camello', line: { es: 'Dale la medicina', icon: '🐫', en: 'Give the medicine' } },
        { kind: 'carry', item: 'sombrilla', line: { es: 'Recoge la sombrilla', icon: '⛱️', en: 'Pick up the umbrella' } },
        { kind: 'deliver', item: 'sombrilla', to: 'camello', line: { es: 'Haz sombra al camello', icon: '⛱️', en: 'Give the camel shade' } },
        // AS-0333 (slice 3): it rests until the next session (or the next finished mission), then the photo of the healthy camel.
        { kind: 'recover', animal: 'camello', line: { es: 'Mañana estará mejor', icon: '🌙', en: 'Better tomorrow' } },
        { kind: 'photo', target: 'camello', line: { es: 'Foto del camello sano', icon: '📷', en: 'Photo of the healthy camel' } }],
      reward: { stars: 2 } },
    // Mission 6 (AS-0336, slice 1 of AS-0185): the eagle's nest. Pick up la pluma near the mountain trail (it goes into the inventory), climb
    // the grey peak `nest.summit`, then cross the rope bridge to the nest peak `nest.peak`, where the chick and mamá sit in the nest.
    // game/mission-nest.js places the feather and tracks the climb; the steps are the generic collect / goTo kinds. AS-0337 (slice 2): the
    // 'give' step hands la pluma to the chick, which flaps and flies a small loop beside mamá (game/flight.js), then a photo of the
    // family from the summit or the nest peak. AS-0338 (slice 3): that photo (target 'nido-aguila', a place so a wild eagle never completes it) is
    // SA.missionNest.snap: it completes the mission, goes into the album and earns the sticker 'aguilucho-volador'.
    { id: 'aguila', n: 6, es: 'El nido del águila', en: "The eagle's nest", icon: '🦅',
      intro: { es: '¡Busca la pluma!', en: 'Find the feather!', icon: '🪶' },
      nest: { item: 'pluma', summit: 'pico-n1', peak: 'pico-n2', summitPlace: 'cima', nestPlace: 'nido-aguila', chick: 'aguila', mama: 'aguila',
        say: { feather: 'item:pluma', summit: ['phrase:arriba', 'biome:montana'], bridge: 'thing:puente', nest: 'thing:nido', give: 'item:pluma', fly: 'phrase:volar' } },
      steps: [{ kind: 'collect', item: 'pluma', n: 1, line: { es: 'Busca la pluma', icon: '🪶', en: 'Find the feather' } },
        { kind: 'goTo', place: 'cima', line: { es: 'Sube la montaña', icon: '⛰️', en: 'Climb the mountain' } },
        { kind: 'goTo', place: 'nido-aguila', line: { es: 'Cruza el puente', icon: '🌉', en: 'Cross the bridge' } },
        { kind: 'give', item: 'pluma', to: 'aguila', line: { es: 'Dale la pluma', icon: '🪶', en: 'Give the feather' } },
        { kind: 'photo', target: 'nido-aguila', line: { es: 'Foto de las águilas', icon: '📷', en: 'Photo of the eagles' } }],
      reward: { stars: 2 } },
    // Mission 7 (AS-0341, slice 2 of AS-0186): the animal census. One 'census' step: when it starts SA.missionCensus asks SA.census for a fresh list
    // (a replay draws a different one); every photo with la cámara that fits an entry ticks it and speaks the trait; the full list finishes the
    // mission and earns the sticker 'censo-completo'.
    { id: 'censo', n: 7, es: 'Censo de animales', en: 'Animal census', icon: '📋',
      intro: { es: '¡Cuenta los animales!', en: 'Count the animals!', icon: '📋' },
      steps: [{ kind: 'census', line: { es: 'Fotografía la lista', icon: '📷', en: 'Photograph the list' } }],
      reward: { stars: 2 } },
    // Mission 8 (AS-0346, slice 1 of AS-0187): the strawberry thieves. A hidden hollow tree in the bosque holds a pantry piled with strawberries
    // and a mouse family (mamá, papá, 3 babies), placed by game/mission-pantry.js only while this mission runs. Walk up to the tree (goTo), then
    // photograph the family with la cámara; the photo (target = the place, so a wild mouse never completes it) ends the mission and earns the
    // sticker 'despensa-secreta'. AS-0347: the first step follows the footprints and crumbs from the empty basket at the station to the tree (game/mission-trail.js).
    { id: 'ladrones', n: 8, es: 'Los ladrones de fresas', en: 'The strawberry thieves', icon: '🍓',
      intro: { es: '¡Faltan fresas!', en: 'Strawberries are missing!', icon: '🍓' },
      // AS-0348 (slice 3): the babies were just hungry. Pick up 3 strawberries (the bosque pickups of `bananas`, kept in the bag), tap the mice to share
      // them (the 'give' step), and they happily hop and hand back a shiny acorn (`pantry.gift`, into the inventory); then the family photo.
      bananas: { item: 'fresa', n: 3, biome: 'bosque', bag: true },
      pantry: { tree: 'arbolhueco', place: 'despensa', family: { mama: 'ratoncampo', papa: 'ratoncampo', baby: 'ratoncito', babies: 3 }, gift: 'bellota',
        trail: { id: 'huellas', say: { start: ['thing:huellas', 'phrase:seguir'] } },
        say: { arrive: 'thing:ratones', give: 'phrase:compartir', gift: 'item:bellota', photo: 'thing:familia' } },
      steps: [{ kind: 'trail', trail: 'huellas', line: { es: 'Sigue las huellas', icon: '🐾', en: 'Follow the tracks' } },
        { kind: 'goTo', place: 'despensa', line: { es: 'Busca la despensa', icon: '🌳', en: 'Find the pantry' } },
        { kind: 'collect', item: 'fresa', n: 3, line: { es: 'Recoge 3 fresas', icon: '🍓', en: 'Pick up 3 strawberries' } },
        { kind: 'give', item: 'fresa', to: 'ratoncampo', n: 3, line: { es: 'Comparte las fresas', icon: '🐭', en: 'Share the strawberries' } },
        { kind: 'photo', target: 'despensa', line: { es: 'Foto de la familia', icon: '📷', en: 'Family photo' } }],
      reward: { stars: 2 } },
    // Mission 9 (AS-0350, slice 1 of AS-0188): build a home for a new rabbit family. The scientist chooses a build spot in the bosque; while this
    // mission runs game/mission-home.js marks it (ground marker + glow ring) and a rabbit family (an adult and 3 kits) waits beside it. For now: walk
    // to the spot (goTo), then photograph the family (target = the place, so a wild rabbit never completes it) for the reward and the sticker
    // 'hogar-nuevo'. Later slices add the building itself.
    { id: 'hogar', n: 9, es: 'Construir un hogar', en: 'Build a home', icon: '🏡',
      intro: { es: 'Construye una casa', en: 'Build a house', icon: '🏡' },
      // AS-0351 (slice 2): before walking to the spot, gather sticks, leaves and soft grass lying around it (`home.gather`, game/mission-gather.js):
      // each kind has its own 'collect' step, its pickups stand only while that step is current, and each goes into the bag and speaks its word.
      home: { place: 'hogar', biome: 'bosque', family: { adult: 'conejo', baby: 'conejito', babies: 3 }, say: { arrive: 'thing:casa', built: 'thing:casa', photo: 'thing:familia' },
        gather: [{ item: 'palo', n: 3 }, { item: 'hoja', n: 3 }, { item: 'hierba', n: 1 }] },
      steps: [{ kind: 'collect', item: 'palo', n: 3, line: { es: 'Recoge 3 palos', icon: '🪵', en: 'Pick up 3 sticks' } },
        { kind: 'collect', item: 'hoja', n: 3, line: { es: 'Recoge 3 hojas', icon: '🍃', en: 'Pick up 3 leaves' } },
        { kind: 'collect', item: 'hierba', n: 1, line: { es: 'Recoge la hierba', icon: '🌾', en: 'Pick up the soft grass' } },
        { kind: 'goTo', place: 'hogar', line: { es: 'Ve al lugar', icon: '📍', en: 'Go to the spot' } },
        // AS-0352 (slice 3): tap the build spot with the right item in hand (it is put in hand for you), one layer of the home per step:
        // sticks below, leaves on top, soft grass inside. The family then moves in and the photo ends the mission.
        { kind: 'place', item: 'palo', n: 3, layer: 'abajo', place: 'hogar', line: { es: 'Pon los palos abajo', icon: '🪵', en: 'Put the sticks below' } },
        { kind: 'place', item: 'hoja', n: 3, layer: 'encima', place: 'hogar', line: { es: 'Pon las hojas encima', icon: '🍃', en: 'Put the leaves on top' } },
        { kind: 'place', item: 'hierba', n: 1, layer: 'dentro', place: 'hogar', line: { es: 'Pon la hierba dentro', icon: '🌾', en: 'Put the grass inside' } },
        { kind: 'photo', target: 'hogar', line: { es: 'Foto de la familia', icon: '📷', en: 'Family photo' } }],
      reward: { stars: 2 } }
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
