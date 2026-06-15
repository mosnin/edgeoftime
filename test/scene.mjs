// Headless test for scene-graph modules using mock services.
// Renderer/HUD/Audio DOM are stubbed; we exercise construction + update logic.
import * as THREE from "three";
import Robot from "../src/player/Robot.js";
import Effects from "../src/core/Effects.js";
import SpaceMap from "../src/maps/SpaceMap.js";
import PlanetMap from "../src/maps/PlanetMap.js";
import { PLANETS } from "../src/maps/SolarSystem.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const near1 = (v) => Math.abs(v.length() - 1) < 1e-6;

// --- Robot ---
const robot = new Robot();
ok(robot.model && robot.model.isObject3D, "robot.model is an Object3D");
ok(robot.position.isVector3 && robot.velocity.isVector3, "robot has position/velocity");
ok(near1(robot.forward()) && near1(robot.forwardFlat()) && near1(robot.right()),
  "robot direction vectors are unit length");
const y0 = robot.yaw; robot.applyLook(100, 0); ok(robot.yaw !== y0, "applyLook changes yaw");
robot.pitch = 5; robot.applyLook(0, 0); ok(Math.abs(robot.pitch) <= 1.6, "pitch clamped");
robot.setJet(true); robot.setJet(false); robot.syncModel();
const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);
robot.updateCamera(cam, { thirdPerson: true }); ok(cam.position.isVector3, "updateCamera runs");

// --- Effects (no scene / no audio) must never throw ---
const fx = new Effects();
fx.jet(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), true);
fx.blockBurst(new THREE.Vector3(1, 2, 3), [1, 0, 0]);
fx.thruster(true); fx.thruster(false);
fx.update(0.016, cam);
const fxScene = new THREE.Scene(); fx.attach(fxScene);
ok(fxScene.children.length > 0, "effects.attach adds particle system to scene");
ok(true, "effects methods crash-safe");

// --- Mock shared services ---
function mockGame() {
  const noop = () => {};
  const input = {
    _d: false,
    consume: () => ({ dx: 0, dy: 0, wheel: 0, left: false, right: false }),
    down: () => false, pressed: () => false,
  };
  const hud = { setMap: noop, setMode: noop, setHint: noop, setCoords: noop,
                buildHotbar: noop, setActiveSlot: noop };
  return {
    camera: cam, input, hud, effects: fx, robot,
    switchMap: (name) => { lastSwitch = name; },
  };
}
let lastSwitch = null;

// --- SpaceMap ---
const space = new SpaceMap(mockGame());
space.onEnter({});
ok(space.scene.children.length > 0, "SpaceMap builds scene contents");
ok(space.scene.children.includes(robot.model), "SpaceMap adds robot model");
for (let i = 0; i < 30; i++) space.update(0.016);
ok(true, "SpaceMap.update runs without throwing");
space.onExit();
ok(!space.scene.children.includes(robot.model), "SpaceMap.onExit detaches robot");

// --- PlanetMap ---
const planet = new PlanetMap(mockGame());
planet.onEnter({ planet: PLANETS[0] });
ok(planet.world && planet.world.group, "PlanetMap created a World");
ok(planet.scene.children.includes(robot.model), "PlanetMap adds robot model");
for (let i = 0; i < 30; i++) planet.update(0.016);
ok(Number.isFinite(robot.position.y), "PlanetMap keeps robot position finite");
planet.onExit();
ok(!planet.scene.children.includes(robot.model), "PlanetMap.onExit detaches robot");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
