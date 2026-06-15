// PlanetMap — the voxel planet surface scene. Team 4 owns this file.
// Gravity-based flight with a jetpack; build/break via Building; fly high + F to
// return to space.

import * as THREE from "three";
import World from "../voxel/World.js";
import Building from "../player/Building.js";
import Physics from "../player/Physics.js";
import { HOTBAR } from "../voxel/blocks.js";

// Tuning constants (world units, seconds).
const GRAVITY = 22;            // downward accel
const JET_THRUST = 45;         // upward accel while holding Space
const JET_MAX_UP = 14;         // clamp upward speed
const DESCEND_THRUST = 30;     // extra downward accel while holding Shift
const WALK_SPEED = 9;          // base horizontal target speed
const BOOST_MULT = 1.9;        // Ctrl boost
const ACCEL = 12;              // horizontal velocity lerp rate
const FOG_NEAR = 24;
const FOG_FAR = 90;

// Atmosphere: climb above ATMO_FADE_START and the sky darkens toward space;
// reach ATMO_TOP and you break orbit (auto-transition to the space map).
const ATMO_FADE_START = 95;
const ATMO_TOP = 175;
const SPACE_COLOR = new THREE.Color(0x05060a);

// Pick a sky color from the planet palette / color so each planet feels distinct.
function skyColorFor(planet) {
  const params = planet && planet.params ? planet.params : {};
  const palette = params.palette;
  if (palette === "desert") return new THREE.Color(0xd9a066);
  if (palette === "ice") return new THREE.Color(0xcfe6f2);
  if (palette === "terran") return new THREE.Color(0x9ec9ff);
  if (palette === "lava") return new THREE.Color(0x4a2526);
  // Derive a light tint from the planet base color as a fallback.
  if (planet && Array.isArray(planet.color)) {
    const c = new THREE.Color(planet.color[0], planet.color[1], planet.color[2]);
    return c.lerp(new THREE.Color(0xffffff), 0.55);
  }
  return new THREE.Color(0x9ec9ff);
}

function groundColorFor(planet) {
  const params = planet && planet.params ? planet.params : {};
  const palette = params.palette;
  if (palette === "desert") return new THREE.Color(0x8a6a3a);
  if (palette === "ice") return new THREE.Color(0x8fa6b5);
  if (palette === "lava") return new THREE.Color(0x301010);
  return new THREE.Color(0x55502f);
}

export default class PlanetMap {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.world = null;
    this.building = null;
    this.planet = null;

