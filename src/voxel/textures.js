// textures.js — procedural Minecraft-style texture atlas for Edge of Time.
//
// We build a grid of TILE x TILE pixel tiles on an HTMLCanvas, one per block
// face type (drawn procedurally: noise speckle, planks, ore flecks, ...). The
// atlas is returned as a THREE.Texture using NearestFilter for a crisp,
// pixelated look. The texture carries the block HUE + detail; the per-face
// directional shading stays in the mesh's vertex colors (grayscale only) and
// multiplies with the texture in MeshStandardMaterial.
//
// HEADLESS-SAFE: in Node (no `document`), buildAtlas() returns null and the
// World falls back to plain vertex-color grayscale shading. Tests still pass.

import * as THREE from "three";
import { BLOCK } from "./blocks.js";

export const TILE = 16;       // pixels per tile edge
export const ATLAS_COLS = 8;  // tiles per row in the atlas
export const ATLAS_ROWS = 4;  // rows of tiles

// ---- Tile index registry --------------------------------------------------
// Each named tile maps to an index in the atlas grid (row-major).
export const TILES = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  METAL: 9,
  GLOW: 10,
  ICE: 11,
  COBBLESTONE: 12,
  PLANKS: 13,
  SNOW: 14,
  GRAVEL: 15,
  BRICK: 16,
  GLASS: 17,
  COAL_ORE: 18,
  IRON_ORE: 19,
  GOLD_ORE: 20,
  CACTUS_SIDE: 21,
  CACTUS_TOP: 22,
};

// Per-block face -> tile mapping. top / side / bottom (side used for ±X,±Z).
// Chunk.js looks this up by block id + face direction.
export const BLOCK_TILES = {
  [BLOCK.GRASS]:  { top: TILES.GRASS_TOP, side: TILES.GRASS_SIDE, bottom: TILES.DIRT },
  [BLOCK.DIRT]:   { top: TILES.DIRT, side: TILES.DIRT, bottom: TILES.DIRT },
  [BLOCK.STONE]:  { top: TILES.STONE, side: TILES.STONE, bottom: TILES.STONE },
  [BLOCK.SAND]:   { top: TILES.SAND, side: TILES.SAND, bottom: TILES.SAND },
  [BLOCK.WATER]:  { top: TILES.WATER, side: TILES.WATER, bottom: TILES.WATER },
  [BLOCK.WOOD]:   { top: TILES.LOG_TOP, side: TILES.LOG_SIDE, bottom: TILES.LOG_TOP },
  [BLOCK.LEAVES]: { top: TILES.LEAVES, side: TILES.LEAVES, bottom: TILES.LEAVES },
  [BLOCK.METAL]:  { top: TILES.METAL, side: TILES.METAL, bottom: TILES.METAL },
  [BLOCK.GLOW]:   { top: TILES.GLOW, side: TILES.GLOW, bottom: TILES.GLOW },
  [BLOCK.ICE]:    { top: TILES.ICE, side: TILES.ICE, bottom: TILES.ICE },
  [BLOCK.COBBLESTONE]: { top: TILES.COBBLESTONE, side: TILES.COBBLESTONE, bottom: TILES.COBBLESTONE },
  [BLOCK.PLANKS]: { top: TILES.PLANKS, side: TILES.PLANKS, bottom: TILES.PLANKS },
  [BLOCK.SNOW]:   { top: TILES.SNOW, side: TILES.SNOW, bottom: TILES.SNOW },
  [BLOCK.GRAVEL]: { top: TILES.GRAVEL, side: TILES.GRAVEL, bottom: TILES.GRAVEL },
  [BLOCK.LOG]:    { top: TILES.LOG_TOP, side: TILES.LOG_SIDE, bottom: TILES.LOG_TOP },
  [BLOCK.BRICK]:  { top: TILES.BRICK, side: TILES.BRICK, bottom: TILES.BRICK },
  [BLOCK.GLASS]:  { top: TILES.GLASS, side: TILES.GLASS, bottom: TILES.GLASS },
  [BLOCK.COAL_ORE]: { top: TILES.COAL_ORE, side: TILES.COAL_ORE, bottom: TILES.COAL_ORE },
  [BLOCK.IRON_ORE]: { top: TILES.IRON_ORE, side: TILES.IRON_ORE, bottom: TILES.IRON_ORE },
  [BLOCK.GOLD_ORE]: { top: TILES.GOLD_ORE, side: TILES.GOLD_ORE, bottom: TILES.GOLD_ORE },
  [BLOCK.CACTUS]: { top: TILES.CACTUS_TOP, side: TILES.CACTUS_SIDE, bottom: TILES.CACTUS_TOP },
};

