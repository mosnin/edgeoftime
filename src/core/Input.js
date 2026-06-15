// Centralised input: keyboard state, mouse-look (pointer lock), wheel, clicks.
// Maps consume this each frame rather than registering their own listeners.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;

    // One-shot event queues, drained by maps each frame.
    this._pressed = new Set();   // keys pressed this frame
    this.clickLeft = false;
    this.clickRight = false;

    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this._pressed.add(e.code);
      this.keys.add(e.code);
      // Stop space/arrows from scrolling the page.
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    canvas.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.clickLeft = true;
      if (e.button === 2) this.clickRight = true;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  requestLock() { this.canvas.requestPointerLock(); }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this._pressed.has(code); }

  // Consume the per-frame deltas. Returns and resets look/wheel/click state.
  consume() {
    const out = {
      dx: this.mouseDX, dy: this.mouseDY,
      wheel: this.wheel,
      left: this.clickLeft, right: this.clickRight,
    };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.clickLeft = false; this.clickRight = false;
    this._pressed.clear();
    return out;
  }
}
