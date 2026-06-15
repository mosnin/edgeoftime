import * as THREE from "three";
import { BLOCK, BLOCKS, isTransparent } from "./blocks.js";

export const CHUNK_SIZE = 16;   // x / z width of a chunk
export const CHUNK_HEIGHT = 64; // fixed world height (y)

// Six cube faces: direction offset, the 4 corner positions, normal shade factor.
// Shading per direction gives free "ambient" depth without lights/textures.
const FACES = [
  { // +X
    dir: [1, 0, 0], shade: 0.78,
    corners: [[1, 1, 0], [1, 0, 0], [1, 1, 1], [1, 0, 1]],
  },
  { // -X
    dir: [-1, 0, 0], shade: 0.62,
    corners: [[0, 1, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0]],
  },
  { // +Y (top)
    dir: [0, 1, 0], shade: 1.0,
    corners: [[0, 1, 1], [0, 1, 0], [1, 1, 1], [1, 1, 0]],
  },
  { // -Y (bottom)
    dir: [0, -1, 0], shade: 0.5,
    corners: [[0, 0, 0], [0, 0, 1], [1, 0, 0], [1, 0, 1]],
  },
  { // +Z
    dir: [0, 0, 1], shade: 0.7,
    corners: [[1, 1, 1], [1, 0, 1], [0, 1, 1], [0, 0, 1]],
  },
  { // -Z
    dir: [0, 0, -1], shade: 0.7,
    corners: [[0, 1, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0]],
  },
];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; // chunk coord (x)
    this.cz = cz; // chunk coord (z)
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.mesh = null;
    this.dirty = true; // needs (re)meshing
  }

  static index(x, y, z) {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  // Local-coordinate get/set (0..SIZE-1, 0..HEIGHT-1).
  getLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    return this.data[Chunk.index(x, y, z)];
  }

  setLocal(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return;
    this.data[Chunk.index(x, y, z)] = id;
    this.dirty = true;
  }

  // Build the BufferGeometry. `sampleWorld(gx,gy,gz)` returns the block id in
  // GLOBAL voxel coords so we can cull faces that touch a neighbouring chunk.
  build(sampleWorld) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let vert = 0;

    const baseX = this.cx * CHUNK_SIZE;
    const baseZ = this.cz * CHUNK_SIZE;

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = this.data[Chunk.index(x, y, z)];
          if (id === BLOCK.AIR) continue;
          const def = BLOCKS[id];
          const gx = baseX + x, gz = baseZ + z;
          const selfTransparent = isTransparent(id);

          for (const face of FACES) {
            const nx = gx + face.dir[0];
            const ny = y + face.dir[1];
            const nz = gz + face.dir[2];
            const neighbour = sampleWorld(nx, ny, nz);

            // Cull the face if the neighbour hides it. Opaque blocks hide
            // any face; transparent blocks only hide faces of their own type
            // (so water/leaves don't draw internal walls but still show edges).
            if (neighbour !== BLOCK.AIR) {
              if (!isTransparent(neighbour)) continue;
              if (selfTransparent && neighbour === id) continue;
            }

            // Pick face colour (grass gets a green top).
            let col = def.color;
            if (face.dir[1] === 1 && def.top) col = def.top;
            const s = def.emissive ? 1.0 : face.shade;
            const r = col[0] * s, g = col[1] * s, b = col[2] * s;

            for (const c of face.corners) {
              positions.push(x + c[0], y + c[1], z + c[2]);
              normals.push(face.dir[0], face.dir[1], face.dir[2]);
              colors.push(r, g, b);
            }
            // Two triangles per quad.
            indices.push(vert, vert + 1, vert + 2, vert + 2, vert + 1, vert + 3);
            vert += 4;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }
}