// Default tile when a block has no mapping.
const DEFAULT_TILE = TILES.STONE;

// Get the atlas-space tile index for a block id + face name ("top"/"side"/"bottom").
export function blockTile(id, faceName) {
  const m = BLOCK_TILES[id];
  if (!m) return DEFAULT_TILE;
  return m[faceName] ?? m.side ?? DEFAULT_TILE;
}

// Atlas UV rectangle for a tile index. A tiny inset avoids bleeding from the
// neighbouring tile under NearestFilter / mipmaps.
const INSET = 0.5 / (TILE * ATLAS_COLS); // half a texel
export function tileUV(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + INSET;
  const u1 = (col + 1) / ATLAS_COLS - INSET;
  // v: row 0 at the TOP of the canvas. Three.js textures have v=0 at the
  // bottom, so flip rows.
  const v1 = 1 - row / ATLAS_ROWS - INSET;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + INSET;
  return { u0, v0, u1, v1 };
}

// ---- Procedural drawing helpers (canvas 2D) -------------------------------

// Deterministic per-pixel hash -> [0,1). Stable so the atlas looks the same.
function hash01(x, y, salt) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Fill one tile pixel-by-pixel via a callback (px,py)->[r,g,b,a] (0..255).
function paintTile(ctx, index, fn) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const ox = col * TILE, oy = row * TILE;
  const img = ctx.createImageData(TILE, TILE);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const c = fn(px, py);
      const i = (py * TILE + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  ctx.putImageData(img, ox, oy);
}

// Speckle: base color + per-pixel brightness jitter.
function speckle(base, amount, salt) {
  return (px, py) => {
    const n = (hash01(px, py, salt) - 0.5) * 2 * amount;
    return [
      clamp01(base[0] + n) * 255,
      clamp01(base[1] + n) * 255,
      clamp01(base[2] + n) * 255,
    ];
  };
}

