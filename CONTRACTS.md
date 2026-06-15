# Edge of Time — Module Contracts (single source of truth)

A browser voxel sandbox built with **Three.js** (imported as the bare specifier
`"three"` via the import map in `index.html`). No build step. ES modules only.

**Every team builds to these interfaces.** Do not change a public signature
without it being reflected here. Only edit the files your team owns.

## Global conventions
- `import * as THREE from "three";`
- Y is up. 1 world unit = 1 voxel. Voxel coords are integers.
- Block ids come from `src/voxel/blocks.js` (`BLOCK`, `BLOCKS`, helpers).
- Every `.js` file must pass `node --check`.
- Units: dt is in **seconds**.

## Shared services object `game`
Created in `main.js`, passed to every map constructor. Shape:
```js
game = {
  renderer,   // THREE.WebGLRenderer
  camera,     // THREE.PerspectiveCamera (shared; maps position it via robot)
  input,      // Input (src/core/Input.js) — already implemented
  hud,        // HUD (src/core/HUD.js)
  effects,    // Effects (src/core/Effects.js)
  robot,      // Robot (src/player/Robot.js) — shared player state + model
  switchMap(name, payload), // name: "space" | "planet". Requests a transition.
}
```

## Map lifecycle (SpaceMap, PlanetMap)
```js
class SomeMap {
  constructor(game) { this.game = game; this.scene = new THREE.Scene(); }
  onEnter(payload) {}   // add robot.model to scene, position robot, hud.setMap(...)
  onExit() {}           // dispose all GPU resources created by this map
  update(dt) {}         // read game.input; move robot; may call game.switchMap(...)
}
```
The loop calls `current.update(dt)` then `renderer.render(current.scene, game.camera)`.
`payload` from space→planet is `{ planet }` (a planet descriptor, see SolarSystem).
`payload` from planet→space is `{ planet }` so the ship returns near that planet.

## Robot (src/player/Robot.js) — Team 6
Shared player: transform state + visible model. Maps drive it.
```js
class Robot {
  model;                 // THREE.Group (the visible robot incl. jetpack)
  position;              // THREE.Vector3 — CENTER of the robot body
  velocity;              // THREE.Vector3 (world units / s)
  yaw; pitch;            // radians (yaw around Y, pitch around X, clamped ±~1.5)
  halfExtents;           // THREE.Vector3 collision half-size, ~ (0.4, 0.9, 0.4)
  applyLook(dx, dy);     // mouse delta -> updates yaw/pitch
  forward();             // THREE.Vector3 unit, from yaw+pitch (for free flight)
  forwardFlat();         // THREE.Vector3 unit, yaw only (horizontal walk dir)
  right();               // THREE.Vector3 unit (yaw)
  syncModel();           // copy position/yaw/pitch into model
  updateCamera(camera, opts); // place camera (third-person follow). opts.thirdPerson bool
  setJet(active);        // toggle jetpack visual flame
}
```

## Physics (src/player/Physics.js) — Team 7
Voxel AABB collision. Pure functions; no Three scene access beyond Vector3.
```js
// Moves an axis-aligned box through the voxel world, resolving collisions.
// world: provides world.getBlock(x,y,z) (0 == air/passable via blocks.isSolid).
// Returns { onGround:boolean } and mutates position/velocity in place.
Physics.moveAndCollide(world, position, velocity, halfExtents, dt) -> { onGround }
```

## World (src/voxel/World.js + TerrainGenerator.js) — Team 5
```js
class World {
  constructor(planet);   // planet descriptor (has .seed, .params)
  group;                 // THREE.Group of chunk meshes — map adds to its scene
  getBlock(x, y, z);     // global voxel coords -> block id (0 outside/air)
  setBlock(x, y, z, id); // edit; marks affected chunk(s) dirty
  update(centerPos);     // load/unload/remesh chunks around centerPos (THREE.Vector3)
  heightAt(x, z);        // integer surface height (for spawn placement)
  // DDA voxel raycast. Returns null or:
  //   { block:{x,y,z}, place:{x,y,z}, normal:THREE.Vector3, distance }
  raycast(origin, dir, maxDist);
  dispose();             // free all geometries/materials
}
// TerrainGenerator: constructor(planet); fillChunk(chunk) writes voxels via setLocal.
```
Material for chunks: `MeshStandardMaterial` with `vertexColors: true`. Chunk
geometry is produced by `Chunk.build(sampleWorldFn)` (already implemented).

## Building (src/player/Building.js) — Team 8
```js
class Building {
  constructor(game, world);
  highlight;             // THREE.LineSegments (box) — map adds to scene
  selected;              // current block id
  selectIndex(i); scrollBy(delta);
  // Call each frame on the planet. Handles break (left), place (right),
  // updates the highlight box & hud hotbar. `input` is the consumed input frame.
  update(input, world);
}
```

## SolarSystem (src/maps/SolarSystem.js) — Team 3 owns
Data + builders for the space scene.
```js
// Planet descriptor:
// { name, seed, color:[r,g,b], radius, orbitRadius, orbitSpeed, angle,
//   params:{ amplitude, baseHeight, waterLevel, treeDensity, palette } }
export const PLANETS = [ ... ];        // 4-6 planets
export function buildStarfield();      // returns THREE.Points
export function buildSun();            // returns THREE.Mesh (emissive) + light
```

## HUD (src/core/HUD.js) — Team 9
Wraps the DOM in index.html (#overlay, #play, #hud-*, #hotbar, #hint, #crosshair).
```js
class HUD {
  onPlay(cb);            // play button / pointer-lock start
  showGame();            // hide overlay; show crosshair/hud/hotbar
  showOverlay();         // on pointer-lock loss (pause)
  setMap(name); setCoords(x,y,z); setMode(text); setHint(textOrNull);
  buildHotbar(blockIds); setActiveSlot(i);
}
```

## Effects (src/core/Effects.js) — Team 10
```js
class Effects {
  attach(scene);                 // (re)parent particle pools to active scene
  jet(position, dir, active);    // jetpack exhaust at position
  blockBurst(position, color);   // break particles
  thruster(active);              // WebAudio thruster loop on/off
  update(dt, camera);
}
```

## Engine / main (src/main.js) — Team 1 ; MapManager (src/core/MapManager.js) — Team 2
- Team 1: create renderer/camera/clock/input/hud/effects/robot, assemble `game`,
  RAF loop (compute dt, call MapManager.update, render), window resize, error overlay.
- Team 2: `MapManager` holds map instances, `switchMap(name,payload)` runs onExit→onEnter
  with a short fade (CSS or renderer clear), exposes `current` and `update(dt)`.

## File ownership (DO NOT touch files outside your list)
- Foundation (DONE, do not edit): index.html, style.css, src/util/noise.js,
  src/voxel/blocks.js, src/core/Input.js, src/voxel/Chunk.js
- Team 1: src/main.js
- Team 2: src/core/MapManager.js
- Team 3: src/maps/SpaceMap.js, src/maps/SolarSystem.js
- Team 4: src/maps/PlanetMap.js
- Team 5: src/voxel/World.js, src/voxel/TerrainGenerator.js
- Team 6: src/player/Robot.js
- Team 7: src/player/Physics.js
- Team 8: src/player/Building.js
- Team 9: src/core/HUD.js
- Team 10: src/core/Effects.js
