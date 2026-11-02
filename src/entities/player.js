import * as THREE from 'three';

// Third-person camera rig with follow / gig-wide / overhead / cinematic modes and Buzz sway.
export class CameraRig {
  constructor(camera, input) {
    this.cam = camera; this.input = input; this.yaw = Math.PI; this.pitch = 0.32; this.dist = 6.5; this.mode = 'follow';
    this.focus = new THREE.Vector3(); this.pos = new THREE.Vector3(0, 8, 20); this.look = new THREE.Vector3(); this.sway = 0; this.shake = 0;
    this.shot = null; this.far = true; // far = zoomed-out overview toggle (V)
  }
  setShot(pos, look) { this.mode = 'shot'; this.shot = { pos: pos.clone(), look: look.clone() }; }
  update(dt, t, target, buzz = 0) {
    const inp = this.input;
    if (this.mode === 'follow') {
      const sens = 0.0042;
      this.yaw -= inp.mouse.dx * sens + inp.gp.rx * dt * 2.6; this.pitch += inp.mouse.dy * sens * 0.8 + inp.gp.ry * dt * 1.8;
      if (inp.isDown('ArrowLeft')) this.yaw += dt * 2; if (inp.isDown('ArrowRight')) this.yaw -= dt * 2;
      this.pitch = Math.max(this.far ? 0.55 : -0.15, Math.min(1.3, this.pitch));
      this.dist = Math.max(3, Math.min(14, this.dist + inp.mouse.wheel * 0.6));
      const tp = target ? target.pos : new THREE.Vector3();
      this.focus.lerp(new THREE.Vector3(tp.x, tp.y + 1.5, tp.z), Math.min(1, dt * 10));
      const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.far ? Math.max(20, this.dist * 2.6) : this.dist);
      const want = this.focus.clone().add(off); want.y = Math.max(0.6, want.y);
      if (this.collide && !this.far) { const hit = this.collide(this.focus, want); if (hit) want.copy(hit); }
      this.pos.lerp(want, Math.min(1, dt * 12)); this.look.copy(this.focus);
    } else if (this.mode === 'gig') {
      const k = Math.sin(t * 0.12) * 0.5;
      const want = this.far ? new THREE.Vector3(-8 + k * 8, 14, 30) : new THREE.Vector3(-4 + k * 6, 5.6, 15.5); this.pos.lerp(want, Math.min(1, dt * 1.5));
      this.look.lerp(new THREE.Vector3(k * 2, 2.1, 1.5), Math.min(1, dt * 2));
    } else if (this.mode === 'shot' && this.shot) {
      const sp = this.far ? this.shot.look.clone().add(this.shot.pos.clone().sub(this.shot.look).multiplyScalar(2.4)) : this.shot.pos;
      this.pos.lerp(sp, Math.min(1, dt * 2.5)); this.look.lerp(this.shot.look, Math.min(1, dt * 3));
    }
    // buzz sway + shake
    this.sway = buzz > 60 ? (buzz - 60) / 40 : 0;
    const sx = Math.sin(t * 0.9) * this.sway * 0.45, sy = Math.sin(t * 1.3) * this.sway * 0.2;
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * 0.15;
    this.cam.position.set(this.pos.x + sx + (Math.random() - 0.5) * sh, this.pos.y + sy + (Math.random() - 0.5) * sh, this.pos.z);
    this.cam.lookAt(this.look);
    this.cam.rotation.z += Math.sin(t * 0.7) * this.sway * 0.06;
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}

// Drives whichever band member the player controls.
export class PlayerController {
  constructor(input, rig) { this.input = input; this.rig = rig; this.actor = null; this.enabled = true; this.wobble = 0; }
  control(actor) { if (this.actor) { this.actor.armsCrossed = false; this.actor.onPhone = false; } this.actor = actor; actor.stop(); }
  update(dt, t, state) {
    const a = this.actor; if (!a) return;
    const inp = this.input;
    a.armsCrossed = this.enabled && inp.isDown('KeyC');
    if (this.enabled && inp.wasPressed('KeyP')) a.onPhone = !a.onPhone;
    let mx = 0, mz = 0;
    if (this.enabled && !a.climbing) {
      if (inp.isDown('KeyW')) mz += 1; if (inp.isDown('KeyS')) mz -= 1; if (inp.isDown('KeyA')) mx -= 1; if (inp.isDown('KeyD')) mx += 1;
      mx += inp.gp.lx; mz -= inp.gp.ly;
    }
    const f = this.rig.forward(), r = new THREE.Vector3(-f.z, 0, f.x);
    const dir = f.multiplyScalar(mz).add(r.multiplyScalar(mx));
    if (dir.lengthSq() > 1) dir.normalize();
    // Buzz: drifting, wobbly steering when you've had a few
    const buzz = state.buzz;
    if (buzz > 65 && dir.lengthSq() > 0.01) { const w = (buzz - 65) / 35; this.wobble += dt * (1.5 + w * 2); const ang = Math.sin(this.wobble * 1.7) * w * 0.7; dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); }
    if (a.armsCrossed || a.onPhone) dir.multiplyScalar(0.4);
    const run = (inp.isDown('ShiftLeft', 'ShiftRight') || inp.touchRun) && !a.carry;
    let speed = (run ? 5.4 : 2.6) * (1 - Math.min(0.55, a.weight * 0.11)) * (a.helped ? 1.35 : 1);
    if (a.drinksCarried) speed *= 0.85;
    a.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 9));
    if (!a.climbing) a.move(dt);
    let anim;
    if (a.climbing) anim = 'climb';
    else if (a.speed < 0.25) { if (a.armsCrossed) anim = 'arms_crossed'; else if (a.onPhone) anim = 'phone'; else if (a.drinksCarried) anim = 'carry'; }
    a.animate(dt, anim);
  }
}