// Mottle: two-frequency value noise for stone-like blotches.
function mottle(base, amount, salt) {
  return (px, py) => {
    const n1 = hash01(px >> 1, py >> 1, salt) - 0.5;
    const n2 = (hash01(px, py, salt + 9) - 0.5) * 0.5;
    const n = (n1 + n2) * amount;
    return [
      clamp01(base[0] + n) * 255,
      clamp01(base[1] + n) * 255,
      clamp01(base[2] + n) * 255,
    ];
  };
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---- Tile painters --------------------------------------------------------

function drawTile(ctx, index) {
  switch (index) {
    case TILES.GRASS_TOP:
      paintTile(ctx, index, speckle([0.34, 0.62, 0.26], 0.10, 1));
      break;
    case TILES.GRASS_SIDE:
      // Dirt with a green grassy lip along the top few rows + hanging blades.
      paintTile(ctx, index, (px, py) => {
        const dirt = [0.45, 0.32, 0.21];
        const grass = [0.34, 0.62, 0.26];
        let base = dirt;
        const lip = 3 + Math.floor(hash01(px, 0, 7) * 2);
        if (py < lip) base = grass;
        else if (py === lip && hash01(px, 1, 8) < 0.5) base = grass; // blades
        const n = (hash01(px, py, 2) - 0.5) * 0.16;
        return [clamp01(base[0] + n) * 255, clamp01(base[1] + n) * 255, clamp01(base[2] + n) * 255];
      });
      break;
    case TILES.DIRT:
      paintTile(ctx, index, speckle([0.45, 0.32, 0.21], 0.14, 3));
      break;
    case TILES.STONE:
      paintTile(ctx, index, mottle([0.50, 0.50, 0.54], 0.22, 4));
      break;
    case TILES.SAND:
      paintTile(ctx, index, speckle([0.84, 0.77, 0.52], 0.08, 5));
      break;
    case TILES.WATER:
      paintTile(ctx, index, (px, py) => {
        const base = [0.18, 0.40, 0.72];
        const w = Math.sin((px + py) * 0.9) * 0.05 + (hash01(px, py, 6) - 0.5) * 0.05;
        return [clamp01(base[0] + w) * 255, clamp01(base[1] + w) * 255, clamp01(base[2] + w) * 255, 200];
      });
      break;
    case TILES.LOG_SIDE:
      // Vertical bark grooves.
      paintTile(ctx, index, (px, py) => {
        const base = [0.42, 0.29, 0.16];
        const groove = Math.sin(px * 1.3) * 0.10;
        const n = (hash01(px, py, 10) - 0.5) * 0.10;
        return [clamp01(base[0] + groove + n) * 255, clamp01(base[1] + groove + n) * 255, clamp01(base[2] + groove + n) * 255];
      });
      break;
    case TILES.LOG_TOP:
      // Concentric rings.
      paintTile(ctx, index, (px, py) => {
        const cx = 7.5, cy = 7.5;
        const r = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        const ring = Math.sin(r * 1.6) * 0.10;
        const base = [0.55, 0.40, 0.24];
        const n = (hash01(px, py, 11) - 0.5) * 0.06;
        return [clamp01(base[0] + ring + n) * 255, clamp01(base[1] + ring + n) * 255, clamp01(base[2] + ring + n) * 255];
      });
      break;
    case TILES.LEAVES:
      paintTile(ctx, index, (px, py) => {
        const base = [0.20, 0.48, 0.20];
        const n = (hash01(px, py, 12) - 0.5) * 0.28;
        const a = hash01(px, py, 13) < 0.12 ? 130 : 255; // a few gaps
        return [clamp01(base[0] + n) * 255, clamp01(base[1] + n) * 255, clamp01(base[2] + n) * 255, a];
      });
      break;
    case TILES.METAL:
      paintTile(ctx, index, (px, py) => {
        const base = [0.62, 0.66, 0.72];
        const plate = (px % 8 === 0 || py % 8 === 0) ? -0.12 : 0;
        const n = (hash01(px, py, 14) - 0.5) * 0.05;
        return [clamp01(base[0] + plate + n) * 255, clamp01(base[1] + plate + n) * 255, clamp01(base[2] + plate + n) * 255];
      });
      break;
    case TILES.GLOW:
      paintTile(ctx, index, (px, py) => {
        const base = [0.97, 0.88, 0.40];
        const fleck = hash01(px, py, 15) < 0.18 ? 0.10 : 0;
        return [clamp01(base[0] + fleck) * 255, clamp01(base[1] + fleck) * 255, clamp01(base[2] - fleck * 2) * 255];
      });
      break;
    case TILES.ICE:
      paintTile(ctx, index, (px, py) => {
        const base = [0.66, 0.82, 0.95];
        const crack = (hash01(px >> 2, py, 16) < 0.10 || hash01(px, py >> 2, 17) < 0.10) ? -0.12 : 0;
        const n = (hash01(px, py, 18) - 0.5) * 0.06;
        return [clamp01(base[0] + crack + n) * 255, clamp01(base[1] + crack + n) * 255, clamp01(base[2] + crack + n) * 255, 210];
      });
      break;
    case TILES.COBBLESTONE:
      // Irregular cobble cells.
      paintTile(ctx, index, (px, py) => {
        const cellX = Math.floor(px / 4), cellY = Math.floor(py / 4);
        const v = hash01(cellX, cellY, 19);
        const base = lerp3([0.36, 0.36, 0.40], [0.58, 0.58, 0.62], v);
        // dark mortar lines between cells
        const mortar = (px % 4 === 0 || py % 4 === 0) ? -0.14 : 0;
        const n = (hash01(px, py, 20) - 0.5) * 0.08;
        return [clamp01(base[0] + mortar + n) * 255, clamp01(base[1] + mortar + n) * 255, clamp01(base[2] + mortar + n) * 255];
      });
      break;
    case TILES.PLANKS:
      // Horizontal planks with darker seam lines.
      paintTile(ctx, index, (px, py) => {
        const base = [0.62, 0.46, 0.26];
        const plankH = 4;
        const seam = (py % plankH === 0) ? -0.16 : 0;
        const grain = Math.sin(px * 0.8 + Math.floor(py / plankH) * 3) * 0.04;
        const n = (hash01(px, py, 21) - 0.5) * 0.05;
        return [clamp01(base[0] + seam + grain + n) * 255, clamp01(base[1] + seam + grain + n) * 255, clamp01(base[2] + seam + grain + n) * 255];
      });
      break;
    case TILES.SNOW:
      paintTile(ctx, index, speckle([0.93, 0.95, 0.98], 0.05, 22));
      break;
    case TILES.GRAVEL:
      paintTile(ctx, index, (px, py) => {
        const cellX = Math.floor(px / 3), cellY = Math.floor(py / 3);
        const v = hash01(cellX, cellY, 23);
        const base = lerp3([0.40, 0.38, 0.36], [0.62, 0.60, 0.58], v);
        const n = (hash01(px, py, 24) - 0.5) * 0.12;
        return [clamp01(base[0] + n) * 255, clamp01(base[1] + n) * 255, clamp01(base[2] + n) * 255];
      });
      break;
    case TILES.BRICK:
      // Brick rows with offset courses + mortar.
      paintTile(ctx, index, (px, py) => {
        const brickH = 4, brickW = 8;
        const row = Math.floor(py / brickH);
        const offset = (row % 2) * (brickW / 2);
        const inRowX = (px + offset) % brickW;
        const mortar = (py % brickH === 0 || inRowX === 0) ? -0.22 : 0;
        const base = mortar < 0 ? [0.72, 0.72, 0.68] : [0.62, 0.26, 0.20];
        const n = (hash01(px, py, 25) - 0.5) * 0.06;
        return [clamp01(base[0] + n) * 255, clamp01(base[1] + n) * 255, clamp01(base[2] + n) * 255];
      });
      break;
    case TILES.GLASS:
      // Mostly transparent with an opaque frame + a highlight streak.
      paintTile(ctx, index, (px, py) => {
        const edge = (px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1);
        const streak = (px + py === 6 || px + py === 7);
        if (edge) return [0.78, 0.88, 0.94, 230];
        if (streak) return [0.90, 0.96, 1.0, 120];
        return [0.80, 0.90, 0.96, 40];
      });
      break;
    case TILES.COAL_ORE:
      paintTile(ctx, index, oreTile([0.50, 0.50, 0.54], [0.10, 0.10, 0.12], 26));
      break;
    case TILES.IRON_ORE:
      paintTile(ctx, index, oreTile([0.50, 0.50, 0.54], [0.78, 0.62, 0.48], 27));
      break;
    case TILES.GOLD_ORE:
      paintTile(ctx, index, oreTile([0.50, 0.50, 0.54], [0.92, 0.78, 0.26], 28));
      break;
    case TILES.CACTUS_SIDE:
      paintTile(ctx, index, (px, py) => {
        const base = [0.24, 0.50, 0.22];
        const rib = (px % 5 === 0) ? -0.10 : 0;
        const edge = (px === 0 || px === TILE - 1) ? -0.06 : 0;
        const n = (hash01(px, py, 29) - 0.5) * 0.06;
        return [clamp01(base[0] + rib + edge + n) * 255, clamp01(base[1] + rib + edge + n) * 255, clamp01(base[2] + rib + edge + n) * 255];
      });
      break;
    case TILES.CACTUS_TOP:
      paintTile(ctx, index, (px, py) => {
        const cx = 7.5, cy = 7.5;
        const r = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
        const base = r < 5 ? [0.30, 0.56, 0.26] : [0.22, 0.46, 0.20];
        const n = (hash01(px, py, 30) - 0.5) * 0.06;
        return [clamp01(base[0] + n) * 255, clamp01(base[1] + n) * 255, clamp01(base[2] + n) * 255];
      });
      break;
    default:
      paintTile(ctx, index, mottle([0.50, 0.50, 0.54], 0.2, 99));
  }
}

// Stone base with colored ore flecks.
function oreTile(stone, ore, salt) {
  return (px, py) => {
    const base = mottle(stone, 0.18, salt)(px, py);
    // ore blobs at a few cluster centers
    const isOre = hash01(px >> 1, py >> 1, salt + 100) < 0.18 && hash01(px, py, salt + 200) < 0.6;
    if (isOre) {
      const v = (hash01(px, py, salt + 300) - 0.5) * 0.12;
      return [clamp01(ore[0] + v) * 255, clamp01(ore[1] + v) * 255, clamp01(ore[2] + v) * 255];
    }
    return base;
  };
}

// ---- Atlas builder (cached) -----------------------------------------------

let _atlas = null;
let _built = false;

// Build (once) and return the THREE.Texture atlas, or null when headless.
export function buildAtlas() {
  if (_built) return _atlas;
  _built = true;

  if (typeof document === "undefined") {
    _atlas = null; // headless (Node tests) — no canvas available
    return _atlas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext("2d");

  // Clear to transparent.
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw every known tile.
  const maxTile = ATLAS_COLS * ATLAS_ROWS;
  for (const name of Object.keys(TILES)) {
    const idx = TILES[name];
    if (idx < maxTile) drawTile(ctx, idx);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  _atlas = tex;
  return _atlas;
}
