import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/map.js', 'game/peaks.js', 'game/camera.js', 'game/station.js', 'game/station-board.js',
  'game/player.js', 'game/perch.js', 'game/climb.js', 'game/space-target.js', 'game/badges-board.js', 'game/ui/badges-board-view.js'];

function boot(extra = []) {
  const events = [];
  const SA = loadGame(FILES.concat(extra), { SAT: { track: (t, f) => events.push([t, f]) } });
  return { SA, events };
}

const DATA = [
  { id: 'a', es: 'Amigo de los cerdos', en: 'Pig friend', icon: '🐷', tier: 'bronce' },
  { id: 'b', es: 'Noche', icon: '🌙' },
  { id: 'c', es: 'Álbum', en: 'Album' },
];
const PROGRESS = [
  { id: 'a', have: 1, need: 1, earned: true },
  { id: 'b', have: 2, need: 5, earned: false },
  { id: 'c', have: 0, need: 12, earned: false },
];

test('rows: one per badge with icon, Spanish name, n/m text, ✅ when earned', () => {
  const { SA } = boot();
  const board = SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA });
  const rows = board.rows();
  assert.equal(rows.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), { id: 'a', icon: '🐷', name: 'Amigo de los cerdos', es: 'Amigo de los cerdos', goal: 'Rescata 1 animal',
    say: 'Amigo de los cerdos. Rescata 1 animal', have: 1, need: 1, earned: true, fraction: 1, state: 'earned', locked: false, text: '✅', tier: 'bronce' });
  assert.deepEqual(JSON.parse(JSON.stringify(rows[1])), { id: 'b', icon: '🌙', name: 'Noche', es: 'Noche', goal: 'Rescata 1 animal', say: 'Noche. Rescata 1 animal',
    have: 2, need: 5, earned: false, fraction: 0.4, state: 'progress', locked: false, text: '2/5' });
  assert.equal(rows[2].icon, '🏅', 'a fallback medal when the data has no icon');
  assert.equal(rows[2].text, '0/12');
  assert.equal(JSON.stringify(board.summary(rows)), JSON.stringify({ earned: 1, total: 3 }));
});

test('rows: English names only with the English scaffold on, falling back to Spanish', () => {
  const { SA } = boot();
  const board = SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA });
  const en = board.rows({ english: true });
  assert.deepEqual(en.map((r) => r.name), ['Pig friend', 'Noche', 'Album']);
  assert.equal(SA.badgesBoard.TITLE, 'Insignias');
  assert.equal(SA.badgesBoard.TITLE_EN, 'Badges');
});

test('rows: missing progress or a throwing source gives an empty list, never an error', () => {
  const { SA } = boot();
  assert.equal(SA.badgesBoard.build({ badges: null, rows: [] }).rows().length, 0);
  assert.equal(SA.badgesBoard.build({ badges: { progress: () => { throw new Error('x'); } }, rows: DATA }).rows().length, 0);
  assert.equal(JSON.stringify(SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA }).summary([])), JSON.stringify({ earned: 0, total: 0 }));
});

test('rows come from the real SA.badges progress and the shipped data (every badge listed)', () => {
  const store = { data: {}, get() { return this.data; }, update(p) { Object.assign(this.data, p); } };
  const { SA } = boot(['game/data/biomes.js', 'game/data/parts.js', 'game/data/animals.js', 'game/data/badges.js', 'game/badges.js',
    (sa) => { store.data = { rescues: [{ animalId: 'cerdo', night: false }], badges: [] }; sa.save = store; }]);
  const rows = SA.badgesBoard.rows();
  const shipped = SA.data.all('badges');
  assert.ok(shipped.length > 3);
  assert.deepEqual(rows.map((r) => r.id), shipped.map((b) => b.id));
  rows.forEach((r) => {
    assert.ok(r.name && r.icon);
    assert.match(r.text, r.earned ? /^✅$/ : /^\d+\/\d+$/);
    assert.ok(r.have <= r.need);
  });
});

test('the Insignias board is a Use target on the front wall, opposite the missions board, clear of the door and window', () => {
  const { SA } = boot();
  const L = SA.station.layout(), k = L.badgesBoard, m = L.board, d = L.door, w = L.window;
  assert.ok(k.z < m.z, 'front wall vs back wall');
  assert.ok(Math.abs(k.z - (L.cz - L.halfD)) < 0.5, 'on the front wall');
  assert.equal(k.facing.z, 1);
  assert.ok(k.x + k.width / 2 < d.x - d.width / 2, 'left of the doorway');
  assert.ok(k.x - k.width / 2 > L.cx - L.halfW + L.wallT / 2, 'inside the west wall');
  assert.ok(k.x + k.width / 2 < w.x - w.width / 2 || k.x - k.width / 2 > w.x + w.width / 2, 'not over the window');
  const t = SA.station.badgesTarget();
  assert.deepEqual([t.id, t.kind, t.source], ['station-badges', 'board', 'badges']);
  assert.equal(t.x, k.x);
  assert.equal(SA.station.badgesTarget(), t, 'one stable object');
  assert.equal(SA.station.boardTargets().length, 2);
  assert.equal(SA.station.boardTargets()[0], SA.station.boardTarget());
  assert.equal(SA.station.boardTargets()[1], t);
  assert.equal(SA.station.boardTargets(), SA.station.boardTargets(), 'stable list');
  assert.ok(SA.station.collisionBoxes().some((b) => Math.abs((b.x0 + b.x1) / 2 - k.x) < 1e-9 && Math.abs((b.z0 + b.z1) / 2 - k.z) < 1e-9), 'solid');
});

