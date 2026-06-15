// Block type registry. Block id 0 is always "air" (empty).
// Each solid block has a base color; faces are shaded per-direction at mesh time
// so the world reads as 3D without needing texture assets.

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
};

// color: [r,g,b] 0..1 ; solid: participates in collision/meshing ;
// transparent: don't cull neighbouring faces (glass/water/leaves) ;
// emissive: lights itself (used for the glow block).
export const BLOCKS = {
  [BLOCK.GRASS]:  { name: "Grass",  color: [0.36, 0.62, 0.28], top: [0.42, 0.72, 0.32] },
  [BLOCK.DIRT]:   { name: "Dirt",   color: [0.45, 0.32, 0.21] },
  [BLOCK.STONE]:  { name: "Stone",  color: [0.50, 0.50, 0.54] },
  [BLOCK.SAND]:   { name: "Sand",   color: [0.84, 0.77, 0.52] },
  [BLOCK.WATER]:  { name: "Water",  color: [0.20, 0.40, 0.75], transparent: true },
  [BLOCK.WOOD]:   { name: "Wood",   color: [0.45, 0.30, 0.16] },
  [BLOCK.LEAVES]: { name: "Leaves", color: [0.22, 0.50, 0.22], transparent: true },
  [BLOCK.METAL]:  { name: "Metal",  color: [0.62, 0.66, 0.72] },
  [BLOCK.GLOW]:   { name: "Glow",   color: [0.95, 0.85, 0.35], emissive: true },
  [BLOCK.ICE]:    { name: "Ice",    color: [0.66, 0.82, 0.95], transparent: true },
};

export function isSolid(id) { return id !== BLOCK.AIR; }
export function isTransparent(id) {
  return id === BLOCK.AIR || (BLOCKS[id] && BLOCKS[id].transparent);
}

// Hotbar order — the blocks the player can place.
export const HOTBAR = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND,
  BLOCK.WOOD, BLOCK.LEAVES, BLOCK.METAL, BLOCK.GLOW, BLOCK.ICE,
];
