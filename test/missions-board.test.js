import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/station-door.js', 'game/data/missions.js', 'game/missions.js',
  'game/missions-board.js', 'game/missions-dialogue.js', 'game/ui/station-menu-view.js', 'game/ui/missions-board-view.js'];

const row = (n) => ({ id: 'm' + n, n, es: 'Misión ' + n + ' nombre', en: 'Mission ' + n, icon: '🐷', intro: [{ es: 'Hola ' + n + '.', icon: '👋' }, { es: 'Vamos.', icon: '🚶' }],
  steps: [{ kind: 'find' }, { kind: 'photo' }], reward: { stars: n } });
const plain = (o) => JSON.parse(JSON.stringify(o));

function setup(count = 4) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const rows = Array.from({ length: count }, (_, i) => row(i + 1));
  SA.missions = SA.missions.create({ missions: rows, rng: () => 0.5, track: () => {} });
  Object.assign(SA.missionsDialogue, SA.missionsDialogue.create({ missions: rows }));   // celebration reads these rows, not SA.data
  const said = [];
  SA.audio = { say: (t) => said.push(t), sfx: () => {} };
  return { SA, said };
}

// --- pure mapping -----------------------------------------------------------------------------------------------------

test('cards map status to done / next / active / locked with glyphs, icons and silhouettes', () => {
  const { SA } = setup();
  SA.missions.start('m1'); SA.missions.complete();
  const cards = SA.missionsBoard.cards(SA.missions.list());
  assert.deepEqual(cards.map((c) => c.state), ['done', 'next', 'locked', 'locked']);
  assert.deepEqual(cards.map((c) => c.glyph), ['✅', '⭐', '🔒', '🔒']);
  assert.equal(cards[0].icon, '🐷');
  assert.equal(cards[0].speak, 'Misión 1 nombre');
  assert.equal(cards[2].silhouette, true);
  assert.equal(cards[2].icon, '', 'a locked card hides its picture');
  assert.equal(cards[2].speak, 'Misión 3', 'a locked card says only its number: the title stays a surprise');
  assert.equal(cards[0].en, null, 'English is off by default');
  assert.equal(SA.missionsBoard.cards(SA.missions.list(), { english: true })[0].en, 'Mission 1');
  SA.missions.start('m2');
  assert.equal(SA.missionsBoard.cards(SA.missions.list())[1].state, 'active');
  assert.deepEqual(plain(SA.missionsBoard.cards(null)), []);
});

test('layout never overflows the width, never overlaps, and scrolls when too tall', () => {
  const { SA } = setup();
  for (const [w, h] of [[360, 640], [768, 1024], [1280, 720], [1920, 1080], [0, 0]]) {
    for (const count of [0, 1, 3, 8, 12, 30]) {
      const L = SA.missionsBoard.layout(count, w, h);
      assert.ok(L.cols >= 1 && L.cardW >= 100, `${w}x${h}/${count}: card ${L.cardW}`);
      assert.ok(L.cols * L.cardW + (L.cols - 1) * L.gap <= L.availW, `${w}x${h}/${count}: row fits`);
      assert.ok(L.availW <= (w || 800), 'fits the screen');
      assert.ok(L.scroll === (L.rows * L.cardH + Math.max(0, L.rows - 1) * L.gap > L.maxH));
    }
  }
  assert.equal(SA.missionsBoard.layout(30, 360, 640).scroll, true);
  assert.equal(SA.missionsBoard.layout(2, 1280, 720).scroll, false);
});

// --- DOM wiring -------------------------------------------------------------------------------------------------------

function fakeDom() {
  const mk = () => ({ style: {}, children: [], listeners: {}, attrs: {}, textContent: '',
    appendChild(c) { this.children.push(c); }, removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; } });
  const body = mk();
  return { doc: { createElement: mk, body, addEventListener() {} }, body };
}
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)];
const find = (n, pred) => (pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean));

function board(count) {
  const { SA, said } = setup(count);
  const { doc } = fakeDom();
  const menu = SA.stationMenuView.create(doc, {});
  const view = SA.missionsBoardView.create(doc, { body: menu.body });
  return { SA, said, menu, view, cards: () => view.element.children };
}

