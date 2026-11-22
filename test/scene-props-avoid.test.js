import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

// Loads game/render/scene.js with a stub THREE and stubbed render builders (no DOM, no WebGL, no network), real
// habitat/save/propAvoid, and records every ambient.setAvoid call.
const BASE = ['game/sa.js', 'game/data-registry.js', 'game/data/parts.js', 'game/data/biomes.js', 'game/data/animals.js',
  'game/data/vocab.js', 'game/map.js', 'game/save.js', 'game/data/props.js', 'game/habitat.js', 'game/prop-avoid.js'];

function setup() {
  const calls = [];
  const propsApi = { group: {}, add() { return 'added'; }, remove() { return 'removed'; } };
  const noop = () => ({});
  const SA = loadGame([...BASE, (sa) => {    sa.camera = { DEFAULTS: { fovDeg: 50 } };
    sa.picking = { hasRubTarget: () => false, isRubTarget: () => false };
    sa.render = {
      buildWorld: noop,
      buildDecor: () => ({ children: [{ position: { x: 1, z: 2 } }] }),
      buildAnimals: () => ({ children: [] }),
      createCameraRig: noop, createPicking: noop, createTreeTap: noop, createRoundFx: noop, createCareFx: noop,
      createProps: () => propsApi,
      createAmbient: () => ({ setAvoid(a) { calls.push(a); } }),
    };
  }, 'game/render/scene.js'], { addEventListener() {} });
  SA.save.reset();
  SA.save.update({ stars: 50 });
  const fn = function () { return {}; };
  const THREE = {
    WebGLRenderer: function () { return { setPixelRatio: fn, setClearColor: fn, setSize: fn, domElement: { style: {} } }; },
    Scene: function () { return { add: fn }; },
    Color: fn, Fog: fn, HemisphereLight: fn, DirectionalLight: function () { return { position: { set: fn } }; },
    Mesh: function () { return { rotation: {}, position: {} }; },
    PlaneGeometry: fn, MeshLambertMaterial: fn,
    PerspectiveCamera: function () { return { updateProjectionMatrix: fn }; },
  };
  const stage = SA.render.createStage(THREE, { appendChild: fn, clientWidth: 400, clientHeight: 300 });
  return { SA, stage, calls };
}

test('createStage seeds the avoid list with the decor points', () => {
  const { calls } = setup();
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify([[1, 2]]));
});

test('props.add refreshes the wander avoid list so it includes the new prop', () => {
  const { SA, stage, calls } = setup();
  const res = SA.habitat.place('arbol', -5, 14);
  assert.equal(res.status, 'placed');
  const before = calls.length;
  assert.equal(stage.props.add(), 'added', 'the original add result is returned');
  assert.equal(calls.length, before + 1);
  const arbolR = SA.data.get('props', 'arbol').radius;
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify([[1, 2], [res.prop.x, res.prop.z, arbolR]]));
});

test('props.remove drops the prop from the wander avoid list', () => {
  const { SA, stage, calls } = setup();
  const res = SA.habitat.place('arbol', -5, 14);
  stage.props.add();
  assert.equal(calls.at(-1).length, 2);
  SA.habitat.remove(res.prop.id);
  const before = calls.length;
  assert.equal(stage.props.remove(), 'removed', 'the original remove result is returned');
  assert.equal(calls.length, before + 1);
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify([[1, 2]]));
});
