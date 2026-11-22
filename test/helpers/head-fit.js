// Pure geometry for "does this animal's head sit on its body, and do its eyes sit on its head?".
// No THREE, no DOM, no animal ids: it works on assembly-plan entries from SA.animalPlan.plan()
// ({ builder, position:[x,y,z], worldSize:[x,y,z] }), where a sphere is an ellipsoid whose
// diameters are worldSize and a box has worldSize as its full extents.

const half = (e) => e.worldSize.map((v) => v / 2);

/** Axis-aligned bounds { min:[x,y,z], max:[x,y,z] } of a plan entry. */
export function bounds(entry) {
  const h = half(entry);
  return { min: entry.position.map((v, i) => v - h[i]), max: entry.position.map((v, i) => v + h[i]) };
}

/** Overlap depth on each axis between two entries' bounds (negative = a gap on that axis). */
export function overlapDepth(a, b) {
  const A = bounds(a), B = bounds(b);
  return [0, 1, 2].map((i) => Math.min(A.max[i], B.max[i]) - Math.max(A.min[i], B.min[i]));
}

/** True when the two volumes overlap by more than `minDepth` on every axis. */
export function volumesOverlap(a, b, minDepth = 0) {
  return overlapDepth(a, b).every((d) => d > minDepth);
}

/**
 * Approximate signed distance from `point` to the surface of `shape` (negative = inside).
 * Boxes use the exact box distance; spheres/other primitives use the ellipsoid
 * (normalised radius - 1) scaled by the shortest semi-axis.
 */
export function surfaceDistance(shape, point) {
  const h = half(shape);
  const d = point.map((v, i) => v - shape.position[i]);
  if (shape.builder === 'box') {
    const q = d.map((v, i) => Math.abs(v) - h[i]);
    const outside = Math.hypot(...q.map((v) => Math.max(v, 0)));
    return outside + Math.min(Math.max(...q), 0);
  }
  const r = Math.sqrt(d.reduce((s, v, i) => s + (v / h[i]) ** 2, 0));
  return (r - 1) * Math.min(...h);
}

/** Distance from an eye's centre to the head surface (negative = the centre is inside the head). */
export function eyeSurfaceDistance(head, eye) {
  return surfaceDistance(head, eye.position);
}
