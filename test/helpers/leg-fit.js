// Pure geometry for "do this animal's legs actually attach to its body?". Works on assembly-plan
// entries from SA.animalPlan.plan() (see head-fit.js). The body is an ellipsoid, so two bounding
// boxes can overlap while a leg standing at the body's corner still floats in the air; instead we
// take the point of the leg's box nearest the body centre and ask how deep inside the body it is.
import { bounds, surfaceDistance } from './head-fit.js';

/** The point of `entry`'s axis-aligned box closest to `point`. */
export function nearestPointInBox(entry, point) {
  const b = bounds(entry);
  return point.map((v, i) => Math.min(Math.max(v, b.min[i]), b.max[i]));
}

/** How far (>0) the leg sinks into the body volume; <= 0 means a gap or a mere touch. */
export function legSink(leg, body) {
  return -surfaceDistance(body, nearestPointInBox(leg, body.position));
}
