import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './helpers/vm.js';

const FILES = ['game/sa.js', 'game/album-pics.js', 'game/render/photo-capture.js'];

// A stub THREE: Box3 reads a fixed box from the object, Vector3.project maps x/y straight to NDC.
function stubThree(ndc) {
  class Box3 { setFromObject(o) { this.min = o.min; this.max = o.max; return this; } }
  class Vector3 { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } project() { this.x = ndc.x; this.y = ndc.y; this.z = ndc.z; return this; } }
  return { Box3, Vector3 };
}

function rig({ visible = true, ndc = { x: 0, y: 0, z: 0.5 }, ctx = true, throwAt } = {}) {
  const calls = [];
  const group = { visible, min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  const canvas = {
    width: 0, height: 0,
    getContext: () => (ctx ? { drawImage: (...a) => calls.push(['draw', ...a]) } : null),
    toDataURL: (type, q) => { if (throwAt === 'url') throw new Error('tainted'); calls.push(['url', type, q]); return 'data:image/jpeg;base64,QQ'; }
  };
  const SA = loadGame(FILES);
  const capture = SA.render.createPhotoCapture(stubThree(ndc), {
    renderer: { render: () => calls.push(['render']), domElement: { width: 800, height: 600 } },
    scene: { updateMatrixWorld() {} }, camera: {},
    animals: { getObjectByName: (n) => (n === 'conejo' ? group : null) },
    doc: { createElement: () => canvas }
  });
  return { capture, calls, canvas };
}

test('capture renders a frame, crops round the animal to ~240 px wide and returns a JPEG data URL', () => {
  const { capture, calls, canvas } = rig();
  assert.equal(capture('conejo'), 'data:image/jpeg;base64,QQ');
  assert.deepEqual(calls[0], ['render']);
  assert.equal(canvas.width, 240);
  assert.equal(canvas.height, 180);
  assert.equal(calls.find((c) => c[0] === 'url')[1], 'image/jpeg');
  assert.ok(calls.find((c) => c[0] === 'url')[2] < 1, 'modest quality');
  assert.equal(calls.find((c) => c[0] === 'draw').length, 10);
});

test('capture returns null (the photo still counts) for unknown or hidden animals, off-screen animals and canvas failures', () => {
  assert.equal(rig().capture('dragon'), null);
  assert.equal(rig({ visible: false }).capture('conejo'), null);
  assert.equal(rig({ ndc: { x: 5, y: 0, z: 0.5 } }).capture('conejo'), null);
  assert.equal(rig({ ndc: { x: 0, y: 0, z: 2 } }).capture('conejo'), null, 'behind the camera');
  assert.equal(rig({ ctx: false }).capture('conejo'), null);
  assert.equal(rig({ throwAt: 'url' }).capture('conejo'), null);
});
