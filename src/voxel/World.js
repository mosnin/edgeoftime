// World — chunk management, meshing, edits, and DDA raycasting for Edge of Time.
// Performance is the headline feature: per-frame chunk generation/remesh is
// budgeted, and chunks beyond the render radius are unloaded.

import * as THREE from "three";
import { Chunk, CHUNK_SIZE, CHUNK_HEIGHT } from "./Chunk.js";
import { BLOCK, isSolid } from "./blocks.js";
import TerrainGenerator from "./TerrainGenerator.js";
import { buildAtlas } from "./textures.js";

// Per-frame work caps (the key anti-lag measure).
const GEN_BUDGET = 2;     // new chunks generated per update()
const MESH_BUDGET = 4;    // dirty chunks remeshed per update()

function floorDiv(a, b) { return Math.floor(a / b); }
function posMod(a, b) { return ((a % b) + b) % b; }

export default class World {
  constructor(planet) {
    this.planet = planet;
    this.gen = new TerrainGenerator(planet);
    this.chunks = new Map();                 // key `${cx},${cz}` -> Chunk
    this.group = new THREE.Group();
    // Procedural texture atlas (null when headless — tests run without canvas).
    // With a map, the texture supplies block hue + detail and the grayscale
    // vertex color provides per-face directional shading. Without it, we fall
    // back to plain grayscale shading.
    this.atlas = buildAtlas();
    this.material = new THREE.MeshStandardMaterial({
      map: this.atlas || null,
      vertexColors: true, roughness: 1, metalness: 0,
      alphaTest: this.atlas ? 0.5 : 0,
    });
    this.renderRadius = 6;                    // in chunks
    this._center = { cx: 0, cz: 0 };
  }

  _key(cx, cz) { return cx + "," + cz; }

