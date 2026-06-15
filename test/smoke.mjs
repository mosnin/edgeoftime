// Headless smoke test for the pure-logic modules (no WebGL/DOM needed).
// Run: node test/smoke.mjs
import * as THREE from "three";
import World from "../src/voxel/World.js";
import Physics from "../src/player/Physics.js";
import { PLANETS } from "../src/maps/SolarSystem.js";
import { BLOCK, isSolid } from "../src/voxel/blocks.js";
import { CHUNK_HEIGHT } from "../src/voxel/Chunk.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗ " + m); } };

// --- Planets exist and have required fields ---
ok(Array.isArray(PLANETS) && PLANETS.length >= 4, "PLANETS has >=4 entries");
for (const p of PLANETS) {
  ok(typeof p.seed === "number" && p.params && typeof p.radius === "number",
    `planet ${p.name} well-formed`);
}

// --- World generation around origin ---
const planet = PLANETS[0];
const world = new World(planet);
const center = new THREE.Vector3(0, 40, 0);
// Pump several update cycles so the per-frame budget fills the area in.
for (let i = 0; i < 60; i++) world.update(center);

ok(world.group.children.length > 0, "world built chunk meshes");
const h = world.heightAt(0, 0);
ok(h > 0 && h < CHUNK_HEIGHT, `heightAt(0,0)=${h} in range`);
ok(isSolid(world.getBlock(0, h - 1, 0)), "block below surface is solid");
ok(world.getBlock(0, CHUNK_HEIGHT - 1, 0) === BLOCK.AIR || !isSolid(world.getBlock(0, CHUNK_HEIGHT-1, 0)), "top of column is air");

// --- setBlock / getBlock round-trip ---
world.setBlock(2, h + 5, 2, BLOCK.METAL);
ok(world.getBlock(2, h + 5, 2) === BLOCK.METAL, "setBlock/getBlock round-trips");

// --- Raycast straight down hits the ground ---
const ray = world.raycast(new THREE.Vector3(0.5, h + 10, 0.5), new THREE.Vector3(0, -1, 0), 32);
ok(ray && ray.block && isSolid(world.getBlock(ray.block.x, ray.block.y, ray.block.z)),
  "raycast down hits a solid block");
ok(ray && ray.place && ray.place.y === ray.block.y + 1, "raycast place cell sits above hit");

// --- Physics: a body falling onto terrain lands and doesn't tunnel ---
const pos = new THREE.Vector3(0.5, h + 8, 0.5);
const vel = new THREE.Vector3(0, 0, 0);
const half = new THREE.Vector3(0.4, 0.9, 0.4);
let grounded = false;
for (let i = 0; i < 240; i++) {
  vel.y -= 22 * (1 / 60);
  const r = Physics.moveAndCollide(world, pos, vel, half, 1 / 60);
  if (r.onGround) { grounded = true; break; }
}
ok(grounded, "physics: falling body reaches the ground");
ok(pos.y > h - 1 && pos.y < h + 4, `physics: rest height ${pos.y.toFixed(2)} sane (didn't tunnel)`);

// --- Physics: fast horizontal jetpack burst doesn't tunnel through a wall ---
// Build a wall of metal at x=5 around the player's height.
for (let y = h; y < h + 4; y++) for (let z = -2; z <= 2; z++) world.setBlock(5, y, z, BLOCK.METAL);
const pos2 = new THREE.Vector3(0.5, h + 1.0, 0.5);
const vel2 = new THREE.Vector3(60, 0, 0); // very fast toward the wall
for (let i = 0; i < 30; i++) Physics.moveAndCollide(world, pos2, vel2, half, 1 / 60);
ok(pos2.x < 5, `physics: substepping stopped fast body before wall (x=${pos2.x.toFixed(2)})`);

world.dispose();
ok(world.group.children.length === 0, "world.dispose clears meshes");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
