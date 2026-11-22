/* SA.settingsView.create(doc, opts) -> { open(), close(), isOpen(), refresh() }: the grown-up drawer (DOM only).
 *   opts { reload?(), copy?(text) -> Promise|void, onChange?(), onOpen?() (after the hold opened it: the 🎒 menu closes) }
 * A ⚙ button (an item of the 🎒 menu) opens it only after a ~1.5s press-and-hold (SA.settings.createHold), so kids don't open it by
 * accident; a quick tap just shows a "hold" hint ring. The drawer holds: English labels toggle, difficulty selector,
 * mute, local stats (+ copy as text), "Send feedback" and Reset progress (with a confirm step).
 * Logic lives in SA.settings / SA.stats (pure, tested); this file is thin glue. Harmless no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;
  var BTN = 'font:700 1.1rem system-ui,sans-serif;color:#24543a;background:#fff;border:.15em solid #24543a;' +
    'border-radius:.6em;cursor:pointer;padding:.5em .8em;min-height:44px;touch-action:manipulation;';
  var DIFF_LABELS = { auto: 'Auto', beginner: 'Beginner', intermediate: 'Intermediate', challenge: 'Challenge' };

  function create(doc, opts) {
    var noop = function () {};
    var none = { open: noop, close: noop, isOpen: function () { return false; }, refresh: noop };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.settings) return none;
    opts = opts || {};
    function el(tag, css, text) {
      var e = doc.createElement(tag);
      if (css) e.style.cssText = css;
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function button(label, fn, css) {
      var b = el('button', BTN + (css || ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    }

    var gear = el('button', 'position:fixed;z-index:8;' +      // rect from SA.hud ('settings', top-right column)
      'border-radius:50%;border:3px solid #24543a;background:#fff8d6;opacity:.7;cursor:pointer;padding:0;touch-action:manipulation;', '⚙️');
    gear.type = 'button';
    if (SA.hudPlace) SA.hudPlace.register('settings', gear, { reserve: true, onPlace: function (r) { gear.style.fontSize = Math.round(r.height * 0.31) + 'px'; } });
    gear.setAttribute('aria-label', 'Settings (press and hold)');
    gear.title = 'Hold to open';
    var isOpen = false;
    var hold = SA.settings.createHold({ onOpen: function () { open(); if (opts.onOpen) opts.onOpen(); } });
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) { gear.addEventListener(ev, function () { hold.down(); }); });
    ['pointerup', 'pointerleave', 'pointercancel', 'touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(function (ev) {
      gear.addEventListener(ev, function () { hold.up(); });
    });

    var panel = el('div', 'position:fixed;top:0;right:0;bottom:0;width:min(380px,100%);z-index:9;display:none;overflow:auto;' +
      'box-sizing:border-box;padding:12px;background:#fff8d6;color:#24543a;border-left:.15em solid #24543a;' +
      'font:600 1.1rem system-ui,sans-serif;box-shadow:-.2em 0 .8em rgba(0,0,0,.3);');
    var title = el('div', 'display:flex;justify-content:space-between;align-items:center;font-size:1.4rem;font-weight:800;', 'Grown-ups ⚙️');
    title.appendChild(button('✖', function () { close(); }, 'min-width:44px;'));
    var englishBtn = button('', function () {
      SA.settings.setEnglish(!SA.settings.get().english); refresh(); changed();
    }, 'display:block;width:100%;margin-top:10px;');
    var diffRow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;');
    var diffBtns = {};
    SA.settings.DIFFICULTIES.forEach(function (d) {
      diffBtns[d] = button(DIFF_LABELS[d], function () { SA.settings.setDifficulty(d); refresh(); changed(); });
      diffRow.appendChild(diffBtns[d]);
    });
    var muteBtn = button('', function () {
      SA.settings.setMuted(!SA.settings.get().muted);
      if (SA.audioUI && SA.audioUI.refresh) SA.audioUI.refresh();
      refresh();
    }, 'display:block;width:100%;margin-top:10px;');
    var statsEl = el('pre', 'margin:10px 0 6px;padding:8px;background:#fff;border-radius:.5em;white-space:pre-wrap;font:500 .95rem ui-monospace,monospace;');
    var copyBtn = button('Copy stats', function () { copyStats(); });
    var note = el('div', 'min-height:1.4em;margin-top:6px;font-size:.95rem;');
    var fbText = el('textarea', 'display:block;width:100%;box-sizing:border-box;height:80px;margin-top:10px;font:500 1rem system-ui,sans-serif;');
    fbText.placeholder = 'Feedback for the developers';
    fbText.maxLength = 1000;
    var sendBtn = button('Send feedback', function () {
      var ev = SA.settings.sendFeedback(fbText.value, 'feedback');
      if (ev) { fbText.value = ''; say('Thanks! Feedback saved.'); } else say('Write something first.');
    });
    var resetBtn = button('Reset progress', function () { setConfirm(true); }, 'display:block;width:100%;margin-top:14px;color:#8a1c1c;border-color:#8a1c1c;');
    var confirmRow = el('div', 'display:none;margin-top:14px;gap:8px;align-items:center;flex-wrap:wrap;');
    confirmRow.appendChild(el('span', 'flex:1 1 100%;', 'Erase stars, props and stats?'));
    confirmRow.appendChild(button('Yes, erase', function () { doReset(); }, 'color:#fff;background:#8a1c1c;border-color:#8a1c1c;'));
    confirmRow.appendChild(button('Cancel', function () { setConfirm(false); }));
    [title, englishBtn, diffRow, muteBtn, statsEl, copyBtn, note, fbText, sendBtn, resetBtn, confirmRow].forEach(function (c) { panel.appendChild(c); });
    doc.body.appendChild(gear); doc.body.appendChild(panel);

    function changed() { if (opts.onChange) opts.onChange(); }
    function say(msg) { note.textContent = msg; }
    function setConfirm(on) { confirmRow.style.display = on ? 'flex' : 'none'; resetBtn.style.display = on ? 'none' : 'block'; }
    function labelFor(part) { var d = SA.data && SA.data.get && SA.data.get('parts', part); return d ? d.label.es : part; }
    function statsText() { return SA.stats.toText(SA.save.get(), labelFor); }

    function copyStats() {
      var text = statsText();
      try {
        var nav = root.navigator;
        if (opts.copy) { opts.copy(text); say('Copied.'); return; }
        if (nav && nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(text).then(function () { say('Copied.'); }, function () { fallbackCopy(text); });
          return;
        }
      } catch (e) { /* fall through */ }
      fallbackCopy(text);
    }
    function fallbackCopy(text) {
      var ok = false;
      try {
        var ta = el('textarea', 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;');
        ta.value = text; doc.body.appendChild(ta); ta.select();
        ok = !!doc.execCommand('copy');
        doc.body.removeChild(ta);
      } catch (e) { ok = false; }
      say(ok ? 'Copied.' : 'Select the text above and copy it.');
    }

    function doReset() {
      try { SA.settings.resetProgress(); } catch (e) { say('Could not reset.'); return; }
      setConfirm(false);
      // A fresh page start is the simplest way to rebuild stars, props and the round from the clean save.
      if (opts.reload) opts.reload();
      else if (root.location && typeof root.location.reload === 'function') root.location.reload();
    }

    function refresh() {
      var s = SA.settings.get();
      englishBtn.textContent = 'English labels: ' + (s.english ? 'ON' : 'off');
      englishBtn.setAttribute('aria-pressed', s.english ? 'true' : 'false');
      Object.keys(diffBtns).forEach(function (d) { diffBtns[d].style.background = d === s.difficulty ? '#ffe9a8' : '#fff'; });
      muteBtn.textContent = s.muted ? '🔇 Sound: off' : '🔊 Sound: on';
      statsEl.textContent = statsText();
    }
    function open() { isOpen = true; setConfirm(false); say(''); refresh(); panel.style.display = 'block'; }
    function close() { isOpen = false; panel.style.display = 'none'; setConfirm(false); }

    return { open: open, close: close, isOpen: function () { return isOpen; }, refresh: refresh };
  }

  SA.settingsView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
