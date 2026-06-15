// Block type registry. Block id 0 is always "air" (empty).
// Each solid block has a base color used as a fallback/tint; real detail comes
// from the procedural texture atlas (src/voxel/textures.js). The per-face
// directional SHADE lives in the mesh vertex colors (grayscale) and multiplies
// with the texture so the world still reads as 3D.

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  METAL: 8,
  GLOW: 9,
  ICE: 10,
  // --- new block types ---
  COBBLESTONE: 11,
  PLANKS: 12,
  SNOW: 13,
  GRAVEL: 14,
  LOG: 15,      // distinct top (rings) vs side (bark)
  BRICK: 16,
  GLASS: 17,    // transparent
  COAL_ORE: 18,
  IRON_ORE: 19,
  GOLD_ORE: 20,
  CACTUS: 21,
};

// color: [r,g,b] 0..1 (fallback/tint) ; top: optional distinct top color ;
// solid: participates in collision/meshing ;
// transparent: don't cull neighbouring faces (glass/water/leaves/ice) ;
// emissive: lights itself (used for the glow block).
export const BLOCKS = {
  [BLOCK.GRASS]:  { name: "Grass",  color: [0.36, 0.62, 0.28], top: [0.42, 0.72, 0.32] },
  [BLOCK.DIRT]:   { name: "Dirt",   color: [0.45, 0.32, 0.21] },
  [BLOCK.STONE]:  { name: "Stone",  color: [0.50, 0.50, 0.54] },
  [BLOCK.SAND]:   { name: "Sand",   color: [0.84, 0.77, 0.52] },
  [BLOCK.WATER]:  { name: "Water",  color: [0.20, 0.40, 0.75], transparent: true },
  [BLOCK.WOOD]:   { name: "Wood",   color: [0.45, 0.30, 0.16], top: [0.55, 0.40, 0.24] },
  [BLOCK.LEAVES]: { name: "Leaves", color: [0.22, 0.50, 0.22], transparent: true },
  [BLOCK.METAL]:  { name: "Metal",  color: [0.62, 0.66, 0.72] },
  [BLOCK.GLOW]:   { name: "Glow",   color: [0.95, 0.85, 0.35], emissive: true },
  [BLOCK.ICE]:    { name: "Ice",    color: [0.66, 0.82, 0.95], transparent: true },

  [BLOCK.COBBLESTONE]: { name: "Cobblestone", color: [0.47, 0.47, 0.50] },
  [BLOCK.PLANKS]:      { name: "Planks",      color: [0.62, 0.46, 0.26] },
  [BLOCK.SNOW]:        { name: "Snow",        color: [0.93, 0.95, 0.98] },
  [BLOCK.GRAVEL]:      { name: "Gravel",      color: [0.50, 0.48, 0.46] },
  [BLOCK.LOG]:         { name: "Log",         color: [0.42, 0.29, 0.16], top: [0.55, 0.40, 0.24] },
  [BLOCK.BRICK]:       { name: "Brick",       color: [0.62, 0.26, 0.20] },
  [BLOCK.GLASS]:       { name: "Glass",       color: [0.80, 0.90, 0.96], transparent: true },
  [BLOCK.COAL_ORE]:    { name: "Coal Ore",    color: [0.40, 0.40, 0.42] },
  [BLOCK.IRON_ORE]:    { name: "Iron Ore",    color: [0.58, 0.52, 0.48] },
  [BLOCK.GOLD_ORE]:    { name: "Gold Ore",    color: [0.68, 0.62, 0.36] },
  [BLOCK.CACTUS]:      { name: "Cactus",      color: [0.24, 0.50, 0.22] },
};

export function isSolid(id) { return id !== BLOCK.AIR; }
export function isTransparent(id) {
  return id === BLOCK.AIR || (BLOCKS[id] && BLOCKS[id].transparent);
}

// Hotbar order — the blocks the player can place.
export const HOTBAR = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLESTONE,
  BLOCK.PLANKS, BLOCK.LOG, BLOCK.BRICK, BLOCK.SAND,
  BLOCK.GLASS, BLOCK.SNOW, BLOCK.GLOW, BLOCK.METAL,
];
