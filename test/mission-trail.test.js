// AS-0347: Mission 8's footprint and crumb trail from the empty basket at the station to the hollow tree: the pure path, the progress logic, the
// 'trail' step that finishes at the tree, the compass target, the spoken words and the never-punishing wandering. Pure logic in node:vm, no THREE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/plants.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/data/props.js', 'game/data/foods.js', 'game/data/items.js', 'game/save.js', 'game/mountain-trail.js', 'game/map.js', 'game/peaks.js',
  'game/station.js', 'game/player.js', 'game/npc.js', 'game/inventory.js', 'game/photo.js', 'game/data/step-kinds.js', 'game/mission-run.js',
  'game/data/missions.js', 'game/missions.js', 'game/focus.js', 'game/data/badges.js', 'game/album.js', 'game/badges.js',
  'game/rescue-log.js', 'game/mission-pantry.js', 'game/trail-route.js', 'game/mission-trail.js', 'game/mission-runtime.js'];

function setup() {
  const SA = loadGame(FILES);
  SA.save.reset();
  const said = [], tracked = [];
  const missions = SA.missions.create({});
  let rt = null;
  const pantry = SA.missionPantry.create({ missions, audio: { say: (k) => said.push(k), sfx: () => {} }, track: () => {}, report: (e) => rt.report(e) });
  const trail = SA.missionTrail.create({ missions, pantry, audio: { say: (k) => said.push(k) }, track: (t, f) => tracked.push([t, f]), report: (e) => rt.report(e) });
  rt = SA.missionRuntime.create({ missions, thing: { update: (p) => { pantry.update(p); trail.update(p); }, locate: (id) => pantry.locate(id),
    target: (s) => pantry.target(s) || trail.target(s) }, spawn: null, celebrate: () => {}, track: () => {} });
  for (const id of ['mama', 'huevo', 'rio', 'fiesta', 'doctor', 'aguila', 'censo']) { assert.equal(missions.start(id).ok, true, id); missions.complete(); }
  assert.equal(missions.start('ladrones').ok, true);
  trail.update(null);
  return { SA, missions, pantry, trail, rt, said, tracked };
}
const step = (c) => c.missions.active().stepData;
const json = (v) => JSON.parse(JSON.stringify(v));

test('build: prints lead from the basket at the station to the tree, wobbling, with crumbs and a log; deterministic per seed', () => {
  const { SA, pantry, trail } = setup();
  const t = pantry.current().tree, b = SA.missionTrail.basket();
  assert.ok(SA.station.inFootprint(b.x, b.z, 4), 'the basket stands at the station');
  assert.equal(SA.station.inFootprint(b.x, b.z, 0), false, 'but not inside its walls');
  const cur = trail.current();
  assert.deepEqual(json(cur.from), json(b));
  assert.ok(cur.points.length >= 8, 'a real trail of prints');
  const first = cur.points[0], last = cur.points[cur.points.length - 1];
  assert.ok(Math.hypot(first.x - b.x, first.z - b.z) < 3, 'starts at the basket');
  assert.ok(Math.hypot(last.x - t.x, last.z - t.z) < 12 &&Math.hypot(last.x - t.x, last.z - t.z) > 3, 'ends at the hollow tree\'s doorstep');
  for (let i = 1; i < cur.points.length; i++) {
    const g = Math.hypot(cur.points[i].x - cur.points[i - 1].x, cur.points[i].z - cur.points[i - 1].z);
    assert.ok(g < 14, 'no huge gaps between prints (a pond may skip a few, the route avoids water where it can)');
  }
  assert.equal(cur.points.filter((p) => p.side === -1).length > 0 && cur.points.filter((p) => p.side === 1).length > 0, true, 'left and right feet');
  for (const p of cur.points) { assert.equal(SA.map.isWater(p.x, p.z), false); assert.equal(SA.station.inFootprint(p.x, p.z, 0), false); }
  assert.ok(cur.crumbs.length >= 3 && cur.crumbs.every((c) => c.n >= 2));
  assert.ok(cur.log.h > 2 && cur.log.len > 3, 'a raised log across the way: you walk under it');
  const onPath = cur.points.some((p) => Math.hypot(p.x - cur.log.x, p.z - cur.log.z) < 3);
  assert.ok(onPath, 'the log lies right on the trail');
  const again = SA.missionTrail.build(b, t, pantry.current().tree && trail.current() && 5);
  const same = SA.missionTrail.build(b, t, 5), other = SA.missionTrail.build(b, t, 6);
  assert.deepEqual(json(again), json(same));
  assert.notDeepEqual(json(same.points), json(other.points));
});

test('build: the way round the station walls and across the river goes through the ford, so no print lies in the water or inside the station', () => {
  const { SA } = setup(), b = SA.missionTrail.basket();
  for (const tree of [{ x: -45, y: 1, z: -20, face: 0.8 }, { x: -48, y: 1, z: 28, face: 0.4 }, { x: -12, y: 1, z: 30, face: 0.2 }, { x: -20, y: 1, z: -25, face: 1 }]) {
    for (const seed of [1, 2, 3]) {
      const tr = SA.missionTrail.build(b, tree, seed);
      assert.ok(tr.points.length >= 8, JSON.stringify(tree));
      for (const p of tr.points) { assert.equal(SA.map.isWater(p.x, p.z), false); assert.equal(SA.station.inFootprint(p.x, p.z, 0), false); }
      for (let i = 1; i < tr.points.length; i++) assert.ok(Math.hypot(tr.points[i].x - tr.points[i - 1].x, tr.points[i].z - tr.points[i - 1].z) < 5, 'no gaps: ' + JSON.stringify(tree) + seed);
      const last = tr.points[tr.points.length - 1];
      assert.ok(Math.hypot(last.x - tree.x, last.z - tree.z) < 8, 'ends at the doorstep');
    }
  }
});

