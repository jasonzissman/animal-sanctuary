import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

function stubThree() {
  class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
  class Obj {
    constructor() { this.children = []; this.visible = true; this.position = new Vec(); this.scale = new Vec(); this.userData = {}; this.name = ''; }
    add(...o) { o.forEach((c) => this.children.push(c)); }
    getObjectByName(n) { return this.children.find((c) => c.name === n) || null; }
  }
  const made = { textures: 0 };
  return { made, THREE: { Group: Obj, Sprite: class extends Obj { constructor(m) { super(); this.material = m; } },
    SpriteMaterial: class { constructor(o) { Object.assign(this, o); } }, CanvasTexture: class { constructor() { made.textures++; } } } };
}
const doc = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }) };

function setup(d = doc) {
  const SA = loadGame(['game/sa.js', 'game/render/need-icons.js']);
  const { THREE, made } = stubThree();
  const scene = new THREE.Group(), animals = new THREE.Group();
  scene.add(animals);
  const g = new THREE.Group(); g.name = 'pato'; g.position.set(4, 0, 6);
  const body = new THREE.Group(); body.position.set(0, 0.5, 0); body.scale.set(1, 0.8, 1); g.children.push(body);
  animals.add(g);
  return { icons: SA.render.createNeedIcons(THREE, { scene, animals, doc: d }), g, made, scene };
}

test('a needy animal gets one floating icon above its head that follows it and bobs', () => {
  const { icons, g } = setup();
  icons.update(0.1, [{ animalId: 'pato', icon: '🍓' }]);
  assert.equal(icons.count(), 1);
  const s = icons.group.children[0];
  assert.equal(s.visible, true);
  assert.equal(s.position.x, 4);
  assert.ok(s.position.y > 0.9, 'above the animal');
  const y1 = s.position.y;
  g.position.set(7, 0, 9);
  icons.update(0.3, [{ animalId: 'pato', icon: '🍓' }]);
  assert.equal(s.position.x, 7);
  assert.notEqual(s.position.y, y1, 'it bobs');
  assert.equal(icons.group.children.length, 1, 'the sprite is reused');
});

test('icons hide when the need is gone, the animal is hidden or unknown; textures are cached', () => {
  const { icons, g, made } = setup();
  icons.update(0, [{ animalId: 'pato', icon: '🍓' }, { animalId: 'nadie', icon: '🍓' }]);
  assert.equal(icons.count(), 1);
  icons.update(0, [{ animalId: 'pato', icon: '🍓' }]);
  assert.equal(made.textures, 1);
  g.visible = false;
  icons.update(0, [{ animalId: 'pato', icon: '🍓' }]);
  assert.equal(icons.count(), 0);
  g.visible = true;
  icons.update(0, null);
  assert.equal(icons.group.children[0].visible, false);
  assert.equal(icons.count(), 0);
});

test('a need icon never blocks picking and changes picture when the need changes', () => {
  const { icons } = setup();
  icons.update(0, [{ animalId: 'pato', icon: '🍓' }]);
  const s = icons.group.children[0];
  assert.equal(typeof s.raycast, 'function');
  assert.equal(s.raycast(), undefined);
  icons.update(0, [{ animalId: 'pato', icon: '🌵' }]);
  assert.equal(icons.group.children.length, 1);
});

test('without a canvas it quietly shows nothing', () => {
  const { icons } = setup({ createElement: () => ({}) });
  icons.update(0, [{ animalId: 'pato', icon: '🍓' }]);
  assert.equal(icons.count(), 0);
});
