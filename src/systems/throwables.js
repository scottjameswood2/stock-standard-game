import * as THREE from 'three';
import { makeProp } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { toast } from '../ui/ui.js';

const LOVE = ['Love ya, mate!', 'Cheers legend!', 'Bun received. Feelings: warm.', 'Aww, mate.'];
const WAKE = ['OI! Alright, I\'m awake!', 'Was that a patty?!', 'Fair cop. Focusing.', 'You\'re dead, mate.'];

export class Throwables {
  constructor(game) { this.g = game; this.flying = []; this.templates = {}; this.selected = 'bun'; }
  async init() { for (const n of ['bun', 'patty', 'lemon']) this.templates[n] = await makeProp(n); }
  get pocket() { return this.g.state.pocket || (this.g.state.pocket = { bun: 2, patty: 2, lemon: 0 }); }
  cycle(to) { setTimeout(() => { if (this.g.touch) this.g.touch.ammo.textContent = { bun: '🍔', patty: '🟤', lemon: '🍋' }[this.selected]; }); if (to) this.selected = to; else { const o = ['bun', 'patty', 'lemon']; this.selected = o[(o.indexOf(this.selected) + 1) % 3]; } this.g.hud.dirty = true; }
  throw(from, dir) {
    const type = this.selected, pocket = this.pocket;
    if (false) { toast(type === 'lemon' ? 'No lemons. Grab some from the crate at the bar (Hayden only).' : `No ${type}s left. Grab more at the burger stall.`); return false; }
    this.g.hud.dirty = true; // buns, patties and lemons are all unlimited
    const obj = this.templates[type].clone(true); obj.scale.setScalar(type === 'lemon' ? 1.3 : 1.5);
    const p = from.pos.clone().add(new THREE.Vector3(0, 1.55, 0)).add(dir.clone().multiplyScalar(0.4));
    obj.position.copy(p); this.g.world.root.add(obj);
    // aim assist: pick the best target (person or car) inside a cone in front of the camera and lob it on target
    const flat = dir.clone().setY(0).normalize(); let best = null, bestScore = 1e9;
    const consider = (pt, kind) => {
      const to = pt.clone().sub(p); const dist = Math.hypot(to.x, to.z); if (dist < 1 || dist > 26) return;
      const cos = (to.x * flat.x + to.z * flat.z) / dist; if (cos < 0.94) return;
      const sc = dist * (1.6 - cos) * (kind === 'car' && type !== 'lemon' ? 3 : 1); if (sc < bestScore) { bestScore = sc; best = pt; }
    };
    for (const a of this.g.world.actors) if (a !== from && a.group.visible) consider(a.pos.clone().add(new THREE.Vector3(0, (a.height || 1.7) * 0.72, 0)), 'person');
    for (const c of this.g.world.cars) consider(c.box.getCenter(new THREE.Vector3()).setY(c.box.max.y - 0.3), 'car');
    let v;
    if (best) { const to = best.clone().sub(p), dist = Math.hypot(to.x, to.z), T = 0.25 + dist / 16; v = new THREE.Vector3(to.x / T, (to.y + 0.5 * 9.8 * T * T) / T, to.z / T); }
    else { v = flat.multiplyScalar(14); v.y = 4.2 + dir.y * 8; }
    this.flying.push({ obj, v, type, thrower: from, life: 4, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
    from.playOnce('throw', 550); audio.play('whoosh');
    return true;
  }
  update(dt) {
    const g = this.g;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]; f.life -= dt;
      f.v.y -= 9.8 * dt; f.obj.position.addScaledVector(f.v, dt);
      f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt;
      let hit = null;
      if (!f.landed) {
        // people
        for (const a of g.world.actors) {
          if (a === f.thrower) continue;
          const c = a.pos.clone(); c.y += (a.height || 1.7) * 0.7;
          if (c.distanceTo(f.obj.position) < 0.5) { hit = { actor: a }; break; }
        }
        // cars
        if (!hit) for (const car of g.world.cars) if (car.box.containsPoint(f.obj.position)) { hit = { car }; break; }
        if (hit) { this.onHit(f, hit); f.obj.parent?.remove(f.obj); this.flying.splice(i, 1); continue; }
        const gy = g.world.groundAt(f.obj.position.x, f.obj.position.z, f.obj.position.y);
        if (f.obj.position.y <= gy + 0.05) { f.landed = true; f.obj.position.y = gy + 0.04; f.v.set(0, 0, 0); f.life = Math.min(f.life, 6); audio.play('thud', { vol: 0.4 }); if (f.type === 'lemon') this.onMiss(f); }
      }
      if (f.life <= 0) { f.obj.parent?.remove(f.obj); this.flying.splice(i, 1); }
    }
  }
  onMiss(f) { const st = this.g.state; if (st.lemonStreak > 0) { st.lemonStreak = 0; toast('Lemon Streak broken!'); } }
  onHit(f, hit) {
    const g = this.g, st = g.state, thrower = f.thrower, tid = thrower.id;
    audio.play('splat', { vol: f.type === 'lemon' ? 0.5 : 1 });
    if (hit.car) return this.lemonCar(f, hit.car);
    const a = hit.actor; const band = g.band.get(a.id) === a;
    g.labels; // projected bubbles
    if (a.id === 'dunny' && a.beretOn && Math.random() < 0.6) { g.band.knockBeret(); toast('💥 Dunny\'s beret got knocked off! Find it!', 'bad'); g.onBeretLost?.(); }
    if (band || a.id === 'jamie') {
      if (f.type === 'bun') {
        g.labels.bubble(a.group, LOVE[Math.floor(Math.random() * LOVE.length)]); st.mood(a.id, 6); st.addMateship(2, `bun for ${a.name}`);
        st.logEvent(tid, 'bun_throw', `Threw ${a.name} a bun`, true, 0.4); st.logEvent(a.id, 'got_bun', 'Copped a loving bun', true, 0.2);
      } else if (f.type === 'patty') {
        g.labels.bubble(a.group, WAKE[Math.floor(Math.random() * WAKE.length)]); st.mood(a.id, -6);
        if (st.members[a.id]) { st.members[a.id].pattyFix = true; st.members[a.id].annoyed++; }
        toast(`${a.name} is awake now (timing fixed for a song), but a bit annoyed.`);
        st.logEvent(tid, 'patty_throw', `Patty'd ${a.name} awake`, false, 0.4);
      } else { g.labels.bubble(a.group, 'A LEMON?!'); st.mood(a.id, -8); st.addMateship(-2, 'lemon to a bandmate'); }
      a.playOnce('fall', 600);
      return;
    }
    // crowd / staff → chaos
    if (a.id === 'security' || a.id === 'truckie' || a.id.startsWith('waiter')) {
      g.labels.bubble(a.group, a.id === 'security' ? 'RIGHT. That\'s it.' : 'Oi!'); g.npcs.startChase(thrower, 'chaos'); return;
    }
    if (Math.random() < (f.type === 'bun' ? 0.65 : 0.45)) {
      g.labels.bubble(a.group, ['Haha legend!', 'BUN RAIN!', 'Yewww!', 'Do it again!'][Math.floor(Math.random() * 4)]);
      a.playOnce('cheer', 1200); st.addCrowd(4); audio.play('cheer', { vol: 0.4 }); toast('The crowd loved it! +Crowd Energy', 'good');
    } else {
      g.labels.bubble(a.group, 'My fascinator!'); a.playOnce('fall', 700); g.npcs.startChase(thrower, 'chaos');
    }
  }
  lemonCar(f, car) {
    const g = this.g, st = g.state;
    if (f.type !== 'lemon') { audio.play('thud'); return; }
    const r = Math.random(), kind = r < 0.55 ? 'alarm' : r < 0.8 ? 'wipers' : 'honk';
    g.world.trigger(car, kind);
    if (kind === 'alarm') audio.play('alarm'); else if (kind === 'honk') audio.play('carhonk'); else audio.play('clunk');
    st.lemonStreak++; st.heat = Math.min(100, st.heat + 14 + st.lemonStreak * 3);
    const words = { alarm: 'ALARM!', wipers: 'Wipers!', honk: 'HONK!' }[kind];
    toast(`🍋 ${words} The ${car.name}. Lemon Streak x${st.lemonStreak} · Heat ${Math.round(st.heat)}%`, 'good');
    st.logEvent(f.thrower.id, 'lemons', `Set off the ${car.name}`, false, 0.3);
    if (kind === 'alarm') { st.carsAlarmed.add(car.id); if (st.carsAlarmed.size >= g.world.cars.length) st.unlock('lemons'); }
    st.addMateship(1); g.hud.dirty = true;
    if (st.heat >= 100) { g.npcs.startChase(f.thrower, 'lemons'); st.heat = 70; }
  }
}
