/* SA.missionsBoardView.create(doc, o) -> { render(), element }: the Misiones board inside the station menu (DOM only).
 *   o.body        the station menu's room (SA.stationMenuView.create(...).body). No-op without it or a DOM.
 *   o.onClose()   closes the menu (default: SA.station.close). Called after a mission starts and on Continuar.
 * Logic: SA.missions (state, start, abandon) and SA.missionsBoard (card mapping + layout). A row of picture cards in mission
 * order: ✅ done (tap replays), ⭐ next (glows; tap starts it, the scientist's intro comes later), 🔒 locked (grey silhouette
 * with its number), and the running one shows "En curso" with big Continuar / Abandonar buttons. Every card speaks its name
 * (SA.audio.say: speechSynthesis / text fallback). Re-rendered each time SA.station opens; the grid wraps or scrolls inside the card.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  var BTN = 'font:700 1.4rem system-ui,sans-serif;color:#24543a;background:#fff;border:.12em solid #24543a;border-radius:.8em;' +
    'cursor:pointer;touch-action:manipulation;min-height:64px;padding:0 .8em;margin:0;';

  function create(doc, o) {
    var none = { render: function () {}, element: null };
    o = o || {};
    if (!doc || typeof doc.createElement !== 'function' || !o.body || !SA.missions || !SA.missionsBoard) return none;
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function say(text) { if (text && SA.audio && SA.audio.say) SA.audio.say(text); }
    function closeMenu() { if (o.onClose) o.onClose(); else if (SA.station && SA.station.close) SA.station.close(); }
    function english() { try { return !!(SA.settings && SA.settings.get().english); } catch (e) { return false; } }
    function size() {
      var w = root.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 800;
      var h = root.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 600;
      return { w: w, h: h };
    }

    var D = SA.missionsDialogue;
    var strip = el('div', 'display:none;');      // the scientist's celebration (board mode only)
    var talkBox = el('div', 'display:none;');    // the scientist's intro lines (instead of the grid: one panel at a time)
    var grid = el('div', '');
    o.body.appendChild(strip);
    o.body.appendChild(talkBox);
    o.body.appendChild(grid);
    var talk = null;       // SA.missionsDialogue state while the intro plays, else null
    var pointId = null;    // the newly unlocked card the scientist points at (until the station opens again)
    var party = null;      // the celebration being shown
    function clear(n) {
      while (n.children && n.children.length) { if (n.removeChild) n.removeChild(n.children[0]); else n.children.shift(); }
    }

    function startNow(id) {
      var r = SA.missions.start(id);
      if (r && r.ok) closeMenu(); else { talk = null; render(); }   // busy (another one is running): just refresh, nothing breaks
    }

    function tapCard(c) {
      if (c.state === 'next' && D && !SA.missions.active()) { beginTalk(c.id); return; }   // the scientist introduces a new mission (speaking its lines) before Empezar starts it
      say(c.speak);
      if (c.state === 'locked' || c.state === 'active') return;   // active: its Continuar / Abandonar buttons do the work
      startNow(c.id);                                            // a done card replays at once
    }

    function beginTalk(id) {
      var row = SA.missions.list().filter(function (m) { return m.id === id; })[0];
      talk = D && row ? D.begin(row) : null;
      if (!talk) { startNow(id); return; }
      render();
      sayLine();
    }
    function sayLine() { var v = D.view(talk); if (v) say(v.line.es); }

    function button(text, fn) {
      var b = el('button', BTN, text);
      b.type = 'button';
      b.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); fn(); });
      return b;
    }

    function cardEl(c, L) {
      var base = 'box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:.8em;' +
        'border:.12em solid #24543a;font:700 1.2rem system-ui,sans-serif;color:#24543a;touch-action:manipulation;overflow:hidden;';
      var node;
      if (c.state === 'active') {
        node = el('div', base + 'width:' + L.availW + 'px;min-height:' + L.cardH + 'px;flex-direction:column;gap:.3em;padding:.4em;' +
          'background:#d9f5c9;border-color:#2f9e44;');
        node.appendChild(el('div', 'font-size:2.6rem;line-height:1;', c.glyph + ' ' + c.icon));
        node.appendChild(el('div', '', c.es));
        node.appendChild(el('div', 'font-size:1.5rem;', SA.missionsBoard.EN_CURSO));
        var row = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
        row.appendChild(button('▶️ ' + SA.missionsBoard.CONTINUAR, function () { say(SA.missionsBoard.CONTINUAR); closeMenu(); }));
        row.appendChild(button('✖️ ' + SA.missionsBoard.ABANDONAR, function () { SA.missions.abandon(); render(); }));
        node.appendChild(row);
        node.addEventListener('click', function () { say(c.speak); });
        return node;
      }
      var look = c.state === 'next' ? 'background:#fff3a0;border-color:#e6a700;box-shadow:0 0 14px 4px #ffd43b;cursor:pointer;' +
          (c.id === pointId ? 'box-shadow:0 0 22px 10px #ff922b;border-color:#e8590c;transform:scale(1.06);' : '')
        : c.state === 'locked' ? 'background:#b8b8b8;border-color:#7a7a7a;color:#6b6b6b;filter:grayscale(1);cursor:default;'
        : 'background:#fff8d6;cursor:pointer;';
      node = el('button', base + 'flex-direction:column;gap:.15em;padding:.3em;margin:0;width:' + L.cardW + 'px;height:' + L.cardH + 'px;' + look);
      node.type = 'button';
      node.setAttribute('aria-label', c.es);
      node.appendChild(el('div', 'font-size:1.1rem;line-height:1;', c.id === pointId && c.state === 'next' ? '👇 ' + c.glyph : c.glyph));
      node.appendChild(el('div', 'font-size:2.6rem;line-height:1.1;', c.state === 'locked' ? String(c.n) : c.icon));
      node.appendChild(el('div', 'font-size:1rem;line-height:1.1;text-align:center;overflow-wrap:anywhere;', c.state === 'locked' ? '' : c.es));
      if (c.en) node.appendChild(el('div', 'font-size:.8rem;font-weight:400;', c.en));
      node.addEventListener('click', function () { tapCard(c); });
      return node;
    }

    // The scientist's intro: one picture card per line (icon + short phrase), a Replay button, then Siguiente / Empezar.
    function renderTalk() {
      var v = D.view(talk);
      clear(talkBox);
      talkBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:.5em;padding:6px;max-width:100%;';
      talkBox.appendChild(el('div', 'font-size:2.4rem;line-height:1;', '🧑‍🔬'));
      var pic = el('div', 'display:flex;flex-direction:column;align-items:center;gap:.2em;padding:.5em 1em;background:#fff;' +
        'border:.12em solid #24543a;border-radius:.8em;min-width:min(60vw,260px);max-width:100%;text-align:center;');
      pic.appendChild(el('div', 'font-size:4.5rem;line-height:1;', v.line.icon));
      pic.appendChild(el('div', 'font-size:1.5rem;overflow-wrap:anywhere;', v.line.es));
      talkBox.appendChild(pic);
      var row = el('div', 'display:flex;flex-wrap:wrap;gap:12px;justify-content:center;');
      row.appendChild(button('🔊 Otra vez', sayLine));
      row.appendChild(button(v.last ? '▶️ ' + v.label : v.label + ' ➡️', function () {
        if (v.last) { say(v.label); startNow(talk.id); return; }
        talk = D.advance(talk); render(); sayLine();
      }));
      talkBox.appendChild(row);
    }

    // The celebration: once after a mission is finished, the scientist cheers (SFX + short phrase) and points at the new card.
    function showParty(p) {
      party = p;
      pointId = p.unlockedId;
      D.markSeen();
      if (SA.audio && SA.audio.sfx) { try { SA.audio.sfx(p.sfx); } catch (e) { /* silent */ } }
      say(p.lines.join(' '));
      if (root.SAT && root.SAT.track) { try { root.SAT.track('mission.celebrate', { id: p.id }); } catch (e) { /* telemetry never breaks play */ } }
    }

    function renderStrip() {
      clear(strip);
      if (!party) { strip.style.cssText = 'display:none;'; return; }
      strip.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:.4em;padding:.3em .6em;margin-bottom:6px;' +
        'background:#d9f5c9;border:.12em solid #2f9e44;border-radius:.8em;font:700 1.3rem system-ui,sans-serif;';
      strip.appendChild(el('span', 'font-size:2rem;', '🧑‍🔬'));
      strip.appendChild(el('span', 'font-size:2rem;', '🎉'));
      strip.appendChild(el('span', '', party.lines.join(' ')));
    }

    function render(celebrate) {
      if (celebrate) {
        talk = null; party = null; pointId = null;
        var p = D && D.celebration();
        if (p) showParty(p);
      }
      clear(grid);
      renderStrip();
      if (talk) {
        strip.style.cssText = 'display:none;';
        grid.style.cssText = 'display:none;';
        renderTalk();
        return;
      }
      talkBox.style.cssText = 'display:none;';
      var cards = SA.missionsBoard.cards(SA.missions.list(), { english: english() });
      var s = size(), L = SA.missionsBoard.layout(cards.length, s.w, s.h);
      grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:' + L.gap + 'px;justify-content:center;align-content:flex-start;box-sizing:border-box;' +
        'width:' + L.availW + 'px;max-width:100%;max-height:' + L.maxH + 'px;overflow-y:' + (L.scroll ? 'auto' : 'visible') + ';padding:6px;';
      cards.forEach(function (c) { grid.appendChild(cardEl(c, L)); });
    }

    // Hook for the intro conversation (AS-0142): open the board, point at the next card and run its intro; Empezar starts it.
    SA.missionsBoard.pointAndStartFirst = function () {
      if (SA.missions.active()) return { ok: false, reason: 'busy' };
      var next = SA.missions.next();
      if (!next) return { ok: false, reason: 'none' };
      if (SA.station && SA.station.open) SA.station.open('intro');
      pointId = next.id;
      beginTalk(next.id);
      return { ok: true, id: next.id };
    };

    render(false);
    if (SA.station && SA.station.onOpen) SA.station.onOpen(function () { render(true); });
    return { render: function () { render(false); }, element: grid };
  }

  SA.missionsBoardView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
