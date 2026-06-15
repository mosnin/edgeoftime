// Building — break/break/place system (Team 8).
// Camera-based raycast so break/place target the crosshair (works in 3rd person).

import * as THREE from "three";
import { BLOCK, BLOCKS, HOTBAR } from "../voxel/blocks.js";

export default class Building {
  constructor(game, world) {
    this.game = game;
    this.world = world;

    this.hotbar = HOTBAR;
    this.selectedIndex = 0;
    this.selected = this.hotbar[0];

    // Wireframe highlight box for the targeted voxel.
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.001, 1.001, 1.001));
    const mat = new THREE.LineBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.6,
    });
    this.highlight = new THREE.LineSegments(geo, mat);
    this.highlight.visible = false;

    // Scratch vectors to avoid per-frame allocations.
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();

    // Build HUD hotbar.
    try {
      game.hud.buildHotbar(this.hotbar);
      game.hud.setActiveSlot(0);
    } catch (e) { /* HUD may not be ready */ }
  }

  selectIndex(i) {
    const len = this.hotbar.length;
    // Clamp/wrap into [0, len-1].
    let idx = ((i % len) + len) % len;
    this.selectedIndex = idx;
    this.selected = this.hotbar[idx];
    try { this.game.hud.setActiveSlot(idx); } catch (e) { /* noop */ }
  }

  scrollBy(delta) {
    const len = this.hotbar.length;
    this.selectIndex((this.selectedIndex + delta + len) % len);
  }

  update(input, world) {
    const game = this.game;

    // --- Hotbar selection ---
    if (input.wheel !== 0) this.scrollBy(input.wheel);

    // Number keys 1..9 -> direct slot selection.
    if (game.input && typeof game.input.pressed === "function") {
      for (let n = 1; n <= 9 && n <= this.hotbar.length; n++) {
        if (game.input.pressed("Digit" + n)) {
          this.selectIndex(n - 1);
        }
      }
    }

    // --- Camera raycast (crosshair) ---
    const origin = this._origin.copy(game.camera.position);
    const dir = this._dir;
    game.camera.getWorldDirection(dir);

    const hit = world.raycast(origin, dir, 8);

    if (hit) {
      this.highlight.position.set(
        hit.block.x + 0.5,
        hit.block.y + 0.5,
        hit.block.z + 0.5,
      );
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }

    // --- Break (left click) ---
    if (input.left && hit) {
      const b = hit.block;
      const oldId = world.getBlock(b.x, b.y, b.z);
      world.setBlock(b.x, b.y, b.z, BLOCK.AIR);
      try {
        if (game.effects && typeof game.effects.blockBurst === "function") {
          const center = new THREE.Vector3(b.x + 0.5, b.y + 0.5, b.z + 0.5);
          const info = BLOCKS[oldId];
          const color = info && info.color ? info.color : [1, 1, 1];
          game.effects.blockBurst(center, color);
        }
      } catch (e) { /* effects optional */ }
    }

    // --- Place (right click) ---
    if (input.right && hit && hit.place) {
      const p = hit.place;
      // Only place into air.
      if (world.getBlock(p.x, p.y, p.z) === BLOCK.AIR) {
        if (!this._intersectsPlayer(p)) {
          world.setBlock(p.x, p.y, p.z, this.selected);
        }
      }
    }
  }

  // True if the voxel [p .. p+1] overlaps the player's AABB.
  _intersectsPlayer(p) {
    const robot = this.game.robot;
    if (!robot || !robot.position || !robot.halfExtents) return false;
    const pos = robot.position;
    const he = robot.halfExtents;

    const minX = pos.x - he.x, maxX = pos.x + he.x;
    const minY = pos.y - he.y, maxY = pos.y + he.y;
    const minZ = pos.z - he.z, maxZ = pos.z + he.z;

    // Voxel occupies [p, p+1] on each axis.
    return (
      minX < p.x + 1 && maxX > p.x &&
      minY < p.y + 1 && maxY > p.y &&
      minZ < p.z + 1 && maxZ > p.z
    );
  }
}
