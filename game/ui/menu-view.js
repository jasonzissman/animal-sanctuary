/* SA.menuView.create(doc, win) -> { menu, used(id), isOpen(), open(), close() }: the 🎒 button and its fan of items (DOM only).
 * One 🎒 button sits at the top of the top-right HUD column (SA.hud 'menu'). Tapping it fans out the four items below it in
 * their reserved SA.hud slots: 🔊 sound (audioUi), 🏡 habitat (sandbox), 📖 album, ⚙️ settings (the settings button keeps its own
 * press-and-hold guard). The item buttons are made by their own views; this file only shows/hides them and closes the menu on
 * an outside tap, Escape, or after habitat/album/settings is used. The M key toggles mute without opening the menu.
 * State and key rules are pure (SA.menu, game/menu.js). Harmless no-op without a DOM.
 */
(function (root) {
  'use strict';
  var SA = root.SA;

  function create(doc, win) {
    var none = { menu: null, used: function () {}, isOpen: function () { return false; }, open: function () {}, close: function () {} };
    if (!doc || typeof doc.createElement !== 'function' || !doc.body || !SA.menu) return none;
    win = win || root;
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = '🎒';
    btn.setAttribute('aria-label', 'Menú');
    btn.setAttribute('aria-haspopup', 'true');
    btn.title = 'Menú';
    btn.style.cssText = 'position:fixed;z-index:7;line-height:1;border-radius:50%;border:4px solid #24543a;background:#fff8d6;' +
      'cursor:pointer;padding:0;touch-action:manipulation;';
    doc.body.appendChild(btn);
    if (SA.hudPlace) SA.hudPlace.register('menu', btn, { reserve: true, onPlace: function (r) { btn.style.fontSize = Math.round(r.height * 0.5) + 'px'; } });

    var members = SA.menu.ITEMS.map(function (it) { return { item: it, el: SA.hudPlace ? SA.hudPlace.element(it.hud) : null }; })
      .filter(function (m) { return m.el; });

    function show(on) {
      members.forEach(function (m) { m.el.style.display = on ? '' : 'none'; });
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      btn.style.background = on ? '#ffe9a8' : '#fff8d6';
      if (SA.hudPlace) SA.hudPlace.refresh();
    }
    var menu = SA.menu.create({ onChange: show });
    show(false);

    // Habitat and album close the menu once their own handler has run. Settings does not: a quick tap only hints "hold", so
    // main.js calls used('settings') when the press-and-hold guard actually opens the drawer.
    members.forEach(function (m) {
      if (m.item.id !== 'settings') m.el.addEventListener('click', function () { menu.used(m.item.id); });
    });
    // Pointer events on the button stop here so a tap never also walks/picks in the 3D world underneath.
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) { btn.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    btn.addEventListener('click', function () { menu.toggle(); });

    // Outside tap: any press that does not land on the 🎒 button or one of its items closes the menu (capture, so it always runs).
    function inside(t) { return t === btn || members.some(function (m) { return m.el === t || (m.el.contains && m.el.contains(t)); }); }
    if (typeof doc.addEventListener === 'function') {
      ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) {
        doc.addEventListener(ev, function (e) { if (menu.isOpen() && !inside(e.target)) menu.outsideTap(); }, true);
      });
    }

    // Keyboard: Escape closes; M toggles mute (not while typing in the grown-ups feedback box).
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        var tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (menu.key(e.key) === 'sound' && SA.audioUI && SA.audio) SA.audioUI.toggle();
      });
    }

    return { menu: menu, used: function (id) { menu.used(id); }, isOpen: menu.isOpen, open: menu.open, close: menu.close };
  }

  SA.menuView = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
