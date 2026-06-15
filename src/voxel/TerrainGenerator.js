// TerrainGenerator — deterministic per-planet terrain for Edge of Time.
// Owns column heights, surface materials, water fill, and simple trees.

import { CHUNK_SIZE, CHUNK_HEIGHT } from "./Chunk.js";
import { BLOCK } from "./blocks.js";
import { Noise } from "../util/noise.js";

// Base frequency for the terrain heightfield (world units).
const FREQ = 0.018;
const OCTAVES = 4;

export default class TerrainGenerator {
  constructor(planet) {
    this.planet = planet;
    const p = planet.params || {};
    this.amplitude = p.amplitude ?? 12;
    this.baseHeight = p.baseHeight ?? 20;
    this.waterLevel = p.waterLevel ?? 14;
    this.treeDensity = p.treeDensity ?? 0.0;
    this.palette = p.palette ?? "terran";

    const seed = (planet.seed ?? 1337) | 0;
    this.noise = new Noise(seed);
    this.noise2 = new Noise((seed + 1) | 0); // trees / variation
  }

  // Integer surface height for a global (gx, gz) column. Deterministic.
  heightAt(gx, gz) {
    const n = this.noise.fbm2(gx * FREQ, gz * FREQ, OCTAVES); // ~[-1,1]
    let h = Math.floor(this.baseHeight + this.amplitude * n);
    if (h < 1) h = 1;
    if (h > CHUNK_HEIGHT - 1) h = CHUNK_HEIGHT - 1;
    return h;
  }

  // Surface block for this palette.
  _surfaceBlock(height) {
    switch (this.palette) {
      case "desert": return BLOCK.SAND;
      case "ice":    return BLOCK.ICE;
      case "rock":   return BLOCK.STONE;
      case "forest":
      case "terran":
      default:       return BLOCK.GRASS;
    }
  }

  // Deterministic hash of a global column -> [0,1). Stable across runs.
  _hash01(gx, gz) {
    let h = (Math.imul(gx | 0, 374761393) ^ Math.imul(gz | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // 3D deterministic hash (gx,gy,gz) -> [0,1). Used for ore veins underground.
  _hash3(gx, gy, gz) {
    let h = (Math.imul(gx | 0, 374761393) ^ Math.imul(gy | 0, 1013904223) ^ Math.imul(gz | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Underground ore: deeper = rarer/more valuable. Returns an ore block id or
  // BLOCK.STONE. Driven by 3D hash so veins are stable from the seed.
  _oreAt(gx, gy, gz, height) {
    const depth = height - gy; // how far below the surface
    if (depth < 3) return BLOCK.STONE;
    const r = this._hash3(gx, gy, gz);
    // Gold: only deep & rare. Iron: medium. Coal: common & shallower.
    if (gy < 10 && r < 0.012) return BLOCK.GOLD_ORE;
    if (gy < 22 && r < 0.028) return BLOCK.IRON_ORE;
    if (r < 0.045) return BLOCK.COAL_ORE;
    return BLOCK.STONE;
  }

  _treesEnabled() {
    return (this.palette === "terran" || this.palette === "forest") && this.treeDensity > 0;
  }

  fillChunk(chunk) {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;
    const water = this.waterLevel;
    const surfaceBlock = this._surfaceBlock();
    const treesOn = this._treesEnabled();

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const gx = baseX + x;
        const gz = baseZ + z;
        const height = this.heightAt(gx, gz);

        // Surface variation: occasional gravel / cobblestone patches and snow
        // caps on tall (or icy) terrain. Deterministic from the column hash.
        const ph = this._hash01(gx, gz);
        const patch = this._hash01(gx + 7919, gz - 104729); // independent stream
        const snowy = (this.palette === "ice") || height >= this.baseHeight + this.amplitude * 0.55;

        // Column: stone (with ore veins), dirt under surface, then surface block.
        const dirtDepth = 3;
        for (let y = 0; y <= height; y++) {
          let id;
          if (y === height) {
            // Underwater surfaces become sand; snow caps on high/icy terrain;
            // gravel patches; otherwise the palette surface block.
            if (y < water && (this.palette === "terran" || this.palette === "forest")) {
              id = BLOCK.SAND;
            } else if (y >= water && snowy && ph > 0.15) {
              id = BLOCK.SNOW;
            } else if (y >= water && patch < 0.05 && this.palette !== "desert") {
              id = BLOCK.GRAVEL;
            } else {
              id = surfaceBlock;
            }
          } else if (y >= height - dirtDepth) {
            id = (this.palette === "desert") ? BLOCK.SAND : BLOCK.DIRT;
            // Cobblestone blotches just under the surface on rocky worlds.
            if (this.palette === "rock" && patch < 0.18) id = BLOCK.COBBLESTONE;
          } else {
            id = this._oreAt(gx, y, gz, height);
          }
          chunk.setLocal(x, y, z, id);
        }

        // Cactus: sometimes on dry desert sand above water, inset from edges.
        if (this.palette === "desert" && height >= water &&
            x >= 1 && x <= CHUNK_SIZE - 2 && z >= 1 && z <= CHUNK_SIZE - 2) {
          if (this._hash01(gx * 13 + 5, gz * 29 + 11) < 0.012) {
            const cactusH = 2 + Math.floor(this._hash01(gx, gz) * 3); // 2..4
            for (let i = 1; i <= cactusH && height + i < CHUNK_HEIGHT; i++) {
              if (chunk.getLocal(x, height + i, z) === BLOCK.AIR) {
                chunk.setLocal(x, height + i, z, BLOCK.CACTUS);
              }
            }
          }
        }

        // Water fill: if terrain is below the water level, fill the gap.
        if (height < water) {
          for (let y = height + 1; y <= water && y < CHUNK_HEIGHT; y++) {
            chunk.setLocal(x, y, z, BLOCK.WATER);
          }
        }

        // Trees: only on dry land surfaces above water, away from chunk edges
        // so the leaf blob stays inside this chunk (keeps it simple/deterministic).
        if (treesOn && height >= water && x >= 2 && x <= CHUNK_SIZE - 3 && z >= 2 && z <= CHUNK_SIZE - 3) {
          if (this._hash01(gx, gz) < this.treeDensity) {
            this._placeTree(chunk, x, height + 1, z);
          }
        }
      }
    }
  }

  // Simple tree: 4-5 tall trunk + a leaf blob on top.
  _placeTree(chunk, x, baseY, z) {
    const r = this._hash01(x * 31 + 7, z * 17 + 3);
    const trunkH = 4 + (r < 0.5 ? 0 : 1); // 4 or 5
    const topY = baseY + trunkH - 1;
    if (topY + 2 >= CHUNK_HEIGHT) return;

    for (let i = 0; i < trunkH; i++) {
      chunk.setLocal(x, baseY + i, z, BLOCK.WOOD);
    }

    // Leaf blob: a 3x3x3-ish cluster around the top, plus a cap.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const dist = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
          if (dist > 3) continue;
          const lx = x + dx, ly = topY + dy, lz = z + dz;
          if (ly < 0 || ly >= CHUNK_HEIGHT) continue;
          if (chunk.getLocal(lx, ly, lz) === BLOCK.AIR) {
            chunk.setLocal(lx, ly, lz, BLOCK.LEAVES);
          }
        }
      }
    }
    // Cap leaf.
    if (topY + 1 < CHUNK_HEIGHT && chunk.getLocal(x, topY + 1, z) === BLOCK.AIR) {
      chunk.setLocal(x, topY + 1, z, BLOCK.LEAVES);
    }
  }
}
