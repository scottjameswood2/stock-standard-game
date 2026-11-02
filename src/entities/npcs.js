import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { toast } from '../ui/ui.js';

const VARIANTS = ['racegoer_suit', 'racegoer_sundress', 'racegoer_fascinator', 'racegoer_linen'];
const SHIRTS = ['#e85d75', '#f2a91a', '#3b7dd8', '#7cc576', '#f7f1e3', '#b04fc4', '#ff8c42', '#2bb3b1', '#c8231c', '#203a72'];
const NAMES = ['Shazza', 'Davo', 'Kylie', 'Bazza', 'Trish', 'Macca', 'Leanne', 'Robbo', 'Jodie', 'Stevo', 'Narelle', 'Gazza', 'Bec', 'Hendo', 'Tash', 'Muzza', 'Kez', 'Johnno', 'Deb', 'Fitzy', 'Sal', 'Bluey', 'Tracey', 'Wazza', 'Mel', 'Smithy', 'Jacinta', 'Thommo', 'Kath', 'Sully', 'Bev', 'Dazza'];

export class NPCs {
  constructor(world, state, labels) {
    this.world = world; this.state = state; this.labels = labels;
    this.crowd = []; this.waitstaff = []; this.security = null; this.truckie = null; this.bookie = null;
    this.mode = 'mingle'; // mingle | gig | race | rain
    this.chase = null;
  }
  async spawn(count = 30, onProgress) {
    const w = this.world, area = w.markers.crowd_area, c = area ? area.position : new THREE.Vector3(0, 0, 9);
    const hx = area ? Math.max(3, area.scale.x) : 9, hz = area ? Math.max(2, area.scale.z) : 5;
    for (let i = 0; i < count; i++) {
      const model = VARIANTS[i % VARIANTS.length];
      const a = await w.spawnActor({ id: 'punter_' + i, name: NAMES[i % NAMES.length], modelId: model, isNPC: true, tint: i >= 4 ? { shirt: SHIRTS[(i * 7) % SHIRTS.length] } : null, height: 1.6 + Math.random() * 0.3, baseHeight: 1.75 });
      const gx = (i % 8) / 7 - 0.5, gz = Math.floor(i / 8) / 3 - 0.5;
      a.home = new THREE.Vector3(c.x + gx * hx * 1.8 + (Math.random() - 0.5) * 1.2, 0, c.z + gz * hz * 1.8 + (Math.random() - 0.5) * 1.2);
      a.setPos(a.home.x, 0, a.home.z); a.faceTowards(new THREE.Vector3(0, 0, 0));
      a.mingle = this.minglePoint(i); a.drunk = Math.random(); a.hasDrink = Math.random() < 0.4; a.timer = Math.random() * 5; a.radius = 0.3;
      a.vibe = Math.random(); a.tipped = false; a.talked = 0;
      if (a.hasDrink) a.attach('schooner', 'socket_hand_R');
      this.crowd.push(a); onProgress?.((i + 1) / count);
    }
    // waitstaff with canapé trays (one vego, one not)
    const path = []; for (let i = 0; i < 6; i++) path.push(w.m('waitstaff_path_' + i));
    for (let k = 0; k < 2; k++) {
      const a = await w.spawnActor({ id: 'waiter_' + k, name: k ? 'Waiter (meat pies)' : 'Waiter (vego)', modelId: 'waitstaff', isNPC: true, height: 1.75, baseHeight: 1.8 });
      a.path0 = path; a.pi = k * 3; a.veg = k === 0; a.canapes = 8; a.offering = false; a.cooldown = 0;
      const p = path[a.pi]; a.setPos(p.x, 0, p.z); a.idleAnim = 'hold_tray';
      a.tray = a.model.nodes['Tray']; a.canapeNode = a.model.nodes['Canapes'];
      a.tag = this.labels.add(a.group, k ? '🥧 Canapés' : '🥗 Vego canapés', { offset: 2.3 }); a.tag.visible = false;
      this.waitstaff.push(a);
    }
    const bar = w.m('poi_bar');
    this.security = await w.spawnActor({ id: 'security', name: 'Security', modelId: 'security', isNPC: true, height: 1.88, baseHeight: 1.8 });
    this.security.setPos(bar.x + 2, 0, bar.z + 5); this.security.home = this.security.pos.clone(); this.security.idleAnim = 'arms_crossed';
    this.truckie = await w.spawnActor({ id: 'truckie', name: 'The Truckie', modelId: 'truckie', isNPC: true, height: 1.8, baseHeight: 1.8 });
    this.truckie.setPos(10.5, 0, 2.6); this.truckie.home = this.truckie.pos.clone(); this.truckie.faceTowards(new THREE.Vector3(0, 0, 10));
    const bk = w.m('poi_bookie');
    this.bookie = await w.spawnActor({ id: 'bookie', name: 'Bookie', modelId: 'racegoer_suit', isNPC: true, height: 1.72, baseHeight: 1.75 });
    this.bookie.setPos(bk.x + 1.2, 0, bk.z - 0.6); this.bookie.faceTowards(bk); this.bookie.idleAnim = 'idle';
    this.barStaff = await w.spawnActor({ id: 'barstaff', name: 'Bar staff', modelId: 'waitstaff', isNPC: true, height: 1.7, baseHeight: 1.8 });
    this.barStaff.setPos(bar.x - 2.4, 0, bar.z); this.barStaff.faceTowards(bar);
    if (this.barStaff.model.nodes['Tray']) this.barStaff.model.nodes['Tray'].visible = false;
  }
  minglePoint(i) { // spread punters across the venue between sets
    const spots = [[-14, 10], [-12, 14], [12, 9], [14, 4], [-4, 18], [5, 17], [0, 12], [-8, 8], [8, 12], [-18, 14]];
    const s = spots[i % spots.length]; return new THREE.Vector3(s[0] + (Math.random() - 0.5) * 4, 0, s[1] + (Math.random() - 0.5) * 4);
  }
  setMode(mode) { this.mode = mode; for (const a of this.crowd) a.timer = Math.random() * 1.5; }

