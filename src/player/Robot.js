import * as THREE from "three";

const SENSITIVITY = 0.0025;
const PITCH_LIMIT = 1.5;

/**
 * Robot — the shared player.
 *
 * Direction conventions (right-handed, Y up):
 *   At yaw = 0, pitch = 0 the robot faces -Z (Three.js default forward).
 *   yaw rotates about +Y. Positive yaw turns the robot to the left (CCW seen
 *   from above), matching THREE.Object3D.rotation.y semantics, so syncModel()
 *   can simply set model.rotation.y = yaw and the model faces forwardFlat().
 *
 *   forwardFlat() = (-sin yaw, 0, -cos yaw)
 *   right()       = ( cos yaw, 0, -sin yaw)   == cross(forwardFlat, up)
 *   forward()     = (-sin yaw * cos pitch, sin pitch, -cos yaw * cos pitch)
 *
 *   right() is forwardFlat rotated -90deg about Y. With these, for a camera
 *   looking along forwardFlat, "right" points to the player's right hand, so
 *   moving along +right strafes right. (cross(forwardFlat, up) = right.)
 *
 * Model structure (a THREE.Group, origin = body CENTER):
 *   torso  : box, centered at y ~ +0.15
 *   head   : box up at y ~ +0.75, with an emissive-cyan visor box on its front
 *   arms   : two boxes on left/right of the torso
 *   legs   : two boxes going down to y ~ -0.9
 *   jetpack: box on the back (+Z is back since forward is -Z) with two
 *            downward thruster nozzle cylinders; two emissive-orange flame
 *            cones below the nozzles, stored in this._flames (start hidden).
 *   Overall bounds ~ 0.8 (x) * 1.8 (y) * 0.8 (z), centered on this.position.
 */
export default class Robot {
  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.halfExtents = new THREE.Vector3(0.4, 0.9, 0.4);

    this.jetActive = false;
    this._flames = [];
    // smoothed third-person camera position (lazily initialised)
    this._smoothCam = null;

    this.model = new THREE.Group();
    this.model.name = "robot";

    // ---- materials ----------------------------------------------------------
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9aa4b0,
      metalness: 0.6,
      roughness: 0.4,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xff7a18,
      metalness: 0.6,
      roughness: 0.4,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x3a3f47,
      metalness: 0.7,
      roughness: 0.35,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0a3a44,
      metalness: 0.4,
      roughness: 0.2,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.2,
    });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff8a00,
      metalness: 0.0,
      roughness: 0.6,
      emissive: 0xff5500,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.9,
    });

    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.model.add(m);
      return m;
    };

    // ---- torso --------------------------------------------------------------
    box(0.6, 0.7, 0.4, steel, 0, 0.15, 0);
    // chest accent
    box(0.3, 0.25, 0.05, orange, 0, 0.2, 0.22);

    // ---- head + visor -------------------------------------------------------
    box(0.45, 0.4, 0.4, steel, 0, 0.75, 0); // head
    // visor faces forward (-Z)
    box(0.34, 0.14, 0.06, visorMat, 0, 0.78, -0.2);

    // ---- arms ---------------------------------------------------------------
    box(0.18, 0.6, 0.22, darkMetal, -0.42, 0.1, 0); // left arm
    box(0.18, 0.6, 0.22, darkMetal, 0.42, 0.1, 0); // right arm
    // shoulder accents
    box(0.22, 0.18, 0.26, orange, -0.42, 0.42, 0);
    box(0.22, 0.18, 0.26, orange, 0.42, 0.42, 0);

    // ---- legs (down to ~ -0.9) ---------------------------------------------
    box(0.22, 0.7, 0.26, darkMetal, -0.16, -0.55, 0); // left leg
    box(0.22, 0.7, 0.26, darkMetal, 0.16, -0.55, 0); // right leg
    // feet
    box(0.26, 0.12, 0.34, steel, -0.16, -0.85, 0.04);
    box(0.26, 0.12, 0.34, steel, 0.16, -0.85, 0.04);

    // ---- jetpack (mounted on the back, +Z) ----------------------------------
    // Central mounting plate against the torso.
    box(0.46, 0.55, 0.12, darkMetal, 0, 0.18, 0.3);

    // Two fuel cylinders flanking the spine, each with a rounded cap and a
    // downward thruster nozzle + flame.
    const tankGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.62, 14);
    const capGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.1, 14);
    const nozzleGeo = new THREE.CylinderGeometry(0.07, 0.12, 0.16, 12);
    for (const sx of [-0.22, 0.22]) {
      const tank = new THREE.Mesh(tankGeo, steel);
      tank.position.set(sx, 0.2, 0.42);
      this.model.add(tank);

      const cap = new THREE.Mesh(capGeo, orange); // accent cap on top
      cap.position.set(sx, 0.54, 0.42);
      this.model.add(cap);

      const nozzle = new THREE.Mesh(nozzleGeo, darkMetal); // points down
      nozzle.position.set(sx, -0.16, 0.42);
      this.model.add(nozzle);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.5, 12),
        flameMat
      );
      flame.rotation.x = Math.PI; // tip points down
      flame.position.set(sx, -0.5, 0.42);
      flame.visible = false;
      this.model.add(flame);
      this._flames.push(flame);
    }
  }

  applyLook(dx, dy) {
    this.yaw -= dx * SENSITIVITY;
    this.pitch -= dy * SENSITIVITY;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      -Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    ).normalize();
  }

  forwardFlat() {
    return new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    ).normalize();
  }

  right() {
    return new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    ).normalize();
  }

  syncModel() {
    this.model.position.copy(this.position);
    this.model.rotation.set(0, this.yaw, 0);
  }

  updateCamera(camera, opts) {
    const thirdPerson = !opts || opts.thirdPerson !== false;
    const up = new THREE.Vector3(0, 1, 0);

    if (thirdPerson) {
      const fwd = this.forward();
      const distance = 5;
      const desired = this.position
        .clone()
        .addScaledVector(fwd, -distance)
        .addScaledVector(up, 1.5);

      if (!this._smoothCam) this._smoothCam = desired.clone();
      this._smoothCam.lerp(desired, 0.2);
      camera.position.copy(this._smoothCam);

      const target = this.position
        .clone()
        .addScaledVector(up, 0.8)
        .addScaledVector(fwd, 2);
      camera.lookAt(target);
    } else {
      // first person: camera at the head, looking along forward
      const head = this.position.clone().addScaledVector(up, 0.75);
      camera.position.copy(head);
      camera.lookAt(head.clone().add(this.forward()));
      this._smoothCam = null;
    }
  }

  setJet(active) {
    this.jetActive = !!active;
    const s = active ? 0.9 + Math.random() * 0.4 : 1;
    for (const flame of this._flames) {
      flame.visible = !!active;
      flame.scale.set(s, s, s);
    }
  }
}
