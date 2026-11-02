import * as THREE from 'three';

const INSTRUMENT = { lead: 'guitar_lead', rhythm: 'guitar_rhythm', bass: 'bass' };
const PLAY_ANIM = { vocals: 'sing', lead: 'play_guitar', rhythm: 'play_guitar', bass: 'play_bass', drums: 'play_drums' };

function stick() {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.4, 6).rotateZ(Math.PI / 2).translate(0.15, 0, 0), new THREE.MeshStandardMaterial({ color: 0xe8c99a, roughness: 0.6 }));
  g.castShadow = true; return g;
}
function handMic() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.16, 8).rotateZ(Math.PI / 2).translate(0.06, 0, 0), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  const grill = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8).translate(0.15, 0, 0), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 }));
  g.add(body, grill); g.traverse(o => o.castShadow = true); return g;
}

// The five band members + Jamie, with simple AI per gig phase.
export class Band {
  constructor(world, state, labels) { this.world = world; this.state = state; this.labels = labels; this.members = {}; this.jamie = null; }
  async spawn() {
    const st = this.state, w = this.world, spawn = w.m('spawn_band');
    let i = 0;
    for (const { slot, id } of st.band) {
      const m = st.member(id); const base = st.member(m.model)?.height || 1.8;
      const a = await w.spawnActor({ id, name: m.name, modelId: m.model, tint: m.tint || null, height: m.height, baseHeight: base });
      a.slot = slot; a.member = m; a.setPos(spawn.x + (i - 2) * 1.3, 0, spawn.z - 1.2 - (i % 2) * 0.9); a.face(Math.PI);
      a.tag = this.labels.add(a.group, m.name, { offset: m.height + 0.3 });
      this.members[id] = a; i++;
      if (id === 'dunny') { a.beret = a.model.nodes['Beret'] || null; a.beretOn = true; }
    }
    const j = st.member('jamie');
    this.jamie = await w.spawnActor({ id: 'jamie', name: 'Jamie', modelId: 'jamie', height: 1.8, baseHeight: 1.8 });
    const desk = w.m('poi_mixing_desk'); this.jamie.setPos(desk.x, 0, desk.z + 0.6); this.jamie.face(Math.PI); this.jamie.idleAnim = 'mix';
    this.jamie.tag = this.labels.add(this.jamie.group, 'Jamie (sound)', { offset: 2.1 });
    this.jamie.member = j;
  }
  get list() { return Object.values(this.members); }
  all() { return [...this.list, this.jamie]; }
  get(id) { return id === 'jamie' ? this.jamie : this.members[id]; }
  slotPos(slot) { const p = this.world.m('slot_' + slot); if (slot === 'drums') p.z -= 0.45; return p; }

  async gearUp(a, mode) { // mode: 'back' (walking around), 'play', 'none'
    const inst = INSTRUMENT[a.slot];
    a.detach('inst'); a.detach('stickL'); a.detach('stickR'); a.detach('mic');
    if (mode === 'none') return;
    if (inst) await a.attach(inst, mode === 'play' ? 'socket_guitar' : 'socket_back', 'inst');
    if (mode === 'play' && a.slot === 'drums') { await a.attach('drumstick', 'socket_grip_L', 'stickL'); await a.attach('drumstick', 'socket_grip_R', 'stickR'); }
    if (mode === 'play' && a.slot === 'vocals') await a.attach('mic', 'socket_grip_R', 'mic');
  }
  async toStage(instant = false) { // everyone to their slot, ready to play
    for (const a of this.list) {
      const p = this.slotPos(a.slot); a.stop();
      if (instant) { a.setPos(p.x, p.y, p.z); a.face(0); }
      await this.gearUp(a, 'play');
      a.playAnim = PLAY_ANIM[a.slot];
    }
  }
  playAnimFor(a) { return PLAY_ANIM[a.slot]; }
  // ---------- AI ----------
  update(dt, t, controlledId, phase) {
    for (const a of this.list) {
      if (a.id === controlledId) continue;
      if (a.ai) a.ai(dt, t); else a.steer(dt, 1.8);
      if (a.climbing) { a.model.update(dt); continue; }
      let override;
      if (phase === 'gig' && !a.target) { override = a.playAnim; if (!a.away) a.face(0); }
      if (a.drinking > 0) { a.drinking -= dt; override = 'drink'; }
      a.animate(dt, override);
    }
    if (this.jamie) { this.jamie.steer(dt, 1.6); this.jamie.animate(dt, this.jamie.target ? undefined : this.jamie.idleOverride || 'mix'); }
    // Dunny without beret: sad bubble occasionally
    const d = this.members.dunny;
    if (d && !d.beretOn && Math.random() < dt * 0.15) this.labels.bubble(d.group, 'Where\'s me beret?!', 1800);
  }
  knockBeret() {
    const d = this.members.dunny; if (!d || !d.beretOn || !d.beret) return null;
    d.beretOn = false; const world = new THREE.Vector3(); d.beret.getWorldPosition(world);
    d.beret.parent.remove(d.beret); this.world.root.add(d.beret);
    const land = new THREE.Vector3(world.x + (Math.random() - 0.5) * 6, 0, world.z + 2 + Math.random() * 4);
    land.y = this.world.groundAt(land.x, land.z, 2) + 0.05;
    d.beret.position.copy(land); d.beret.rotation.set(0.3, Math.random() * 6, 0.2); d.beret.scale.setScalar(d.model.root.scale.x);
    this.state.logEvent('dunny', 'beret_lost', 'Lost the beret mid-song', false, 0.5);
    return d.beret;
  }
  restoreBeret() {
    const d = this.members.dunny; if (!d || d.beretOn || !d.beret) return;
    d.beret.parent?.remove(d.beret); d.beret.position.set(0, 0, 0); d.beret.rotation.set(0, 0, 0); d.beret.scale.setScalar(1);
    (d.beretLocal?.parent || d.model.nodes['head'] || d.model.root).add(d.beret);
    // restore original local transform if we stored it
    if (d.beretLocal) { d.beret.position.copy(d.beretLocal.p); d.beret.quaternion.copy(d.beretLocal.q); d.beret.scale.copy(d.beretLocal.s); }
    d.beretOn = true;
  }
  rememberBeret() { const d = this.members.dunny; if (d?.beret) d.beretLocal = { parent: d.beret.parent, p: d.beret.position.clone(), q: d.beret.quaternion.clone(), s: d.beret.scale.clone() }; }
}
