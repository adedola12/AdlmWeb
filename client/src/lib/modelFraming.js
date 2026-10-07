// How the 3D viewer frames a whole model when it first loads.
//
// A building is roughly as wide as it is long, so fitting its bounding box is
// right. A road corridor is not: a 480 m by 10 m CIVIQ corridor fitted whole
// puts the camera ~600 m away and the road shrinks to a grey line. For a model
// whose plan is much longer than it is wide, frame the first stretch of it and
// look down its length, so the pavement layers, kerbs and drains are readable
// and the rest of the corridor recedes in perspective.
//
// Plain numbers, no three.js, so it is unit-testable. Coordinates are the
// viewer's: y is up, x and z are plan.

// Plan length / plan width above which a model counts as a corridor.
export const ELONGATED_RATIO = 6;

// { min:{x,y,z}, max:{x,y,z} } -> null (fit the whole box) or
// { min, max, dir:{x,y,z} } — the sub-box to frame and the direction from its
// centre to the camera.
export function elongatedFrame(box) {
  const sx = box.max.x - box.min.x;
  const sz = box.max.z - box.min.z;
  const long = Math.max(sx, sz);
  const short = Math.min(sx, sz);
  if (!(short > 0) || long / short <= ELONGATED_RATIO) return null;

  const alongX = sx >= sz;
  // The first stretch: three widths, at least 30 m, never more than the model.
  const stretch = Math.min(long, Math.max(short * 3, 30));
  const min = { ...box.min };
  const max = { ...box.max };
  if (alongX) max.x = min.x + stretch;
  else max.z = min.z + stretch;

  // Stand behind the start, a little to one side and above, looking along it.
  const dir = alongX ? { x: -1, y: 0.7, z: 0.55 } : { x: 0.55, y: 0.7, z: -1 };
  return { min, max, dir };
}