    // Held refs so onExit can clean up.
    this.hemiLight = null;
    this.sunLight = null;
    this._skyColor = null;
  }

  onEnter(payload) {
    const game = this.game;
    this.planet = payload && payload.planet ? payload.planet : null;

    // Tight camera range on the planet for solid voxel depth precision
    // (SpaceMap opens this back up for the vast solar system).
    game.camera.near = 0.1;
    game.camera.far = 2000;
    game.camera.updateProjectionMatrix();

    // --- Sky + fog -------------------------------------------------------
    const skyColor = skyColorFor(this.planet);
    this._skyColor = skyColor;
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(skyColor.clone(), FOG_NEAR, FOG_FAR);

    // --- Lighting --------------------------------------------------------
    const groundColor = groundColorFor(this.planet);
    this.hemiLight = new THREE.HemisphereLight(skyColor.clone(), groundColor, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 1.05);
    this.sunLight.position.set(60, 100, 40);
    this.scene.add(this.sunLight);

    // Low ambient so shadowed faces aren't pure black.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);

    // --- World -----------------------------------------------------------
    this.world = new World(this.planet);
    this.scene.add(this.world.group);

    // --- Building --------------------------------------------------------
    this.building = new Building(game, this.world);
    this.scene.add(this.building.highlight);

    // --- Spawn the robot -------------------------------------------------
    const spawnX = 0;
    const spawnZ = 0;
    // Generate the spawn-area chunk DATA synchronously so collision is solid
    // before the first physics step (otherwise the robot falls through terrain
    // that hasn't streamed in yet). Then kick off meshing.
    const probe = new THREE.Vector3(spawnX, 0, spawnZ);
    this.world.prime(probe, 2);
    this.world.update(probe);
    const surfaceY = this.world.heightAt(spawnX, spawnZ);
    const spawnY = surfaceY + 4;

    const robot = game.robot;
    robot.position.set(spawnX, spawnY, spawnZ);
    robot.velocity.set(0, 0, 0);
    robot.pitch = 0;
    robot.syncModel();
    this.scene.add(robot.model);

    // --- Effects ---------------------------------------------------------
    game.effects.attach(this.scene);

    // --- HUD -------------------------------------------------------------
    const name = this.planet && this.planet.name ? this.planet.name : "Planet";
    game.hud.setMap(name.toUpperCase());
    game.hud.setMode("Jetpack");
    game.hud.buildHotbar(HOTBAR);
    game.hud.setActiveSlot(HOTBAR.indexOf(this.building.selected));
    game.hud.setHint("Fly straight up to leave the atmosphere");
  }

  update(dt) {
    const game = this.game;
    const robot = game.robot;
    const input = game.input;

    const f = input.consume();

    // Mouse look.
    robot.applyLook(f.dx, f.dy);

    // --- Horizontal target velocity (snappy control) --------------------
    const fwd = robot.forwardFlat();
    const right = robot.right();
    let ix = 0;
    let iz = 0;
    if (input.down("KeyW")) iz += 1;
    if (input.down("KeyS")) iz -= 1;
    if (input.down("KeyD")) ix += 1;
    if (input.down("KeyA")) ix -= 1;

    const boost = (input.down("ControlLeft") || input.down("ControlRight")) ? BOOST_MULT : 1;
    const speed = WALK_SPEED * boost;

    // Desired horizontal velocity in world space.
    const desiredX = (fwd.x * iz + right.x * ix);
    const desiredZ = (fwd.z * iz + right.z * ix);
    const len = Math.hypot(desiredX, desiredZ);
    let dvx = 0;
    let dvz = 0;
    if (len > 1e-4) {
      dvx = (desiredX / len) * speed;
      dvz = (desiredZ / len) * speed;
    }
    // Lerp current horizontal velocity toward desired.
    const t = Math.min(1, ACCEL * dt);
    robot.velocity.x += (dvx - robot.velocity.x) * t;
    robot.velocity.z += (dvz - robot.velocity.z) * t;

    // --- Vertical: gravity + jetpack ------------------------------------
    const spaceHeld = input.down("Space");
    robot.velocity.y -= GRAVITY * dt;
    if (spaceHeld) {
      robot.velocity.y += JET_THRUST * dt;
      if (robot.velocity.y > JET_MAX_UP) robot.velocity.y = JET_MAX_UP;
    }
    if (input.down("ShiftLeft") || input.down("ShiftRight")) {
      robot.velocity.y -= DESCEND_THRUST * dt;
    }

    // --- Collision / integration ----------------------------------------
    const res = Physics.moveAndCollide(
      this.world, robot.position, robot.velocity, robot.halfExtents, dt
    );
    if (res && res.onGround && robot.velocity.y < 0) robot.velocity.y = 0;

    // --- Jetpack visuals + audio ----------------------------------------
    robot.setJet(spaceHeld);
    const jetActive = spaceHeld;
    if (jetActive) {
      // Exhaust below the robot, pointing down.
      const exhaust = robot.position.clone();
      exhaust.y -= robot.halfExtents.y;
      game.effects.jet(exhaust, new THREE.Vector3(0, -1, 0), true);
    } else {
      game.effects.jet(robot.position, new THREE.Vector3(0, -1, 0), false);
    }
    game.effects.thruster(jetActive);

    // --- World streaming -------------------------------------------------
    this.world.update(robot.position);

    // --- Build / break ---------------------------------------------------
    this.building.update(f, this.world);
    game.hud.setActiveSlot(HOTBAR.indexOf(this.building.selected));

    // --- Camera + model --------------------------------------------------
    robot.syncModel();
    robot.updateCamera(game.camera, { thirdPerson: true });
    game.effects.update(dt, game.camera);

    // --- HUD coords ------------------------------------------------------
    game.hud.setCoords(robot.position.x, robot.position.y, robot.position.z);

    // --- Atmosphere: fly up to leave the planet -------------------------
    const y = robot.position.y;
    if (y > ATMO_FADE_START) {
      // Fade sky + fog from the planet's sky color toward space-black as you
      // ascend, and open the fog so the surface stays visible below you.
      const t = Math.min(1, (y - ATMO_FADE_START) / (ATMO_TOP - ATMO_FADE_START));
      const faded = this._skyColor.clone().lerp(SPACE_COLOR, t);
      this.scene.background = faded;
      if (this.scene.fog) {
        this.scene.fog.color.copy(faded);
        this.scene.fog.far = FOG_FAR + t * 500;
      }
      game.hud.setHint(t < 1 ? "Leaving atmosphere…" : "Breaking orbit…");

      // Broke orbit -> hand off to space (MapManager adds the black fade).
      if (y >= ATMO_TOP) {
        game.switchMap("space", { planet: this.planet });
        return;
      }
    } else {
      // Back in the lower atmosphere: restore the normal sky.
      this.scene.background = this._skyColor;
      if (this.scene.fog) {
        this.scene.fog.color.copy(this._skyColor);
        this.scene.fog.far = FOG_FAR;
      }
      game.hud.setHint("Fly straight up to leave the atmosphere");
    }
  }

  onExit() {
    const game = this.game;

    // Detach the robot model (never dispose it — it's shared).
    if (game.robot && game.robot.model) this.scene.remove(game.robot.model);

    // Dispose world GPU resources and detach.
    if (this.world) {
      if (this.world.group) this.scene.remove(this.world.group);
      this.world.dispose();
    }

    // Detach building highlight.
    if (this.building && this.building.highlight) {
      this.scene.remove(this.building.highlight);
    }

    // Lights + fog.
    if (this.hemiLight) { this.scene.remove(this.hemiLight); this.hemiLight = null; }
    if (this.sunLight) { this.scene.remove(this.sunLight); this.sunLight = null; }
    if (this.ambient) { this.scene.remove(this.ambient); this.ambient = null; }
    this.scene.fog = null;
    this._skyColor = null;

    // Null these so onEnter rebuilds cleanly on re-entry.
    this.world = null;
    this.building = null;
  }
}