  // ---- Block access (global voxel coords) ----------------------------------

  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk) return BLOCK.AIR;
    return chunk.getLocal(posMod(x, CHUNK_SIZE), y, posMod(z, CHUNK_SIZE));
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.chunks.get(this._key(cx, cz));
    if (!chunk) return; // only edit loaded chunks
    const lx = posMod(x, CHUNK_SIZE);
    const lz = posMod(z, CHUNK_SIZE);
    chunk.setLocal(lx, y, lz, id);
    chunk.dirty = true;

    // If the edit is on a chunk border, the neighbour's culling changes too.
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const c = this.chunks.get(this._key(cx, cz));
    if (c) c.dirty = true;
  }

  heightAt(x, z) {
    return this.gen.heightAt(x, z);
  }

  // Generate a chunk's voxel DATA immediately if it's missing (cheap CPU work).
  // Meshing (the expensive GPU work) is still deferred via the dirty flag.
  _ensureChunk(cx, cz) {
    const key = this._key(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.gen.fillChunk(chunk);
      chunk.dirty = true;
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  // Synchronously generate all chunk data within `radius` chunks of a point.
  // Used at spawn so the player always lands on SOLID ground (collision reads
  // block data, which must exist before the first physics step).
  prime(centerPos, radius = 2) {
    const ccx = floorDiv(Math.floor(centerPos.x), CHUNK_SIZE);
    const ccz = floorDiv(Math.floor(centerPos.z), CHUNK_SIZE);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this._ensureChunk(ccx + dx, ccz + dz);
      }
    }
  }

  // ---- Chunk load / unload / remesh ----------------------------------------

  update(centerPos) {
    const ccx = floorDiv(Math.floor(centerPos.x), CHUNK_SIZE);
    const ccz = floorDiv(Math.floor(centerPos.z), CHUNK_SIZE);
    this._center = { cx: ccx, cz: ccz };

    const R = this.renderRadius;

    // 0) ALWAYS keep the chunks immediately around the player generated, so the
    // ground is never missing under your feet while exploring (data only —
    // cheap). Meshing of these still goes through the budgeted pass below.
    const COLLISION_R = 2;
    for (let dz = -COLLISION_R; dz <= COLLISION_R; dz++) {
      for (let dx = -COLLISION_R; dx <= COLLISION_R; dx++) {
        this._ensureChunk(ccx + dx, ccz + dz);
      }
    }

    // 1) Generate missing chunks within renderRadius (budgeted, nearest first).
    let generated = 0;
    let bestList = [];
    for (let dz = -R; dz <= R && generated < GEN_BUDGET * 4; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx, cz = ccz + dz;
        if (this.chunks.has(this._key(cx, cz))) continue;
        bestList.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
    bestList.sort((a, b) => a.d - b.d);
    for (const c of bestList) {
      if (generated >= GEN_BUDGET) break;
      const chunk = new Chunk(c.cx, c.cz);
      this.gen.fillChunk(chunk);
      chunk.dirty = true;
      this.chunks.set(this._key(c.cx, c.cz), chunk);
      generated++;
    }

    // 2) Unload chunks beyond renderRadius + 2.
    const unloadR = R + 2;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > unloadR || Math.abs(chunk.cz - ccz) > unloadR) {
        if (chunk.mesh) {
          this.group.remove(chunk.mesh);
          if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
          chunk.mesh = null;
        }
        this.chunks.delete(key);
      }
    }

    // 3) Remesh dirty chunks (budgeted, nearest first).
    let meshed = 0;
    const dirtyList = [];
    for (const chunk of this.chunks.values()) {
      if (!chunk.dirty) continue;
      const d = (chunk.cx - ccx) * (chunk.cx - ccx) + (chunk.cz - ccz) * (chunk.cz - ccz);
      dirtyList.push({ chunk, d });
    }
    dirtyList.sort((a, b) => a.d - b.d);
    for (const { chunk } of dirtyList) {
      if (meshed >= MESH_BUDGET) break;
      this._remesh(chunk);
      meshed++;
    }
  }

  _remesh(chunk) {
    const geo = chunk.build((gx, gy, gz) => this.getBlock(gx, gy, gz));
    if (chunk.mesh) {
      const old = chunk.mesh.geometry;
      chunk.mesh.geometry = geo;
      if (old) old.dispose();
    } else {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
      chunk.mesh = mesh;
      this.group.add(mesh);
    }
    chunk.dirty = false;
  }

  // ---- Voxel DDA raycast (Amanatides & Woo) --------------------------------

  raycast(origin, dir, maxDist) {
    // Normalize direction.
    const d = dir.clone();
    const len = d.length();
    if (len === 0) return null;
    d.multiplyScalar(1 / len);

    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = d.x > 0 ? 1 : (d.x < 0 ? -1 : 0);
    const stepY = d.y > 0 ? 1 : (d.y < 0 ? -1 : 0);
    const stepZ = d.z > 0 ? 1 : (d.z < 0 ? -1 : 0);

    const tDeltaX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tDeltaY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tDeltaZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;

    const boundary = (o, s, b) => {
      if (s > 0) return (b + 1 - o);
      if (s < 0) return (o - b);
      return Infinity;
    };
    let tMaxX = d.x !== 0 ? boundary(origin.x, stepX, x) / Math.abs(d.x) : Infinity;
    let tMaxY = d.y !== 0 ? boundary(origin.y, stepY, y) / Math.abs(d.y) : Infinity;
    let tMaxZ = d.z !== 0 ? boundary(origin.z, stepZ, z) / Math.abs(d.z) : Infinity;

    let t = 0;
    let normal = new THREE.Vector3(0, 0, 0);

    // If we start inside a solid block, treat the starting voxel as the hit.
    if (isSolid(this.getBlock(x, y, z))) {
      return {
        block: { x, y, z },
        place: { x, y, z },
        normal: new THREE.Vector3(0, 1, 0),
        distance: 0,
      };
    }

    const guard = Math.ceil(maxDist * 3) + 8;
    for (let i = 0; i < guard; i++) {
      // Advance to the next voxel boundary.
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX;
        normal.set(-stepX, 0, 0);
      } else if (tMaxY <= tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY;
        normal.set(0, -stepY, 0);
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
        normal.set(0, 0, -stepZ);
      }

      if (t > maxDist) return null;

      if (isSolid(this.getBlock(x, y, z))) {
        return {
          block: { x, y, z },
          place: { x: x + normal.x, y: y + normal.y, z: z + normal.z },
          normal: normal.clone(),
          distance: t,
        };
      }
    }
    return null;
  }

  // ---- Cleanup -------------------------------------------------------------

  dispose() {
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh && chunk.mesh.geometry) chunk.mesh.geometry.dispose();
      chunk.mesh = null;
    }
    if (this.group) {
      while (this.group.children.length) this.group.remove(this.group.children[0]);
    }
    if (this.material) this.material.dispose();
    if (this.atlas) { this.atlas.dispose(); this.atlas = null; }
    this.chunks.clear();
  }
}
