import * as THREE from 'three';
import { el, layer, toast, centerMsg, showScreen, closeScreen } from '../ui/ui.js';
import { audio } from '../core/audio.js';
import { makeProp } from '../core/assets.js';

const GENERIC_BUN = ['Solid gig, mate', 'Good energy tonight', 'Love your work'];
const GENERIC_PATTY = ['Tighten it up next time', 'Bit sloppy in spots', 'Maybe one less beer'];
const DECOY = { bun: ['Great solo', 'Killer drum fill', 'Saved the gig with that harmony', 'Best tone I\'ve ever heard'], patty: ['You rushed the bridge', 'Where were you during load-in?', 'Turn your amp down', 'You forgot the outro'] };
const CHALLENGE = {
  rushed: 'Hit 85%+ on your first song', noodled: 'Zero noodling in soundcheck', forgot_shout: 'Get everyone in at least one shout', spill: 'Deliver a full round without spilling',
  wrap_wrong: 'Wrap every lead over-under', left_setlist: 'Peel the setlist off before pack-up ends', slack_loadin: 'Carry 5+ weight of gear at load-in', fell: 'Top-of-the-semi climb without falling',
  wet_gear: 'Tarp all the gear if it rains', busted: 'Don\'t get busted by security', canape_wrong: 'Remember who\'s vego', unresolved_sulk: 'Never leave a bandmate sulking', no_capo: 'Find the capo',
};

