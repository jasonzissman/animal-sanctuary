// AS-0174: the hidden grottos behind both waterfalls (plan, walkable route, treasure state, stickers, riddle, renderer against the real THREE).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js', 'game/data/badges.js',
  'game/data/vocab.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js', 'game/save.js', 'game/station.js', 'game/player.js', 'game/rocks.js', 'game/surfaces.js',
  'game/lookouts.js', 'game/forest-streams.js', 'game/mountain-plan.js', 'game/jungle-plan.js', 'game/grotto-plan.js', 'game/badges.js', 'game/stickers.js',
  'game/treasure.js', 'game/scientist-talk.js', 'game/badges-board.js', 'game/render/waterfall.js', 'game/render/grotto.js'];

function boot(extra = []) {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['game/vendor/three.min.js', ...FILES, ...extra]) {
    const abs = path.resolve(ROOT, f);
    vm.runInContext(fs.readFileSync(abs, 'utf8'), ctx, { filename: abs });
  }
  return { SA: ctx.window.SA, THREE: ctx.THREE };
}
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);   // the game runs in its own vm realm: compare by value
const { SA, THREE } = boot();
const GP = SA.grottoPlan;

function memStore(initial = {}) {
  return { data: { ...initial }, get() { return this.data; }, update(p) { Object.assign(this.data, p); } };
}
function treasureKit(initial) {
  const save = memStore(initial), told = [];
  const badges = SA.badges.create({ save, album: () => null, track() {} });
  const treasure = SA.treasure.create({ save, badges, stickers: { notify: (rows) => told.push(...rows.map((r) => r.id)) }, track() {} });
  return { save, badges, treasure, told };
}

test('each waterfall hides one grotto: tunnel through the middle block, a cave and a chest behind it', () => {
  const sites = GP.sites();
  same(sites.map((s) => s.id), ['montana', 'selva']);
  assert.equal(GP.get('selva'), sites[1]);
  assert.equal(GP.get('nope'), null);
  for (const s of sites) {
    assert.ok(s.tunnel.top > SA.map.groundHeight(s.origin.x, s.origin.z) + 1.5, 'the tunnel is tall enough to walk through');
    assert.ok(s.chamber.lx < -GP.TUNNEL_LEN, 'the cave lies beyond the tunnel');
    assert.ok(s.ring.length >= 6 && s.ring.every((r) => r[3] >= 99), 'rock walls round the cave, never jumped');
    assert.ok(Math.hypot(s.chest.x - s.chamber.x, s.chest.z - s.chamber.z) < s.chamber.r, 'the chest stands inside the cave');
    assert.ok(SA.map.biomeAt(s.chamber.x) === s.biome && SA.map.biomeAt(s.chest.x) === s.biome, 'inside its own biome');
    assert.ok(s.ring.every((r) => !SA.map.isWater(r[0], r[1])), 'on dry ground');
  }
  assert.equal(GP.solids().length, sites[0].ring.length + sites[1].ring.length);
});

test('the montaña cave keeps off the trail, the peaks and the selva cave off every giant tree', () => {
  const m = GP.get('montana'), j = GP.get('selva'), T = SA.mountainTrail;
  for (const r of m.ring.concat([[m.chamber.x, m.chamber.z]])) {
    assert.ok(T.distance(r[0], r[1]) > (r[2] || 0) + 0.6, 'a walker on the trail line never touches a wall');
    for (const p of SA.peaks.LIST) assert.ok(Math.hypot(r[0] - p.x, r[1] - p.z) > SA.peaks.BASE_R, 'off the peaks');
  }
  for (const b of SA.mountainPlan.get().boulders) assert.ok(Math.hypot(b.x - m.chamber.x, b.z - m.chamber.z) > b.r + m.chamber.r, 'no boulder inside the cave');
  for (const g of SA.junglePlan.get().giants) assert.ok(Math.hypot(j.chamber.x - g.x, j.chamber.z - g.z) > g.canopyR, 'clear of every canopy');
  assert.ok(!SA.player.inSpawnZone(j.chamber.x, j.chamber.z, 2) && !SA.station.inFootprint(j.chamber.x, j.chamber.z, 2));
});

test('scenery keeps out: both plans report the cave footprint as near / in the field', () => {
  const m = GP.get('montana'), j = GP.get('selva');
  assert.ok(GP.near(m.chamber.x, m.chamber.z) && GP.near(j.chamber.x, j.chamber.z));
  assert.ok(!GP.near(m.chamber.x + 60, m.chamber.z + 60));
  assert.ok(SA.mountainPlan.inField(m.chamber.x, m.chamber.z, 0));
  assert.ok(SA.junglePlan.near(j.chamber.x, j.chamber.z, 0));
});