test('opening the station shows every mission in order as done, next and locked cards', () => {
  const { SA, menu, cards } = board(4);
  SA.missions.start('m1'); SA.missions.complete(); SA.missionsDialogue.markSeen();   // (the celebration has its own test)
  SA.station.open('use');
  assert.equal(menu.isOpen(), true);
  assert.equal(cards().length, 4);
  const glyphs = cards().map((c) => c.children[0].textContent);
  assert.deepEqual(glyphs, ['✅', '⭐', '🔒', '🔒']);
  assert.equal(cards()[2].children[1].textContent, '3', 'locked: its number');
  assert.match(cards()[2].style.cssText, /grayscale/);
  assert.match(cards()[1].style.cssText, /box-shadow/, 'the next card glows');
  assert.equal(cards()[3].children[2].textContent, '', 'locked: no title');
  const w = cards().map((c) => parseInt(/width:(\d+)px/.exec(c.style.cssText)[1], 10));
  assert.ok(w.every((x) => x === w[0]), 'equal-size cards');
});

test('it re-renders each time the station opens', () => {
  const { SA, cards } = board(3);
  SA.station.open('use');
  assert.equal(cards()[0].children[0].textContent, '⭐');
  SA.station.close();
  SA.missions.start('m1'); SA.missions.complete();
  SA.station.open('use');
  assert.equal(cards()[0].children[0].textContent, '✅');
});

const clickText = (root, re) => find(root, (n) => re.test(n.textContent) && n.listeners.click && n.children.length === 0).listeners.click({ stopPropagation() {} });
const shown = (n) => !/display:none/.test(n.style.cssText);

test('tapping the next card plays the intro lines one by one, then Empezar starts it and closes the menu', () => {
  const { SA, said, menu, view, cards } = board(3);
  SA.station.open('use');   // the scientist's panels are siblings of the grid inside the menu body
  const body = menu.element.children[0].children[2];
  const panel = body.children[1];
  cards()[0].listeners.click();
  assert.equal(SA.missions.active(), null, 'does not start straight away');
  assert.equal(menu.isOpen(), true);
  assert.equal(shown(panel), true);
  assert.equal(shown(view.element), false, 'the talk replaces the grid: nothing overlaps');
  assert.deepEqual(said, ['Hola 1.']);
  assert.ok(texts(panel).includes('👋') && texts(panel).includes('Hola 1.'), 'picture card + phrase');
  clickText(panel, /Otra vez/);
  assert.deepEqual(said, ['Hola 1.', 'Hola 1.'], 'Replay says the line again');
  clickText(panel, /Siguiente/);
  assert.deepEqual(said.slice(2), ['Vamos.']);
  assert.ok(texts(panel).includes('🚶'));
  assert.equal(SA.missions.active(), null);
  clickText(panel, /Empezar/);
  assert.equal(SA.missions.active().id, 'm1');
  assert.equal(menu.isOpen(), false);
});

test('opening the station again drops a half-heard intro and shows the board', () => {
  const { SA, view, menu } = board(3);
  SA.station.open('use');
  view.element.children[0].listeners.click();
  SA.station.close();
  SA.station.open('use');
  assert.equal(shown(view.element), true);
  assert.equal(shown(menu.element.children[0].children[2].children[1]), false);
});

test('after finishing a mission the next visit celebrates once and points at the new card', () => {
  const { SA, said, view, cards } = board(3);
  const sfx = [];
  SA.audio.sfx = (n) => sfx.push(n);
  SA.missions.start('m1'); SA.missions.complete();
  SA.station.open('use');
  assert.deepEqual(sfx.includes('fanfare'), true);
  assert.ok(said.includes('¡Lo lograste! ¡Nueva misión!'));
  assert.match(cards()[1].style.cssText, /scale/, 'the unlocked card is highlighted');
  assert.match(cards()[1].children[0].textContent, /👇/);
  assert.doesNotMatch(cards()[0].style.cssText, /scale/);
  SA.station.close();
  sfx.length = 0; said.length = 0;
  SA.station.open('use');
  assert.deepEqual(sfx.filter((n) => n === 'fanfare'), [], 'plays only once');
  assert.deepEqual(said, []);
  assert.doesNotMatch(cards()[1].style.cssText, /scale/);
  assert.ok(view);
});

