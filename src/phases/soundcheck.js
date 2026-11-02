import * as THREE from 'three';
import { el, showScreen, closeScreen, toast, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

const CALLS = { drums: ['Kick drum!', 'Snare!', 'Toms, one at a time!'], bass: ['Bass, give us an E.'], rhythm: ['Rhythm guitar, chug us something.'], lead: ['Scotty, keep it under ten minutes.'], vocals: ['Vocals. Check one two.'] };
const ORDER = ['drums', 'bass', 'rhythm', 'lead', 'vocals'];
const NOODLE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'Space'];

// Phase 2: Setup & Soundcheck. Jamie runs it one at a time; mini-games for your instrument; don't noodle.
export class Soundcheck {
  constructor(game) { this.g = game; this.roam = true; this.bandMode = 'roam'; this.stage = 'walk'; this.turn = -1; this.timer = 0; this.marker = null; }
  enter() {
    const g = this.g, st = g.state;
    g.hud.setPhase('2 · SETUP & SOUNDCHECK');
    g.hud.setHint('<b>Get to your spot</b> (glowing ring) · during others\' checks keep your hands off <b>D F J K / Space</b> · <b>Esc</b> pause');
    g.setObjective('Head up the ramp onto the semi and stand on your spot. Jamie\'s waiting.');
    const ramp = [new THREE.Vector3(-10.2, 0, 0.6), new THREE.Vector3(-6.2, 1.35, 0.6)];
    for (const m of g.band.list) { if (m.id === st.playerId) continue; const s = g.band.slotPos(m.slot); m.goTo(s, a => a.face(0), [...ramp, new THREE.Vector3(s.x, 1.35, 0.9)]); }
    g.band.list.forEach(m => g.band.gearUp(m, 'back'));
    const slot = g.band.slotPos(st.slotOf(st.playerId));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2a91a, transparent: true, opacity: 0.9 }));
    ring.position.set(slot.x, 1.37, slot.z); g.world.root.add(ring); this.marker = ring; this.slot = slot;
  }
  onSwitch() { return false; }
  get allowSwitch() { return this.stage === 'walk'; }
  update(dt, t) {
    const g = this.g, st = g.state, p = g.player.actor;
    if (this.marker) this.marker.material.opacity = 0.6 + Math.sin(t * 5) * 0.3;
    if (this.stage === 'walk') {
      // AI that aren't walking: send them too (e.g. after a Tab swap)
      for (const m of g.band.list) if (m.id !== st.playerId && !m.target && m.pos.distanceTo(g.band.slotPos(m.slot)) > 0.6) { const s = g.band.slotPos(m.slot); m.goTo(s, a => a.face(0), [new THREE.Vector3(-10.2, 0, 0.6), new THREE.Vector3(-6.2, 1.35, 0.6), new THREE.Vector3(s.x, 1.35, 0.9)]); }
      if (p.pos.distanceTo(this.slot) < 0.7 && Math.abs(p.pos.y - 1.35) < 0.3) this.begin();
      return;
    }
    if (this.stage === 'check') {
      p.animate(dt, p.playAnim);
      this.timer -= dt;
      if (this.aiTurn && this.timer > 0) this.aiSounds(dt);
      if (this.aiTurn && this.timer <= 0) this.next();
      // AI noodlers: unreliable members sometimes noodle out of turn
      for (const m of g.band.list) {
        if (m.id === st.playerId || m.slot === ORDER[this.turn]) continue;
        const rel = st.member(m.id).stats.reliability; if (Math.random() < dt * (100 - rel) / 2200) this.noodle(m.id);
      }
    }
  }
  begin() {
    const g = this.g, st = g.state, p = g.player.actor;
    this.stage = 'check'; this.marker.parent.remove(this.marker); this.marker = null;
    g.band.list.forEach(m => { m.stop(); const s = g.band.slotPos(m.slot); m.setPos(s.x, s.y, s.z); m.face(0); g.band.gearUp(m, 'play'); m.playAnim = g.band.playAnimFor(m); });
    p.face(0); this.roam = false; g.rig.mode = 'shot';
    g.rig.setShot(new THREE.Vector3(2, 3.6, 9.5), new THREE.Vector3(-0.5, 2.1, 0));
    g.labels.bubble(g.band.jamie.group, 'Right. ONE AT A TIME!', 2600); audio.say('Right. One at a time!');
    this.bandMode = 'gig'; this.drivePlayer = false;
    setTimeout(() => this.next(), 2000);
  }
  next() {
    if (this.g.phase !== this || this.done) return;
    const g = this.g, st = g.state;
    this.turn++;
    if (this.turn >= ORDER.length) return this.finish();
    const slot = ORDER[this.turn], who = st.lineup[slot], line = CALLS[slot][0];
    g.labels.bubble(g.band.jamie.group, line, 2400); audio.say(line);
    g.setObjective(`Soundcheck: <b>${st.member(who).name}</b>${who === st.playerId ? ' — that\'s you!' : '. Hands OFF your instrument until it\'s your turn.'}`);
    if (who === st.playerId) { this.aiTurn = false; setTimeout(() => this.miniGames(slot), 900); }
    else { this.aiTurn = true; this.timer = 3.2; this.aiSlot = slot; this.aiT = 0; const a = g.band.get(who); a.playAnim = g.band.playAnimFor(a); }
  }
  aiSounds(dt) {
    this.aiT -= dt; if (this.aiT > 0) return;
    const now = audio.now, s = this.aiSlot;
    if (s === 'drums') { this.aiT = 0.45; audio.tone(now, 150, 0.3, { gain: 0.8, slideTo: 42 }); }
    else if (s === 'bass') { this.aiT = 0.5; audio.tone(now, 41.2, 0.45, { type: 'sawtooth', gain: 0.25 }); }
    else if (s === 'rhythm' || s === 'lead') { this.aiT = s === 'lead' ? 0.18 : 0.4; audio.tone(now, s === 'lead' ? 440 * Math.pow(2, Math.floor(Math.random() * 8) / 12) : 110, 0.3, { type: 'sawtooth', gain: 0.08 }); }
    else { this.aiT = 0.8; }
  }
  onKey(code) {
    if (this.stage !== 'check' || !this.aiTurn) return false;
    if (NOODLE_KEYS.includes(code)) { this.noodle(this.g.state.playerId); return true; }
    return false;
  }
  noodle(id) {
    const g = this.g, st = g.state, now = performance.now();
    if (this.lastNoodle && now - this.lastNoodle < 1500) return; this.lastNoodle = now;
    audio.tone(audio.now, 330, 0.25, { type: 'sawtooth', gain: 0.07 });
    g.labels.bubble(g.band.jamie.group, `${st.member(id).name.split(' ')[0].toUpperCase()}! ONE AT A TIME!`, 2200); audio.say('One at a time!', { force: true });
    st.mix[id] = Math.max(0.6, (st.mix[id] || 1) - 0.12); st.members[id].noodled++; st.mood('jamie', -4);
    if (id === st.playerId) toast('Jamie turned you down in the mix for noodling. 🔉', 'bad');
    st.logEvent(id, 'noodled', 'Noodled during soundcheck', false, 0.7);
  }
  miniGames(slot) {
    const games = [() => this.plugIn(), () => this.tune(slot), () => this.level()];
    let score = 0, i = 0;
    const run = () => { if (this.g.phase !== this) return; if (i >= games.length) { closeScreen(); this.playerDone(score / games.length); return; } games[i++]().then(s => { score += s; run(); }); };
    run();
  }
  plugIn() {
    return new Promise(res => {
      const keys = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'], seq = Array.from({ length: 4 }, () => keys[Math.floor(Math.random() * keys.length)]);
      let idx = 0, errs = 0; const t0 = performance.now();
      const seqEl = el('div', { class: 'seq' }, ...seq.map(k => el('span', { class: 'kbd' }, k.replace('Key', ''))));
      showScreen(el('div', { class: 'panel mini' }, el('h2', {}, '🔌 Plug in your lead'), el('div', { class: 'small' }, 'Type the sequence. Lead → pedal → pedal → amp.'), seqEl));
      const h = e => {
        if (e.code === seq[idx]) { seqEl.children[idx].classList.add('done'); idx++; audio.play('click'); if (idx >= seq.length) { done(); } }
        else if (/^Key/.test(e.code)) { errs++; audio.play('clunk'); }
      };
      const done = () => { window.removeEventListener('keydown', h); const s = Math.max(0.3, 1 - errs * 0.2 - Math.max(0, (performance.now() - t0) / 1000 - 3) * 0.1); setTimeout(() => res(s), 250); };
      window.addEventListener('keydown', h);
    });
  }
  tune(slot) {
    return new Promise(res => {
      const needle = el('div', { class: 'needle' }), zone = el('div', { class: 'zone', style: { left: '44%', width: '12%' } });
      const info = el('div', { class: 'small' }, 'Press SPACE when the needle is in the green. 3 strings.');
      showScreen(el('div', { class: 'panel mini' }, el('h2', {}, slot === 'drums' ? '🥁 Tighten the snare' : slot === 'vocals' ? '🎤 Find your pitch' : '🎸 Tune up'), info, el('div', { class: 'gauge' }, zone, needle)));
      let hits = 0, tries = 0, t = Math.random() * 3, alive = true;
      const loop = () => { if (!alive) return; t += 0.028 + tries * 0.006; needle.style.left = (50 + Math.sin(t * 2.4) * 48) + '%'; requestAnimationFrame(loop); }; loop();
      const h = e => {
        if (e.code !== 'Space') return; e.preventDefault();
        const x = 50 + Math.sin(t * 2.4) * 48; tries++;
        if (x > 43 && x < 57) { hits++; audio.play('ok'); } else audio.play('bad');
        info.textContent = `${tries}/3 · ${hits} in tune`;
        if (tries >= 3) { alive = false; window.removeEventListener('keydown', h); setTimeout(() => res(hits / 3), 300); }
      };
      window.addEventListener('keydown', h);
    });
  }
  level() {
    return new Promise(res => {
      const fill = el('div', { class: 'zone', style: { left: 0, width: '0%', background: '#f2a91a' } }), zone = el('div', { class: 'zone', style: { left: '62%', width: '14%', background: 'rgba(47,143,78,.45)' } });
      showScreen(el('div', { class: 'panel mini' }, el('h2', {}, '🎚️ Set your level'), el('div', { class: 'small' }, 'HOLD Space to push the fader, release in the green.'), el('div', { class: 'gauge' }, zone, fill)));
      let v = 0, holding = false, alive = true;
      const loop = () => { if (!alive) return; if (holding) v = Math.min(100, v + 1.1); fill.style.width = v + '%'; requestAnimationFrame(loop); }; loop();
      const dn = e => { if (e.code === 'Space') { e.preventDefault(); holding = true; } };
      const up = e => { if (e.code === 'Space' && holding) { holding = false; alive = false; window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); const c = 69, s = Math.max(0, 1 - Math.abs(v - c) / 25); audio.play(s > 0.6 ? 'ok' : 'bad'); setTimeout(() => res(s), 300); } };
      window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    });
  }
  playerDone(score) {
    if (this.g.phase !== this || this.done) return;
    const g = this.g, st = g.state, id = st.playerId;
    st.mix[id] = Math.max(0.6, Math.min(1.5, (st.mix[id] || 1) * (0.85 + score * 0.3)));
    const msg = score > 0.8 ? 'Mint. Sounds massive.' : score > 0.5 ? 'Yeah, that\'ll do.' : 'Hmm. We\'ll fix it in the mix. Maybe.';
    g.labels.bubble(g.band.jamie.group, msg, 2200);
    st.logEvent(id, score > 0.7 ? 'good_check' : 'messy_check', score > 0.7 ? 'Quick, clean soundcheck' : 'Took forever to soundcheck', score > 0.7, 0.4);
    if (st.members.jamie) st.logEvent('jamie', 'ran_check', 'Ran a tight soundcheck', true, 0.3);
    setTimeout(() => this.next(), 1200);
  }
  skip() { closeScreen(); this.finish(); }
  finish() {
    if (this.done) return; this.done = true;
    const g = this.g, st = g.state;
    const noodles = Object.values(st.members).reduce((a, m) => a + (m.noodled || 0), 0);
    if (noodles === 0) { g.labels.bubble(g.band.jamie.group, 'Nobody noodled! I\'m welling up.', 2500); st.mood('jamie', 12); st.addMateship(3, 'zero noodling in soundcheck'); }
    centerMsg('Gates are open!', 1700); audio.play('cheer', { vol: 0.6 });
    setTimeout(() => g.setPhase('gig1'), 1800);
  }
  exit() { if (this.marker) this.marker.parent?.remove(this.marker); }
}
