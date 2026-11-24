// AS-0346: Mission 8 core (Los ladrones de fresas): the data row and its validation, the hidden hollow tree with the mouse family, the goTo step, the
// family photo that ends the mission with a sticker, the compass target, the spoken lines and the paused small tasks. Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-pantry.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [], cheers = [], photos = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const log = SA.rescueLog.create({});
  const pantry = SA.missionPantry.create({ missions, audio: { say: (k) => said.push(k), sfx: (n) => said.push('sfx:' + n) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), photo: { record: (id) => photos.push(id) }, rescueLog: log });
  rt = SA.missionRuntime.create({ missions, thing: pantry, spawn: null, celebrate: (r) => cheers.push(r), track: (t, f) => tracked.push([t, f]) });
  SA.audio = { say: (k) => said.push(k) };
  const out = { SA, missions, pantry, rt, said, tracked, cheers, photos, log };
  pantry.onSticker = (e) => (out.sticker = e);
  return out;
}

function startLadrones(ctx) {
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo']) { assert.equal(ctx.missions.start(id).ok, true, id); ctx.missions.complete(); }
  const r = ctx.missions.start('ladrones');
  assert.equal(r.ok, true, JSON.stringify(r));
  ctx.pantry.sync();
  assert.equal(ctx.rt.report({ type: 'trailed', trail: 'huellas' }).status, 'step', 'AS-0347: the footprints step comes first; these tests start after it');
  return ctx;
}
const step = (ctx) => ctx.missions.active().stepData;
const frame = (ctx, p) => { ctx.pantry.update(p); return ctx.rt.update(p); };
const json = (v) => JSON.parse(JSON.stringify(v));

test('data: mission 8 follows mission 7, one intro line of <= 4 words, steps goTo -> photo; it validates', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[7];
  assert.equal(m.n, 8);
  assert.equal(m.id, 'ladrones');
  assert.equal(typeof m.intro, 'object');
  assert.ok(m.intro.es.split(/\s+/).length <= 4);
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['trail', 'goTo', 'photo']);
  assert.equal(m.steps[0].trail, m.pantry.trail.id, 'AS-0347: the first step follows the footprints');
  assert.equal(m.steps[1].place, 'despensa');
  assert.equal(m.steps[2].target, 'despensa', 'a place, so a photo of some wild mouse never completes it');
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4 && s.line.icon));
  assert.deepEqual(Array.from(m.steps.map((s) => s.line.es)), ['Sigue las huellas', 'Busca la despensa', 'Foto de la familia']);
  SA.missionRun.validate(m.steps);
  const f = m.pantry.family;
  assert.equal(f.babies, 3);
  [f.mama, f.papa, f.baby].forEach((id) => assert.equal(SA.data.get('animals', id).story, true, id + ' is a story animal'));
  assert.equal(SA.data.get('animals', f.baby).baby.of, f.mama, 'the babies are the adults made small (babyParts)');
  assert.ok(SA.data.get('animals', f.baby).parts.length >= 7, 'built from the existing part system');
  const tree = SA.data.get('props', m.pantry.tree);
  assert.deepEqual([tree.mission, tree.biomes[0], tree.name.es], [true, 'bosque', 'el árbol hueco']);
  for (const k of ['thing:ratones', 'thing:familia', m.pantry.say.arrive, m.pantry.say.photo, 'animal:ratoncampo', 'animal:ratoncito', 'item:fresa']) assert.ok(SA.vocab.get(k), k);
  assert.equal(SA.vocab.get('thing:ratones').es, 'los ratones');
  assert.equal(SA.vocab.get('thing:familia').es, 'la familia');
  assert.ok(SA.data.get('badges', 'despensa-secreta'));
});

test('data: validation rejects a bad pantry spec', () => {
  const { SA } = setup();
  const good = { tree: 'arbolhueco', place: 'despensa', family: { mama: 'ratoncampo', papa: 'ratoncampo', baby: 'ratoncito', babies: 3 } };
  let n = 0;
  const row = (pantry) => ({ id: 'x8' + (n++), n: 99, es: 'X', en: 'X', icon: '🍓', intro: { es: 'Hola', icon: '🍓' }, pantry,
    steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } });
  assert.doesNotThrow(() => SA.data.register('missions', [row({ ...good, say: { arrive: 'thing:ratones' } })]));
  assert.throws(() => SA.data.register('missions', [row({ ...good, tree: 'Arbol' })]), /pantry\.tree/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, place: undefined })]), /pantry\.place/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, babies: 0 } })]), /babies/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, family: { ...good.family, papa: 3 } })]), /papa/);
  assert.throws(() => SA.data.register('missions', [row({ ...good, say: { bad: 'x' } })]), /pantry\.say/);
  assert.throws(() => SA.data.register('missions', [row('x')]), /pantry/);
  assert.throws(() => SA.data.register('props', [{ ...SA.data.get('props', 'arbol'), id: 'zz', mission: 1 }]), /mission/);
});