  update(dt, t, player) {
    const st = this.state, energy = st.crowd;
    for (const a of this.crowd) {
      a.timer -= dt;
      if (a.pulled) { a.animate(dt, 'dance'); continue; }
      const dest = this.mode === 'mingle' ? a.mingle : this.mode === 'rain' ? new THREE.Vector3(a.home.x * 0.4 - 14, 0, a.home.z * 0.3 + 6) : a.home;
      if (a.timer <= 0) { a.timer = 2 + Math.random() * 4; if (a.pos.distanceTo(dest) > 0.8) a.goTo(dest); }
      const moving = a.steer(dt, this.mode === 'rain' ? 3.5 : 1.3);
      let anim;
      if (!moving) {
        if (this.mode === 'race') { a.face(Math.PI); anim = a.vibe > 0.3 ? 'cheer' : 'wave'; }
        else if (this.mode === 'gig') {
          a.faceTowards(new THREE.Vector3(a.pos.x * 0.6, 0, 0));
          anim = energy < 25 ? (a.vibe < 0.3 ? 'phone' : a.vibe < 0.6 ? 'arms_crossed' : 'idle') : energy < 50 ? (a.vibe < 0.5 ? 'clap' : 'idle') : energy < 80 ? (a.vibe < 0.75 ? 'dance' : 'clap') : (a.vibe < 0.5 ? 'cheer' : 'dance');
          if (a.hasDrink && anim === 'idle' && Math.sin(t * 0.3 + a.vibe * 9) > 0.9) anim = 'drink';
        } else anim = a.hasDrink && Math.sin(t * 0.25 + a.vibe * 9) > 0.85 ? 'drink' : (a.vibe < 0.15 ? 'phone' : 'idle');
      }
      a.animate(dt, anim);
    }
    this.updateWaitstaff(dt, player);
    this.updateSecurity(dt, player);
    for (const n of [this.truckie, this.bookie, this.barStaff]) n?.animate(dt);
  }

  // ---- Canapé Stance ----
  stanceOK(player) {
    if (!player || player.speed > 0.2 || player.armsCrossed || player.onPhone || player.carry) return false;
    return true;
  }
  facing(player, a) {
    const f = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const to = new THREE.Vector3().subVectors(a.pos, player.pos).setY(0).normalize();
    return f.dot(to) > 0.6;
  }
  updateWaitstaff(dt, player) {
    const tall = this.state.hasAbility(this.state.playerId, 'tall_poppy');
    for (const a of this.waitstaff) {
      a.cooldown -= dt; a.tag.visible = tall;
      if (a.tag.e) a.tag.e.className = 'tag3d' + (tall ? ' hl' : '');
      if (a.canapeNode) a.canapeNode.visible = a.canapes > 0;
      if (a.canapes <= 0 && a.cooldown < -30) { a.canapes = 8; }
      const d = player ? a.pos.distanceTo(player.pos) : 99;
      const wants = player && d < 5 && Math.abs(player.pos.y - a.pos.y) < 0.8 && a.canapes > 0 && a.cooldown <= 0 && this.stanceOK(player) && this.facing(player, a);
      if (wants) {
        if (d > 1.3) { a.goTo(player.pos); a.steer(dt, 1.6); a.offering = false; }
        else { a.stop(); a.faceTowards(player.pos); a.offering = true; }
        a.animate(dt, a.offering ? 'hold_tray' : undefined);
        continue;
      }
      if (a.offering && player && d < 1.8) { // player broke stance: walk off
        a.offering = false; a.cooldown = 2;
      }
      a.offering = false;
      if (!a.target) { a.pi = (a.pi + 1) % a.path0.length; a.goTo(a.path0[a.pi]); }
      a.steer(dt, 1.2); a.animate(dt);
    }
  }
  takeCanape(a) { a.canapes--; a.offering = false; a.cooldown = 4; if (a.canapes <= 0) a.cooldown = 0; audio.play('pickup'); }

  // ---- Security chase (Lemon heat / crowd chaos) ----
  startChase(target, reason) {
    if (this.chase) return; this.chase = { target, until: performance.now() + 25000, reason };
    this.labels.bubble(this.security.group, reason === 'lemons' ? 'Oi! Lemon boy!' : 'Oi! Settle down!', 2500);
    toast('🚨 Security is coming for you! Leg it!', 'bad'); audio.play('bad');
  }
  updateSecurity(dt, player) {
    const s = this.security; if (!s) return;
    if (this.chase) {
      const tgt = this.chase.target;
      s.goTo(tgt.pos); s.steer(dt, 4.4);
      if (s.pos.distanceTo(tgt.pos) < 1.0) {
        this.chase.caught = true; this.onCaught?.(this.chase); this.chase = null; s.goTo(s.home);
      } else if (performance.now() > this.chase.until) { this.chase = null; toast('Security gave up. Phew.', 'good'); s.goTo(s.home); this.onEscaped?.(); }
    } else s.steer(dt, 1.4);
    s.animate(dt);
  }
  nearestPunter(pos, max = 2.2) {
    let best = null, bd = max;
    for (const a of this.crowd) { const d = a.pos.distanceTo(pos); if (d < bd && !a.pulled) { bd = d; best = a; } }
    return best;
  }
}
