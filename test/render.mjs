// Regression tests for two bugs found in the browser:
//   1) Inverted chunk face winding -> terrain looked translucent (faces culled).
//   2) Budget-delayed chunk generation -> player fell through unspawned ground.
import * as THREE from "three";
import { Chunk } from "../src/voxel/Chunk.js";
import { BLOCK, isSolid } from "../src/voxel/blocks.js";
import World from "../src/voxel/World.js";
import { PLANETS } from "../src/maps/SolarSystem.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

// --- 1) Face winding: every triangle's geometric normal (from CCW winding)
//        must match its stored vertex normal, i.e. front faces point OUTWARD. ---
const chunk = new Chunk(0, 0);
chunk.setLocal(1, 1, 1, BLOCK.STONE); // a single block surrounded by air
const geo = chunk.build(() => BLOCK.AIR); // all neighbours air -> all 6 faces emitted
const pos = geo.getAttribute("position");
const nrm = geo.getAttribute("normal");
const idx = geo.getIndex();

ok(idx && idx.count === 36, `single block emits 6 faces (got ${idx ? idx.count / 3 : 0} tris)`);

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), geoN = new THREE.Vector3();
let mismatches = 0;
for (let t = 0; t < idx.count; t += 3) {
  const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
  a.fromBufferAttribute(pos, i0);
  b.fromBufferAttribute(pos, i1);
  c.fromBufferAttribute(pos, i2);
  ab.subVectors(b, a); ac.subVectors(c, a);
  geoN.crossVectors(ab, ac).normalize(); // CCW front-face normal
  const stored = new THREE.Vector3(nrm.getX(i0), nrm.getY(i0), nrm.getZ(i0));
  if (geoN.dot(stored) < 0.9) mismatches++; // should point the same way
}
ok(mismatches === 0, `all face windings point outward (mismatches: ${mismatches})`);

// --- 2) Spawn solidity: prime() + one update must leave SOLID ground under the
//        spawn point before any physics runs (the fall-through fix). ---
const world = new World(PLANETS[0]);
const spawn = new THREE.Vector3(0, 0, 0);
world.prime(spawn, 2);
const h = world.heightAt(0, 0);
ok(isSolid(world.getBlock(0, h - 1, 0)), "ground under spawn is solid right after prime()");
// And a chunk one over (within collision radius) after a single update.
world.update(spawn);
ok(isSolid(world.getBlock(20, world.heightAt(20, 0) - 1, 0)),
  "neighbour-chunk ground solid after one update (collision radius)");
world.dispose();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
