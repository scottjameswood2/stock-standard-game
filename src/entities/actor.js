import * as THREE from 'three';
import { makeCharacter, makeProp } from '../core/assets.js';

// Any animated person in the world: band member, Jamie, punter, waitstaff, security.
export class Actor {
  constructor(world, { id, name, modelId, tint, height, baseHeight, isNPC = false }) {
    this.world = world; this.id = id; this.name = name; this.modelId = modelId; this.tint = tint;
    this.height = height; this.baseHeight = baseHeight; this.isNPC = isNPC;
    this.group = new THREE.Group(); this.group.name = 'actor_' + id;
    this.heading = 0; this.vel = new THREE.Vector3(); this.speed = 0; this.radius = 0.32;
    this.target = null; this.path = []; this.onArrive = null; this.anim = 'idle'; this.lockAnim = null; this.lockUntil = 0;
    this.props = {}; this.carry = null; this.weight = 0; this.grounded = true; this.climbing = false; this.yOffset = 0;
    this.state = 'idle'; this.timer = 0; this.labelItem = null;
  }
  async load() {
    this.model = await makeCharacter(this.modelId, { tint: this.tint, height: this.height, baseHeight: this.baseHeight });
    this.group.add(this.model.root); this.model.play('idle'); return this;
  }
  get pos() { return this.group.position; }
  setPos(x, y, z) { this.group.position.set(x, y, z); return this; }
  face(h) { this.heading = h; this.group.rotation.y = h; }
  faceTowards(p) { this.face(Math.atan2(p.x - this.pos.x, p.z - this.pos.z)); }
  async attach(propName, socket = 'socket_hand_R', key = propName) {
    this.detach(key);
    const obj = await makeProp(propName); obj.name = key;
    this.model.socket(socket).add(obj); this.props[key] = obj; return obj;
  }
  attachObject(obj, socket, key) { this.detach(key); this.model.socket(socket).add(obj); this.props[key] = obj; return obj; }
  detach(key) { const o = this.props[key]; if (o) { o.parent?.remove(o); delete this.props[key]; } return o; }
  play(name, opts) { if (this.model) this.model.play(name, opts); this.anim = name; }
  playOnce(name, ms = 800, opts = {}) { this.lockAnim = name; this.lockUntil = performance.now() + ms; this.play(name, { once: true, restart: true, ...opts }); }
  goTo(p, onArrive, path) { this.target = new THREE.Vector3(p.x, 0, p.z); this.onArrive = onArrive || null; this.path = path ? path.map(q => new THREE.Vector3(q.x, 0, q.z)) : []; }
  stop() { this.target = null; this.path = []; this.vel.set(0, 0, 0); }
  // steering toward target with simple collision; returns true while moving
  steer(dt, maxSpeed) {
    if (!this.target) return false;
    const to = new THREE.Vector3(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const d = to.length();
    if (d < 0.35) {
      if (this.path.length) { this.target = this.path.shift(); return true; }
      const cb = this.onArrive; this.stop(); cb && cb(this); return false;
    }
    to.normalize();
    const sp = Math.min(maxSpeed, d * 2.5 + 0.6);
    const before = this.pos.clone();
    this.vel.lerp(to.clone().multiplyScalar(sp), Math.min(1, dt * 6));
    this.move(dt);
    // stuck? (walking into a wall) → detour sideways, then carry on to the real target
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (moved < sp * dt * 0.3) this._stuck = (this._stuck || 0) + dt; else this._stuck = Math.max(0, (this._stuck || 0) - dt * 0.5);
    if (this._stuck > 0.45) {
      this._stuck = 0; this._side = -(this._side || 1);
      const perp = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this._side * (2 + Math.random() * 1.5));
      const back = to.clone().multiplyScalar(-0.8);
      this.path.unshift(this.target.clone()); this.target = this.pos.clone().add(perp).add(back); this.target.y = 0;
    }
    return true;
  }
  move(dt) {
    const p = this.pos; const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.z * dt;
    const res = this.world.resolve(nx, nz, this.radius, this);
    p.x = res.x; p.z = res.z;
    if (!this.climbing) { const gy = this.world.groundAt(p.x, p.z, p.y); p.y += (gy - p.y) * Math.min(1, dt * 14); }
    const sp = Math.hypot(this.vel.x, this.vel.z); this.speed = sp;
    if (sp > 0.15) { const h = Math.atan2(this.vel.x, this.vel.z); let dh = h - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.face(this.heading + dh * Math.min(1, dt * 10)); }
  }
  // choose locomotion animation unless a one-shot / locked anim is playing
  animate(dt, override) {
    if (!this.model) return;
    const now = performance.now();
    if (this.lockAnim && now < this.lockUntil) { this.model.update(dt); return; }
    this.lockAnim = null;
    let want = override;
    if (!want) {
      if (this.speed > 3.2) want = 'run'; else if (this.speed > 0.25) want = this.carry ? 'carry' : 'walk';
      else want = this.carry ? 'carry' : (this.idleAnim || 'idle');
    }
    // animation LOD: far-away NPCs update their skeleton less often
    if (this.isNPC && this.world.camPos) {
      const d2 = this.pos.distanceToSquared(this.world.camPos);
      this._lodAcc = (this._lodAcc || 0) + dt;
      const every = d2 > 1600 ? 4 : d2 > 625 ? 2 : 1;
      this._lodTick = ((this._lodTick || 0) + 1) % every;
      if (this._lodTick !== 0) { if (this.model.currentName !== want) this.play(want); return; }
      dt = this._lodAcc;
    }
    this._lodAcc = 0;
    const speedMul = want === 'walk' || want === 'carry' ? Math.max(0.6, Math.min(1.6, this.speed / 1.8)) : want === 'run' ? Math.max(0.8, this.speed / 4.8) : 1;
    if (this.model.currentName !== want) this.play(want);
    if (this.model.current) this.model.current.timeScale = speedMul;
    this.model.update(dt);
  }
}
