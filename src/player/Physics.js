// Voxel AABB collision resolution. Pure-ish: mutates the passed position/velocity
// Vector3s in place, never touches a Three scene. No per-call Vector allocations.
import { isSolid } from "../voxel/blocks.js";

// A voxel at integer (x,y,z) occupies [x, x+1] on each axis. A block is solid for
// collision if isSolid(getBlock) is true. For v1 ALL non-air blocks are solid,
// including water (players do not wade) — see note in module report.
function blockSolid(world, x, y, z) {
  return isSolid(world.getBlock(x, y, z));
}

// Returns true if any solid voxel overlaps the AABB given by [min,max] on each axis.
// Uses a small epsilon-shrunk box so that resting flush against a face (where the
// box max exactly equals an integer plane) does not count the next cell over.
const EPS = 1e-4;

function overlapsSolid(world, minX, minY, minZ, maxX, maxY, maxZ) {
  const x0 = Math.floor(minX + EPS);
  const x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY + EPS);
  const y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ + EPS);
  const z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (blockSolid(world, x, y, z)) return true;
      }
    }
  }
  return false;
}

// Resolve one axis. axis: 0=x,1=y,2=z. Moves position[axis] by disp, and if the
// resulting box overlaps a solid voxel, snaps it to rest against the block face and
// zeroes velocity on that axis. Returns the (possibly clamped) displacement applied.
function resolveAxis(world, position, velocity, halfExtents, axis, disp) {
  if (disp === 0) return 0;

  const px = position.x, py = position.y, pz = position.z;
  const hx = halfExtents.x, hy = halfExtents.y, hz = halfExtents.z;

  // Tentative center on this axis.
  let centerAxis;
  if (axis === 0) centerAxis = px + disp;
  else if (axis === 1) centerAxis = py + disp;
  else centerAxis = pz + disp;

  // Build the AABB at the tentative position (other axes unchanged).
  const cx = axis === 0 ? centerAxis : px;
  const cy = axis === 1 ? centerAxis : py;
  const cz = axis === 2 ? centerAxis : pz;

  const minX = cx - hx, maxX = cx + hx;
  const minY = cy - hy, maxY = cy + hy;
  const minZ = cz - hz, maxZ = cz + hz;

  if (!overlapsSolid(world, minX, minY, minZ, maxX, maxY, maxZ)) {
    // No collision: commit the move.
    if (axis === 0) position.x = centerAxis;
    else if (axis === 1) position.y = centerAxis;
    else position.z = centerAxis;
    return disp;
  }

  // Collision: snap to rest flush against the offending block face.
  const half = axis === 0 ? hx : axis === 1 ? hy : hz;
  if (disp > 0) {
    // Moving in +axis: the box's leading (max) face hit a block. Find the lowest
    // integer plane >= old max that the new box crosses; rest just below it.
    const newMax = (axis === 0 ? maxX : axis === 1 ? maxY : maxZ);
    const plane = Math.floor(newMax + EPS); // integer face the box pushed into
    const snapped = plane - half - EPS;
    if (axis === 0) position.x = snapped;
    else if (axis === 1) position.y = snapped;
    else position.z = snapped;
  } else {
    // Moving in -axis: the box's trailing (min) face hit a block.
    const newMin = (axis === 0 ? minX : axis === 1 ? minY : minZ);
    const plane = Math.ceil(newMin - EPS); // integer face the box pushed into
    const snapped = plane + half + EPS;
    if (axis === 0) position.x = snapped;
    else if (axis === 1) position.y = snapped;
    else position.z = snapped;
  }

  // Stop motion on this axis.
  if (axis === 0) velocity.x = 0;
  else if (axis === 1) velocity.y = 0;
  else velocity.z = 0;
  return 0;
}

// Test a thin slab just beneath the bottom face for a solid voxel.
function isOnGround(world, position, halfExtents) {
  const probe = 0.05; // 5cm slab below the feet
  const minX = position.x - halfExtents.x;
  const maxX = position.x + halfExtents.x;
  const minZ = position.z - halfExtents.z;
  const maxZ = position.z + halfExtents.z;
  const footY = position.y - halfExtents.y;
  const slabMin = footY - probe;
  const slabMax = footY - EPS; // strictly below the feet
  return overlapsSolid(world, minX, slabMin, minZ, maxX, slabMax, maxZ);
}

const MAX_STEP = 0.4; // max per-substep displacement (blocks) on any axis

const Physics = {
  // Moves an AABB through the voxel world resolving collisions axis-by-axis.
  // position/velocity mutated in place. Returns { onGround }.
  moveAndCollide(world, position, velocity, halfExtents, dt) {
    if (dt > 0) {
      // Sub-step so a single frame never displaces more than MAX_STEP per axis,
      // preventing tunnelling through 1-block walls under fast jetpack motion.
      const maxDisp = Math.max(
        Math.abs(velocity.x),
        Math.abs(velocity.y),
        Math.abs(velocity.z)
      ) * dt;
      let steps = 1;
      if (maxDisp > MAX_STEP) {
        steps = Math.ceil(maxDisp / MAX_STEP);
      }
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        // Resolution order: Y first, then X, then Z. Resolving Y first lets the
        // player settle onto floors before horizontal resolution.
        resolveAxis(world, position, velocity, halfExtents, 1, velocity.y * sdt);
        resolveAxis(world, position, velocity, halfExtents, 0, velocity.x * sdt);
        resolveAxis(world, position, velocity, halfExtents, 2, velocity.z * sdt);
      }
    }

    const onGround = velocity.y <= 0 && isOnGround(world, position, halfExtents);
    return { onGround };
  },
};

export default Physics;
