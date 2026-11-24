// AS-0342: the mission pill shows the census checklist ("🩶 0/3", "🩶 3/3 ✓") and updates it as photos tick entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/album.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/data/badges.js', 'game/badges.js',
  'game/rescue-log.js', 'game/census.js', 'game/mission-census.js', 'game/mission-runtime.js', 'game/mission-pill.js', 'game/hud.js', 'game/ui/prompt.js'];

function setup(seed = 7) {
  const SA = loadGame(FILES);
  SA.save.reset();
  const missions = SA.missions.create({ track: () => {} });
  const rt = SA.missionRuntime.create({ missions, spawn: null, celebrate: () => {}, track: () => {} });
  const log = SA.rescueLog.create({});
  const census = SA.missionCensus.create({ missions, audio: { say() {}, sfx() {} }, report: (e) => rt.report(e), rescueLog: log,
    photo: { record() {} }, rng: SA.census.makeRng(seed), track: () => {} });
  const calls = [];
  const view = { showStep: (s) => calls.push(['step', s]), showChecklist: (rows, bounced) => calls.push(['list', rows, bounced]) };
  const pill = SA.missionPill.create({ view, audio: { say() {} }, census, missions, focus: { active: () => 'mission' } });
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('censo').ok, true);
  return { SA, missions, census, pill, calls, view };
}

const pool = (SA) => SA.data.all('animals').filter((a) => !a.story && !a.easterEgg);

test('checklistRows formats icon + n/total, with a check once complete', () => {
  const { SA } = setup();
  const rows = SA.missionPill.checklistRows([
    { entry: { icon: '🩶' }, have: 0, need: 3, done: false },
    { entry: { icon: '🌊' }, have: 2, need: 2, done: true },
    { entry: { icon: '🐇' }, have: 5, need: 1, done: false }]);
  assert.deepEqual(rows.map((r) => r.text), ['🩶 0/3', '🌊 2/2 ✓', '🐇 1/1 ✓']);
  assert.deepEqual(rows.map((r) => r.done), [false, true, true]);
  assert.equal(SA.missionPill.checklistRows(null).length, 0);
});

test('the census step shows every list entry with its icon and 0/n right away', () => {
  const { census, pill, calls } = setup();
  assert.equal(pill.update(), true);
  assert.equal(calls[0][0], 'step');
  assert.equal(calls[1][0], 'list');
  const v = census.view();
  assert.equal(calls[1][1].length, v.list.entries.length);
  v.list.entries.forEach((e, i) => assert.equal(calls[1][1][i].text, `${e.icon} 0/${e.n}`));
  assert.equal(calls[1][2].length, 0, 'nothing bounces on the first draw');
  const n = calls.length;
  pill.update(); pill.update();
  assert.equal(calls.length, n, 'no redraw while nothing changed');
});

test('a fitting photo updates its chip right away (bounce), a finished entry shows a check, a miss changes nothing', () => {
  const { SA, census, pill, calls } = setup();
  pill.update();
  const list = census.view().list;
  const first = list.entries[0];
  const fit = pool(SA).find((a) => SA.census.matches(a, first));
  const r = census.photo(fit.id);
  assert.equal(r.status, 'tick');
  const before = calls.length;
  pill.update();
  assert.equal(calls.length, before + 1);
  const [, rows, bounced] = calls[calls.length - 1];
  assert.equal(rows[0].have, 1);
  assert.ok(bounced.includes(0));
  assert.equal(rows[0].text, `${first.icon} 1/${first.n}` + (first.n === 1 ? ' ✓' : ''));
  // same animal again: nothing ticks, so the pill is left alone
  census.photo(fit.id);
  pill.update();
  assert.equal(calls.length, before + 1);
  // keep photographing: each tick redraws; the last one finishes the mission (the pill then goes back to its normal view)
  for (const e of list.entries) {
    for (const a of pool(SA).filter((x) => SA.census.matches(x, e))) { census.photo(a.id); pill.update(); }
  }
  const done = calls.filter((c) => c[0] === 'list').flatMap((c) => c[1]).filter((row) => row.done);
  assert.ok(done.length >= 1, 'a finished entry shows its check');
  done.forEach((row) => { assert.match(row.text, /✓$/); assert.equal(row.have, row.need); });
});

test('other steps never show a checklist; a broken census or view never throws', () => {
  const { SA } = setup();
  const calls = [];
  const mama = SA.missionPill.create({ view: { showStep: () => calls.push('step'), showChecklist: () => calls.push('list') }, audio: { say() {} },
    focus: { active: () => 'mission' }, missions: { active: () => ({ id: 'mama', seed: 1, step: 0, stepData: { kind: 'find', line: { es: 'Hola', icon: '👋' } } }) } });
  mama.update();
  assert.deepEqual(calls, ['step']);
  const act = { id: 'censo', seed: 1, step: 0, stepData: { kind: 'census', line: { es: 'Hola', icon: '👋' } } };
  const bad = SA.missionPill.create({ view: { showStep() {}, showChecklist() { throw new Error('x'); } }, audio: { say() {} }, focus: { active: () => 'mission' },
    missions: { active: () => act }, census: { view: () => ({ list: { key: 'k' }, progress: [{ entry: { icon: '🩶' }, have: 0, need: 2, done: false }] }) } });
  assert.doesNotThrow(() => bad.update());
  const none = SA.missionPill.create({ view: { showStep() {} }, audio: { say() {} }, focus: { active: () => 'mission' }, missions: { active: () => act },
    census: { view: () => { throw new Error('y'); } } });
  assert.equal(none.update(), true);
});

test('the real pill view draws one chip per row (done ones green), bounces, and showStep restores the plain text', () => {
  const { SA } = setup();
  const made = [];
  const mk = (tag) => { const e = { tag, style: {}, textContent: '', children: [], appendChild(c) { this.children.push(c); }, setAttribute() {}, addEventListener() {},
    animate(frames, opts) { (this.anims = this.anims || []).push(opts); } }; made.push(e); return e; };
  const view = SA.prompt.createView({ createElement: mk, body: { appendChild() {} } }, {});
  const text = made[3];
  view.showChecklist([{ text: '🩶 0/3', done: false }, { text: '🌊 2/2 ✓', done: true }], [1]);
  assert.deepEqual(text.children.map((c) => c.textContent), ['🩶 0/3', '🌊 2/2 ✓']);
  assert.equal(text.children[0].anims, undefined);
  assert.equal(text.children[1].anims.length, 1);
  assert.match(text.children[1].style.cssText, /#c9f0d2/);
  assert.match(text.style.cssText, /display:flex/);
  view.showStep({ text: 'Hola', icon: '👋' });
  assert.equal(text.textContent, 'Hola');
  assert.doesNotMatch(text.style.cssText, /display:flex/);
  assert.doesNotThrow(() => SA.prompt.createView(null).showChecklist([], []));
});
