// SolarSystem — data + builders for the space scene. (Team 3)
// Planet descriptors, starfield, and the central sun.

import * as THREE from "three";

// Planet descriptor shape (see CONTRACTS.md):
// { name, seed, color:[r,g,b], radius, orbitRadius, orbitSpeed, angle,
//   params:{ amplitude, baseHeight, waterLevel, treeDensity, palette } }
export const PLANETS = [
  {
    name: "Verdance",
    seed: 10427,
    color: [0.30, 0.62, 0.34],
    radius: 22,
    orbitRadius: 160,
    orbitSpeed: 0.16,
    angle: 0.0,
    params: {
      amplitude: 18,
      baseHeight: 30,
      waterLevel: 28,
      treeDensity: 0.55,
      palette: "terran",
    },
  },
  {
    name: "Dunaris",
    seed: 88231,
    color: [0.84, 0.66, 0.36],
    radius: 18,
    orbitRadius: 280,
    orbitSpeed: 0.12,
    angle: 1.7,
    params: {
      amplitude: 26,
      baseHeight: 26,
      waterLevel: 6,
      treeDensity: 0.04,
      palette: "desert",
    },
  },
  {
    name: "Glacior",
    seed: 51199,
    color: [0.70, 0.85, 0.96],
    radius: 26,
    orbitRadius: 430,
    orbitSpeed: 0.09,
    angle: 3.4,
    params: {
      amplitude: 14,
      baseHeight: 34,
      waterLevel: 32,
      treeDensity: 0.10,
      palette: "ice",
    },
  },
  {
    name: "Ferrux",
    seed: 73604,
    color: [0.55, 0.40, 0.36],
    radius: 16,
    orbitRadius: 580,
    orbitSpeed: 0.07,
    angle: 5.0,
    params: {
      amplitude: 34,
      baseHeight: 22,
      waterLevel: 0,
      treeDensity: 0.0,
      palette: "rock",
    },
  },
  {
    name: "Aquelle",
    seed: 29845,
    color: [0.24, 0.46, 0.78],
    radius: 28,
    orbitRadius: 740,
    orbitSpeed: 0.055,
    angle: 2.3,
    params: {
      amplitude: 10,
      baseHeight: 24,
      waterLevel: 40,
      treeDensity: 0.30,
      palette: "terran",
    },
  },
  {
    name: "Cindara",
    seed: 64012,
    color: [0.74, 0.34, 0.22],
    radius: 20,
    orbitRadius: 880,
    orbitSpeed: 0.045,
    angle: 4.1,
    params: {
      amplitude: 40,
      baseHeight: 20,
      waterLevel: 0,
      treeDensity: 0.0,
      palette: "rock",
    },
  },
];

// A few thousand stars scattered on a large sphere shell around the scene.
export function buildStarfield() {
  const COUNT = 3500;
  const SHELL = 3000;
  const positions = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    // Uniform direction on a sphere, then place on the shell radius.
    const u = Math.random() * 2 - 1;            // cos(theta) in [-1,1]
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const r = SHELL * (0.92 + Math.random() * 0.16);
    positions[i * 3 + 0] = r * s * Math.cos(phi);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xf2f4ff,
    size: 2,
    sizeAttenuation: false,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "starfield";
  points.frustumCulled = false;
  return points;
}

// Central sun: a glowing emissive sphere plus a warm point light at the origin.
export function buildSun() {
  const geometry = new THREE.SphereGeometry(50, 48, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff3c0,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "sun";
  mesh.position.set(0, 0, 0);

  const light = new THREE.PointLight(0xfff0cf, 2.6, 8000, 0.0);
  light.position.set(0, 0, 0);

  // Suggested ambient level for the consuming map (kept on the return object).
  return { mesh, light, ambient: { color: 0x404858, intensity: 0.35 } };
}
