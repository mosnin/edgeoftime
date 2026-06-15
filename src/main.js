// Edge of Time — engine & game loop (Team 1).
// Creates the renderer/camera/clock and shared services, wires the HUD/pointer-lock
// start flow, drives the RAF loop, and shows a visible error overlay on failure.

import * as THREE from "three";
import { Input } from "./core/Input.js";
import HUD from "./core/HUD.js";
import MapManager from "./core/MapManager.js";
import Effects from "./core/Effects.js";
import Robot from "./player/Robot.js";
import SpaceMap from "./maps/SpaceMap.js";
import PlanetMap from "./maps/PlanetMap.js";

function showError(err) {
  // Make failures visible instead of silently dying in the console.
  // eslint-disable-next-line no-console
  console.error("[Edge of Time] startup error:", err);
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;" +
    "justify-content:center;padding:24px;background:rgba(10,0,0,0.92);" +
    "color:#ff8888;font:14px/1.5 monospace;white-space:pre-wrap;text-align:left;";
  const msg = (err && (err.stack || err.message)) || String(err);
  box.textContent = "Edge of Time failed to start:\n\n" + msg;
  document.body.appendChild(box);
}

try {
  const canvas = document.getElementById("game");
  if (!canvas) throw new Error("Missing <canvas id=\"game\"> in index.html");

  // --- Renderer -------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a, 1);

  // --- Camera ---------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    4000
  );

  // --- Timing ---------------------------------------------------------------
  const clock = new THREE.Clock();

  // --- Shared services ------------------------------------------------------
  const input = new Input(canvas);
  const hud = new HUD();
  const effects = new Effects();
  const robot = new Robot();

  let mapManager = null;

  const game = {
    renderer,
    camera,
    input,
    hud,
    effects,
    robot,
    switchMap(name, payload) {
      return mapManager.switchMap(name, payload);
    },
  };

  // MapManager owns map construction; main.js constructs the instances and hands
  // them over per CONTRACTS.md.
  const maps = {
    space: new SpaceMap(game),
    planet: new PlanetMap(game),
  };
  mapManager = new MapManager(game, maps);

  // --- Start / pause flow ---------------------------------------------------
  let started = false;

  hud.onPlay(() => input.requestLock());

  let wasLocked = false;
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    if (locked && !wasLocked) {
      // First (or any) lock acquisition: start the game once, show the HUD.
      if (!started) {
        started = true;
        mapManager.switchMap("space", {});
      }
      hud.showGame();
    } else if (!locked && wasLocked) {
      // Lost pointer lock -> pause overlay.
      hud.showOverlay();
    }
    wasLocked = locked;
  });

  // --- Resize ---------------------------------------------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Loop -----------------------------------------------------------------
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (started) mapManager.update(dt);
    effects.update(dt, camera);

    const current = mapManager.current;
    if (current && current.scene) {
      renderer.render(current.scene, camera);
    }
  }
  requestAnimationFrame(frame);
} catch (err) {
  showError(err);
}
