// AS-0327: Mission 4 slice 2: invite two animal friends (they follow you at once), then take them to the monkey's tree. Pure logic in node:vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js', 'game/data/vocab.js',
  'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/map.js', 'game/station.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js',
  'game/data/step-kinds.js', 'game/mission-run.js', 'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/mission-pill.js',
  'game/carry.js', 'game/follow.js', 'game/mission-bananas.js', 'game/mission-friends.js', 'game/mission-runtime.js'];
const DT = 1 / 30;
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [];
  const missions = SA.missions.create({ track: (t, f) => tracked.push([t, f]) });
  let rt = null;
  const friends = SA.missionFriends.create({ missions, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]),
    report: (e) => rt.report(e), later: (fn) => fn() });
  rt = SA.missionRuntime.create({ missions, thing: friends, spawn: null, celebrate: () => {}, track: (t, f) => tracked.push([t, f]) });
  return { SA, missions, friends, rt, said, tracked };
}

// Start the party mission and play it up to the invite steps (bananas and the crown reported straight to the runtime).
function startAtInvites(ctx) {
  for (const id of ['mama', 'huevo', 'rio']) { assert.equal(ctx.missions.start(id).ok, true); ctx.missions.complete(); }
  assert.equal(ctx.missions.start('fiesta').ok, true);
  for (let i = 0; i < 3; i++) ctx.rt.report({ type: 'collected', item: 'platano' });
  assert.equal(ctx.rt.report({ type: 'talked', who: 'scientist' }).status, 'step');
  ctx.friends.sync();
  ctx.SA.map.isWater = () => false;     // a flat dry test world (where things were placed is already decided); the river test re-stubs it
  return ctx;
}
const at = (p) => ({ x: p.x, z: p.z, heading: 0, lift: 0 });

// Walk the player toward (x, z) in a straight line; the friends step every frame.
function walkTo(ctx, player, x, z, speed = 4) {
  for (let n = 0; n < 4000 && d(player, { x, z }) > 0.3; n++) {
    const a = Math.atan2(x - player.x, z - player.z), s = Math.min(speed * DT, d(player, { x, z }));
    player.x += Math.sin(a) * s; player.z += Math.cos(a) * s; player.heading = a;
    ctx.friends.step(DT, player, []);
    ctx.friends.update(player);
  }
}

test('data: the mission goes crown -> invite two friends -> goTo the monkey tree, one short line each, valid step kinds', () => {
  const { SA } = setup();
  const m = SA.data.all('missions')[3];
  assert.deepEqual(Array.from(m.steps.map((s) => s.kind)), ['collect', 'talk', 'invite', 'invite', 'goTo', 'party', 'photo']);
  assert.deepEqual(Array.from(m.steps.slice(2, 4).map((s) => s.animal)), Array.from(m.friends.animals));
  assert.equal(m.steps[4].place, m.friends.tree);
  m.steps.forEach((s) => assert.ok(s.line.es.split(/\s+/).length <= 4, s.line.es));
  SA.missionRun.validate(m.steps);
  m.friends.animals.forEach((id) => assert.ok(SA.data.get('animals', id), id));
  assert.ok(SA.data.get('animals', m.friends.monkey));
  m.friends.say.forEach((k) => assert.ok(SA.vocab.get(k), k));
  assert.deepEqual(Array.from(m.friends.say.map((k) => SA.vocab.get(k).es)), ['la fiesta', 'el regalo']);
});

test('data: validation rejects a bad friends spec', () => {
  const { SA } = setup();
  const row = (friends) => ({ id: 'x', n: 9, es: 'X', en: 'X', icon: '🎉', intro: { es: 'Hola', icon: '🎉' }, friends,
    steps: [{ kind: 'invite', animal: 'a', line: { es: 'Invita', icon: '🐰' } }], reward: { stars: 1 } });
  assert.throws(() => SA.data.register('missions', [row({ animals: [], tree: 't' })]), /friends\.animals/);
  assert.throws(() => SA.data.register('missions', [row({ animals: ['a'], tree: 'T t' })]), /friends\.tree/);
  assert.throws(() => SA.data.register('missions', [row({ animals: ['a'], tree: 't', say: 'x' })]), /friends\.say/);
  assert.throws(() => SA.data.register('missions', [row([])]), /friends/);
});

test('invite step: only the named friend, only when you walk up to it; progression goes invite 1 -> invite 2 -> tree', () => {
  const ctx = startAtInvites(setup());
  const [a, b] = ctx.friends.current().friends;
  assert.equal(ctx.missions.active().stepData.kind, 'invite');
  assert.equal(ctx.friends.update({ x: b.x, z: b.z }), null);                       // beside the second friend first: nothing yet
  assert.equal(ctx.missions.active().step, 2);
  assert.equal(ctx.friends.update({ x: a.x + 20, z: a.z }), null);                  // too far away: nothing
  assert.equal(ctx.missions.active().step, 2);
  assert.equal(ctx.friends.update({ x: a.x + 2, z: a.z }).status, 'step');
  assert.equal(ctx.missions.active().step, 3);
  assert.equal(ctx.friends.invited(a.id), true);
  assert.equal(ctx.friends.invited(b.id), false);
  assert.equal(ctx.friends.update({ x: b.x, z: b.z }).status, 'step');
  assert.equal(ctx.missions.active().step, 4);
  assert.equal(ctx.missions.active().stepData.kind, 'goTo');
  assert.deepEqual(ctx.tracked.filter((t) => t[0] === 'mission.invite').map((t) => t[1].animal), [a.id, b.id]);
});

