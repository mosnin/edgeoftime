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
    radius: 90,
    orbitRadius: 900,
    orbitSpeed: 0.032,
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
    radius: 70,
    orbitRadius: 1700,
    orbitSpeed: 0.022,
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
    radius: 110,
    orbitRadius: 2600,
    orbitSpeed: 0.016,
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
    radius: 65,
    orbitRadius: 3500,
    orbitSpeed: 0.012,
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
    radius: 120,
    orbitRadius: 4600,
    orbitSpeed: 0.009,
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
    radius: 80,
    orbitRadius: 5800,
    orbitSpeed: 0.007,
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
  const COUNT = 4500;
  const SHELL = 40000;
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
    size: 2.4,
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
  const geometry = new THREE.SphereGeometry(400, 64, 48);
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff3c0,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "sun";
  mesh.position.set(0, 0, 0);

  // distance 0 = no falloff, so even the outermost planet is lit.
  const light = new THREE.PointLight(0xfff0cf, 2.6, 0, 0.0);
  light.position.set(0, 0, 0);

  // Suggested ambient level for the consuming map (kept on the return object).
  return { mesh, light, ambient: { color: 0x404858, intensity: 0.35 } };
}

// Additive corona glow shell around the sun (a few translucent back-side
// spheres) — gives the star a soft, bright halo instead of a flat disc.
export function buildSunGlow() {
  const group = new THREE.Group();
  group.name = "sun-glow";
  const layers = [
    { r: 520, color: 0xffdf8a, opacity: 0.35 },
    { r: 680, color: 0xffb44a, opacity: 0.18 },
    { r: 920, color: 0xff7a2a, opacity: 0.08 },
  ];
  for (const l of layers) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(l.r, 32, 24),
      new THREE.MeshBasicMaterial({
        color: l.color,
        transparent: true,
        opacity: l.opacity,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    group.add(m);
  }
  return group;
}

// Dyson swarm: a Kardashev-III civilization tiling the star with millions of
// collectors. We fake the look with an InstancedMesh of thousands of small
// glowing panels distributed through a thick spherical shell. One draw call.
export function buildDysonSwarm() {
  const COUNT = 4000;
  const INNER = 700;
  const OUTER = 1500;

  const panel = new THREE.BoxGeometry(34, 34, 3);
  const material = new THREE.MeshStandardMaterial({
    color: 0x10141c,
    metalness: 0.7,
    roughness: 0.35,
    emissive: 0x4488ff,
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.InstancedMesh(panel, material, COUNT);
  mesh.name = "dyson-swarm";
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < COUNT; i++) {
    // Uniform point on a sphere, random radius in the shell.
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const r = INNER + Math.random() * (OUTER - INNER);
    dummy.position.set(r * s * Math.cos(phi), r * u, r * s * Math.sin(phi));
    // Face the sun, with a little random spin.
    dummy.lookAt(0, 0, 0);
    dummy.rotation.z += Math.random() * Math.PI;
    const sc = 0.6 + Math.random() * 1.6;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// Megastructure scaffolding: a few enormous glowing rings encircling the star
// at different inclinations (partial Dyson sphere / orbital rings).
export function buildDysonRings() {
  const group = new THREE.Group();
  group.name = "dyson-rings";
  const specs = [
    { r: 1300, tube: 10, color: 0x66ccff, rot: [0, 0, 0] },
    { r: 1650, tube: 8, color: 0x88aaff, rot: [Math.PI / 2.2, 0.4, 0] },
    { r: 2000, tube: 7, color: 0x55ffcc, rot: [0.6, 0, Math.PI / 2.5] },
  ];
  for (const s of specs) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(s.r, s.tube, 8, 220),
      new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    ring.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
    group.add(ring);
  }
  return group;
}

// A faraway spiral galaxy backdrop — the home of a Type-III civilization.
// Coloured points spun into spiral arms with a bright core, on a huge disc.
export function buildGalaxy() {
  const COUNT = 12000;
  const ARMS = 5;
  const RADIUS = 26000;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);

  const core = new THREE.Color(0xfff2c4);
  const mid = new THREE.Color(0x7fb0ff);
  const edge = new THREE.Color(0x6a3cff);

  for (let i = 0; i < COUNT; i++) {
    const t = Math.pow(Math.random(), 0.6);       // bias toward the core
    const r = t * RADIUS;
    const arm = (i % ARMS) / ARMS * Math.PI * 2;
    const spin = r * 0.00018;                       // spiral twist
    const spread = (1 - t) * 0.5 + 0.05;
    const angle = arm + spin + (Math.random() - 0.5) * spread;
    const thickness = (Math.random() - 0.5) * RADIUS * 0.05 * (0.3 + (1 - t));

    positions[i * 3 + 0] = Math.cos(angle) * r + (Math.random() - 0.5) * r * 0.05;
    positions[i * 3 + 1] = thickness;
    positions[i * 3 + 2] = Math.sin(angle) * r + (Math.random() - 0.5) * r * 0.05;

    const c = core.clone().lerp(mid, Math.min(1, t * 1.6)).lerp(edge, Math.max(0, t - 0.4));
    colors[i * 3 + 0] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 60,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "galaxy";
  points.frustumCulled = false;
  // Tilt the disc so we see it at an angle, and park it off to one side.
  points.rotation.set(0.5, 0.2, 0.3);
  points.position.set(-9000, 4000, -14000);
  return points;
}

// An orbital-ring megastructure around a planet (a glowing band of habitats).
export function buildPlanetRing(planetRadius, color) {
  const r = planetRadius * 1.7;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, planetRadius * 0.06, 6, 120),
    new THREE.MeshStandardMaterial({
      color: 0x20242c,
      metalness: 0.6,
      roughness: 0.4,
      emissive: new THREE.Color(color || 0x66ccff),
      emissiveIntensity: 0.7,
    })
  );
  ring.rotation.x = Math.PI / 2 + 0.25;
  ring.name = "planet-ring";
  return ring;
}
