import * as THREE from 'three';
import { el, showScreen, closeScreen, toast, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

const CAPO_SPOTS = [[-5.8, 1.36, -0.9], [4.9, 1.36, -0.8], [-14.5, 0.02, 11.5], [2.5, 0.02, 12.8], [9.8, 0.02, 4.8], [-9.6, 0.02, 3.4]];

// Phase 4: Pack-up. Tired, probably buzzing. Wrap leads over-under, find the capo, grab the setlist, load the van.
export class PackUp {
  constructor(game) { this.g = game; this.roam = true; this.bandMode = 'roam'; this.allowBets = true; this.crowdMode = 'mingle'; this.raceAt = 40; this.time = 0; this.limit = game.state.settings.shortGig ? 180 : 240; this.gearLeft = 0; this.wrapErrors = 0; }
  enter() {
    const g = this.g, st = g.state, w = g.world;
    g.rig.mode = 'follow'; g.npcs.setMode('mingle');
    g.hud.setPhase('4 · PACK-UP');
    g.hud.setHint('<b>E</b> wrap leads / grab gear / pick up · Buzz makes everything wobblier · <b>Tab</b> swap bandmate');
    g.band.list.forEach(m => { g.band.gearUp(m, 'back'); });
    const p = g.player.actor; const s = g.band.slotPos(st.slotOf(st.playerId)); p.setPos(s.x, s.y, s.z + 0.4); g.rig.yaw = 0.3; g.rig.pitch = 0.45;
    // cables
    this.cables = w.cables.map((o, i) => { o.visible = true; const c = { o, done: false, i }; g.interact.add({ id: 'cable_' + i, tag: 'phase', pos: () => o.position, radius: 1.4, dy: 1, label: () => c.done ? null : 'Wrap this lead (over-under!)', action: () => this.wrap(c) }); return c; });
    // the lost capo
    const spot = CAPO_SPOTS[Math.floor(Math.random() * CAPO_SPOTS.length)];
    import('../core/assets.js').then(async ({ makeProp }) => {
      const capo = await makeProp('capo'); capo.position.set(...spot); capo.scale.setScalar(2.2); w.root.add(capo); this.capo = capo;
      const glow = new THREE.PointLight(0xffd36b, 2.5, 3); glow.position.set(0, 0.3, 0); capo.add(glow);
      g.interact.add({ id: 'capo', tag: 'phase', pos: () => this.capo?.parent ? this.capo.position : null, radius: 1.5, dy: 1, priority: 2, label: () => 'Pick up the lost capo!', action: () => this.foundCapo() });
    });
    // setlist taped to the floor
    const sl = w.stageGear.setlist; this.setlistDone = !sl.visible;
    g.interact.add({ id: 'setlist', tag: 'phase', pos: () => sl.visible ? sl.position : null, radius: 1.4, dy: 1, priority: 1, label: () => 'Peel the setlist off the floor', action: () => { sl.visible = false; this.setlistDone = true; audio.play('pickup'); toast('Setlist peeled off. Souvenir for Scotty\'s fridge.', 'good'); st.logEvent(st.playerId, 'setlist', 'Remembered the setlist taped to the floor', true, 0.4); this.updateObjective(); } });
    // gear back to the van
    this.gearKeys = ['amp_lead', 'amp_bass', 'amp_rhythm', 'drums', 'mic', 'wedges', 'wedge2', 'wedge3'].filter(k => w.stageGear[k]?.visible);
    this.gearLeft = this.gearKeys.length;
    g.interact.add({ id: 'grab_gear', tag: 'phase', pos: () => w.m('poi_stage_load'), radius: 2.6, label: () => this.gearLeft > 0 && !g.player.actor.carry ? `Carry gear to the van (${this.gearLeft} left)` : null, action: () => this.grab(g.player.actor) });
    g.interact.add({ id: 'van_drop', tag: 'phase', pos: () => w.m('poi_van'), radius: 3.4, priority: 2, label: () => g.player.actor.carry ? `Load the ${g.player.actor.carry.label} into the van` : null, action: () => this.load(g.player.actor) });
    this.onSwitch(st.playerId); this.updateObjective();
    toast('Pack-up! Everyone\'s tired. Wrap leads properly or the drummer gets cranky.');
  }
  onSwitch(id) { for (const m of this.g.band.list) m.ai = m.id === id ? null : (dt => this.ai(m, dt)); }
  updateObjective() {
    const left = this.cables.filter(c => !c.done).length; const t = Math.max(0, Math.ceil(this.limit - this.time));
    this.g.setObjective(`Pack-up (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}): wrap <b>${left}</b> leads · ${this.capoFound ? '✔ capo' : 'find the <b>lost capo</b>'} · ${this.setlistDone ? '✔ setlist' : 'peel the <b>setlist</b> off the floor'} · <b>${this.gearLeft}</b> gear to the van${this.g.band.members.dunny && !this.g.band.members.dunny.beretOn ? ' · <b>Dunny\'s beret!</b>' : ''}`);
  }
  ai(m, dt) {
    const w = this.g.world;
    if (m.carry && m.pos.distanceTo(w.m('poi_van').add(new THREE.Vector3(-3, 0, -1.5))) < 2) { m.stop(); this.load(m); return; }
    if (!m.carry && this.gearLeft > 0 && m.pos.distanceTo(w.m('poi_stage_load')) < 1.8) { m.stop(); this.grab(m); return; }
    if (m.carry) { if (!m.target) m.goTo(w.m('poi_van').add(new THREE.Vector3(-3, 0, -1.5)), () => this.load(m), m.pos.z < 20 ? [new THREE.Vector3(-9.2, 0, 5), new THREE.Vector3(-13.6, 0, 20)] : null); m.steer(dt, 2.6); return; }
    if (!m.target) {
      if (this.gearLeft > 0) m.goTo(w.m('poi_stage_load'), () => this.grab(m), m.pos.z > 20 ? [new THREE.Vector3(-13.6, 0, 20), new THREE.Vector3(-9.2, 0, 5)] : null);
      else if (m.pos.distanceTo(w.m('poi_burger_circle')) > 3) m.goTo(w.m('poi_burger_circle').add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, 1.5)));
    }
    m.steer(dt, 2.0);
  }
  grab(a) {
    if (a.carry || this.gearLeft <= 0) return;
    const w = this.g.world, k = this.gearKeys.shift(); if (!k) return; this.gearLeft--;
    const o = w.stageGear[k]; o.visible = false;
    const label = { amp_lead: 'lead amp', amp_bass: 'bass rig', amp_rhythm: 'rhythm amp', drums: 'drum kit', mic: 'mic stand', wedges: 'wedge', wedge2: 'wedge', wedge3: 'wedge' }[k];
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.6 })); box.castShadow = true;
    const sock = a.model.nodes['socket_carry']; if (sock) sock.add(box); else { a.group.add(box); box.position.set(0, 1, 0.45); }
    a.carry = { label, obj: box, weight: k === 'drums' || k.startsWith('amp') ? 3 : 1 }; a.weight = a.carry.weight;
    if (a.id === this.g.state.playerId) audio.play('pickup');
    this.updateObjective();
  }
  load(a) {
    if (!a.carry) return; const st = this.g.state;
    a.carry.obj.parent?.remove(a.carry.obj); if (st.members[a.id]) st.members[a.id].packed = (st.members[a.id].packed || 0) + a.carry.weight;
    a.carry = null; a.weight = 0; if (a.id === st.playerId) audio.play('drop');
    this.updateObjective(); this.check();
  }
  wrap(c) {
    const g = this.g, st = g.state; g.player.enabled = false;
    const total = 8; let n = 0, errs = 0; const wobbly = st.buzz > 55;
    const prompt = el('div', { style: { fontSize: '42px', fontWeight: 900, margin: '14px 0' } });
    const info = el('div', { class: 'small' });
    const show = () => {
      const want = n % 2 === 0 ? 'OVER' : 'UNDER';
      // when you're buzzing, the prompt sometimes lies for a split second
      const shown = wobbly && Math.random() < (st.buzz - 55) / 120 ? (want === 'OVER' ? 'UNDER' : 'OVER') : want;
      prompt.innerHTML = `${shown === 'OVER' ? '⤴️' : '⤵️'} ${shown}`; prompt.dataset.want = want;
      info.textContent = `Loop ${n + 1}/${total} · A = over · D = under${wobbly ? ' · (you\'re a bit wobbly…)' : ''}`;
    };
    showScreen(el('div', { class: 'panel mini' }, el('h2', {}, '🔌 Over-under wrap'), el('div', { class: 'small' }, 'Alternate over and under, or the lead kinks and the drummer loses it.'), prompt, info));
    show();
    const h = e => {
      if (!['KeyA', 'KeyD'].includes(e.code)) return;
      const want = prompt.dataset.want, got = e.code === 'KeyA' ? 'OVER' : 'UNDER';
      if (want === got) { audio.play('click'); n++; } else { errs++; audio.play('bad'); n++; }
      if (n >= total) { window.removeEventListener('keydown', h); setTimeout(() => this.wrapDone(c, errs), 200); } else show();
    };
    window.addEventListener('keydown', h);
  }
  wrapDone(c, errs) {
    if (this.g.phase !== this) return;
    const g = this.g, st = g.state; closeScreen(); g.player.enabled = true; c.done = true; c.o.visible = false;
    const drummer = st.lineup.drums;
    if (errs) { this.wrapErrors += errs; st.mood(drummer, -6); g.labels.bubble(g.band.get(drummer).group, 'THAT\'S NOT OVER-UNDER!', 2000); st.logEvent(st.playerId, 'wrap_wrong', 'Wrapped a lead wrong. Drummer fuming.', false, 0.7); toast(`Kinked lead! ${st.member(drummer).name} is fuming.`, 'bad'); }
    else { st.addMateship(2, 'perfect over-under'); st.logEvent(st.playerId, 'wrap_good', 'Wrapped the leads properly', true, 0.5); }
    if (this.cables.every(x => x.done) && this.wrapErrors === 0) st.unlock('over_under');
    this.updateObjective(); this.check();
  }
  foundCapo() {
    const st = this.g.state; this.capo.parent.remove(this.capo); this.capoFound = true; audio.play('ok');
    toast('Found the capo! Scotty owes you a beer.', 'good'); st.addMateship(3, 'found the lost capo'); st.logEvent(st.playerId, 'capo', 'Found the lost capo', true, 0.6);
    this.updateObjective(); this.check();
  }
  check() {
    if (this.done) return;
    if (this.cables.every(c => c.done) && this.capoFound && this.setlistDone && this.gearLeft <= 0 && !this.g.band.list.some(m => m.carry)) this.finish();
  }
  update(dt) {
    this.time += dt; if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.updateObjective();
    if (this.raceAt > 0 && this.time > this.raceAt) { this.raceAt = -1; this.g.roam.startRace(); }
    // AI wrap leads too (but the player is expected to do some)
    if (Math.random() < dt * 0.02) { const c = this.cables.find(x => !x.done); if (c && this.cables.filter(x => x.done).length < 2) { c.done = true; c.o.visible = false; this.updateObjective(); this.check(); } }
    if (this.time > this.limit) this.finish();
  }
  finish() {
    if (this.done) return; this.done = true; const st = this.g.state, g = this.g;
    if (!this.skipped && !this.capoFound) st.logEvent(st.playerId, 'no_capo', 'Lost the capo. Again.', false, 0.4);
    if (!this.skipped && !this.setlistDone) st.logEvent(st.playerId, 'left_setlist', 'Left the setlist taped to the floor', false, 0.5);
    if (!this.skipped && this.cables.some(c => !c.done)) st.logEvent(st.playerId, 'left_leads', 'Left leads on the stage', false, 0.5);
    for (const id of st.bandIds) { const m = st.members[id]; if ((m.packed || 0) >= 4) st.logEvent(id, 'packed', 'Did the heavy lifting at pack-up', true, 0.6); }
    centerMsg('Van\'s packed!', 1600); audio.play('ok');
    setTimeout(() => g.setPhase('burger'), 1500);
  }
  skip() { closeScreen(); this.g.player.enabled = true; this.skipped = true; for (const k of this.gearKeys || []) if (this.g.world.stageGear[k]) this.g.world.stageGear[k].visible = false; this.cables.forEach(c => c.o.visible = false); this.finish(); }
  exit() { for (const m of this.g.band.list) { m.ai = null; if (m.carry) { m.carry.obj?.parent?.remove(m.carry.obj); m.carry = null; m.weight = 0; } } this.capo?.parent?.remove(this.capo); }
}