test('mission 8 is locked until mission 7 is done, then starts from the board like any other and can be replayed', () => {
  const { missions } = setup();
  assert.equal(missions.start('ladrones').ok, false);
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila']) { missions.start(id); missions.complete(); }
  assert.equal(missions.start('ladrones').ok, false, 'still locked: mission 7 is not done');
  assert.equal(missions.status('ladrones'), 'locked');
  missions.start('censo'); missions.complete();
  assert.equal(missions.status('ladrones'), 'available');
  assert.equal(missions.next().id, 'ladrones');
  assert.equal(missions.start('ladrones').ok, true);
  missions.complete();
  assert.equal(missions.status('ladrones'), 'done');
  const re = missions.start('ladrones');
  assert.deepEqual([re.ok, re.replay], [true, true]);
});

test('place: a hidden hollow tree on flat dry ground in the bosque with mamá, papá and 3 babies in it; deterministic; nothing without the mission', () => {
  const ctx = setup();
  const { SA, pantry } = ctx;
  assert.equal(pantry.sync(), null);
  assert.equal(pantry.view(), null);
  assert.equal(pantry.locate('despensa'), null);
  startLadrones(ctx);
  const cur = pantry.current(), t = cur.tree;
  assert.equal(SA.map.biomeAt(t.x), 'bosque');
  assert.equal(SA.map.isWater(t.x, t.z), false);
  const sp = SA.station.spawn();
  assert.ok(Math.hypot(t.x - sp.x, t.z - sp.z) >= 22, 'hidden away from the station');
  assert.equal(cur.family.length, 5);
  assert.deepEqual(Array.from(cur.family.map((f) => f.role)), ['mama', 'papa', 'baby', 'baby', 'baby']);
  assert.deepEqual(Array.from(new Set(cur.family.map((f) => f.animal))).sort(), ['ratoncampo', 'ratoncito']);
  for (const f of cur.family) {
    assert.ok(Math.hypot(f.x - t.x, f.z - t.z) < 1.9, 'inside the hollow');
    assert.equal(f.rotY, t.face, 'facing out of the doorway');
  }
  const again = SA.missionPantry.place(cur.spec, ctx.missions.active().seed);
  assert.deepEqual([again.tree.x, again.tree.z], [t.x, t.z]);
  assert.equal(SA.missionPantry.place({ ...cur.spec, family: { ...cur.spec.family, babies: 9 } }, 1), null);
  // Solids are kept clear.
  const avoided = SA.missionPantry.place(cur.spec, 5, { solids: [[t.x, t.z, 6]] });
  assert.ok(Math.hypot(avoided.tree.x - t.x, avoided.tree.z - t.z) >= 9, 'a solid at the first spot pushes the tree elsewhere (r + gap)');
  ctx.missions.abandon && ctx.missions.abandon();
  pantry.sync();
  assert.equal(pantry.current(), null);
});