test('facing the Insignias board highlights it (the chooser picks it); the missions board is far away inside', () => {
  const { SA } = boot();
  const t = SA.station.badgesTarget(), c = SA.spaceTarget.create();
  const got = c.choose({ player: { x: t.x, z: t.z + 1.2, heading: Math.PI }, boards: SA.station.boardTargets() });   // heading π faces -z, toward the wall
  assert.equal(got.kind, 'board');
  assert.equal(got.ref, t);
  c.reset();
  assert.equal(c.choose({ player: { x: t.x, z: t.z + 1.2, heading: Math.PI }, boards: SA.station.boardTargets() }).ref.source, 'badges');
});

test('tap reach is per board', () => {
  const { SA } = boot();
  const t = SA.station.badgesTarget();
  assert.equal(SA.station.canTapBoard({ x: t.x, z: t.z + 1 }, t), true);
  assert.equal(SA.station.canTapBoard({ x: t.x, z: t.z + SA.station.TAP_REACH + 1 }, t), false);
  assert.equal(SA.station.canTapBoard({ x: t.x, z: t.z + 1 }), SA.station.canTapBoard({ x: t.x, z: t.z + 1 }, SA.station.boardTarget()));
});

test('opening with source badges fires station.open { source: badges } once and reports the source', () => {
  const { SA, events } = boot();
  const seen = [];
  SA.station.onOpen((s) => seen.push(s));
  assert.equal(SA.station.openSource(), null);
  assert.equal(SA.station.toggle('badges'), true);
  assert.equal(SA.station.openSource(), 'badges');
  assert.equal(SA.station.open('badges'), false, 'already open');
  assert.equal(JSON.stringify(events), JSON.stringify([['station.open', { source: 'badges' }]]));
  assert.deepEqual(seen, ['badges']);
  SA.station.close();
  assert.equal(SA.station.openSource(), null);
});

// A tiny DOM: enough for the view to build rows.
function fakeDoc() {
  const mk = (tag) => {
    const e = { tag, children: [], style: {}, text: '', listeners: {}, textContent: '' };
    e.appendChild = (c) => { e.children.push(c); return c; };
    e.removeChild = (c) => { e.children.splice(e.children.indexOf(c), 1); };
    e.addEventListener = (n, f) => { e.listeners[n] = f; };
    return e;
  };
  return { createElement: mk, body: mk('body'), documentElement: {} };
}
const flat = (e) => [e].concat(...e.children.map(flat));

test('view: shows icon + name + n/m rows only for source badges, spoken on tap, and hides on close', () => {
  const { SA } = boot();
  const spoken = [];
  SA.audio = { say: (t) => spoken.push(t) };
  SA.badgesBoard = SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA });
  const doc = fakeDoc(), body = doc.createElement('div');
  const view = SA.badgesBoardView.create(doc, { body });
  assert.equal(body.children[0], view.element);
  SA.station.open('board');
  assert.match(view.element.style.cssText, /display:none/, 'the missions card owns a plain board open');
  SA.station.close();
  SA.station.open('badges');
  assert.match(view.element.style.cssText, /display:flex/);
  const texts = flat(view.element).map((e) => e.textContent).filter(Boolean);
  assert.ok(texts.includes('Amigo de los cerdos') && texts.includes('✅') && texts.includes('2/5') && texts.includes('0/12'));
  assert.ok(texts.includes('🐷') && texts.some((t) => /Insignias 1\/3/.test(t)));
  const row = flat(view.element).find((e) => e.listeners.click);
  row.listeners.click({});
  assert.deepEqual(spoken, ['Amigo de los cerdos. Rescata 1 animal']);
  SA.station.close();
  assert.match(view.element.style.cssText, /display:none/);
});

test('rows: progress fraction and state flags (earned ✅, progress, locked grey)', () => {
  const { SA } = boot();
  const rows = SA.badgesBoard.build({ badges: { progress: () => PROGRESS }, rows: DATA }).rows();
  assert.deepEqual(rows.map((r) => r.state), ['earned', 'progress', 'locked']);
  assert.deepEqual(rows.map((r) => r.locked), [false, false, true]);
  assert.deepEqual(rows.map((r) => r.fraction), [1, 0.4, 0]);
  assert.equal(rows[0].text, '✅');
  const odd = SA.badgesBoard.build({ badges: { progress: () => [{ id: 'a', have: 3, need: 0, earned: false }] }, rows: DATA }).rows();
  assert.equal(odd[0].fraction, 0, 'never NaN');
});

