import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './helpers/vm.js';

// A stub THREE scene graph: no WebGL, no DOM. Checks the shadow flags, the single map and the follow-the-player window.
const mesh = (extra = {}) => ({ isMesh: true, children: [], userData: {}, ...extra });
const group = (children, userData = {}) => ({ children, userData });
const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });

function setup(player = { x: 0, z: 0 }) {
  const SA = loadGame(['game/sa.js', 'game/render/sun-shadow.js']);
  const sun = { position: vec(), target: { position: vec() },
    shadow: { mapSize: {}, camera: { updateProjectionMatrix() {} } } };
  const renderer = { shadowMap: {} };
  const added = [];
  const ground = mesh({ material: { vertexColors: true } });
  const water = mesh({ material: {} });
  const world = group([ground, water]);
  const tree = group([mesh(), mesh()], { decor: 'pino', tree: true });
  const rock = mesh({ userData: { decor: 'roca' } });
  const flower = group([mesh()], { decor: 'flor' });
  const decor = group([tree, rock, flower]);
  const pickVol = mesh({ visible: false, userData: { pick: true } });
  const body = mesh();
  const animal = group([body, pickVol]);
  const animals = group([animal]);
  const avatarBody = mesh();
  const avatar = group([avatarBody]);
  const THREE = { PCFSoftShadowMap: 2 };
  const p = player;
  const shadow = SA.render.createSunShadow(THREE, { renderer, scene: { add: (o) => added.push(o) }, sun,
    getPlayer: () => p, world, casters: [decor, avatar], dynamic: [animals] });
  return { SA, sun, renderer, added, ground, water, tree, rock, flower, animals, animal, body, pickVol, avatarBody, shadow, p, THREE };
}

test('the sun is a shadow-casting light with one PCFSoft map sized for performance', () => {
  const { SA, sun, renderer, added } = setup();
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(renderer.shadowMap.type, 2);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.mapSize.width, sun.shadow.mapSize.height);
  assert.ok(sun.shadow.mapSize.width >= 1024 && sun.shadow.mapSize.width <= 2048);
  assert.equal(sun.shadow.mapSize.width, SA.render.SUN_SHADOW.mapSize);
  assert.ok(added.includes(sun.target), 'the target is in the scene');
});

test('trees, rocks, animals and the player cast; the ground receives; water, flowers and pick volumes do nothing', () => {
  const t = setup();
  t.tree.children.forEach((m) => assert.equal(m.castShadow, true));
  assert.equal(t.rock.castShadow, true);
  assert.equal(t.body.castShadow, true);
  assert.equal(t.avatarBody.castShadow, true);
  assert.equal(t.ground.receiveShadow, true);
  assert.notEqual(t.water.receiveShadow, true);
  assert.notEqual(t.flower.children[0].castShadow, true);
  assert.notEqual(t.pickVol.castShadow, true);
});

test('the shadow window follows the player, snapped to shadow texels, and animals added later cast too', () => {
  const t = setup();
  const cfg = t.SA.render.SUN_SHADOW, texel = (2 * cfg.halfExtent) / cfg.mapSize;
  t.p.x = 10.01; t.p.z = -20.02;
  t.shadow.update();
  assert.ok(Math.abs(t.sun.target.position.x - 10.01) <= texel);
  assert.ok(Math.abs(t.sun.target.position.z + 20.02) <= texel);
  assert.equal(t.sun.position.x, t.sun.target.position.x + cfg.offset.x);
  assert.equal(t.sun.position.y, cfg.offset.y);
  assert.equal(t.sun.position.z, t.sun.target.position.z + cfg.offset.z);
  const late = mesh();
  t.animals.children.push(group([late]));
  assert.notEqual(late.castShadow, true);
  t.shadow.update();
  assert.equal(late.castShadow, true);
});

test('wired into the page and the stage: loaded before scene.js, updated each frame', () => {
  const html = fs.readFileSync('index.html', 'utf8'), manifest = fs.readFileSync('game/manifest.js', 'utf8');
  for (const s of [html, manifest]) {
    const a = s.indexOf('game/render/sun-shadow.js');
    assert.ok(a > 0 && a < s.indexOf('game/render/scene.js'));
  }
  const scene = fs.readFileSync('game/render/scene.js', 'utf8');
  assert.match(scene, /createSunShadow/);
  assert.match(scene, /sunShadow\.update\(\)/);
});