test('the whole mission: reach the tree (goTo), then photograph the family with la cámara: sticker, stars, album, spoken words', () => {
  const ctx = startLadrones(setup());
  const { SA, pantry, said, cheers, photos, missions } = ctx, t = pantry.current().tree;
  // Compass points at the tree, then at the family inside it.
  assert.deepEqual(json(pantry.target(step(ctx))), { x: t.x, z: t.z, role: 'place', id: 'despensa' });
  assert.deepEqual(json(ctx.rt.target()), { x: t.x, z: t.z, role: 'place', id: 'despensa' });
  frame(ctx, { x: t.x + 30, z: t.z, y: 0 });
  assert.equal(step(ctx).kind, 'goTo', 'far away does nothing');
  assert.equal(pantry.snap({ x: t.x, z: t.z }).status, 'none', 'too early for the photo');
  frame(ctx, { x: t.x + 1, z: t.z + 2, y: t.y });
  assert.equal(step(ctx).kind, 'photo', 'reaching the hollow tree completes the goTo step');
  assert.ok(said.includes('thing:ratones'), 'los ratones is spoken at the tree');
  assert.deepEqual(json(ctx.rt.target()), { x: t.x, z: t.z, role: 'place', id: 'despensa' });
  assert.equal(pantry.view().photo, true);
  // The photo.
  assert.equal(pantry.snap({ x: t.x, z: t.z + 2 }).status, 'nocamera');
  assert.equal(SA.inventory.equip('camara'), true);
  assert.equal(pantry.snap({ x: t.x + 40, z: t.z }).status, 'far');
  assert.equal(missions.active().id, 'ladrones', 'a wrong try loses nothing');
  const stars = SA.save.get().stars || 0;
  const r = pantry.snap({ x: t.x, z: t.z + 3 });
  assert.equal(r.status, 'complete');
  assert.equal(r.id, 'ladrones');
  assert.equal(r.firstTime, true);
  assert.deepEqual(photos, ['ratoncampo']);
  assert.equal(missions.status('ladrones'), 'done');
  assert.equal(missions.active(), null);
  assert.equal(cheers.length, 1);
  assert.ok(said.includes('thing:familia') && said.includes('sfx:shutter'));
  assert.equal(ctx.sticker.mission, 'ladrones');
  assert.equal(ctx.sticker.badges[ctx.sticker.badges.length - 1].id, 'despensa-secreta');
  assert.ok(Array.from(SA.save.get().badges).includes('despensa-secreta'));
  assert.equal(ctx.log.count('pantry'), 1);
  assert.ok(ctx.tracked.some(([n]) => n === 'pantry.arrived') && ctx.tracked.some(([n]) => n === 'pantry.photo'));
  assert.ok((SA.save.get().stars || 0) >= stars + 2, 'the mission reward');
  assert.equal(pantry.snap({ x: t.x, z: t.z }).status, 'none', 'no second photo');
});

test('a photo of some wild mouse (or any animal) never finishes the photo step; only the family at the tree does', () => {
  const ctx = startLadrones(setup());
  const t = ctx.pantry.current().tree;
  frame(ctx, { x: t.x, z: t.z + 2, y: t.y });
  assert.equal(ctx.rt.report({ type: 'photo', target: 'raton' }).status, 'ignored');
  assert.equal(ctx.rt.report({ type: 'photo', target: 'ratoncampo' }).status, 'ignored');
  assert.equal(step(ctx).kind, 'photo');
});

test('a replay is a fresh seed, pays no second sticker or stars', () => {
  const ctx = startLadrones(setup());
  const { SA, pantry, missions } = ctx, first = pantry.current();
  const t = first.tree;
  frame(ctx, { x: t.x, z: t.z + 2, y: t.y });
  SA.inventory.equip('camara');
  assert.equal(pantry.snap({ x: t.x, z: t.z + 2 }).status, 'complete');
  const stars = SA.save.get().stars || 0;
  assert.equal(missions.start('ladrones').replay, true);
  assert.equal(ctx.rt.report({ type: 'trailed', trail: 'huellas' }).status, 'step', 'a replay follows the footprints again');
  pantry.sync();
  assert.notEqual(pantry.current().key, first.key);
  const t2 = pantry.current().tree;
  frame(ctx, { x: t2.x, z: t2.z + 2, y: t2.y });
  assert.equal(pantry.snap({ x: t2.x, z: t2.z + 2 }).status, 'complete');
  assert.equal(SA.save.get().stars || 0, stars, 'no second star reward');
  assert.equal(ctx.log.count('pantry'), 1, 'the rescue log keys by mission: a replay adds no row');
  assert.equal(Array.from(SA.save.get().badges).filter((b) => b === 'despensa-secreta').length, 1);
});

test('each step line is spoken through audio and small tasks pause while the mission runs (AS-0221 / AS-0223)', () => {
  const ctx = startLadrones(setup());
  const { SA, pantry } = ctx, t = pantry.current().tree;
  const spoken = [], shown = [];
  const pill = SA.missionPill.create({ view: { showStep: (s) => shown.push(s.text) }, audio: { say: (k) => spoken.push(k) }, missions: ctx.missions, focus: { active: () => 'mission' } });
  assert.equal(pill.update(), true);
  frame(ctx, { x: t.x, z: t.z + 2, y: t.y });
  pill.update();
  assert.deepEqual(spoken, ['Busca la despensa', 'Foto de la familia'], 'the trail step line was spoken (and shown) before these');
  assert.deepEqual(shown, spoken);
  const focus = SA.focus.create({ missions: ctx.missions });
  assert.equal(focus.active(), 'mission');
  assert.equal(focus.allowsSmall(), false);
});

test('the hollow tree is a mission prop: it is built by a data builder key and never offered for sale', () => {
  const { SA } = setup();
  const p = SA.data.get('props', 'arbolhueco');
  assert.equal(p.builder, 'hollowtree');
  assert.equal(p.mission, true);
  assert.equal(SA.vocab.get('prop:arbolhueco').es, 'el árbol hueco');
});