test('pointAndStartFirst opens the board, points at mission 1 and runs its intro', () => {
  const { SA, said, menu } = board(3);
  assert.equal(menu.isOpen(), false);
  const r = SA.missionsBoard.pointAndStartFirst();
  assert.deepEqual(plain(r), { ok: true, id: 'm1' });
  assert.equal(menu.isOpen(), true);
  assert.deepEqual(said, ['Hola 1.']);
  const panel = menu.element.children[0].children[2].children[1];
  clickText(panel, /Siguiente/);
  clickText(panel, /Empezar/);
  assert.equal(SA.missions.active().id, 'm1');
  assert.deepEqual(plain(SA.missionsBoard.pointAndStartFirst()), { ok: false, reason: 'busy' });
});

test('pointAndStartFirst without a mounted board is a safe no-op', () => {
  const { SA } = setup(2);
  assert.deepEqual(plain(SA.missionsBoard.pointAndStartFirst()), { ok: false, reason: 'no-board' });
});

test('tapping a done card replays it', () => {
  const { SA, said, cards } = board(3);
  SA.missions.start('m1'); SA.missions.complete(); SA.missionsDialogue.markSeen();
  SA.station.open('use');
  cards()[0].listeners.click();
  assert.equal(SA.missions.active().id, 'm1');
  assert.equal(SA.missions.active().replay, true);
  assert.equal(said[0], 'Misión 1 nombre');
});

test('a locked card speaks its number but never starts', () => {
  const { SA, said, menu, cards } = board(3);
  SA.station.open('use');
  cards()[2].listeners.click();
  assert.deepEqual(said, ['Misión 3']);
  assert.equal(SA.missions.active(), null);
  assert.equal(menu.isOpen(), true);
});

test('the active mission shows En curso with Continuar and Abandonar that work', () => {
  const { SA, said, menu, cards } = board(3);
  SA.missions.start('m1');
  SA.station.open('use');
  const act = cards()[0];
  assert.ok(texts(act).includes('En curso'));
  assert.match(act.style.cssText, /width:\d+px/);
  const cont = find(act, (n) => /Continuar/.test(n.textContent) && n.listeners.click);
  const aband = find(act, (n) => /Abandonar/.test(n.textContent) && n.listeners.click);
  assert.ok(cont && aband);
  assert.match(cont.style.cssText, /min-height:64px/, 'big touch targets');
  // another card while busy: speaks, does not start, stays open
  cards()[1].listeners.click();
  assert.equal(SA.missions.active().id, 'm1');
  assert.equal(menu.isOpen(), true);
  cont.listeners.click({ stopPropagation() {} });
  assert.equal(menu.isOpen(), false, 'Continuar closes the menu');
  assert.equal(SA.missions.active().id, 'm1', 'and keeps the mission');
  SA.station.open('use');
  const aband2 = find(cards()[0], (n) => /Abandonar/.test(n.textContent) && n.listeners.click);
  aband2.listeners.click({ stopPropagation() {} });
  assert.equal(SA.missions.active(), null);
  assert.equal(plain(SA.missions.list()).map((m) => m.status).join(), 'available,locked,locked');
  assert.equal(cards()[0].children[0].textContent, '⭐', 'the board refreshes');
  assert.deepEqual(said, ['Misión 2', 'Continuar']);
});

test('English shows only when the setting is on; the board is a no-op without a DOM or body', () => {
  const { SA } = setup(2);
  SA.settings = { get: () => ({ english: true }) };
  const { doc } = fakeDom();
  const menu = SA.stationMenuView.create(doc, {});
  const v = SA.missionsBoardView.create(doc, { body: menu.body });
  assert.ok(texts(v.element).includes('Mission 1'));
  assert.equal(SA.missionsBoardView.create(null, { body: {} }).element, null);
  assert.equal(SA.missionsBoardView.create(doc, {}).element, null);
});