test('invite speaks la fiesta, then el regalo (one word per invite)', () => {
  const ctx = startAtInvites(setup());
  const [a, b] = ctx.friends.current().friends;
  ctx.friends.update({ x: a.x, z: a.z });
  assert.deepEqual(ctx.said, ['thing:fiesta']);
  ctx.friends.update({ x: b.x, z: b.z });
  assert.deepEqual(ctx.said, ['thing:fiesta', 'thing:regalo']);
});

test('compass: the next friend, then the other friend, then the monkey tree', () => {
  const ctx = startAtInvites(setup());
  const cur = ctx.friends.current(), [a, b] = cur.friends;
  assert.deepEqual([ctx.rt.target().id, ctx.rt.target().x, ctx.rt.target().z], [a.id, a.x, a.z]);
  ctx.friends.update(at(a));
  assert.equal(ctx.rt.target().id, b.id);
  ctx.friends.update(at(b));
  const t = ctx.rt.target();
  assert.deepEqual([t.id, t.x, t.z], [cur.tree.id, cur.tree.x, cur.tree.z]);
});

test('place: friends in the bosque, the tree in the selva, dry, apart, deterministic per seed', () => {
  const { SA } = setup();
  const spec = SA.data.all('missions')[3].friends;
  for (const seed of [1, 7, 99, 12345]) {
    const r = SA.missionFriends.place(spec, seed, { solids: [] });
    assert.ok(r, 'seed ' + seed);
    assert.equal(r.friends.length, 2);
    r.friends.forEach((f) => { assert.equal(SA.map.biomeAt(f.x), 'bosque'); assert.ok(!SA.map.isWater(f.x, f.z)); });
    assert.equal(SA.map.biomeAt(r.tree.x), 'selva');
    const all = r.friends.concat([r.tree]);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(d(all[i], all[j]) >= 8);
    assert.equal(JSON.stringify(SA.missionFriends.place(spec, seed, { solids: [] })), JSON.stringify(r));
  }
  assert.equal(SA.missionFriends.place({ animals: ['a'], tree: 't', biome: 'nowhere' }, 1), null);
});

test('two followers: both trail the player at the same time, apart from each other', () => {
  const ctx = startAtInvites(setup());
  const [a, b] = ctx.friends.current().friends;
  const p = { x: a.x, z: a.z, heading: 0, lift: 0 };
  ctx.friends.update(p);
  p.x = b.x + 1; p.z = b.z;                       // go to the second friend (the first follows)
  walkTo(ctx, p, b.x, b.z);
  ctx.friends.update(p);
  const views = ctx.friends.step(DT, p, []);
  assert.deepEqual(Array.from(views.map((v) => v.following)), [true, true]);
  // walk 25 units away: both keep up (within a few units) and never sit on top of each other
  const far = { x: p.x + 25, z: p.z };
  walkTo(ctx, p, far.x, far.z);
  for (let i = 0; i < 60; i++) ctx.friends.step(DT, p, []);
  const v = ctx.friends.view();
  v.forEach((f) => assert.ok(d(f, p) < 4, `${f.id} ${d(f, p)} behind`));
  assert.ok(d(v[0], v[1]) >= 0.7, 'the friends do not overlap');
});

test('followers that fall behind keep their place and follow again when the player returns', () => {
  const ctx = startAtInvites(setup());
  const [a, b] = ctx.friends.current().friends;
  ctx.friends.update(at(a)); ctx.friends.update(at(b));
  const p = { x: a.x, z: a.z, heading: 0, lift: 0 };
  for (let i = 0; i < 30; i++) ctx.friends.step(DT, p, []);
  const [fa, fb] = ctx.friends.current().friends.map((f) => f.f);
  fa.x = p.x - 1.7; fa.z = p.z; fb.x = p.x - 1.7; fb.z = p.z + 1.2; fa.trail = []; fb.trail = [];   // both stand beside the player
  // the player jumps far away over a river: water between, so they cannot pop; they stay on dry ground
  const away = { x: p.x + 60, z: p.z, heading: 0, lift: 0 };
  const dry = ctx.SA.map.isWater;
  ctx.SA.map.isWater = (x, z) => x > p.x + 6 && x < p.x + 30;     // an impassable river east of them
  for (let i = 0; i < 600; i++) ctx.friends.step(DT, away, []);
  [fa, fb].forEach((f) => assert.ok(!ctx.SA.map.isWater(f.x, f.z), 'not in the water'));
  assert.ok(d(fa, away) > 15 && d(fb, away) > 15, 'waiting back at the water');
  ctx.SA.map.isWater = dry;
  const back = { x: fa.x + 2.5, z: fa.z, heading: 0, lift: 0 };   // the player comes back
  const spot = { x: back.x, z: back.z };
  for (let i = 0; i < 20; i++) ctx.friends.step(DT, back, []);
  assert.ok(d(fa, back) < 3.2 && d(fb, back) < 6, 'both are with you again');
  for (let i = 0; i < 90; i++) { back.x += 4 * DT; ctx.friends.step(DT, back, []); }
  assert.ok(back.x > spot.x + 2);
  [fa, fb].forEach((f) => assert.ok(d(f, back) < 4, 'they follow again'));
});

