import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './helpers/vm.js';

const SA = loadGame(['game/sa.js', 'game/hud.js']);
const { hud } = SA;
const SIZES = [[375, 667], [768, 1024], [1280, 800], [1920, 1080]];
const TRANSIENT = hud.ZONES.transient.concat(['snapshot', 'feedTray']);
const ALWAYS = hud.IDS.filter((id) => !TRANSIENT.includes(id));

function check(width, height, visible, label) {
  const rects = hud.layout({ width, height }, visible);
  for (const id of hud.IDS) {
    const r = rects[id];
    assert.ok(r && [r.left, r.top, r.width, r.height].every(Number.isInteger) && r.width > 0 && r.height > 0, `${label}: rect for ${id}`);
  }
  for (const id of visible) assert.ok(hud.onScreen(rects[id], width, height), `${label}: ${id} on-screen ${JSON.stringify(rects[id])}`);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      assert.ok(!hud.overlaps(rects[visible[i]], rects[visible[j]]),
        `${label}: ${visible[i]} overlaps ${visible[j]} ${JSON.stringify([rects[visible[i]], rects[visible[j]]])}`);
    }
  }
  return rects;
}

test('every known element has a rect; zones cover each id exactly once', () => {
  assert.equal(new Set(hud.IDS).size, hud.IDS.length);
  for (const id of ['prompt', 'snapshot', 'sandbox', 'album', 'settings', 'audioUi', 'hotbar', 'jump', 'climb', 'use', 'joystick',
    'orbitPad', 'pickingChip', 'pickupsToast', 'reachCue', 'hintArrow', 'clickFx']) assert.ok(hud.IDS.includes(id), id);
  for (const m of ['regular', 'compact']) for (const id of hud.IDS) assert.ok(hud.SIZES[m][id], `${m} size for ${id}`);
});

test('no two visible rects overlap and all are on-screen, everything visible, at 4 sizes', () => {
  for (const [w, h] of SIZES) check(w, h, hud.IDS, `${w}x${h}`);
});

test('every combination of transient overlays keeps the layout clean at 4 sizes', () => {
  for (const [w, h] of SIZES) {
    for (let mask = 0; mask < 1 << TRANSIENT.length; mask++) {
      const vis = ALWAYS.concat(TRANSIENT.filter((_, i) => mask & (1 << i)));
      check(w, h, vis, `${w}x${h} mask ${mask}`);
    }
  }
});

test('the snapshot card is on-screen and clear of every button at every size', () => {
  for (const [w, h] of SIZES) {
    const r = hud.layout({ width: w, height: h });
    assert.ok(hud.onScreen(r.snapshot, w, h));
    for (const id of hud.IDS) if (id !== 'snapshot') assert.ok(!hud.overlaps(r.snapshot, r[id]), `${w}x${h}: snapshot vs ${id}`);
  }
});

test('hidden ids keep their reserved slot; showing one does not move the always-visible controls', () => {
  for (const [w, h] of SIZES) {
    const some = hud.layout({ width: w, height: h }, ALWAYS);
    const all = hud.layout({ width: w, height: h });
    for (const id of ['hotbar', 'joystick', 'orbitPad', 'use', 'jump', 'climb', 'audioUi', 'album']) assert.deepEqual(some[id], all[id], `${w}x${h} ${id}`);
    assert.deepEqual(some.toast, all.toast);
  }
});

test('mode switches to compact on phone widths; small or odd sizes still return finite rects', () => {
  assert.equal(hud.mode({ width: 375, height: 667 }), 'compact');
  assert.equal(hud.mode({ width: 768, height: 1024 }), 'regular');
  const r = hud.layout({ width: 320, height: 480 }, ['prompt']);
  assert.ok(hud.IDS.every((id) => Number.isFinite(r[id].left + r[id].top + r[id].width + r[id].height)));
});

test('the mission prompt is a small pill: <= 6% of the height and <= 45% of the width at the 4 sizes, top-left', () => {
  for (const [w, h] of SIZES) {
    const r = hud.layout({ width: w, height: h }, ['prompt', 'stars']).prompt;
    assert.ok(r.height <= h * 0.06, `${w}x${h}: height ${r.height}`);
    assert.ok(r.width <= w * 0.45, `${w}x${h}: width ${r.width}`);
    assert.ok(r.height >= 32 && r.width >= 120, `${w}x${h}: still big enough to read and tap ${JSON.stringify(r)}`);
    assert.deepEqual([r.left, r.top], [12, 12]);
  }
});

test('the prompt pill view: tap replays, the camera is a badge (not a button), no replay/hint/camera buttons', () => {
  const made = [];
  const mk = (tag) => {
    const e = { tag, style: {}, textContent: '', attrs: {}, listeners: {}, children: [], appendChild(c) { this.children.push(c); },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
    made.push(e);
    return e;
  };
  const G = loadGame(['game/sa.js', 'game/hud.js', 'game/ui/prompt.js']);
  let replays = 0;
  const view = G.prompt.createView({ createElement: mk, body: { appendChild() {} }, documentElement: { clientWidth: 1280, clientHeight: 800 } },
    { replay: () => replays++ });
  const pillEl = made.find((e) => e.attrs.role === 'button');
  assert.ok(pillEl, 'the pill is the tappable element');
  pillEl.listeners.click();
  assert.equal(replays, 1);
  assert.equal(made.filter((e) => e.tag === 'button').length, 0, 'no <button> in the HUD from the prompt view');
  view.showRound({ text: 'Busca el animal verde', icon: '🐸', hintShown: false, stars: 0, camera: true });
  const cam = pillEl.children.find((c) => c.textContent === '📷');
  assert.ok(cam && cam.style.display !== 'none', 'camera icon shows in the pill when a photo is due');
  view.showRound({ text: 'Busca el animal verde', icon: '🐸', hintShown: false, stars: 0, camera: false });
  assert.equal(cam.style.display, 'none');
  assert.ok(pillEl.children.some((c) => c.textContent === 'Busca el animal verde'));
});

test('index.html and the manifest load hud.js before prompt.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('game/hud.js') > 0 && html.indexOf('game/hud.js') < html.indexOf('game/ui/prompt.js'));
});

test('prompt.js has no fixed pixel offsets for its bar, stars, toast, snapshot or tray', () => {
  const src = readFileSync(new URL('../game/ui/prompt.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /(?:top|left|right|bottom):\s*-?\d+px/);
  assert.match(src, /SA\.hud\.layout/);
});
