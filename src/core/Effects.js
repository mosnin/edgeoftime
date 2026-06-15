import * as THREE from "three";

const PARTICLE_COUNT = 400;
const FAR_AWAY = 100000; // park dead particles far off-screen

export default class Effects {
  constructor() {
    this._scene = null;

    // Particle pool — flat typed arrays we manage by hand.
    this._count = PARTICLE_COUNT;
    this._positions = new Float32Array(this._count * 3);
    this._colors = new Float32Array(this._count * 3); // displayed (faded) color
    this._baseColors = new Float32Array(this._count * 3); // spawn color
    // Per-particle bookkeeping (plain JS arrays / typed arrays).
    this._vel = new Float32Array(this._count * 3);
    this._life = new Float32Array(this._count); // seconds remaining; <=0 == dead
    this._maxLife = new Float32Array(this._count);
    this._gravity = new Float32Array(this._count); // gravity accel applied per particle

    // Start everything dead and parked far away.
    for (let i = 0; i < this._count; i++) {
      this._positions[i * 3 + 0] = FAR_AWAY;
      this._positions[i * 3 + 1] = FAR_AWAY;
      this._positions[i * 3 + 2] = FAR_AWAY;
      this._colors[i * 3 + 0] = 0;
      this._colors[i * 3 + 1] = 0;
      this._colors[i * 3 + 2] = 0;
      this._life[i] = 0;
    }
    this._cursor = 0; // round-robin allocation cursor

    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this._positions, 3)
    );
    this._geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this._colors, 3)
    );

    this._material = new THREE.PointsMaterial({
      size: 0.18,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    this.points = new THREE.Points(this._geometry, this._material);
    this.points.frustumCulled = false; // we manage positions ourselves

    // Jet spawn throttle.
    this._jetAccum = 0;

    // WebAudio thruster graph (lazily created).
    this._audioCtx = null;
    this._audioNodes = null; // { gain, osc, noiseSrc, ... }
    this._audioActive = false;
  }

  attach(scene) {
    if (!scene) return;
    try {
      if (this._scene && this._scene !== scene && this.points.parent) {
        this.points.parent.remove(this.points);
      }
      scene.add(this.points);
      this._scene = scene;
    } catch (e) {
      // never throw from attach
    }
  }

  // Find the next slot to (re)use. Prefer dead particles; otherwise recycle
  // round-robin so we never grow the pool.
  _alloc() {
    const n = this._count;
    for (let k = 0; k < n; k++) {
      const i = this._cursor;
      this._cursor = (this._cursor + 1) % n;
      if (this._life[i] <= 0) return i;
    }
    // All alive — recycle whatever the cursor points at.
    const i = this._cursor;
    this._cursor = (this._cursor + 1) % n;
    return i;
  }

  _spawn(px, py, pz, vx, vy, vz, r, g, b, life, gravity) {
    const i = this._alloc();
    const p = i * 3;
    this._positions[p + 0] = px;
    this._positions[p + 1] = py;
    this._positions[p + 2] = pz;
    this._vel[p + 0] = vx;
    this._vel[p + 1] = vy;
    this._vel[p + 2] = vz;
    this._colors[p + 0] = r;
    this._colors[p + 1] = g;
    this._colors[p + 2] = b;
    this._baseColors[p + 0] = r;
    this._baseColors[p + 1] = g;
    this._baseColors[p + 2] = b;
    this._life[i] = life;
    this._maxLife[i] = life;
    this._gravity[i] = gravity;
  }

  jet(position, dir, active) {
    if (!active) return;
    if (!position || typeof position.x !== "number") return;

    // Throttle: spawn a small burst, but cap how often.
    // Direction of thrust exhaust ~ opposite to `dir` (default downward).
    let dx = 0,
      dy = -1,
      dz = 0;
    if (dir && typeof dir.x === "number") {
      dx = -dir.x;
      dy = -dir.y;
      dz = -dir.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
    }

    const burst = 3; // few particles per call
    for (let n = 0; n < burst; n++) {
      const speed = 2.5 + Math.random() * 2.0;
      const jitter = 0.8;
      const vx = dx * speed + (Math.random() - 0.5) * jitter;
      const vy = dy * speed + (Math.random() - 0.5) * jitter;
      const vz = dz * speed + (Math.random() - 0.5) * jitter;
      // Warm orange -> blue mix.
      const hot = Math.random();
      const r = 1.0;
      const g = 0.45 + hot * 0.35;
      const b = 0.1 + hot * 0.7;
      const px = position.x + (Math.random() - 0.5) * 0.15;
      const py = position.y + (Math.random() - 0.5) * 0.15;
      const pz = position.z + (Math.random() - 0.5) * 0.15;
      this._spawn(
        px,
        py,
        pz,
        vx,
        vy,
        vz,
        r,
        g,
        b,
        0.35 + Math.random() * 0.1,
        1.5 // slight gravity
      );
    }
  }

  blockBurst(position, color) {
    if (!position || typeof position.x !== "number") return;

    let r = 0.8,
      g = 0.8,
      b = 0.8;
    if (color) {
      if (Array.isArray(color)) {
        r = color[0];
        g = color[1];
        b = color[2];
      } else if (typeof color.r === "number") {
        r = color.r;
        g = color.g;
        b = color.b;
      }
    }

    const count = 12;
    for (let n = 0; n < count; n++) {
      // Outward spherical-ish velocity.
      const vx = (Math.random() - 0.5) * 2;
      const vy = Math.random() * 2.5; // bias upward a touch
      const vz = (Math.random() - 0.5) * 2;
      const speed = 1.5 + Math.random() * 2.0;
      const px = position.x + (Math.random() - 0.5) * 0.3;
      const py = position.y + (Math.random() - 0.5) * 0.3;
      const pz = position.z + (Math.random() - 0.5) * 0.3;
      // Slight per-particle color variation.
      const tint = 0.85 + Math.random() * 0.3;
      this._spawn(
        px,
        py,
        pz,
        vx * speed,
        vy * speed,
        vz * speed,
        Math.min(1, r * tint),
        Math.min(1, g * tint),
        Math.min(1, b * tint),
        0.6 + Math.random() * 0.15,
        6.0 // small gravity
      );
    }
  }

  thruster(active) {
    try {
      if (active) {
        if (!this._audioCtx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return; // WebAudio unavailable -> no-op
          this._audioCtx = new AC();
          this._buildAudioGraph();
        }
        if (this._audioCtx.state === "suspended") {
          this._audioCtx.resume().catch(() => {});
        }
        if (this._audioNodes) {
          const now = this._audioCtx.currentTime;
          const g = this._audioNodes.gain.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0.18, now + 0.15);
        }
        this._audioActive = true;
      } else {
        if (this._audioCtx && this._audioNodes) {
          const now = this._audioCtx.currentTime;
          const g = this._audioNodes.gain.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value, now);
          g.linearRampToValueAtTime(0.0001, now + 0.2);
        }
        this._audioActive = false;
      }
    } catch (e) {
      // Audio must never crash the game.
    }
  }

  _buildAudioGraph() {
    try {
      const ctx = this._audioCtx;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);

      // Low oscillator rumble.
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 55;

      // Slight LFO wobble on the oscillator frequency for texture.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Filtered white-noise hiss layered in.
      let noiseSrc = null;
      try {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = buffer;
        noiseSrc.loop = true;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "lowpass";
        noiseFilter.frequency.value = 400;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.5;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(gain);
        noiseSrc.start();
      } catch (e) {
        noiseSrc = null;
      }

      osc.connect(gain);
      osc.start();
      lfo.start();

      this._audioNodes = { gain, osc, lfo, lfoGain, noiseSrc };
    } catch (e) {
      this._audioNodes = null;
    }
  }

  update(dt, camera) {
    if (!dt || dt <= 0) dt = 0.016;
    // Clamp dt so a tab-switch hiccup doesn't fling particles to infinity.
    if (dt > 0.1) dt = 0.1;

    const pos = this._positions;
    const vel = this._vel;
    const n = this._count;
    let anyAlive = false;

    for (let i = 0; i < n; i++) {
      if (this._life[i] <= 0) continue;
      anyAlive = true;

      this._life[i] -= dt;
      if (this._life[i] <= 0) {
        // Park it.
        const p = i * 3;
        pos[p + 0] = FAR_AWAY;
        pos[p + 1] = FAR_AWAY;
        pos[p + 2] = FAR_AWAY;
        this._life[i] = 0;
        continue;
      }

      const p = i * 3;
      // Gravity (pulls -Y).
      vel[p + 1] -= this._gravity[i] * dt;
      pos[p + 0] += vel[p + 0] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;

      // Fade brightness toward black as life runs out (cheap alpha-like fade).
      const t = this._maxLife[i] > 0 ? this._life[i] / this._maxLife[i] : 0;
      const base = this._baseColors;
      this._colors[p + 0] = base[p + 0] * t;
      this._colors[p + 1] = base[p + 1] * t;
      this._colors[p + 2] = base[p + 2] * t;
    }

    this._geometry.attributes.position.needsUpdate = true;
    this._geometry.attributes.color.needsUpdate = true;

    void anyAlive;
  }
}
