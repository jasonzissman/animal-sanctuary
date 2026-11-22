import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';

const SIZES = [[375, 667], [768, 1024], [1280, 800], [1920, 1080]];
const url = (p) => new URL('../' + p, import.meta.url);

// Fresh context with a resizable viewport (innerWidth/innerHeight) and a captured 'resize' listener.
function boot(w, h) {
  const handlers = {};
  const ctx = vm.createContext({ console, innerWidth: w, innerHeight: h });
  ctx.window = ctx;
  ctx.addEventListener = (t, f) => { handlers[t] = f; };
  for (const f of ['game/sa.js', 'game/hud.js', 'game/ui/hud-place.js']) vm.runInContext(readFileSync(url(f), 'utf8'), ctx, { filename: f });
  return { ctx, SA: ctx.window.SA, resize(nw, nh) { ctx.innerWidth = nw; ctx.innerHeight = nh; handlers.resize(); } };
}
const px = (r) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
const styleRect = (el) => ({ left: parseInt(el.style.left, 10), top: parseInt(el.style.top, 10), width: parseInt(el.style.width, 10), height: parseInt(el.style.height, 10) });

test('a registered element takes its rect from SA.hud and follows window resizes', () => {
  const { SA, resize } = boot(1280, 800);
  const el = { style: {} };
  SA.hudPlace.register('album', el, { reserve: true });
  assert.deepEqual({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height },
    px(SA.hud.layout({ width: 1280, height: 800 }).album));
  resize(375, 667);
  assert.deepEqual({ left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height },
    px(SA.hud.layout({ width: 375, height: 667 }).album));
  assert.equal(el.style.width, '56px', 'phones get the compact size');
});

test('onPlace gets the rect and mode; unknown ids and missing elements are ignored', () => {
  const { SA } = boot(375, 667);
  const seen = [];
  SA.hudPlace.register('settings', { style: {} }, { onPlace: (r, m) => seen.push([r.width, m]) });
  assert.deepEqual(seen, [[44, 'compact']]);
  assert.doesNotThrow(() => { SA.hudPlace.register('nope', { style: {} }); SA.hudPlace.register('album', null); });
});

test('hiding an element frees its slot for the next one; showing it again pushes the next back down', () => {
  const { SA } = boot(1280, 800);
  const gear = { style: { display: 'none' } }, home = { style: {} };
  SA.hudPlace.register('settings', gear, {});
  SA.hudPlace.register('sandbox', home, {});
  const packed = styleRect(home).top;
  gear.style.display = 'block';
  SA.hudPlace.refresh();
  assert.ok(styleRect(home).top > packed, 'sandbox sits lower once settings is shown');
  assert.equal(styleRect(gear).top + styleRect(gear).height + 8, styleRect(home).top);
  // reserve keeps the slot while hidden, so a neighbour never jumps
  gear.style.display = 'none';
  SA.hudPlace.register('settings', gear, { reserve: true });
  assert.ok(styleRect(home).top > packed);
});

test('🏡, 📖 and the settings button never overlap the prompt, stars or snapshot card at the 4 sizes', () => {
  for (const [w, h] of SIZES) {
    const { SA } = boot(w, h);
    const els = { sandbox: { style: {} }, album: { style: {} }, settings: { style: {} } };
    for (const id of Object.keys(els)) SA.hudPlace.register(id, els[id], { reserve: true });
    const L = SA.hud.layout({ width: w, height: h });
    for (const id of Object.keys(els)) {
      const r = styleRect(els[id]);
      assert.ok(SA.hud.onScreen(r, w, h), `${w}x${h} ${id} on-screen`);
      for (const other of ['prompt', 'stars', 'snapshot', 'toast', 'hotbar', 'joystick', 'orbitPad']) {
        assert.ok(!SA.hud.overlaps(r, L[other]), `${w}x${h}: ${id} vs ${other}`);
      }
    }
    const ids = Object.keys(els);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) assert.ok(!SA.hud.overlaps(styleRect(els[ids[i]]), styleRect(els[ids[j]])));
  }
});

test('nudge keeps the hint arrow on-screen and clear of every HUD element wherever it points', () => {
  for (const [w, h] of SIZES) {
    const { SA } = boot(w, h);
    const others = SA.hud.IDS.filter((id) => !SA.hud.ZONES.floating.includes(id)).map((id) => SA.hud.layout({ width: w, height: h })[id]);
    const size = SA.hud.SIZES[SA.hud.mode({ width: w })].hintArrow[0];
    for (const ex of [-1, -0.5, 0, 0.5, 1]) {
      for (const ey of [-1, -0.5, 0, 0.5, 1]) {
        const r = SA.hud.nudge({ left: Math.round((ex + 1) / 2 * w - size / 2), top: Math.round((1 - ey) / 2 * h - size / 2), width: size, height: size }, others, w, h);
        assert.ok(SA.hud.onScreen(r, w, h), `${w}x${h} (${ex},${ey}) on-screen`);
        assert.ok(others.every((o) => !SA.hud.overlaps(r, o)), `${w}x${h} (${ex},${ey}) clear ${JSON.stringify(r)}`);
      }
    }
  }
});

test('the hint arrow module places itself through SA.hud (pixels, on-screen)', () => {
  const { SA, ctx } = boot(1280, 800);
  vm.runInContext(readFileSync(url('game/ui/hint-arrow.js'), 'utf8'), ctx);
  const el = { style: {}, setAttribute() {}, addEventListener() {} };
  const a = SA.hintArrow.create({ body: { appendChild() {} }, createElement: () => el });
  a.show(1, 1, 0);   // top-right corner: where the buttons live
  const r = styleRect(el);
  assert.ok(SA.hud.onScreen(r, 1280, 800));
  assert.equal(r.width, 72);
  assert.ok(Object.values(SA.hud.layout({ width: 1280, height: 800 })).every((o) => o === undefined || !SA.hud.overlaps(r, o) || SA.hud.ZONES.floating.some((id) => SA.hud.layout({ width: 1280, height: 800 })[id] === o)));
});

test('no numeric top/left/right/bottom offsets on position:fixed elements in game/ui (positions come from SA.hud)', () => {
  const dir = url('game/ui/');
  const bad = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const lines = readFileSync(new URL(f, dir), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('position:fixed')) return;
      let a = i, b = i;
      while (a > 0 && lines[a - 1].trimEnd().endsWith('+')) a--;
      while (b < lines.length - 1 && lines[b].trimEnd().endsWith('+')) b++;
      const stmt = lines.slice(a, b + 1).join('\n');
      const m = /(?<![-\w])(?:top|left|right|bottom):\s*-?(?:0*[1-9]\d*|0*\.\d*[1-9])/.exec(stmt);
      if (m) bad.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('index.html and the manifest load hud-place.js right after hud.js', () => {
  for (const f of ['index.html', 'game/manifest.js']) {
    const src = readFileSync(url(f), 'utf8');
    assert.ok(src.indexOf('game/hud.js') > 0 && src.indexOf('game/ui/hud-place.js') > src.indexOf('game/hud.js'), f);
    assert.ok(src.indexOf('game/ui/hud-place.js') < src.indexOf('game/ui/prompt.js'), f);
    for (const m of ['hotbar-view', 'joystick-view', 'orbit-pad', 'hint-arrow', 'album-view', 'sandbox-view', 'settings-view']) {
      assert.ok(src.indexOf('game/ui/hud-place.js') < src.indexOf('game/ui/' + m + '.js'), `${f}: ${m}`);
    }
  }
});