test('goal phrases: short, with gender/number agreement, for every shipped badge', () => {
  const { SA } = boot(['game/data/biomes.js', 'game/data/parts.js', 'game/data/animals.js', 'game/data/badges.js', 'game/badges.js']);
  const g = (rule) => SA.badgesBoard.goal(rule);
  assert.equal(g({ count: 1 }), 'Rescata 1 animal');
  assert.equal(g({ count: 25 }), 'Rescata 25 animales');
  assert.equal(g({ animalId: 'conejo', count: 1 }), 'Rescata 1 conejo');
  assert.equal(g({ animalId: 'conejo', count: 5 }), 'Rescata 5 conejos');
  assert.equal(g({ animalId: 'tucan', count: 15 }), 'Rescata 15 tucanes');
  assert.equal(g({ animalId: 'aguila', count: 5 }), 'Rescata 5 águilas');
  assert.equal(g({ animalId: 'tortuga', count: 1 }), 'Rescata 1 tortuga');
  assert.equal(g({ kind: 'hatch', count: 1 }), 'Salva 1 huevo');
  assert.equal(g({ kind: 'river', count: 1 }), 'Salva 1 perrito');
  assert.equal(g({ kind: 'reunion', count: 1 }), 'Reúne 1 familia');
  assert.equal(g({ kind: 'reunion', count: 3 }), 'Reúne 3 familias');
  assert.equal(g({ need: 'thorn', count: 5 }), 'Quita 5 espinas');
  assert.equal(g({ need: 'thorn', count: 1 }), 'Quita 1 espina');
  assert.equal(g({ need: 'hungry', count: 5 }), 'Alimenta 5 animales');
  assert.equal(g({ need: 'mud', count: 1 }), 'Limpia 1 animal');
  assert.equal(g({ biome: 'bosque', count: 5 }), 'Rescata 5 animales en el bosque');
  assert.equal(g({ biome: 'selva', count: 5 }), 'Rescata 5 animales en la selva');
  assert.equal(g({ biome: 'montana', count: 5 }), 'Rescata 5 animales en la montaña');
  assert.equal(g({ night: true, count: 3 }), 'Rescata 3 animales de noche');
  assert.equal(g({ album: 'all' }), 'Fotografía todos los animales');
  assert.equal(g(), 'Rescata 1 animal');
  SA.badgesBoard.rows().forEach((r) => {
    assert.ok(r.goal.split(' ').length <= 6, r.goal);
    assert.equal(r.say, r.es + '. ' + r.goal);
  });
});

test('view: rows have a progress bar; locked rows are grey; a tap speaks the name and goal', () => {
  const { SA } = boot();
  const spoken = [];
  SA.audio = { say: (t) => spoken.push(t) };
  const data = [{ id: 'x', es: 'Chef del santuario', icon: '🍓', rule: { need: 'hungry', count: 5 } },
    { id: 'y', es: 'Noche', icon: '🌙', rule: { night: true, count: 3 } }];
  SA.badgesBoard = SA.badgesBoard.build({ badges: { progress: () => [{ id: 'x', have: 2, need: 5, earned: false }, { id: 'y', have: 0, need: 3, earned: false }] }, rows: data });
  const doc = fakeDoc(), view = SA.badgesBoardView.create(doc, { body: doc.createElement('div') });
  SA.station.open('badges');
  const all = flat(view.element), clickable = all.filter((e) => e.listeners.click);
  assert.equal(clickable.length, 2);
  assert.match(String(clickable[0].style.cssText), /background:#fff/);
  assert.match(String(clickable[1].style.cssText), /background:#e4e4e4/, 'not started = grey');
  assert.ok(all.some((e) => /width:40%/.test(e.style.cssText)), '2/5 bar');
  assert.ok(all.some((e) => /width:0%/.test(e.style.cssText)), 'empty bar');
  assert.match(all.find((e) => e.style.cssText && /overflow-y:auto/.test(e.style.cssText)).style.cssText, /max-height:\d+px/, 'scrolls');
  clickable[0].listeners.click({});
  clickable[1].listeners.click({ stopPropagation() {} });
  assert.deepEqual(spoken, ['Chef del santuario. Alimenta 5 animales', 'Noche. Rescata 3 animales de noche']);
});

test('view: a missing DOM or body is a quiet no-op', () => {
  const { SA } = boot();
  assert.equal(SA.badgesBoardView.create(null, {}).element, null);
  assert.equal(SA.badgesBoardView.create(fakeDoc(), {}).element, null);
});