test('you can really walk in: through the curtain, along the tunnel, into the cave and up to the chest (real player physics)', () => {
  for (const s of GP.sites()) {
    const obstacles = SA.mountainPlan.solids().concat(SA.junglePlan.solids(), GP.solids());
    let st = { x: GP.toWorld(s, 3, 0).x, z: GP.toWorld(s, 3, 0).z, heading: 0 };
    const route = [[-0.5, 0], [-2.0, 0], [s.chamber.lx, s.chamber.lz], [s.chest.lx + 0.9 * Math.cos(s.chamber.open), s.chest.lz + 0.9 * Math.sin(s.chamber.open)]];
    const seen = new Set();
    for (const [lx, lz] of route) {
      const target = GP.toWorld(s, lx, lz);
      for (let i = 0; i < 400 && Math.hypot(target.x - st.x, target.z - st.z) > 0.25; i++) {
        const heading = Math.atan2(target.x - st.x, target.z - st.z);
        st = SA.player.step({ ...st, heading }, { forward: 1 }, 0.05, obstacles);
        seen.add(GP.zone(st.x, st.z).zone);
      }
      assert.ok(Math.hypot(target.x - st.x, target.z - st.z) <= 0.25, `${s.id}: reached local (${lx.toFixed(1)}, ${lz.toFixed(1)})`);
    }
    assert.ok(['sheet', 'tunnel', 'chamber'].every((z) => seen.has(z)), `${s.id}: passed the curtain, the tunnel and entered the cave`);
    assert.equal(GP.nearChest(st.x, st.z), s, `${s.id}: close enough to open the chest`);
  }
});

test('the cliff stays solid either side of the tunnel, and the tunnel line itself is free', () => {
  for (const s of GP.sites()) {
    const solids = (s.id === 'montana' ? SA.mountainPlan : SA.junglePlan).get().waterfall.cliffSolids;
    assert.equal(solids.length, 2, 'two side walls (the middle block is the tunnel)');
    const sides = solids.map((o) => GP.toLocal(s, o[0], o[1])).map((l) => l.lz).sort((a, b) => a - b);
    assert.ok(sides[0] < -1.5 && sides[1] > 1.5, `${s.id}: one wall each side`);
    const all = SA.mountainPlan.solids().concat(SA.junglePlan.solids(), GP.solids());
    for (let lx = 1; lx >= -2.4; lx -= 0.2) {
      const w = GP.toWorld(s, lx, 0);
      for (const o of all) assert.ok(Math.hypot(o[0] - w.x, o[1] - w.z) >= o[2] + SA.player.RADIUS, `${s.id}: free at local x ${lx.toFixed(1)}`);
    }
  }
});

test('zone(): outside, curtain, tunnel, cave; null far away', () => {
  const s = GP.get('montana'), at = (lx, lz) => { const w = GP.toWorld(s, lx, lz); return GP.zone(w.x, w.z); };
  assert.equal(at(3, 0).zone, 'outside');
  assert.equal(at(0, 0).zone, 'sheet');
  assert.equal(at(-1.5, 0).zone, 'tunnel');
  assert.equal(at(s.chamber.lx, s.chamber.lz).zone, 'chamber');
  assert.equal(at(3, 0).site, s);
  assert.equal(GP.zone(0, 0), null);
  assert.equal(GP.nearChest(0, 0), null);
});

test('treasure: a chest gives its unique reward once, the secret sticker, and stays open after a reload', () => {
  const k = treasureKit();
  assert.equal(k.treasure.isOpen('montana'), false);
  const a = k.treasure.open('montana');
  assert.ok(a.first && a.reward.id === 'sombrero-explorador' && a.reward.kind === 'hat');
  same(a.earned.map((r) => r.id), ['buscador-de-tesoros']);
  same(k.told, ['buscador-de-tesoros'], 'the sticker book celebrates it');
  same(k.save.data.treasure, { opened: ['montana'], cosmetics: ['sombrero-explorador'] });
  assert.ok(k.save.data.badges.includes('buscador-de-tesoros'));
  const again = k.treasure.open('montana');
  assert.ok(!again.first && again.earned.length === 0 && k.save.data.treasure.cosmetics.length === 1, 'once per save');
  const b = k.treasure.open('selva');
  assert.ok(b.first && b.reward.id === 'collar-dorado' && b.reward.kind === 'collar');
  same(b.earned.map((r) => r.id), ['dos-cofres']);
  same(k.treasure.cosmetics(), ['sombrero-explorador', 'collar-dorado']);
  assert.ok(k.treasure.has('collar-dorado') && !k.treasure.has('nada'));
  same(k.treasure.open('desconocido'), { first: false, reward: null, earned: [] });
  const reloaded = SA.treasure.create({ save: memStore(JSON.parse(JSON.stringify(k.save.data))), track() {} });
  assert.ok(reloaded.isOpen('montana') && reloaded.isOpen('selva'), 'opened chests stay open');
});