test('reached: the highest print near you, never going back; wandering off loses nothing', () => {
  const { SA, trail } = setup();
  const pts = trail.current().points, R = SA.missionTrail;
  assert.equal(R.reached(pts, { x: 9999, z: 9999 }, -1), -1);
  assert.equal(R.reached(pts, { x: pts[0].x, z: pts[0].z }, -1) >= 0, true);
  const mid = Math.floor(pts.length / 2);
  assert.ok(R.reached(pts, pts[mid], -1) >= mid, 'a shortcut to a later print counts');
  assert.equal(R.reached(pts, { x: 9999, z: 9999 }, mid), mid, 'walking away never lowers progress');
  assert.equal(R.reached(pts, pts[2], mid), mid);
  assert.equal(R.reached(null, null), -1);
});

test('the step: shown only while active, spoken once, compass follows the prints, finishes at the hollow tree and goes on to goTo', () => {
  const c = setup(), { trail, said, rt, tracked } = c, pts = trail.current().points, t = c.pantry.current().tree;
  assert.equal(step(c).kind, 'trail');
  assert.equal(trail.view().active, true);
  assert.deepEqual(json(trail.view().ahead), [0, 1, 2], 'the next prints glow');
  // Compass: a few prints ahead of progress.
  const t0 = rt.target();
  assert.equal(t0.role, 'trail');
  const ahead = (i) => (i < pts.length ? [pts[i].x, pts[i].z] : [t.x, t.z]);    // the tree once the prints run out
  assert.deepEqual([t0.x, t0.z], ahead(4));
  // Words are spoken once at the step.
  rt.update({ x: pts[0].x, z: pts[0].z, y: 0 });
  rt.update({ x: pts[1].x, z: pts[1].z, y: 0 });
  assert.deepEqual(json(said), ['thing:huellas', 'phrase:seguir']);
  assert.equal(trail.current().reached >= 1, true);
  assert.deepEqual(json(trail.view().ahead).slice(0, 1), [trail.current().reached + 1]);
  const t1 = rt.target();
  assert.deepEqual([t1.x, t1.z], ahead(trail.current().reached + 5));
  // Wandering off the trail has no fail state.
  rt.update({ x: pts[1].x + 200, z: pts[1].z, y: 0 });
  assert.equal(step(c).kind, 'trail');
  assert.equal(c.missions.active().id, 'ladrones');
  // Near the end the arrow points at the tree.
  rt.update({ x: pts[pts.length - 3].x, z: pts[pts.length - 3].z, y: 0 });
  const tl = rt.target();
  if (step(c).kind === 'trail') assert.ok(tl.role === 'trail');
  // Reaching the hollow tree finishes the step.
  rt.update({ x: t.x + Math.sin(t.face) * 5, z: t.z + Math.cos(t.face) * 5, y: t.y });
  assert.notEqual(step(c).kind, 'trail', 'reaching the doorstep ends the footprints step');
  assert.ok(['goTo', 'collect', 'photo'].includes(step(c).kind));
  assert.equal(trail.view().active, false, 'prints are hidden once the step is over');
  assert.equal(trail.target(step(c)), null);
  assert.ok(tracked.some(([n]) => n === 'trail.start') && tracked.some(([n]) => n === 'trail.end'));
  // The existing goTo step then finishes at the tree itself.
  rt.update({ x: t.x, z: t.z + 1, y: t.y });
  assert.equal(step(c).kind, 'collect', 'AS-0348: the strawberries come after reaching the tree');
});

test('a straight dash to the tree also finishes the step (no fail state, no need to walk every print)', () => {
  const c = setup(), t = c.pantry.current().tree;
  c.rt.update({ x: t.x + Math.sin(t.face) * 4, z: t.z + Math.cos(t.face) * 4, y: t.y });
  assert.notEqual(step(c).kind, 'trail');
});

test('no trail without the mission: nothing is built, no compass target', () => {
  const SA = loadGame(FILES);
  SA.save.reset();
  assert.equal(SA.missionTrail.sync(), null);
  assert.equal(SA.missionTrail.view(), null);
  assert.equal(SA.missionTrail.target({ kind: 'trail', trail: 'huellas' }), null);
  assert.equal(SA.missionTrail.locate('x'), null);
  assert.equal(SA.missionTrail.update({ x: 0, z: 0 }), null);
});

test('data and words: las huellas and seguir are vocabulary; the trail step validates; a bad trail spec is refused', () => {
  const { SA } = setup();
  assert.equal(SA.vocab.get('thing:huellas').es, 'las huellas');
  assert.equal(SA.vocab.get('phrase:seguir').es, 'seguir');
  const m = SA.data.all('missions')[7];
  SA.missionRun.validate(m.steps);
  assert.equal(m.steps[0].line.es, 'Sigue las huellas');
  assert.equal(m.steps[0].line.icon, '🐾');
  for (const k of m.pantry.trail.say.start) assert.ok(SA.vocab.get(k), k);
  const ok = { id: 'zz', n: 99, es: 'Prueba', en: 'Test', icon: '🐾', intro: { es: 'Hola', icon: '🐾' }, steps: [{ kind: 'photo', line: { es: 'Foto', icon: '📷' } }], reward: { stars: 1 } };
  const bad = (trail) => () => SA.data.register('missions', [{ ...ok, pantry: { ...m.pantry, trail } }]);
  assert.throws(bad('x'), /pantry\.trail/);
  assert.throws(bad({ id: 'Bad Id' }), /pantry\.trail/);
  assert.throws(bad({ id: 'huellas', say: { start: [3] } }), /pantry\.trail\.say/);
});
