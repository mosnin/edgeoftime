// SpaceMap — the solar-system flight scene. (Team 3)
// Free 6DOF flight between orbiting planets; land on the nearest one.

import * as THREE from "three";
import {
  PLANETS, buildStarfield, buildSun, buildSunGlow,
  buildDysonSwarm, buildDysonRings, buildGalaxy, buildPlanetRing,
} from "./SolarSystem.js";

const BOOST_MULT = 3.2;
const THRUST_ACCEL = 60;     // world units / s^2 while a thrust key is held
const DAMPING = 0.85;        // per-second velocity retention factor (mild)
const LAND_MARGIN = 25;      // how close to a planet's surface to allow landing

export default class SpaceMap {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();

    this._built = false;
    this._starfield = null;
    this._sunMesh = null;
    this._sunLight = null;
    this._ambient = null;
    // [{ desc, mesh }]
    this._planets = [];
  }

  _build() {
    if (this._built) return;

    // Starfield + a faraway spiral galaxy backdrop (Type-III home).
    this._starfield = buildStarfield();
    this.scene.add(this._starfield);
    this._galaxy = buildGalaxy();
    this.scene.add(this._galaxy);

    // Sun (mesh + light) and ambient.
    const sun = buildSun();
    this._sunMesh = sun.mesh;
    this._sunLight = sun.light;
    this.scene.add(this._sunMesh);
    this.scene.add(this._sunLight);

    const amb = sun.ambient || { color: 0x404858, intensity: 0.35 };
    this._ambient = new THREE.AmbientLight(amb.color, amb.intensity);
    this.scene.add(this._ambient);

    // Kardashev-III megastructures around the star: corona glow, a Dyson swarm
    // of millions of collectors, and giant scaffolding rings.
    this._sunGlow = buildSunGlow();
    this.scene.add(this._sunGlow);
    this._dysonSwarm = buildDysonSwarm();
    this.scene.add(this._dysonSwarm);
    this._dysonRings = buildDysonRings();
    this.scene.add(this._dysonRings);

    // One mesh per planet, colored & sized by its descriptor. Larger worlds get
    // an orbital-ring megastructure to sell the engineered-galaxy look.
    this._planets = PLANETS.map((desc) => {
      const geometry = new THREE.SphereGeometry(desc.radius, 32, 24);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(desc.color[0], desc.color[1], desc.color[2]),
        roughness: 0.85,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "planet:" + desc.name;
      this._placePlanet(desc, mesh);
      this.scene.add(mesh);

      let ring = null;
      if (desc.radius >= 80) {
        ring = buildPlanetRing(desc.radius, 0x66ccff);
        mesh.add(ring); // child -> follows the planet's orbit automatically
      }
      return { desc, mesh, ring };
    });

    this._built = true;
  }

  _placePlanet(desc, mesh) {
    mesh.position.set(
      Math.cos(desc.angle) * desc.orbitRadius,
      0,
      Math.sin(desc.angle) * desc.orbitRadius,
    );
  }

  onEnter(payload) {
    this._build();

    const game = this.game;
    const robot = game.robot;

    // The solar system is vast — open up the camera's far plane so distant
    // planets and stars are visible. (PlanetMap restores a tighter range for
    // voxel depth precision.)
    game.camera.near = 1;
    game.camera.far = 120000;
    game.camera.updateProjectionMatrix();

    // Add the shared robot model to this scene.
    if (robot.model && robot.model.parent !== this.scene) {
      this.scene.add(robot.model);
    }

    // Position the robot near a planet (the one we came from, or the first one
    // by default) so you immediately see a proper-scale, orbiting world rather
    // than empty space next to the sun.
    const targetPlanet = (payload && payload.planet) || PLANETS[0];
    if (targetPlanet) {
      // Place just outside the target planet's current position.
      const entry = this._planets.find((p) => p.desc === targetPlanet)
        || this._planets.find((p) => p.desc.name === targetPlanet.name);
      const desc = entry ? entry.desc : targetPlanet;
      const pos = entry
        ? entry.mesh.position.clone()
        : new THREE.Vector3(
            Math.cos(desc.angle) * desc.orbitRadius, 0,
            Math.sin(desc.angle) * desc.orbitRadius);
      const offset = desc.radius + LAND_MARGIN + 8;
      // Sit on the sun-facing side, looking back toward the planet.
      const outward = pos.clone();
      if (outward.lengthSq() < 1e-6) outward.set(1, 0, 0);
      outward.normalize();
      robot.position.copy(pos).addScaledVector(outward, offset);
      robot.yaw = Math.atan2(-outward.x, -outward.z);
      robot.pitch = 0;
    } else {
      // Default vantage point near origin, facing the sun.
      robot.position.set(0, 30, 130);
      robot.yaw = Math.atan2(-robot.position.x, -robot.position.z);
      robot.pitch = 0;
    }

    robot.velocity.set(0, 0, 0);
    robot.syncModel();
    robot.updateCamera(game.camera, { thirdPerson: true });

    game.hud.setMap("SPACE");
    game.hud.setMode("Flight: FREE");
    game.hud.setHint(null);

    game.effects.attach(this.scene);

    this._hintTarget = null;
  }

  update(dt) {
    const game = this.game;
    const robot = game.robot;
    const input = game.input;

    // Capture one-shot landing key before consuming the frame.
    const fPressed = input.pressed("KeyF");
    const frame = input.consume();

    // Mouse look. applyLook() already applies the robot's look sensitivity, so
    // pass the raw mouse deltas (multiplying again here zeroed out the motion).
    robot.applyLook(frame.dx, frame.dy);

    // 6DOF thrust input.
    const fwd = robot.forward();
    const right = robot.right();
    const accel = new THREE.Vector3();
    let thrusting = false;

    if (input.down("KeyW")) { accel.add(fwd); thrusting = true; }
    if (input.down("KeyS")) { accel.addScaledVector(fwd, -1); thrusting = true; }
    if (input.down("KeyD")) { accel.add(right); thrusting = true; }
    if (input.down("KeyA")) { accel.addScaledVector(right, -1); thrusting = true; }
    if (input.down("Space")) { accel.y += 1; thrusting = true; }
    if (input.down("ShiftLeft") || input.down("ShiftRight")) { accel.y -= 1; thrusting = true; }

    const boost = input.down("ControlLeft") || input.down("ControlRight");
    const mult = boost ? BOOST_MULT : 1;

    if (accel.lengthSq() > 0) {
      accel.normalize().multiplyScalar(THRUST_ACCEL * mult);
      robot.velocity.addScaledVector(accel, dt);
    }

    // Mild damping so flight stays controllable (frame-rate independent).
    const damp = Math.pow(DAMPING, dt);
    robot.velocity.multiplyScalar(damp);

    // Integrate position.
    robot.position.addScaledVector(robot.velocity, dt);

    robot.syncModel();
    robot.updateCamera(game.camera, { thirdPerson: true });

    // Animate the Kardashev-III megastructures.
    this._t = (this._t || 0) + dt;
    if (this._dysonSwarm) this._dysonSwarm.rotation.y += 0.015 * dt;
    if (this._dysonRings) {
      this._dysonRings.rotation.y += 0.03 * dt;
      this._dysonRings.rotation.x += 0.008 * dt;
    }
    if (this._galaxy) this._galaxy.rotation.z += 0.004 * dt;
    if (this._sunGlow) {
      this._sunGlow.scale.setScalar(1 + Math.sin(this._t * 0.8) * 0.04);
    }

    // Advance orbits + spin planets, then find the nearest one.
    let nearest = null;
    let nearestSurfDist = Infinity;
    for (const p of this._planets) {
      p.desc.angle += p.desc.orbitSpeed * dt;
      p.mesh.position.set(
        Math.cos(p.desc.angle) * p.desc.orbitRadius,
        0,
        Math.sin(p.desc.angle) * p.desc.orbitRadius,
      );
      p.mesh.rotation.y += 0.15 * dt;

      const surfDist = p.mesh.position.distanceTo(robot.position) - p.desc.radius;
      if (surfDist < nearestSurfDist) {
        nearestSurfDist = surfDist;
        nearest = p;
      }
    }

    // Landing prompt / action.
    if (nearest && nearestSurfDist <= LAND_MARGIN) {
      game.hud.setHint("Press F to land on " + nearest.desc.name);
      if (fPressed) {
        game.switchMap("planet", { planet: nearest.desc });
        return;
      }
    } else if (this._hintTarget !== null) {
      game.hud.setHint(null);
    }
    this._hintTarget = (nearest && nearestSurfDist <= LAND_MARGIN) ? nearest : null;

    // HUD coords.
    game.hud.setCoords(
      Math.round(robot.position.x),
      Math.round(robot.position.y),
      Math.round(robot.position.z),
    );

    // Jet visuals + audio.
    robot.setJet(thrusting);
    if (game.effects.jet) {
      game.effects.jet(robot.position, fwd.clone().multiplyScalar(-1), thrusting);
    }
    if (game.effects.thruster) game.effects.thruster(thrusting);
    if (game.effects.update) game.effects.update(dt, game.camera);
  }

  onExit() {
    const game = this.game;
    // Detach (never dispose) the shared robot model.
    if (game.robot.model && game.robot.model.parent === this.scene) {
      this.scene.remove(game.robot.model);
    }
    if (game.effects.thruster) game.effects.thruster(false);
    this._dispose();
  }

  // Free GPU resources we created; null them so onEnter rebuilds.
  _dispose() {
    if (this._starfield) {
      this.scene.remove(this._starfield);
      this._starfield.geometry.dispose();
      this._starfield.material.dispose();
      this._starfield = null;
    }
    if (this._sunMesh) {
      this.scene.remove(this._sunMesh);
      this._sunMesh.geometry.dispose();
      this._sunMesh.material.dispose();
      this._sunMesh = null;
    }
    if (this._sunLight) {
      this.scene.remove(this._sunLight);
      this._sunLight = null;
    }
    if (this._ambient) {
      this.scene.remove(this._ambient);
      this._ambient = null;
    }
    // Megastructures (galaxy, sun glow, Dyson swarm + rings).
    for (const key of ["_galaxy", "_sunGlow", "_dysonSwarm", "_dysonRings"]) {
      const obj = this[key];
      if (!obj) continue;
      this.scene.remove(obj);
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this[key] = null;
    }
    for (const p of this._planets) {
      this.scene.remove(p.mesh);
      if (p.ring) {
        p.ring.geometry.dispose();
        p.ring.material.dispose();
      }
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._planets = [];
    this._built = false;
  }
}