test('arriving at the monkey tree: advances only with both friends there; alone it does nothing', () => {
  const ctx = startAtInvites(setup());
  const cur = ctx.friends.current(), [a, b] = cur.friends, tree = cur.tree;
  assert.equal(ctx.friends.locate(tree.id), null, 'nobody invited yet');
  ctx.friends.update(at(a)); ctx.friends.update(at(b));
  assert.equal(ctx.missions.active().stepData.kind, 'goTo');
  // arriving alone: the friends stay where they were placed, far from the tree
  assert.equal(ctx.friends.locate(tree.id), null);
  const alone = { x: tree.x + 1, z: tree.z };
  assert.equal(ctx.rt.update(alone).status, 'none');
  assert.equal(ctx.missions.active().step, 4);
  // walk there with both friends in tow
  const p = { x: b.x, z: b.z, heading: 0, lift: 0 };
  walkTo(ctx, p, tree.x - 1.5, tree.z - 1.5);
  let res = null;
  for (let i = 0; i < 300 && (!res || res.status === 'none'); i++) { ctx.friends.step(DT, p, []); res = ctx.rt.update(p); }
  assert.ok(res && (res.status === 'complete' || res.status === 'step'), JSON.stringify(res));
  assert.equal(ctx.missions.active().stepData.kind, 'party');       // the party (AS-0328) comes next; test/mission-party.test.js
});

test('a reload on the goTo step keeps both friends invited and the mission clears them when it ends', () => {
  const ctx = startAtInvites(setup());
  const [a, b] = ctx.friends.current().friends;
  ctx.friends.update(at(a)); ctx.friends.update(at(b));
  const key = ctx.friends.current().key;
  const again = ctx.SA.missionFriends.create({ missions: ctx.missions, report: () => ({ status: 'none' }) });   // a fresh page load
  const v = again.step(DT, { x: a.x, z: a.z, heading: 0, lift: 0 }, []);
  assert.equal(again.current().key, key);
  assert.deepEqual(Array.from(v.map((f) => f.following)), [true, true]);
  ctx.missions.complete();
  assert.equal(ctx.friends.sync(), null);
  assert.equal(ctx.friends.step(DT, { x: 0, z: 0 }, []), null);
});

test('the party (AS-0328): from the party step the friends stop following, gather round the tree facing it and dance', () => {
  const ctx = startAtInvites(setup());
  const cur = ctx.friends.current(), [a, b] = cur.friends, tree = cur.tree;
  ctx.friends.update(at(a)); ctx.friends.update(at(b));
  const p = { x: b.x, z: b.z, heading: 0, lift: 0 };
  walkTo(ctx, p, tree.x - 1.5, tree.z - 1.5);
  for (let i = 0; i < 300 && ctx.missions.active().stepData.kind === 'goTo'; i++) { ctx.friends.step(DT, p, []); ctx.rt.update(p); }
  assert.equal(ctx.missions.active().stepData.kind, 'party');
  let views = null;
  const far = { x: tree.x - 30, z: tree.z, heading: 0, lift: 0 };            // the player wanders off: they stay at the party
  for (let i = 0; i < 150; i++) views = ctx.friends.step(DT, far, []);
  views.forEach((v) => {
    assert.equal(v.dancing, true);
    assert.ok(Math.abs(Math.hypot(v.x - tree.x, v.z - tree.z) - 2.7) < 0.2, 'in a ring round the tree');
    const face = Math.atan2(tree.x - v.x, tree.z - v.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(v.heading - face), Math.cos(v.heading - face))) < 0.01, 'facing the tree');
  });
  assert.ok(Math.hypot(views[0].x - views[1].x, views[0].z - views[1].z) > 2, 'not on top of each other');
});

test('SA.follow.stepGroup: every follower trails the player and they keep apart', () => {
  const { SA } = setup();
  const p = { x: -10, z: 10, heading: Math.PI / 2, lift: 0 };
  const fs = [SA.follow.create({ x: -12, z: 10 }), SA.follow.create({ x: -12, z: 10.2 })];
  for (let t = 0; t < 5; t += DT) { p.x += 4 * DT; SA.follow.stepGroup(fs, p, [], DT); }
  fs.forEach((f) => assert.ok(d(f, p) < 3, 'close behind'));
  assert.ok(d(fs[0], fs[1]) >= 0.7);
  assert.equal(SA.follow.stepGroup([], p, [], DT).length, 0);
});
