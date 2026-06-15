// Edge of Time — MapManager (Team 2)
// Holds the map instances and drives transitions between them with a short
// black fade. See CONTRACTS.md (Map lifecycle) for the onEnter/onExit/update
// contract each map honors.

const FADE_MS = 250;
const SWAP_DELAY_MS = 200;

export class MapManager {
  /**
   * @param {object} game  shared services object (see CONTRACTS.md)
   * @param {{ space: object, planet: object }} maps  already-constructed map instances
   */
  constructor(game, maps) {
    this.game = game;
    this.maps = maps || {};
    this.current = null;      // active map instance; null until first switch
    this._switching = false;  // guard against overlapping switches
    this._fadeEl = null;      // cached fullscreen black overlay
  }

  // Create or reuse the fullscreen black fade overlay.
  _getFade() {
    if (this._fadeEl && this._fadeEl.isConnected) return this._fadeEl;
    let el = (typeof document !== "undefined")
      ? document.getElementById("fade")
      : null;
    if (!el && typeof document !== "undefined") {
      el = document.createElement("div");
      el.id = "fade";
      document.body.appendChild(el);
    }
    if (el) {
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.top = "0";
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.background = "#000";
      el.style.zIndex = "9999";
      el.style.pointerEvents = "none";
      el.style.opacity = el.style.opacity || "0";
      el.style.transition = `opacity ${FADE_MS}ms ease`;
    }
    this._fadeEl = el;
    return el;
  }

  /**
   * Transition to a named map, running onExit on the old and onEnter on the new
   * with a short fade-to-black in between.
   * @param {"space"|"planet"} name
   * @param {object} [payload]
   */
  switchMap(name, payload) {
    const next = this.maps[name];
    if (!next) {
      throw new Error(`MapManager.switchMap: unknown map "${name}"`);
    }
    // Ignore overlapping requests while a fade is in progress.
    if (this._switching) return;
    this._switching = true;

    const data = payload || {};
    const fade = this._getFade();

    const doSwap = () => {
      try {
        if (this.current && typeof this.current.onExit === "function") {
          this.current.onExit();
        }
        this.current = next;
        if (typeof this.current.onEnter === "function") {
          this.current.onEnter(data);
        }
      } finally {
        // Fade back in (or finish immediately if no DOM).
        if (fade) {
          // Force a reflow so the opacity change animates reliably.
          void fade.offsetWidth;
          fade.style.opacity = "0";
          this._switching = false;
        } else {
          this._switching = false;
        }
      }
    };

    if (fade) {
      // Fade out (to black), then swap + fade in at peak black.
      fade.style.opacity = "1";
      setTimeout(doSwap, SWAP_DELAY_MS);
    } else {
      // No DOM available (e.g. headless) — swap synchronously.
      doSwap();
    }
  }

  /**
   * Per-frame update; forwards to the active map.
   * @param {number} dt  seconds since last frame
   */
  update(dt) {
    if (this.current && typeof this.current.update === "function") {
      this.current.update(dt);
    }
  }
}

export default MapManager;
