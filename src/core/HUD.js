// HUD (Team 9) — wraps the static DOM defined in index.html.
// Pure DOM; no Three import. All element lookups are guarded so missing
// nodes never throw (keeps headless tests happy).

import { BLOCKS } from "../voxel/blocks.js";

export default class HUD {
  constructor() {
    this.overlay   = document.getElementById("overlay");
    this.play      = document.getElementById("play");
    this.crosshair = document.getElementById("crosshair");
    this.hud       = document.getElementById("hud");
    this.hudMap    = document.getElementById("hud-map");
    this.hudCoords = document.getElementById("hud-coords");
    this.hudMode   = document.getElementById("hud-mode");
    this.hotbar    = document.getElementById("hotbar");
    this.hint      = document.getElementById("hint");
    this._slots = [];
  }

  onPlay(cb) {
    if (this.play && typeof cb === "function") {
      this.play.addEventListener("click", () => cb());
    }
  }

  showGame() {
    if (this.overlay)   this.overlay.style.display = "none";
    if (this.crosshair) this.crosshair.style.display = "block";
    if (this.hud)       this.hud.style.display = "block";
    if (this.hotbar)    this.hotbar.style.display = "flex";
  }

  showOverlay() {
    if (this.overlay) this.overlay.style.display = "flex";
  }

  setMap(name) {
    if (this.hudMap) this.hudMap.textContent = String(name);
  }

  // Accepts (x, y, z) numbers OR a single {x, y, z} vector-like object.
  setCoords(x, y, z) {
    if (x && typeof x === "object") {
      const v = x;
      z = v.z; y = v.y; x = v.x;
    }
    if (this.hudCoords) {
      this.hudCoords.textContent =
        `x ${Math.round(x)}  y ${Math.round(y)}  z ${Math.round(z)}`;
    }
  }

  setMode(text) {
    if (this.hudMode) this.hudMode.textContent = String(text);
  }

  setHint(textOrNull) {
    if (!this.hint) return;
    if (textOrNull == null || textOrNull === "") {
      this.hint.style.display = "none";
    } else {
      this.hint.textContent = String(textOrNull);
      this.hint.style.display = "block";
    }
  }

  buildHotbar(blockIds) {
    this._slots = [];
    if (!this.hotbar) return;
    this.hotbar.textContent = "";
    const ids = blockIds || [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const def = BLOCKS[id] || {};

      const slot = document.createElement("div");
      slot.className = "slot";
      if (def.name) slot.title = def.name;

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(i + 1);

      const swatch = document.createElement("div");
      swatch.className = "swatch";
      const c = def.color || [0, 0, 0];
      const r = Math.round(c[0] * 255);
      const g = Math.round(c[1] * 255);
      const b = Math.round(c[2] * 255);
      swatch.style.background = `rgb(${r}, ${g}, ${b})`;

      slot.appendChild(num);
      slot.appendChild(swatch);
      this.hotbar.appendChild(slot);
      this._slots.push(slot);
    }
  }

  setActiveSlot(i) {
    for (let j = 0; j < this._slots.length; j++) {
      const slot = this._slots[j];
      if (!slot) continue;
      if (j === i) slot.classList.add("active");
      else slot.classList.remove("active");
    }
  }
}
