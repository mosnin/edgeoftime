# Edge of Time

A **browser voxel sandbox** where you play a jetpack-equipped robot. Fly through a
solar system, pick a planet, land on it, and build on its Minecraft-style voxel
surface. Space and each planet are **separate maps** that load on demand and
dispose their GPU resources on exit, so rendering stays smooth.

Built with [Three.js](https://threejs.org/) — **no build step, no install** to
play. Just serve the folder and open it.

## Play

ES modules + the import map require an HTTP server (opening `index.html` directly
via `file://` will not work).

```bash
npm start          # python3 -m http.server 8000
# then open http://localhost:8000
```

Click **PLAY** to lock the mouse and begin.

### Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Look | Mouse |
| Jetpack up / ascend | `Space` |
| Descend | `Shift` |
| Boost | `Ctrl` |
| Break block | Left click |
| Place block | Right click |
| Select block | `1`–`9` / scroll wheel |
| Land on planet / take off | `F` |

Fly close to a planet in space and press **F** to land. On a planet, fly high and
press **F** to return to space.

## Architecture

The codebase is split into independent modules with fixed interfaces documented in
[`CONTRACTS.md`](./CONTRACTS.md) — the single source of truth used to build the
project in parallel.

```
index.html / style.css      Entry point, import map, HUD DOM
src/main.js                 Engine: renderer, camera, RAF loop, services wiring
src/core/MapManager.js      Map registry + faded transitions
src/core/Input.js           Keyboard / mouse-look / pointer lock
src/core/HUD.js             Overlay, hotbar, coords, hints
src/core/Effects.js         Jetpack particles + WebAudio thruster
src/maps/SolarSystem.js     Planet descriptors, sun & starfield builders
src/maps/SpaceMap.js        6DOF flight through the solar system
src/maps/PlanetMap.js       Voxel surface: gravity + jetpack + building
src/voxel/blocks.js         Block registry
src/voxel/Chunk.js          Chunk storage + face-culled meshing
src/voxel/World.js          Chunk streaming, raycast, edits
src/voxel/TerrainGenerator.js  Seeded Perlin terrain + trees per biome
src/player/Robot.js         Robot model + transform + camera rig
src/player/Physics.js       Voxel AABB collision (substepped)
src/player/Building.js      Place / break / highlight / hotbar
src/util/noise.js           Seedable Perlin / fBm noise
```

### Performance / anti-lag design

- **Chunked world** (16×64×16) with **face-culled meshing** — only block faces
  exposed to air/transparent neighbours are emitted.
- **Radius-based streaming**: chunks load within a radius of the player and unload
  (geometry disposed) beyond it.
- **Per-frame work budget**: at most ~2 chunks generated and ~4 remeshed per frame
  so movement never stalls the main thread.
- **Fog** on planets hides chunk pop-in at the load boundary.
- **Map switching** disposes the previous map's GPU resources, so space and planet
  scenes never compete for memory.

## Tests

Headless runtime tests (no browser needed) cover the world, terrain, physics,
raycasting, and scene construction:

```bash
npm install        # installs three locally for tests only
npm test
```

## Status

This is a playable **vertical slice**: flight, the solar system, landing, voxel
terrain, and build/break all work end to end. Natural next steps: multiplayer,
world persistence, inventory, more biomes/structures, and day/night.
