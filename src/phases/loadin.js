import * as THREE from 'three';
import { toast, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

// Phase 1: Arrival & Load-in — carry gear from the van to the stage. Heavy gear is slow. Help a Mate.
const GEAR = [
  { key: 'kick', label: 'Kick drum', prop: 'drum_kit', weight: 3, owner: 'drums', reveals: 'drums', scale: 0.55 },
  { key: 'shells', label: 'Tom & snare cases', prop: 'amp', weight: 3, owner: 'drums', reveals: 'drums', scale: 0.8 },
  { key: 'cymbals', label: 'Cymbal bag', prop: 'tarp', weight: 2, owner: 'drums', reveals: 'drums', scale: 0.8 },
  { key: 'amp_lead', label: 'Lead amp stack', prop: 'amp_stack', weight: 3, owner: 'lead', reveals: 'amp_lead', scale: 0.7 },
  { key: 'amp_bass', label: 'Bass rig', prop: 'amp_stack', weight: 3, owner: 'bass', reveals: 'amp_bass', scale: 0.7 },
  { key: 'amp_rhythm', label: 'Rhythm amp', prop: 'amp', weight: 2, owner: 'rhythm', reveals: 'amp_rhythm', scale: 0.9 },
  { key: 'guitar_lead', label: 'Scotty\'s guitar case', prop: 'guitar_lead', weight: 1, owner: 'lead', scale: 1 },
  { key: 'guitar_rhythm', label: 'Rhythm guitar case', prop: 'guitar_rhythm', weight: 1, owner: 'rhythm', scale: 1 },
  { key: 'bass_case', label: 'Bass case', prop: 'bass', weight: 1, owner: 'bass', scale: 1 },
  { key: 'mic', label: 'Mic stand & mics', prop: 'mic_stand', weight: 1, owner: 'vocals', reveals: 'mic', scale: 0.8 },
  { key: 'wedges', label: 'Foldback wedges', prop: 'wedge', weight: 2, owner: 'vocals', reveals: 'wedges', scale: 1 },
  { key: 'tarp', label: 'The tarp (just in case)', prop: 'tarp', weight: 1, owner: null, scale: 1 },
];

export class LoadIn {
  constructor(game) { this.g = game; this.roam = true; this.bandMode = 'roam'; this.items = []; this.delivered = 0; this.time = 0; this.target = 240; }
  enter() {
    const g = this.g, w = g.world, st = g.state;
    g.rig.mode = 'follow'; g.rig.yaw = 0; g.rig.pitch = 0.35; g.npcs.setMode('mingle');
    g.hud.setPhase('1 · ARRIVAL & LOAD-IN');
    g.hud.setHint('<b>WASD</b> walk · <b>Shift</b> run · <b>E</b> pick up / drop · <b>Tab</b> swap bandmate · <b>F</b> throw · <b>H</b> hide');
    centerMsg('The Colac Cup', 2000);
    audio.say('Righto. Let\'s get the gear in.');
    // spawn gear behind the van
    const van = w.m('poi_van'), stageLoad = w.m('poi_stage_load');
    this.drop = stageLoad;
    GEAR.forEach((def, i) => {
      const tpl = w.vanGearTemplates[def.prop];
      const obj = tpl ? tpl.clone(true) : new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      obj.scale.multiplyScalar(def.scale);
      const col = i % 4, row = Math.floor(i / 4);
      obj.position.set(van.x - 3.0 - col * 1.4, 0, van.z - 1.5 - row * 1.4); obj.rotation.y = Math.random() * 0.6;
      w.root.add(obj);
      const item = { ...def, obj, state: 'van', carrier: null, home: obj.position.clone() };
      this.items.push(item);
      g.interact.add({ id: 'gear_' + def.key, tag: 'phase', pos: () => item.state === 'van' ? item.obj.position : null, radius: 1.7,
        label: () => g.player.actor.carry ? null : `Pick up: ${def.label} ${'▮'.repeat(def.weight)}`, action: () => this.pickUp(g.player.actor, item) });
    });
    g.interact.add({ id: 'drop', tag: 'phase', pos: () => this.drop, radius: 3.0, priority: 2, label: () => g.player.actor.carry ? `Drop ${g.player.actor.carry.label} at the stage` : null, action: () => this.dropOff(g.player.actor) });
    // Help a Mate: appears on any AI bandmate struggling with heavy gear
    for (const m of g.band.list) g.interact.add({ id: 'help_' + m.id, tag: 'phase', pos: () => m.pos, radius: 2.0, priority: 3,
      label: () => (m.id !== st.playerId && m.carry && m.carry.weight >= 3 && !m.helper && !g.player.actor.carry) ? `🤝 Help a Mate: ${m.name} is struggling with the ${m.carry.label}` : null,
      action: () => this.help(m) });
    for (const m of g.band.list) m.ai = (dt) => this.ai(m, dt);
    this.updateObjective();
  }
  onSwitch(id) { for (const m of this.g.band.list) if (m.id !== id) m.ai = (dt) => this.ai(m, dt); }
  updateObjective() {
    const left = this.items.filter(i => i.state !== 'stage').length;
    const mm = Math.max(0, Math.ceil(this.target - this.time)); const t = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
    this.g.setObjective(`Carry the gear from the van to the stage. <b>${left}</b> items left · Gates open in <b>${t}</b>. Optional: shout Jamie a beer at the bar for a better mix.`);
  }
  pickUp(a, item) {
    if (a.carry || item.state !== 'van' || !item.obj.parent || this.g.phase !== this) return;
    item.state = 'carried'; item.carrier = a; a.carry = item; a.weight = item.weight;
    item.obj.parent.remove(item.obj);
    const sock = a.model.nodes['socket_carry'];
    if (sock) {
      item.obj.position.set(0, 0, 0); item.obj.rotation.set(0, 0, 0); sock.add(item.obj); sock.updateWorldMatrix(true, false); item.obj.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(item.obj), c = bb.getCenter(new THREE.Vector3()); sock.worldToLocal(c);
      item.obj.position.sub(c);
    } else { a.group.add(item.obj); item.obj.position.set(0, 0.95, 0.45); item.obj.rotation.set(0, 0, 0); }
    if (a.id === this.g.state.playerId) audio.play('pickup');
    if (item.weight >= 3 && a.id !== this.g.state.playerId && Math.random() < 0.7) this.g.labels.bubble(a.group, 'Ooof. A hand, anyone?', 2200);
  }
  dropOff(a) {
    const item = a.carry; if (!item) return;
    const st = this.g.state, w = this.g.world;
    item.obj.parent.remove(item.obj); item.state = 'stage'; a.carry = null; a.weight = 0;
    this.delivered++; st.members[a.id] && (st.members[a.id].carried += item.weight);
    if (a.helper) { const h = a.helper; h.helping = null; h.helped = false; a.helper = null; a.helped = false; st.addMateship(5, `helped ${a.name} with the ${item.label}`); st.mood(a.id, 10); st.members[h.id] && st.members[h.id].helped++; st.logEvent(h.id, 'helped', `Helped ${a.name} carry the ${item.label}`, true, 0.9); st.logEvent(a.id, 'got_help', 'Accepted a hand with heavy gear', true, 0.2); this.g.labels.bubble(a.group, 'Cheers, legend!'); }
    if (item.reveals) {
      const remaining = this.items.filter(i => i.reveals === item.reveals && i.state !== 'stage').length;
      if (!remaining) { const o = w.stageGear[item.reveals]; if (o) { o.visible = true; o.scale.setScalar(0.01); this.pop(o); } if (item.reveals === 'wedges') { for (const k of ['wedge2', 'wedge3']) { const x = w.stageGear[k]; x.visible = true; x.scale.setScalar(0.01); this.pop(x); } } }
    }
    if (a.id === st.playerId) audio.play('drop');
    this.updateObjective();
    if (this.items.every(i => i.state === 'stage')) this.finish();
  }
  pop(o) { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 350); o.scale.setScalar(k < 1 ? 1.15 * Math.sin(k * Math.PI / 2) : 1); if (k < 1) requestAnimationFrame(step); }; step(); }
  help(m) {
    const p = this.g.player.actor; if (p.carry || !m.carry) return;
    m.helper = p; m.helped = true; p.helping = m; p.helped = true;
    this.g.labels.bubble(m.group, 'Oh you\'re a saint.'); audio.play('ok');
    toast(`Helping ${m.name}. Walk with them to the stage.`);
  }
  ai(m, dt) {
    const w = this.g.world;
    if (m.helper && m.helper.id !== this.g.state.playerId) m.helper = null;
    if (m.carry) {
      if (m.pos.distanceTo(this.drop) < 1.8) { m.stop(); this.dropOff(m); return; }
      if (!m.target) m.goTo(this.drop, () => this.dropOff(m), m.pos.z > 20 ? [new THREE.Vector3(-13.6, 0, 20), new THREE.Vector3(-9.2, 0, 5)] : null);
      const slow = (1 - Math.min(0.45, m.weight * 0.1)) * (m.helper ? 1.4 : 1);
      // if helped, wait for the helper to keep up
      if (m.helper && m.helper.pos.distanceTo(m.pos) > 3) { m.vel.multiplyScalar(0.8); m.move(dt); return; }
      m.steer(dt, 3.2 * slow); return;
    }
    if (!m.target) {
      const mine = this.items.filter(i => i.state === 'van' && !i.claimed);
      const pref = mine.find(i => i.owner === m.slot) || mine[0];
      if (pref) { pref.claimed = m; m.goTo(pref.obj.position, () => { pref.claimed = null; if (pref.state === 'van') this.pickUp(m, pref); }, m.pos.z < 20 ? [new THREE.Vector3(-9.2, 0, 5), new THREE.Vector3(-13.6, 0, 20)] : null); }
      else if (m.pos.distanceTo(this.drop) > 4) m.goTo(this.drop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, 2 + Math.random() * 2)));
    }
    m.steer(dt, 3.6);
  }
  update(dt) {
    this.time += dt; if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.updateObjective();
    const p = this.g.player.actor;
    if (p.helping) { // walking with a mate: stay close or you let go
      if (p.pos.distanceTo(p.helping.pos) > 5) { toast(`You let go of ${p.helping.name}'s gear…`, 'bad'); p.helping.helper = null; p.helping.helped = false; p.helping = null; p.helped = false; }
    }
    if (this.time > this.target && !this.lateWarned) { this.lateWarned = true; toast('Gates are open and the gear\'s still in the car park! Hurry!', 'bad'); this.g.state.addCrowd(-5); }
  }
  finish() {
    const st = this.g.state, g = this.g;
    if (this.done) return; this.done = true;
    centerMsg('Gear\'s in!', 1600); audio.play('ok');
    const fast = this.time < this.target; if (fast) st.addMateship(5, 'load-in done before the gates opened');
    for (const id of st.bandIds) {
      const m = st.members[id];
      if (m.carried >= 5) st.logEvent(id, 'carried_lots', 'Carried heaps of gear in load-in', true, 0.8);
      else if (m.carried <= 1 && !this.skipped) st.logEvent(id, 'slack_loadin', 'Where were you during load-in?', false, 0.9);
    }
    const drummer = st.lineup.drums; if (st.members[drummer]?.carried >= 6 && !st.members[st.playerId].helped) st.logEvent(drummer, 'drum_burden', 'Carried the whole drum kit, again', true, 0.5);
    for (const m of g.band.list) { m.ai = null; m.stop(); m.carry = null; m.weight = 0; }
    setTimeout(() => g.setPhase('soundcheck'), 1400);
  }
  skip() {
    const w = this.g.world; this.skipped = true;
    for (const it of this.items) { if (it.state === 'stage') continue; it.obj.parent?.remove(it.obj); it.state = 'stage'; if (it.carrier) { it.carrier.carry = null; it.carrier.weight = 0; } }
    for (const k of ['drums', 'amp_lead', 'amp_bass', 'amp_rhythm', 'mic', 'wedges', 'wedge2', 'wedge3']) if (w.stageGear[k]) { w.stageGear[k].visible = true; w.stageGear[k].scale.setScalar(1); }
    this.finish();
  }
  exit() { for (const i of this.items) i.obj.parent?.remove(i.obj); const p = this.g.player.actor; p.carry = null; p.weight = 0; p.helping = null; p.helped = false; }
}