// Phase 5: the Feedback Burger Circle. Build a burger of buns (positive) and patties (constructive) for each bandmate.
export class Burger {
  constructor(game) { this.g = game; this.roam = false; this.drivePlayer = false; this.bandMode = 'roam'; this.allowSwitch = false; this.stack = []; this.meshes = []; this.results = []; this.idx = 0; }
  async enter() {
    const g = this.g, st = g.state, c = new THREE.Vector3(-6.6, 0, 30.2); // out the back, in the car park by the van
    g.world.circleGrill.position.copy(c); g.npcs.setMode('gig');
    g.input.unlock(); g.hud.setPhase('5 · FEEDBACK BURGER CIRCLE'); g.hud.setHint('Click chips to stack them on the grill · <b>Serve</b> when it\'s right · tall burgers collapse');
    toast('Feedback circle: tap chips to stack. 🟡 bun = good, 🟤 patty = constructive');
    const people = [...g.band.list, g.band.jamie];
    people.forEach((a, i) => { const ang = i / people.length * Math.PI * 2; a.stop(); a.ai = null; a.speed = 0; a.vel.set(0, 0, 0); a.setPos(c.x + Math.sin(ang) * 2.3, 0, c.z + Math.cos(ang) * 2.3); a.faceTowards(c); });
    g.band.jamie.idleOverride = 'idle';
    // keep the circle visible: hide HUD clutter + name tags, shift the camera so the circle sits left of the panel
    g.hud.top.style.display = 'none'; g.hud.phase.style.display = 'none'; g.hud.hint.style.display = 'none'; g.hud.right.style.display = 'none';
    for (const a of [...g.band.list, g.band.jamie]) if (a.tag) a.tag.visible = false;
    this.offset = () => { const w = innerWidth, h = innerHeight, panel = w > 700 ? 300 : 0; if (panel) g.engine.camera.setViewOffset(w, h, panel / 2, 0, w, h); else g.engine.camera.clearViewOffset(); };
    this.offset(); addEventListener('resize', this.offset);
    g.rig.setShot(new THREE.Vector3(c.x + 1.8, 4.6, c.z + 5.6), new THREE.Vector3(c.x, 0.7, c.z));
    this.top = c.clone(); this.top.y = this.grillTop();
    this.tpl = { bun: await makeProp('bun'), patty: await makeProp('patty') };
    audio.play('grill');
    this.recipients = [...st.bandIds.filter(id => id !== st.playerId), 'jamie'];
    this.ui = el('div', { class: 'burger-ui2' }, this.side = el('div', { class: 'burger-card pe' }));
    layer('screen').append(this.ui);
    this.showRecipient();
  }
  grillTop() { const b = new THREE.Box3().setFromObject(this.g.world.circleGrill); return b.max.y + 0.01; }
  update(dt) {
    this.g.player.actor.animate(dt, 'idle');
    for (const m of this.meshes) if (m.userData.vel) { m.userData.vel.y -= 9.8 * dt; m.position.addScaledVector(m.userData.vel, dt); m.rotation.x += dt * 6; if (m.position.y < 0.03) { m.position.y = 0.03; m.userData.vel.multiplyScalar(0.3); m.userData.vel.y = 0; } }
  }
  chipsFor(id) {
    const st = this.g.state, evs = st.eventsFor(id);
    const seen = new Set(), acc = [];
    for (const e of evs.sort((a, b) => b.weight - a.weight)) { if (seen.has(e.type)) continue; seen.add(e.type); acc.push({ text: e.text, kind: e.positive ? 'bun' : 'patty', accurate: true, weight: e.weight }); if (acc.length >= 5) break; }
    if (!acc.some(c => c.kind === 'bun')) acc.push({ text: GENERIC_BUN[Math.floor(Math.random() * 3)], kind: 'bun', accurate: true, weight: 0.3, generic: true });
    if (!acc.some(c => c.kind === 'patty')) acc.push({ text: GENERIC_PATTY[Math.floor(Math.random() * 3)], kind: 'patty', accurate: true, weight: 0.3, generic: true });
    // decoys: things that didn't happen for this person
    const others = st.log.filter(e => e.who !== id && !evs.some(x => x.type === e.type));
    const decoys = [];
    for (let i = 0; i < 2; i++) {
      const o = others[Math.floor(Math.random() * others.length)];
      if (o && !decoys.some(d => d.text === o.text)) decoys.push({ text: o.text, kind: o.positive ? 'bun' : 'patty', accurate: false });
      else { const k = Math.random() < 0.5 ? 'bun' : 'patty'; decoys.push({ text: DECOY[k][Math.floor(Math.random() * 4)], kind: k, accurate: false }); }
    }
    return [...acc, ...decoys].sort(() => Math.random() - 0.5);
  }
  showRecipient() {
    const st = this.g.state, id = this.recipients[this.idx]; if (!id) return this.receive();
    const who = st.member(id), a = this.g.band.get(id);
    this.chips = this.chipsFor(id); this.clearStack();
    this.g.labels.bubble(a.group, 'Go on then…', 1800);
    this.render(who);
  }
  render(who) { // compact card on the right: who it's for, chips, three small buttons
    const s = this.side; s.innerHTML = '';
    s.append(el('div', { class: 'bc-head' }, el('b', {}, `🍔 ${who.name.split(' ')[0]}`), el('span', { class: 'small' }, ` ${this.idx + 1}/${this.recipients.length}`),
      el('span', { class: 'spacer' }), el('button', { class: 'bc-icon', title: 'Zoom (V)', onclick: () => this.g.toggleZoom() }, '🔭')));
    const chips = el('div', { class: 'chips' });
    this.chips.forEach(c => {
      const row = el('div', { class: `fchip ${c.kind}${this.stack.includes(c) ? ' used' : ''}`, title: c.text }, el('span', { class: 'dot' }), el('span', { class: 'ft' }, c.text));
      row.addEventListener('click', () => this.add(c, who)); chips.append(row);
    });
    s.append(chips, el('div', { class: 'bc-row' },
      el('button', { class: 'bc-icon', title: 'Undo', onclick: () => { this.stack.pop(); this.rebuildMeshes(); this.render(who); } }, '↩'),
      el('button', { class: 'bc-icon', title: 'Clear', onclick: () => { this.clearStack(); this.render(who); } }, '🗑'),
      el('button', { class: 'btn red bc-serve', disabled: this.stack.length ? false : 'disabled', onclick: () => this.serve(who) }, 'Serve'),
      el('button', { class: 'bc-icon', title: 'Skip the rest', onclick: () => this.skip() }, '⏭')));
  }
  add(c, who) {
    if (this.stack.includes(c)) return;
    this.stack.push(c); audio.play('click'); this.addMesh(c.kind);
    if (this.stack.length > 7) { this.collapse(who); return; }
    this.render(who);
  }
  addMesh(kind) {
    const m = this.tpl[kind].clone(true); m.scale.setScalar(2.2);
    const h = this.meshes.reduce((s, x) => s + x.userData.h, 0);
    const box = new THREE.Box3().setFromObject(m), hh = box.max.y - box.min.y;
    m.position.set(this.top.x + (Math.random() - 0.5) * 0.04 * this.meshes.length, this.top.y + h - box.min.y + 0.002, this.top.z); m.rotation.y = Math.random() * 6;
    m.userData.h = hh; this.g.world.root.add(m); this.meshes.push(m); audio.play('drop', { vol: 0.4 });
  }
  rebuildMeshes() { for (const m of this.meshes) m.parent?.remove(m); this.meshes = []; for (const c of this.stack) this.addMesh(c.kind); }
  clearStack() { this.stack = []; for (const m of this.meshes) m.parent?.remove(m); this.meshes = []; }
  collapse(who) {
    audio.play('collapse'); centerMsg('TOO TALL! 🍔💥', 1400);
    for (const m of this.meshes) m.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.g.state.score.burger -= 5; this.g.state.logEvent(this.g.state.playerId, 'tower', 'Built a burger so tall it fell over', false, 0.2);
    const ms = this.meshes; this.meshes = []; this.stack = [];
    setTimeout(() => { for (const m of ms) m.parent?.remove(m); this.render(who); }, 1800);
    this.render(who);
  }
  serve(who) {
    const st = this.g.state, S = this.stack, id = this.recipients[this.idx];
    const buns = S.filter(c => c.kind === 'bun').length, patties = S.length - buns, acc = S.filter(c => c.accurate && !c.generic).length, wrong = S.filter(c => !c.accurate).length;
    let score = acc * 10 - wrong * 7 + S.filter(c => c.generic).length * 2;
    const balanced = buns > 0 && patties > 0; if (balanced) score += 8;
    const classic = S.length === 3 && S[0].kind === 'bun' && S[1].kind === 'patty' && S[2].kind === 'bun';
    if (classic) { score += 6; if (S.every(c => c.accurate)) st.unlock('balanced'); }
    const verdict = !balanced && S.length >= 2 ? (patties === 0 ? 'soft' : 'harsh') : 'ok';
    st.mood(id, buns * 3 - patties * 1.5 + acc * 2 - wrong * 3);
    const a = this.g.band.get(id);
    const line = wrong > acc ? 'That… didn\'t happen?' : verdict === 'soft' ? 'All buns? You\'re too nice, mate.' : verdict === 'harsh' ? 'Brutal. Noted.' : classic ? 'A classic. Bun, patty, bun. Respect.' : acc >= 2 ? 'Fair. Very fair.' : 'Cheers, I think.';
    this.g.labels.bubble(a.group, line, 2400);
    if (verdict === 'harsh') st.addMateship(-4, 'all-patty burger');
    this.results.push({ id, score, verdict, stack: S.slice() });
    st.score.burger += score; audio.play(score > 15 ? 'ok' : 'click');
    toast(`${who.name}'s burger: ${score >= 0 ? '+' : ''}${score} pts${verdict === 'soft' ? ' (too soft)' : verdict === 'harsh' ? ' (too harsh)' : ''}`, score > 10 ? 'good' : score < 0 ? 'bad' : '');
    this.idx++; setTimeout(() => this.showRecipient(), 900);
  }
  receive() {
    if (this.received) return; this.received = true;
    const g = this.g, st = g.state, me = st.playerId, mine = st.eventsFor(me);
    this.clearStack();
    // traits from how you gave feedback
    const soft = this.results.filter(r => r.verdict === 'soft').length, harsh = this.results.filter(r => r.verdict === 'harsh').length;
    const half = this.results.length / 2;
    let trait = null; if (soft > half) trait = 'too_soft'; else if (harsh > half) trait = 'too_harsh';
    if (trait) st.save.traits[me] = trait; else delete st.save.traits[me];
    if (trait === 'too_harsh') st.addMateship(-6, 'Too Harsh: band morale dips');
    // burgers you receive
    const givers = [...st.bandIds.filter(id => id !== me), 'jamie'];
    const pos = mine.filter(e => e.positive).sort((a, b) => b.weight - a.weight), neg = mine.filter(e => !e.positive).sort((a, b) => b.weight - a.weight);
    const received = givers.map((gid, i) => {
      const mood = st.members[gid]?.mood ?? 60; const items = [];
      const p1 = pos[i % Math.max(1, pos.length)], n1 = neg[i % Math.max(1, neg.length)];
      items.push(p1 ? { kind: 'bun', text: p1.text } : { kind: 'bun', text: GENERIC_BUN[i % 3] });
      if (n1 && (mood < 75 || i % 2 === 0)) items.push({ kind: 'patty', text: n1.text, type: n1.type });
      if (mood >= 55) items.push({ kind: 'bun', text: pos[(i + 1) % Math.max(1, pos.length)]?.text || 'Top bloke' });
      if (gid === 'jamie') { const nd = mine.find(e => e.type === 'noodled'); if (nd) items.splice(1, 0, { kind: 'patty', text: 'ONE. AT. A. TIME.', type: 'noodled' }); const sj = mine.find(e => e.type === 'shouted_jamie'); if (sj) items.unshift({ kind: 'bun', text: 'Thanks for the beer at the desk' }); }
      const seen = new Set(); return { gid, items: items.filter(x => { const k = x.type === 'noodled' ? 'noodled' : x.text; if (seen.has(k)) return false; seen.add(k); return true; }) };
    });
    // buffs & practice challenges for next gig
    const buns = received.reduce((s, r) => s + r.items.filter(x => x.kind === 'bun').length, 0);
    const challenges = [...new Set(received.flatMap(r => r.items.filter(x => x.kind === 'patty' && CHALLENGE[x.type]).map(x => CHALLENGE[x.type])))].slice(0, 3);
    const buff = { mood: Math.min(15, buns * 1.5), timing: mine.some(e => e.type === 'great_song') ? 0.05 : 0 };
    st.save.buffs[me] = buff; st.save.challenges = challenges; st.persist();
    const box = el('div', { class: 'panel menu' }, el('h2', {}, 'Your burgers'));
    for (const r of received) box.append(el('div', { class: 'stat-row', style: { alignItems: 'flex-start' } }, el('span', {}, `From ${st.member(r.gid).name}`), el('span', { style: { textAlign: 'right', maxWidth: '65%' } }, ...r.items.map(x => el('div', {}, `${x.kind === 'bun' ? '🟡' : '🟤'} ${x.text}`)))));
    box.append(...[el('h3', { style: { marginTop: '12px' } }, 'Next gig'),
      el('div', {}, `🟡 Buffs: +${Math.round(buff.mood)} band mood${buff.timing ? ', +5% timing window' : ''}`),
      el('div', {}, `🎯 Practice challenges: ${challenges.length ? challenges.join(' · ') : 'none. Legend.'}`),
      trait ? el('div', { style: { marginTop: '6px' } }, el('span', { class: 'trait' }, trait === 'too_soft' ? 'TOO SOFT: your praise counts for less next time' : 'TOO HARSH: band morale dropped')) : null,
      el('div', { class: 'row', style: { marginTop: '12px' } }, el('div', { class: 'spacer' }), el('button', { class: 'btn red', onclick: () => { closeScreen(); g.setPhase('results'); } }, 'Gig results ▶'))].filter(Boolean));
    this.ui.remove(); showScreen(box);
  }
  skip() { if (this.received) { closeScreen(); this.g.setPhase('results'); } else this.receive(); }
  exit() { removeEventListener('resize', this.offset); this.g.engine.camera.clearViewOffset(); this.g.hud.top.style.display = ''; this.g.hud.phase.style.display = ''; this.g.hud.right.style.display = ''; this.ui?.remove(); this.clearStack(); }
}