test('save: treasure is normalised (junk, duplicates and bad ids dropped); absent stays absent', () => {
  const save = boot().SA.save;   // no localStorage in the vm: the in-memory fallback
  assert.equal(save.get().treasure, undefined, 'absent until the first chest');
  save.update({ treasure: { opened: ['montana', 'montana', 'Bad Id', 3], cosmetics: ['collar-dorado'] } });
  same(save.get().treasure, { opened: ['montana'], cosmetics: ['collar-dorado'] });
  save.update({ treasure: 'x' });
  same(save.get().treasure, { opened: [], cosmetics: [] });
});

test('the secret stickers stay hidden in the board until found, then show with their goal', () => {
  const k = treasureKit({ rescues: [] });
  SA.save = k.save;
  const ids = () => SA.badgesBoard.rows().map((r) => r.id);
  assert.ok(!ids().includes('buscador-de-tesoros') && !ids().includes('dos-cofres'));
  assert.equal(SA.badgesBoard.goal({ treasure: 1 }), 'Halla un cofre');
  assert.equal(SA.badgesBoard.goal({ treasure: 2 }), 'Halla 2 cofres');
  k.treasure.open('selva');
  assert.ok(ids().includes('buscador-de-tesoros') && !ids().includes('dos-cofres'), 'one found, the second still secret');
});

test('the scientist whispers the riddle after 10 rescues, until both chests are open (no other hint anywhere)', () => {
  let rescues = 9;
  const k = SA.treasure.create({ save: memStore(), rescues: () => rescues, badges: { check: () => [] }, track() {} });
  assert.equal(k.riddle(), null);
  rescues = 10;
  same(k.riddle(), { es: 'Detrás del agua que cae... hay algo brillante.', key: 'phrase:tesoroadivina' });
  k.open('montana');
  assert.ok(k.riddle(), 'one chest left');
  k.open('selva');
  assert.equal(k.riddle(), null);
  assert.ok(SA.data.get('vocab', 'phrase:tesoroadivina') || SA.vocab.get('phrase:tesoroadivina'), 'the line has a voice key');
  assert.ok(SA.vocab.get('phrase:untesoro'));
  // the talk card carries it as a plain line
  const prev = SA.treasure; SA.treasure = { riddle: () => ({ es: 'Detrás...', key: 'phrase:tesoroadivina' }) };
  try { assert.equal(SA.scientistTalk.reminder({ missions: {} }).lines.at(-1).role, 'riddle'); } finally { SA.treasure = prev; }
});

test('badge data: treasure rules validate', () => {
  assert.throws(() => SA.data.register('badges', [{ id: 'x-mal', es: 'Mal', icon: '💎', rule: { treasure: 0 } }]), /treasure/);
  assert.throws(() => SA.data.register('badges', [{ id: 'x-mal2', es: 'Mal', icon: '💎', rule: { treasure: 1, count: 1 } }]), /treasure/);
});

// ---- the renderer, against the real three.js r128 ----

function stage(opts = {}) {
  const k = treasureKit(opts.save);
  const prev = SA.treasure; SA.treasure = k.treasure;
  const scene = new THREE.Scene(), cues = [], sounds = [], said = [];
  SA.audio = { sfx: (n) => sounds.push(n), say: (key) => said.push(key) };
  const falls = {
    montana: SA.render.createWaterfall(THREE, { scene, grotto: GP.get('montana') }),
    selva: SA.render.createJungleWaterfall(THREE, { scene, grotto: GP.get('selva') }),
  };
  const grotto = SA.render.createGrotto(THREE, { scene, falls, reachCue: { show: (c) => cues.push(c) } });
  return { k, scene, cues, sounds, said, falls, grotto, restore: () => { SA.treasure = prev; } };
}
const at = (s, lx, lz) => { const w = GP.toWorld(s, lx, lz); return { x: w.x, z: w.z, heading: 0 }; };

