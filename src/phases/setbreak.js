import * as THREE from 'three';
import { toast, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

export function wanderAI(game, m) {
  const w = game.world, spots = [w.m('poi_bar').add(new THREE.Vector3(1.5, 0, 1)), w.m('poi_bookie').add(new THREE.Vector3(-1.5, 0, 1)), new THREE.Vector3(-4, 0, 6), new THREE.Vector3(5, 0, 8), w.m('poi_burger_circle').add(new THREE.Vector3(-1, 0, 2)), new THREE.Vector3(-9, 0, 3)];
  let wait = Math.random() * 4;
  return dt => {
    if (m.target) { m.steer(dt, 1.7); return; }
    wait -= dt; if (wait > 0) return;
    wait = 6 + Math.random() * 10;
    const s = spots[Math.floor(Math.random() * spots.length)].clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
    m.goTo(s, () => { if (s.distanceTo(w.m('poi_bar')) < 3 && Math.random() < 0.5) { m.drinking = 2; const rt = game.state.members[m.id]; if (rt) rt.buzz += 8; } });
  };
}

// Between sets: free roam. Drinks, canapés, bookie, crowd. Maybe rain (tarp the gear!).
export class SetBreak {
  constructor(game) { this.g = game; this.roam = true; this.bandMode = 'roam'; this.allowBets = true; this.crowdMode = 'mingle'; this.time = 0; this.length = game.state.settings.shortGig ? 120 : 180; }
  enter() {
    const g = this.g, st = g.state, w = g.world;
    g.rig.mode = 'follow'; g.npcs.setMode('mingle');
    g.hud.setPhase('SET BREAK — FREE ROAM');
    g.hud.setHint('<b>E</b> interact · bar = shouts · stand still facing waitstaff for canapés · bookie = bets · <b>F</b> throw · <b>Tab</b> swap bandmate · <b>H</b> hide');
    g.band.list.forEach(m => { g.band.gearUp(m, 'back'); m.stop(); const s = g.band.slotPos(m.slot); m.setPos(-7 + Math.random() * 2, 0, 2.5 + Math.random() * 2); });
    const p = g.player.actor; p.setPos(-6, 0, 5.5); p.face(Math.PI); g.rig.yaw = 0.25; g.rig.pitch = 0.3;
    this.onSwitch(st.playerId);
    this.raceAt = 35 + Math.random() * 20; this.rainAt = Math.random() < 0.55 ? 70 + Math.random() * 25 : -1;
    g.interact.add({ id: 'ready', tag: 'phase', pos: () => w.m('slot_' + st.slotOf(st.playerId)), radius: 1.6, dy: 0.5, label: () => 'Ready for Set 2', action: () => this.finish() });
    toast('Set break! The bookie\'s taking bets on the next race.');
    // sulking reminder
    this.updateObjective();
  }
  onSwitch(id) { for (const m of this.g.band.list) m.ai = m.id === id ? null : wanderAI(this.g, m); }
  updateObjective() {
    const left = Math.max(0, Math.ceil(this.length - this.time));
    const sulk = this.g.state.bandIds.filter(id => this.g.state.members[id]?.sulking).map(id => this.g.state.member(id).name);
    this.g.setObjective(`Set break (<b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b>): shout the band, hunt canapés, have a punt, meet the punters. ${this.g.band.members.dunny && !this.g.band.members.dunny.beretOn ? '<b>Find Dunny\'s beret!</b> ' : ''}${sulk.length ? `😤 ${sulk.join(', ')} sulking. ` : ''}Back on your spot when ready.`);
  }
  update(dt, t) {
    const g = this.g; this.time += dt;
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.updateObjective();
    if (this.raceAt > 0 && this.time > this.raceAt) { this.raceAt = -1; g.roam.startRace(); }
    if (this.rainAt > 0 && this.time > this.rainAt) { this.rainAt = -1; this.startRain(); }
    if (this.rain) this.updateRain(dt);
    if (this.time > this.length) this.finish();
  }
  startRain() {
    const g = this.g, w = g.world, st = g.state;
    g.engine.setWeather(true); audio.play('thunder'); audio.play('rain'); centerMsg('RAIN! Tarp the gear!', 1800); g.npcs.setMode('rain');
    const geo = new THREE.BufferGeometry(), n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = Math.random() * 20; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.08, transparent: true, opacity: 0.7 }));
    w.root.add(pts);
    this.rain = { pts, until: 34, t: 0, items: [] };
    const targets = [['drums', 'drum kit', st.lineup.drums], ['amp_lead', 'lead amp', st.lineup.lead], ['amp_bass', 'bass rig', st.lineup.bass]];
    for (const [k, label, owner] of targets) {
      const o = w.stageGear[k]; if (!o) continue;
      const item = { k, label, owner, done: false, obj: o };
      this.rain.items.push(item);
      g.interact.add({ id: 'tarp_' + k, tag: 'phase', pos: () => o.position, radius: 2.0, dy: 1.6, priority: 4, label: () => item.done ? null : `Tarp the ${label}!`, action: () => this.tarp(item, st.playerId) });
    }
    // one AI bandmate helps out after a bit
    const helper = g.band.list.find(m => m.id !== st.playerId);
    setTimeout(() => { const it = this.rain?.items.find(i => !i.done); if (it && helper) { this.tarp(it, helper.id); g.labels.bubble(helper.group, `Got the ${it.label}!`, 1600); } }, 12000);
  }
  tarp(item, by) {
    const g = this.g, st = g.state; if (item.done) return; item.done = true;
    const box = new THREE.Box3().setFromObject(item.obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.15, size.y + 0.1, size.z + 0.15), new THREE.MeshStandardMaterial({ color: 0x2357c9, roughness: 0.5 }));
    tarp.position.copy(c); tarp.castShadow = true; g.world.root.add(tarp); item.tarp = tarp;
    audio.play('drop'); st.logEvent(by, 'tarped', `Tarped the ${item.label} in the rain`, true, 0.7);
    if (by === st.playerId) st.addMateship(3, `saved the ${item.label} from the rain`);
  }
  updateRain(dt) {
    const r = this.rain, p = this.g.player.actor.pos; r.t += dt;
    const a = r.pts.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 18; if (y < 0) y += 20; a.setY(i, y); }
    a.needsUpdate = true; r.pts.position.set(p.x, 0, p.z);
    if (r.t > r.until) this.endRain();
  }
  endRain() {
    const g = this.g, st = g.state, r = this.rain; this.rain = null;
    g.engine.setWeather(false); r.pts.parent.remove(r.pts); g.npcs.setMode('mingle');
    for (const it of r.items) {
      it.tarp?.parent?.remove(it.tarp);
      if (!it.done) { const rt = st.members[it.owner]; if (rt) rt.wet = true; if (it.owner === st.playerId && rt) rt.timingBuff = (rt.timingBuff || 0) - 0.1; toast(`The ${it.label} got soaked. ${st.member(it.owner).name} won't be happy.`, 'bad'); st.mood(it.owner, -10); st.logEvent(st.playerId, 'wet_gear', `Left the ${it.label} out in the rain`, false, 0.8); }
    }
    toast('Rain\'s cleared. Classic Colac.');
  }
  skip() { this.finish(); }
  finish() {
    if (this.done) return; this.done = true;
    const g = this.g, st = g.state;
    if (this.rain) this.endRain();
    for (const id of st.bandIds) if (st.members[id]?.sulking) st.logEvent(st.playerId, 'unresolved_sulk', `Never made it up to ${st.member(id).name}`, false, 0.6);
    centerMsg('Set two. Let\'s go.', 1500);
    setTimeout(() => g.setPhase('gig2'), 900);
  }
  exit() { for (const m of this.g.band.list) m.ai = null; if (this.rain) this.endRain(); }
}