test('render: both grottos are built (cave, crystals, chest) and the cliff has a lintel over the tunnel', () => {
  const t = stage();
  try {
    assert.equal(t.grotto.stats().grottos, 2);
    for (const v of t.grotto.views) {
      assert.equal(v.crystals.length, 7);
      assert.ok(v.group.getObjectByName('grotto-inner') && v.group.getObjectByName('grotto-outer'));
      assert.equal(v.chest.pivot.rotation.z, 0, 'closed');
    }
    const lintel = t.falls.montana.group.getObjectByName('waterfall-cliff-1'), mid = GP.get('montana').tunnel;
    const box = new THREE.Box3().setFromObject(lintel);
    assert.ok(Math.abs(box.min.y - mid.top) < 0.3 || box.min.y >= mid.top - 0.31, 'the middle block starts above the tunnel');
    assert.equal(t.falls.montana.cliffMeshes.length >= 3, true);
  } finally { t.restore(); }
});

test('render: walking into the cave hides the cliff and shell; the curtain splashes', () => {
  const t = stage(), s = GP.get('montana'), v = t.grotto.views[0];
  try {
    t.grotto.update(0.1, at(s, 2, 0));
    t.grotto.update(0.1, at(s, -0.2, 0));
    assert.ok(t.sounds.includes('splash'), 'splash through the water');
    t.grotto.update(0.1, at(s, s.chamber.lx, s.chamber.lz));
    assert.equal(v.outer.visible, false);
    assert.ok(t.falls.montana.cliffMeshes.every((m) => !m.visible), 'the camera can see in');
    t.grotto.update(0.1, at(s, 4, 0));
    assert.equal(v.outer.visible, true);
    assert.ok(t.falls.montana.cliffMeshes.every((m) => m.visible));
  } finally { t.restore(); }
});

test('render: walking up to the chest plays the treasure moment, then saves once', () => {
  const t = stage(), s = GP.get('selva'), v = t.grotto.views[1];
  try {
    const p = at(s, s.chest.lx + 0.9 * Math.cos(s.chamber.open), s.chest.lz + 0.9 * Math.sin(s.chamber.open));
    for (let i = 0; i < 28; i++) t.grotto.update(0.1, p);
    assert.ok(t.sounds.includes('creak') && t.sounds.includes('fanfare'));
    assert.equal(t.cues[0].es, '¡Un tesoro!');
    same(t.said, ['phrase:untesoro']);
    assert.ok(v.chest.pivot.rotation.z > 1.8, 'the lid is up');
    assert.ok(t.k.treasure.isOpen('selva') && t.k.treasure.has('collar-dorado'), 'saved');
    for (let i = 0; i < 40; i++) t.grotto.update(0.1, p);
    assert.equal(t.cues.at(-1).es, 'el collar dorado', 'then the reward is named');
    assert.equal(t.cues.filter((c) => c.es === '¡Un tesoro!').length, 1, 'only once');
    assert.equal(v.glow.visible, false, 'the light settles');
    assert.ok(t.k.told.includes('buscador-de-tesoros'));
  } finally { t.restore(); }
});

test('render: a chest opened before is drawn open and stays quiet after a reload', () => {
  const t = stage({ save: { treasure: { opened: ['montana'], cosmetics: ['sombrero-explorador'] } } }), s = GP.get('montana');
  try {
    assert.ok(t.grotto.views[0].chest.pivot.rotation.z > 1.8);
    assert.equal(t.grotto.views[1].chest.pivot.rotation.z, 0);
    const p = at(s, s.chest.lx + 0.9 * Math.cos(s.chamber.open), s.chest.lz + 0.9 * Math.sin(s.chamber.open));
    for (let i = 0; i < 10; i++) t.grotto.update(0.1, p);
    assert.equal(t.cues.length, 0);
    assert.ok(!t.sounds.includes('creak'));
  } finally { t.restore(); }
});

test('wiring: scripts are in the page and the manifest, and the stage builds the grotto and its walls', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), scene = fs.readFileSync(path.join(ROOT, 'game/render/scene.js'), 'utf8');
  for (const f of ['game/grotto-plan.js', 'game/treasure.js', 'game/render/grotto.js']) assert.ok(html.includes(`src="${f}"`), f);
  assert.ok(html.indexOf('game/mountain-plan.js') < html.indexOf('game/grotto-plan.js'));
  assert.ok(html.indexOf('game/render/waterfall.js') < html.indexOf('game/render/grotto.js'));
  assert.ok(/createGrotto/.test(scene) && /grottoPlan\.solids\(\)/.test(scene) && /grotto\.update\(dt, rig\.getPlayer\(\)\)/.test(scene));
});
