import * as THREE from 'three';
import { buildSong, buildChart, SongPlayer, extendAt } from '../core/music.js';
import { Rhythm, LANE_KEYS } from './rhythm.js';
import { el, layer, toast, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

const PART = { vocals: 'vocals', lead: 'lead', rhythm: 'rhythm', bass: 'bass', drums: 'drums' };
const ABILITY_HINT = {
  dave_young: '<b>Q</b> Climb Anything (then <b>W/S</b> up/down, <b>Q</b> to get down) · <b>G</b> Crowd Run (<b>T</b> to untangle)',
  ant_lewis: 'Full Tank: your crowd bonus grows every song',
  scotty_woods: '<b>Q</b> Solo Skull any time (once per song, <b>W/S</b> tilt), press again for Solo Extension',
  chris_white: '<b>Q</b> Into the Crowd (<b>E</b> to high-five)',
  steve_smart: 'Rock Solid: cancels one band mistake per song',
  dunny: 'Keep that beret on', james_huntersmith: 'Tall Poppy works in free roam',
  hayden_joseph: 'Save the lemons for the set break', dave_stockman: 'Rock Solid: wider timing window',
};

// Phase 3: The Gig — a set of songs as a 4-lane rhythm game, with abilities, synergies, requests and hazards.
export class Gig {
  constructor(game, setIndex) {
    this.g = game; this.setIndex = setIndex; this.roam = false; this.drivePlayer = false; this.bandMode = 'gig'; this.allowSwitch = false; this.crowdMode = 'gig';
    this.songIdx = -1; this.queue = []; this.song = null; this.timeouts = []; this.extensions = 0; this.racePlanned = -1;
  }
  later(ms, fn) { const id = setTimeout(fn, ms); this.timeouts.push(id); return id; }
  enter() {
    const g = this.g, st = g.state, songs = st.songs;
    g.input.unlock();
    let set = songs.sets[this.setIndex].slice();
    if (st.settings.shortGig) set = [set[0], set[set.length - 1]];
    this.queue = set;
    this.racePlanned = 1 + Math.floor(Math.random() * Math.max(1, set.length - 1));
    this.windSong = Math.floor(Math.random() * Math.max(1, set.length - 1));
    g.band.toStage(true).then(() => { const p = g.player.actor; p.playAnim = g.band.playAnimFor(p); });
    g.npcs.setMode('gig'); g.rig.mode = 'gig';
    for (const m of g.band.list) m.tag.visible = false; g.band.jamie.tag.visible = false;
    for (const a of g.npcs.crowd) { a.setPos(a.home.x + (Math.random() - 0.5), 0, a.home.z + 2 + Math.random() * 2); }
    g.world.stageGear.setlist.visible = true;
    g.hud.setPhase('3 · THE GIG');
    g.hud.setHint(`<b>D F J K</b> hit the notes · ${ABILITY_HINT[st.playerId] || ''} · <b>R</b> accept a request · <b>Esc</b> pause`);
    this.rhythm = new Rhythm(); this.side = el('div', { class: 'gig-side' }); layer('hud').append(this.side);
    this.rhythm.onHit = (n, perfect) => this.playerHit(n, perfect); this.rhythm.onMiss = n => this.playerMiss(n); this.rhythm.onStray = () => st.addCrowd(-0.15);
    centerMsg('Showtime!', 1400);
    audio.play('cheer', { vol: 0.5 });
    this.nextTimer = this.later(2200, () => this.nextSong());
  }
  get part() { return PART[this.g.state.slotOf(this.g.state.playerId)]; }
  windows() {
    const st = this.g.state; const d = st.settings.difficulty;
    let w = [0.13, 0.1, 0.075][d], p = [0.06, 0.045, 0.035][d];
    if (st.anyAbility('rock_solid_window')) { w *= 1.3; p *= 1.2; }
    if (st.hasSyn('bedrock')) { w *= 1.15; }
    if (st.playerId === 'dunny' && !this.g.band.members.dunny?.beretOn) { w *= 0.7; p *= 0.7; }
    if (st.members[st.playerId]?.timingBuff) w *= 1 + st.members[st.playerId].timingBuff;
    return { w, p };
  }
  nextSong() {
    const g = this.g, st = g.state;
    this.songIdx++;
    if (this.songIdx >= this.queue.length) return this.endSet();
    const id = this.queue[this.songIdx]; const song = st.songs.songs.find(s => s.id === id);
    this.song = song; this.built = buildSong(song);
    const diff = st.settings.difficulty;
    this.chart = buildChart(this.built, this.part, diff);
    this.rhythm.load(this.chart);
    const { w, p } = this.windows(); this.rhythm.window = w; this.rhythm.perfect = p; this.rhythm.drift = 0; this.rhythm.disabledUntil = -1;
    this.energySum = 0; this.energyN = 0; this.songMistakes = {}; this.cancelsLeft = st.anyAbility('rock_solid_cancel') ? 1 : 0;
    this.skullDone = false; this.barT = 0; this.nextBar = this.built.bar; this.requestDone = false; this.extensions = 0; this.skull = null; this.raceAcc = null;
    this.hazards = this.planHazards();
    // patty wake-ups only last one song
    for (const m of Object.values(st.members)) { m.thisSongFix = m.pattyFix; m.pattyFix = false; }
    this.player = new SongPlayer(this.built);
    // mix: Jamie boosts/cuts your channel
    const mix = st.mix[st.playerId] || 1; this.player.setPartLevel(this.part, mix, 0.01);
    if (st.mix[st.playerId] > 1.05) toast('🎚️ Jamie\'s pushed your channel up this song.', 'good');
    centerMsg(`♪ ${song.title}`, 1700);
    g.hud.setPhase(`3 · THE GIG · SONG ${this.songIdx + 1}/${this.queue.length}`);
    g.setObjective(`Song ${this.songIdx + 1}/${this.queue.length}: <b>${song.title}</b>${song.soloSkull ? ' — <b>SOLO SKULL SONG</b> 🍺' : ''}${this.requested === id ? ' (request!)' : ''}`);
    this.startTimer = this.later(1200, () => { this.startTimer = null; this.player.start(0.25); this.playing = true; });
    // Full Tank (Ant Lewis): bonus that keeps growing all gig
    if (st.anyAbility('full_tank')) { st.flags.fullTank = (st.flags.fullTank || 0) + 1; }
  }
  planHazards() {
    const L = this.built.length, st = this.g.state, hz = [];
    if (this.songIdx === this.racePlanned) hz.push({ t: L * (0.3 + Math.random() * 0.2), kind: 'race' });
    if (Math.random() < 0.45) hz.push({ t: L * (0.2 + Math.random() * 0.6), kind: 'honk' });
    if (Math.random() < 0.3) hz.push({ t: L * (0.25 + Math.random() * 0.5), kind: 'feedback' });
    if (this.songIdx === this.windSong) hz.push({ t: L * (0.3 + Math.random() * 0.3), kind: 'wind' });
    if (!this.song.soloSkull && Math.random() < 0.6 && this.queue.length < 5) hz.push({ t: L * (0.25 + Math.random() * 0.2), kind: 'request' });
    // AI abilities
    const lineup = st.lineup, me = st.playerId;
    if (this.song.soloSkull) return hz.sort((a, b) => a.t - b.t);
    if (lineup.vocals === 'dave_young' && me !== 'dave_young' && Math.random() < 0.45) hz.push({ t: L * (0.45 + Math.random() * 0.2), kind: Math.random() < 0.5 ? 'ai_climb' : 'ai_crowdrun' });
    if (lineup.rhythm === 'chris_white' && me !== 'chris_white' && Math.random() < 0.35) hz.push({ t: L * (0.3 + Math.random() * 0.3), kind: 'ai_crowdwalk' });
    return hz.sort((a, b) => a.t - b.t);
  }
  // ---------- scoring ----------
  playerHit(n, perfect) {
    const st = this.g.state, mix = st.mix[st.playerId] || 1;
    let gain = (perfect ? 0.55 : 0.34) * st.buzzConfidence() * (0.8 + mix * 0.2) * (n.solo ? 1.4 : 1);
    if (st.flags.fullTank && st.playerId === st.lineup.vocals) gain *= 1 + st.flags.fullTank * 0.06;
    if (this.coverBoost) gain *= 2;
    if (this.crowdBoost) gain *= this.crowdBoost;
    st.addCrowd(gain);
    this.player.setPartLevel(this.part, mix, 0.01);
    if (this.skull) this.skull.hits++;
  }
  playerMiss() {
    const st = this.g.state; st.addCrowd(-0.9); audio.play('clunk', { vol: 0.5 });
    this.player.setPartLevel(this.part, 0.12, 0.01); clearTimeout(this.unmute);
    this.unmute = setTimeout(() => this.player?.setPartLevel(this.part, st.mix[st.playerId] || 1, 0.05), 280);
  }
  aiAccuracy(id) {
    const st = this.g.state, m = st.member(id), rt = st.members[id] || { mood: 60 };
    let a = m.stats.timing / 100 * (0.88 + rt.mood / 500);
    const b = rt.buzz || 0; if (b > 60) a -= (b - 60) / 400 * (m.abilities.includes('rock_solid_window') ? 0.3 : 1);
    if (id === 'dunny' && !this.g.band.members.dunny?.beretOn) a *= 0.72;
    if (rt.thisSongFix) a += 0.05; if (rt.wet) a -= 0.07;
    if (st.hasSyn('bedrock')) a += 0.05; if (st.anyAbility('rock_solid_window')) a += 0.02;
    if (this.exposed && st.lineup.lead === id) a -= 0.12;
    return Math.max(0.4, Math.min(0.99, a));
  }
  simBar() { // once per bar: AI members play; mistakes and energy contributions
    const g = this.g, st = g.state;
    for (const [slot, id] of Object.entries(st.lineup)) {
      if (id === st.playerId) continue;
      const acc = this.aiAccuracy(id), m = st.member(id);
      st.addCrowd((acc - 0.78) * 1.4 * (m.stats.energy / 80) + 0.25);
      if (m.abilities.includes('full_tank')) st.addCrowd(0.12 * (st.flags.fullTank || 0)); // Ant Lewis: keeps building all gig
      const rt = st.members[id]; rt.accuracy.push(acc);
      if (Math.random() < (1 - acc) * 0.32) {
        if (this.cancelsLeft > 0) { this.cancelsLeft--; toast(`🧱 ${st.member(st.bandIds.find(x => st.member(x).abilities.includes('rock_solid_cancel'))).name} covered ${m.name}'s slip. Rock solid.`, 'good'); continue; }
        rt.mistakes++; st.addCrowd(-3); this.songMistakes[id] = (this.songMistakes[id] || 0) + 1;
        const a = g.band.get(id); g.labels.bubble(a.group, ['Oops.', 'Whoops!', '…that was jazz.', 'Meant that.'][Math.floor(Math.random() * 4)], 1200);
      }
    }
    // the crowd cools off slowly unless you keep them going
    st.addCrowd(this.racing ? -2.2 : -0.35);
  }
  // ---------- per-frame ----------
  update(dt, t) {
    const g = this.g, st = g.state, p = g.player.actor;
    // player animation (the band AI skips the controlled member)
    if (p) {
      if (p.climbing) { p.model.update(dt); }
      else if (p.target) { p.steer(dt, this.runSpeed || 3); p.animate(dt); }
      else { if (!p.away) p.face(0); p.animate(dt, p.playAnim); }
    }
    this.updateAbilities(dt, t);
    if (!this.playing || !this.player) { this.rhythm?.draw(-10); return; }
    const time = this.player.time;
    // buzz drift
    let drift = 0; const resist = st.anyAbility('rock_solid_window') ? 0.3 : 1;
    if (st.buzz > 70 && !(st.members[st.playerId]?.thisSongFix)) drift = Math.sin(t * 0.8) * (st.buzz - 70) * 0.0028 * resist;
    if (this.honkUntil && t < this.honkUntil) drift += (Math.random() - 0.5) * 0.12 * resist;
    this.rhythm.drift = drift;
    // solo glow
    const sec = this.built.sections.find(s => time >= s.start && time < s.end);
    this.rhythm.soloGlow = sec?.name === 'solo' ? 1 : Math.max(0, this.rhythm.soloGlow - dt);
    this.section = sec;
    this.rhythm.update(time);
    // bars
    if (time >= this.nextBar) { this.nextBar += this.built.bar; this.simBar(); }
    this.energySum += st.crowd * dt; this.energyN += dt;
    // hazards & AI abilities
    while (this.hazards.length && time >= this.hazards[0].t) this.trigger(this.hazards.shift());
    if (this.feedback) { st.addCrowd(-2 * dt); if (t > this.feedback.fixAt) this.fixFeedback(); }
    if (this.wind && t > this.wind.until) this.windFail();
    if (this.racing) { if (!g.world.racing) { this.racing = false; const acc = this.rhythm.hits - this.raceAcc.h, miss = this.rhythm.misses - this.raceAcc.m; if (acc / Math.max(1, acc + miss) > 0.8) { st.addCrowd(8); toast('🏇 Played \'em home! The crowd turns back, pumped. +8', 'good'); } g.npcs.setMode('gig'); } }
    if (this.reqCard && t > this.reqCard.until) this.ignoreRequest();
    // Solo Skull
    if (this.song.soloSkull && sec?.name === 'solo' && !this.skull && !this.skullDone) this.startSkull(sec);
    if (this.skull) this.updateSkull(dt, time);
    // song end
    if (time > this.built.length + 0.6) this.endSong();
  }
  onKey(code) {
    if (!this.playing && !this.betweenSongs) return false;
    const st = this.g.state, li = LANE_KEYS.indexOf(code);
    if (li >= 0 && this.playing) { this.rhythm.press(li, this.player.time); return true; }
    if (code === 'KeyQ') { this.ability(); return true; }
    if (code === 'KeyG' && st.playerId === 'dave_young') { this.crowdRun(this.g.player.actor, true); return true; }
    if (code === 'KeyT' && this.tangle) { this.untangle(true); return true; }
    if (code === 'KeyE' && this.walk?.player) { this.highFive(); return true; }
    if (code === 'KeyR' && this.reqCard) { this.acceptRequest(); return true; }
    if ((code === 'Space' || code === 'KeyR') && this.wind) { this.windSave(); return true; }
    return false;
  }
  // ---------- abilities ----------
  ability() {
    const st = this.g.state, id = st.playerId, a = this.g.player.actor;
    if (id === 'dave_young') { if (this.climb) this.endClimb(false); else this.startClimb(a, true); return; }
    if (id === 'chris_white') { this.crowdWalk(a, true); return; }
    if (id === 'scotty_woods') {
      if (!this.skull && !this.skullDone && this.playing) { const t = this.player.time; this.startSkull({ end: Math.min(t + this.built.bar * 8, this.built.length - 1) }); if (this.skull) return; }
      this.soloExtension(true); return;
    }
    if (st.member(id)?.abilities.includes('pourer') && !this.skull && !this.skullDone && this.playing && st.bandIds.includes('scotty_woods')) { /* singers: Q climbs (Dave) — the skull is started by Scotty or the closer */ }
    toast(ABILITY_HINT[id] || 'No active ability for this member mid-song.');
  }
  startClimb(a, isPlayer) {
    if (this.climb || this.run || !this.playing) return;
    const w = this.g.world, pt = w.climbPoints.find(c => c.id === 'climb_semi_rail') || w.climbPoints[0];
    this.climb = { a, isPlayer, h: 0, max: pt.height, peak: 0, base: pt.pos.clone(), slot: a.pos.clone(), aiGoal: 0.45 + Math.random() * 0.45 };
    a.setPos(pt.pos.x, 0, pt.pos.z); a.face(Math.PI * 0.0); a.climbing = true; a.play('climb');
    if (isPlayer) { this.g.rig.mode = 'follow'; this.g.rig.yaw = Math.PI * 0.85; this.g.rig.dist = 7; }
    this.g.labels.bubble(a.group, 'WATCH THIS!', 1500); audio.play('cheer', { vol: 0.35 });
    if (this.g.state.lineup.rhythm === 'chris_white' && this.g.state.hasSyn('double_trouble') && !this.walk && Math.random() < 0.0) this.crowdWalk(this.g.band.get('chris_white'), false);
  }
  updateAbilities(dt, t) {
    const st = this.g.state, inp = this.g.input;
    const c = this.climb;
    if (c) {
      const up = c.isPlayer ? inp.isDown('KeyW') : c.h < c.max * c.aiGoal;
      const down = c.isPlayer ? inp.isDown('KeyS') : false;
      if (up) c.h = Math.min(c.max, c.h + dt * 1.3); if (down) c.h = Math.max(0, c.h - dt * 2);
      c.peak = Math.max(c.peak, c.h); c.a.pos.y = c.h; c.a.model.current && (c.a.model.current.timeScale = up || down ? 1 : 0.15);
      const k = c.h / c.max, risk = (0.015 + Math.pow(k, 3) * 0.24) * (1 + st.buzz / 80) * (c.isPlayer ? 1 : 0.4) * (up || k > 0.9 ? 1 : 0.35);
      if (Math.random() < risk * dt) return this.fall(c);
      if (!c.isPlayer && c.h >= c.max * c.aiGoal) { c.hold = (c.hold || 0) + dt; if (c.hold > 3) this.endClimb(false); }
      if (c.isPlayer && down && c.h <= 0.01 && c.peak > 0.3) this.endClimb(false);
    }
    if (this.run) this.updateRun(dt, t);
    if (this.walk) this.updateWalk(dt, t);
    if (this.tangle && performance.now() > this.tangle.until) this.untangle(false);
  }
  fall(c) {
    const st = this.g.state, a = c.a; this.climb = null; a.climbing = false;
    a.pos.y = 0; a.playOnce('fall', 1400); audio.play('thud'); audio.play('boo', { vol: 0.5 });
    centerMsg('OOF! 🤕', 1300); st.addCrowd(-10);
    if (c.isPlayer && this.playing) { this.rhythm.disabledUntil = this.player.time + 8; this.rhythm.label = 'Fell off! Missing a verse…'; }
    st.logEvent(a.id, 'fell', 'Fell off mid-climb and missed a verse', false, 1.0);
    this.later(1500, () => this.returnToSlot(a));
  }
  endClimb() {
    const c = this.climb; if (!c) return; const st = this.g.state, a = c.a; this.climb = null; a.climbing = false;
    const k = c.peak / c.max, bonus = 4 + 24 * Math.pow(k, 1.5);
    st.addCrowd(bonus); audio.play('cheer', { vol: 0.5 + k * 0.5 }); toast(`🧗 Climb Anything: ${Math.round(c.peak * 10) / 10} m! +${Math.round(bonus)} Crowd Energy`, 'good');
    if (k > 0.95 && c.isPlayer) st.unlock('full_send');
    st.logEvent(a.id, 'climb', k > 0.7 ? 'Climbed the semi mid-song. Massive.' : 'Had a little climb mid-song', true, 0.6 + k * 0.5);
    a.pos.y = 0; this.returnToSlot(a);
  }
  returnToSlot(a) {
    const s = this.g.band.slotPos(a.slot);
    a.setPos(s.x, s.y, s.z); a.face(0); a.climbing = false; a.away = false; a.ai = null; a.stop();
    if (a.id === this.g.state.playerId) this.g.rig.mode = 'gig';
  }
  crowdRun(a, isPlayer) {
    if (this.run || this.climb || !this.playing) return;
    const crowd = this.g.npcs.crowd.slice().sort(() => Math.random() - 0.5).slice(0, 4).map(p => p.pos.clone().add(new THREE.Vector3(0.6, 0, 0.6)));
    const ramp = [new THREE.Vector3(-6.2, 1.35, 0.6), new THREE.Vector3(-10.2, 0, 0.6)];
    a.setPos(-6.4, 1.35, 0.6); a.away = true;
    a.goTo(ramp[1], null, [...crowd, new THREE.Vector3(-10.2, 0, 0.6)]);
    this.run = { a, isPlayer, tangles: 0, next: 1.5 + Math.random(), t: 0 }; this.runSpeed = 4.2;
    if (!isPlayer) a.ai = dt => a.steer(dt, 4.2);
    if (isPlayer) { this.g.rig.mode = 'follow'; }
    this.g.labels.bubble(a.group, 'COMING THROUGH!', 1500);
    this.doubleTrouble(a.id);
  }
  updateRun(dt, t) {
    const r = this.run, a = r.a; r.t += dt;
    if (!this.tangle && r.t > r.next && r.tangles < 3 && a.target) {
      r.tangles++; r.next = r.t + 2.5 + Math.random() * 1.5;
      const punter = this.g.npcs.nearestPunter(a.pos, 6) || this.g.npcs.crowd[0];
      this.tangle = { until: performance.now() + (r.isPlayer ? 2200 : 900), punter, a };
      if (r.isPlayer) { this.showSide(`🎤 Mic lead tangled around ${punter.name}! Press <span class="kbd">T</span>`, 2200); }
      this.g.labels.bubble(punter.group, 'My leg!', 1200);
      if (!r.isPlayer) this.later(700, () => this.untangle(Math.random() < 0.8));
    }
    if (!a.target) { this.run = null; this.runSpeed = 3; this.returnToSlot(a); this.endDoubleTrouble(); this.g.state.logEvent(a.id, 'crowd_run', 'Ran through the crowd on the mic lead', true, 0.7); }
  }
  untangle(ok) {
    const tg = this.tangle; if (!tg) return; this.tangle = null; const st = this.g.state;
    if (ok) { st.addCrowd(4 * (this.crowdBoost || 1)); audio.play('ok'); }
    else { st.addCrowd(-3); tg.a.playOnce('fall', 600); audio.play('bad'); st.logEvent(tg.a.id, 'tangled', 'Got tangled in the mic lead', false, 0.4); }
  }
  crowdWalk(a, isPlayer) {
    if (this.walk || !this.playing) return;
    const crowd = this.g.npcs.crowd.slice().sort(() => Math.random() - 0.5).slice(0, 3).map(p => p.pos.clone().add(new THREE.Vector3(-0.5, 0, 0.5)));
    a.setPos(-6.4, 1.35, 0.6); a.away = true; a.goTo(new THREE.Vector3(-10.2, 0, 0.6), null, [...crowd, new THREE.Vector3(-10.2, 0, 0.6)]);
    this.walk = { a, player: isPlayer, fives: 0, t: 0, near: null }; this.runSpeed = 1.6;
    if (!isPlayer) a.ai = dt => a.steer(dt, 1.6);
    if (isPlayer) { this.g.rig.mode = 'follow'; toast('Into the Crowd! Keep hitting your notes. E to high-five punters.'); }
    this.g.labels.bubble(a.group, 'Wireless pack, baby!', 1500);
    this.doubleTrouble(a.id);
  }
  updateWalk(dt) {
    const w = this.walk, a = w.a; w.t += dt;
    if (!w.player) { if (Math.random() < dt * 0.8) { w.fives++; this.g.state.addCrowd(1.5 * (this.crowdBoost || 1)); } }
    const p = this.g.npcs.nearestPunter(a.pos, 1.8);
    if (p && p !== w.near) { w.near = p; p.playOnce('wave', 900); if (w.player) this.showSide(`🙌 ${p.name} wants a high-five! <span class="kbd">E</span>`, 1400); }
    if (!a.target) { this.walk = null; this.runSpeed = 3; this.returnToSlot(a); this.endDoubleTrouble(); this.g.state.logEvent(a.id, 'into_crowd', `Walked into the crowd and got ${w.fives} high-fives`, true, 0.6); }
  }
  highFive() {
    const w = this.walk; if (!w?.near || w.near.fived) return; w.near.fived = true; setTimeout(() => w.near && (w.near.fived = false), 6000);
    w.fives++; w.near.playOnce('cheer', 900); audio.play('clink', { vol: 0.3 }); this.g.state.addCrowd(2.5 * (this.crowdBoost || 1));
  }
  doubleTrouble(starter) {
    const st = this.g.state; if (!st.hasSyn('double_trouble')) return;
    if (starter === 'dave_young' && !this.walk) this.crowdWalk(this.g.band.get('chris_white'), st.playerId === 'chris_white');
    if (starter === 'chris_white' && !this.run) this.crowdRun(this.g.band.get('dave_young'), st.playerId === 'dave_young');
    if (this.run && this.walk && !this.crowdBoost) {
      this.crowdBoost = 2; this.exposed = true; centerMsg('DOUBLE TROUBLE!', 1500); audio.play('cheer');
      if (st.playerId === st.lineup.lead) { this.coverBoost = true; toast('Stage exposed! Scotty, cover for them: your notes count double.', 'good'); }
      else toast('Double Trouble! ×2 crowd energy, but the stage is exposed. Scotty must cover!');
      st.logEvent(st.lineup.lead, 'covered', 'Held the stage together during Double Trouble', true, 0.6);
    }
  }
  endDoubleTrouble() { if (!this.run && !this.walk) { this.crowdBoost = 0; this.exposed = false; this.coverBoost = false; } }
  soloExtension(isPlayer) {
    const st = this.g.state, sec = this.section;
    if (!sec || !this.playing) return;
    // works any time: repeats the next 4 bars of whatever section you're in (or the current solo)
    const ins = sec.end - this.player.time > 0.6 ? sec.end : (this.built.sections.find(s => s.start > this.player.time + 0.6)?.end ?? null);
    if (ins == null) { if (isPlayer) toast('Too close to the end of the song to extend.'); return; }
    extendAt(this.built, this.chart, ins, this.built.bar * 4);
    this.extensions++; st.addCrowd(5); audio.play('cheer', { vol: 0.5 }); centerMsg(`+4 BARS${'!'.repeat(this.extensions)}`, 1000);
    this.g.labels.bubble(this.g.band.get(st.lineup.lead).group, 'ONE MORE TIME!', 1200);
    if (this.extensions >= 3) {
      st.addMateship(-4, 'Solo Extension overdone'); toast('🍔 The band is throwing patties at Scotty. Wrap it up!', 'bad');
      const scotty = this.g.band.get(st.lineup.lead);
      for (const m of this.g.band.list) if (m !== scotty && Math.random() < 0.7) { const dir = new THREE.Vector3().subVectors(scotty.pos, m.pos).normalize(); dir.y = 0.05; const sel = this.g.throwables.selected; this.g.throwables.selected = 'patty'; this.g.state.pocket.patty++; this.g.throwables.throw(m, dir); this.g.throwables.selected = sel; }
      st.logEvent(st.lineup.lead, 'solo_overdone', 'Solo went on for a fortnight', false, 0.8);
    } else st.logEvent(st.lineup.lead, 'solo_ext', 'Big solo extension', true, 0.4);
  }
  // ---------- Solo Skull ----------
  startSkull(sec) {
    const g = this.g, st = g.state;
    const scottyId = st.lineup.lead, pourerId = st.bandIds.find(id => st.member(id).abilities.includes('pourer'));
    if (!st.bandIds.includes('scotty_woods') || !pourerId) { this.skullDone = true; return; }
    const scotty = g.band.get(scottyId), pourer = g.band.get(pourerId);
    if (this.climb) this.endClimb(); if (this.tangle) this.tangle = null;
    for (const k of ['run', 'walk']) if (this[k]) { const a = this[k].a; this[k] = null; this.returnToSlot(a); } this.endDoubleTrouble();
    this.skull = { beer: 1, spilled: 0, tilt: 0.1, hits: 0, lastHits: 0, rate: 0.1, t: 0, end: sec.end, scotty, pourer, playerCtl: [scottyId, pourerId].includes(st.playerId), bros: st.hasSyn('skull_bros'), startHits: this.rhythm.hits, startMiss: this.rhythm.misses };
    pourer.setPos(scotty.pos.x - 0.55, scotty.pos.y, scotty.pos.z + 0.35); pourer.faceTowards(scotty.pos); pourer.attach('schooner', 'socket_hand_R', 'skullBeer');
    pourer.playAnim = 'pour'; scotty.playAnim = 'drink_play'; pourer.away = true;
    if (st.playerId === pourerId) pourer.playAnim = 'pour';
    centerMsg('🍺 THE SOLO SKULL 🍺', 1600); audio.play('cheer'); audio.say('Solo skull!', { force: true });
    const liq = el('div', { class: 'liq', style: { height: '100%' } }), foam = el('div', { class: 'foam', style: { bottom: '100%' } });
    const tiltFill = el('div', { class: 'fill' }), zone = el('div', { class: 'zone' });
    const info = el('div', { class: 'small', style: { color: '#fff', textShadow: '0 1px 2px #000', fontWeight: 800 } }, '');
    this.skullUI = { liq, foam, tiltFill, zone, info, box: el('div', { class: 'skull' }, el('div', { class: 'beer' }, liq, foam), el('div', { class: 'tilt' }, zone, tiltFill), info,
      el('div', { class: 'small', style: { color: '#fff', textShadow: '0 1px 2px #000' } }, this.skull.playerCtl ? 'W/S: tilt. Keep it in the green. Hit notes so Scotty can gulp!' : 'Watch the masters work.')) };
    layer('hud').append(this.skullUI.box);
  }
  updateSkull(dt, time) {
    const s = this.skull, st = this.g.state, inp = this.g.input;
    dt = Math.max(0, Math.min(0.5, time - (s.prevTime ?? time))); s.prevTime = time; s.t += dt; // song-clock based so it can't drift from the music
    // Scotty's gulp rate follows how well the solo is going (hits per second)
    const scottyIsPlayer = st.playerId === st.lineup.lead;
    if (!scottyIsPlayer && Math.random() < dt * 4 * this.aiAccuracy(st.lineup.lead)) s.hits++;
    if (s.t - (s.lastT || 0) > 0.5) { const hps = (s.hits - s.lastHits) / (s.t - (s.lastT || 0)); s.rate = 0.05 + Math.min(0.17, hps * 0.045); s.lastHits = s.hits; s.lastT = s.t; }
    const ideal = Math.pow(s.rate / 0.24, 1 / 1.5), wid = s.bros ? 0.4 : 0.25;
    if (s.playerCtl) { if (inp.isDown('KeyW')) s.tilt += dt * 0.7; if (inp.isDown('KeyS')) s.tilt -= dt * 0.9; s.tilt -= dt * 0.05; }
    else { s.tilt += (ideal * (1 + (Math.random() - 0.5) * (s.bros ? 0.3 : 0.6)) - s.tilt) * dt * 2.5; }
    s.tilt = Math.max(0, Math.min(1, s.tilt));
    if (s.beer > 0) {
      const flow = 0.24 * Math.pow(s.tilt, 1.5), drink = Math.min(flow, s.rate);
      s.beer -= flow * dt; s.spilled += Math.max(0, flow - s.rate * (1 + wid * 0.5)) * dt;
      if (flow > 0.02 && Math.random() < dt * 3) audio.play('gulp', { vol: 0.35 });
      if (flow - s.rate > 0.04 && Math.random() < dt * 4) audio.play('spill', { vol: 0.25 });
    }
    const ui = this.skullUI;
    ui.liq.style.height = Math.max(0, s.beer) * 100 + '%'; ui.foam.style.bottom = Math.max(0, s.beer) * 100 + '%';
    ui.tiltFill.style.width = s.tilt * 100 + '%'; ui.zone.style.left = Math.max(0, ideal * (1 - wid)) * 100 + '%'; ui.zone.style.width = ideal * wid * 2 * 100 + '%';
    ui.info.textContent = s.beer > 0 ? `Spilled: ${Math.round(s.spilled * 100)}%` : 'EMPTY! Finish the solo!';
    if (s.spilled > 0.6 && !s.onGuitar) { s.onGuitar = true; audio.play('crackle'); centerMsg('BEER ON THE GUITAR! ⚡', 1400); st.addCrowd(-8); this.player.setPartLevel('lead', 0.05); setTimeout(() => this.player?.setPartLevel('lead', 1), 3000); }
    if (time >= s.end) this.endSkull();
  }
  endSkull() {
    const s = this.skull, st = this.g.state; if (!s) return; this.skull = null; this.skullDone = true;
    const hits = this.rhythm.hits - s.startHits, miss = this.rhythm.misses - s.startMiss;
    const acc = st.playerId === st.lineup.lead ? hits / Math.max(1, hits + miss) : this.aiAccuracy(st.lineup.lead);
    const finished = s.beer <= 0.02, clean = s.spilled < 0.35 && acc >= 0.7;
    const scotty = st.lineup.lead, pourer = s.pourer.id;
    if (finished && clean) {
      const b = 30 * (s.bros ? 1.3 : 1); st.addCrowd(b); centerMsg('SKULL LEGEND! 🍺🎸', 2200); audio.play('cheer', { vol: 1.2 }); st.unlock('skull_legend');
      st.logEvent(scotty, 'skull_win', 'Absolutely nailed the Solo Skull', true, 1.4); st.logEvent(pourer, 'pour_win', 'Perfect pour in the Solo Skull', true, 1.2); st.addMateship(6, 'Solo Skull legends');
      st.members[scotty] && (st.members[scotty].buzz += 15); if (st.playerId === scotty) st.addBuzz(15);
    } else if (finished) { st.addCrowd(12); toast('Beer finished, solo a bit messy. Still a crowd-pleaser! +12', 'good'); st.logEvent(scotty, 'skull_ok', 'Got the beer down, solo got sloppy', true, 0.6); if (st.playerId === scotty) st.addBuzz(12); }
    else { st.addCrowd(-4); toast('Didn\'t finish the beer. The crowd boos softly.', 'bad'); st.logEvent(pourer, 'pour_fail', s.spilled > 0.6 ? 'Poured half the beer onto Scotty\'s guitar' : 'Pour was way too slow', false, 0.9); }
    if (s.spilled > 0.6) st.logEvent(scotty, 'beer_guitar', 'Beer all over the guitar', false, 0.5);
    s.pourer.detach('skullBeer'); s.pourer.playAnim = this.g.band.playAnimFor(s.pourer); s.scotty.playAnim = this.g.band.playAnimFor(s.scotty); this.returnToSlot(s.pourer);
    this.skullUI.box.remove(); this.skullUI = null;
  }
  // ---------- hazards ----------
  trigger(h) {
    const g = this.g, st = g.state;
    switch (h.kind) {
      case 'race': g.roam.startRace(); this.racing = true; this.raceAcc = { h: this.rhythm.hits, m: this.rhythm.misses }; toast('🏇 A race has started behind the stage! The crowd turns around. Play \'em home!'); break;
      case 'honk': audio.play('honk', { dur: 1.1 }); g.labels.bubble(g.npcs.truckie.group, 'HOOOOONK', 1500); this.honkUntil = g.engine.time + 1.5; g.rig.shake = 1; toast('🚛 The truckie leant on the horn. Hold your nerve!'); break;
      case 'feedback': {
        const mood = st.members.jamie?.mood ?? 60, delay = mood > 65 ? 1.2 : mood > 40 ? 3 : 6;
        this.feedback = { fixAt: g.engine.time + delay }; audio.play('feedback', { dur: delay }); toast('📢 FEEDBACK! Jamie\'s on it…', 'bad');
        g.labels.bubble(g.band.jamie.group, mood > 65 ? 'On it!' : mood > 40 ? 'Yep yep, hang on…' : 'Oh NOW you need me?', 1800);
        st.logEvent('jamie', mood > 65 ? 'fast_fix' : 'slow_fix', mood > 65 ? 'Killed the feedback instantly' : 'Took ages to fix the feedback', mood > 65, 0.6); break;
      }
      case 'wind': {
        audio.play('wind'); this.wind = { until: g.engine.time + 1.7 }; this.showSide('💨 WIND GUST! The setlist is flying! <span class="kbd">SPACE</span> stomp on it!', 1700);
        const sl = g.world.stageGear.setlist; if (sl) sl.rotation.z = 0.4; break;
      }
      case 'request': this.showRequest(); break;
      case 'ai_climb': this.startClimb(g.band.get('dave_young'), false); break;
      case 'ai_crowdrun': this.crowdRun(g.band.get('dave_young'), false); break;
      case 'ai_crowdwalk': this.crowdWalk(g.band.get('chris_white'), false); break;
    }
  }
  fixFeedback() { this.feedback = null; toast('Feedback fixed.'); }
  windSave() { this.wind = null; const st = this.g.state; st.addCrowd(2); audio.play('ok'); toast('Setlist saved! 🦶', 'good'); st.logEvent(st.playerId, 'saved_setlist', 'Saved the setlist from the wind', true, 0.5); this.g.world.stageGear.setlist.rotation.z = 0; }
  windFail() {
    this.wind = null; const g = this.g, st = g.state; st.addCrowd(-4); toast('The setlist blew into the car park. "What\'s next?!"', 'bad');
    g.world.stageGear.setlist.visible = false; st.flags.setlistGone = true;
    const pool = st.songs.requestPool.filter(id => !this.queue.includes(id));
    if (pool.length && this.songIdx + 1 < this.queue.length && !st.songs.songs.find(s => s.id === this.queue[this.songIdx + 1]).soloSkull) this.queue[this.songIdx + 1] = pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() < 0.5 && g.band.members.dunny?.beretOn) { g.band.knockBeret(); toast('…and it took Dunny\'s beret with it! 💨🔴', 'bad'); }
    st.logEvent(st.lineup.vocals, 'lost_setlist', 'Lost the setlist to the wind', false, 0.4);
  }
  showRequest() {
    const st = this.g.state, pool = st.songs.requestPool.filter(id => !this.queue.includes(id)); if (!pool.length) return;
    const id = pool[Math.floor(Math.random() * pool.length)], song = st.songs.songs.find(s => s.id === id);
    const punter = this.g.npcs.crowd[Math.floor(Math.random() * this.g.npcs.crowd.length)];
    this.g.labels.bubble(punter.group, `Play ${song.title}!!`, 4000); punter.playOnce('wave', 2500);
    const card = el('div', { class: 'req-card' }, el('div', { class: 't' }, `🙋 ${punter.name} requests:`), el('div', { style: { fontWeight: 800 } }, song.title), el('div', { class: 'small' }, 'Press ', el('span', { class: 'kbd' }, 'R'), ' to play it next'));
    this.side.append(card); this.reqCard = { id, punter, card, until: this.g.engine.time + 9 };
  }
  acceptRequest() {
    const r = this.reqCard; this.reqCard = null; r.card.remove(); const st = this.g.state;
 // the band slips a bit of the request into this song's outro (keeps the gig to two songs)
    this.requested = this.song.id; this.requester = r.punter;
    this.g.labels.bubble(r.punter.group, 'LEGENDS!!', 1500); audio.play('ok'); toast('Request accepted: working it into the outro!', 'good');
  }
  ignoreRequest() {
    const r = this.reqCard; this.reqCard = null; r.card.remove();
    if (Math.random() < 0.5) { this.g.labels.bubble(r.punter.group, 'BOOOO! Play it!', 2000); this.g.state.addCrowd(-3); audio.play('boo', { vol: 0.4 }); }
  }
  showSide(html, ms) { const c = el('div', { class: 'req-card', html }); this.side.append(c); setTimeout(() => c.remove(), ms); }
  skip() { // Skip button: end this song now / jump to the next one
    // one click = straight to the next song, or straight to pack-up after the last one
    const last = this.songIdx >= this.queue.length - 1;
    for (const t of [this.nextTimer, this.startTimer, this.endTimer]) clearTimeout(t);
    this.startTimer = null;
    if (this.playing) this.endSong(true); else this.player?.stop(0.1);
    if (last || this.ending) { this.g.setPhase('packup'); return; }
    this.betweenSongs = false; this.nextSong();
  }
  // ---------- song / set end ----------
  endSong(skipped = false) {
    const g = this.g, st = g.state; this.playing = false; this.player.stop(0.6);
    if (this.skull) this.endSkull();
    if (this.climb) this.endClimb();
    const acc = this.rhythm.accuracy(), energy = this.energyN ? this.energySum / this.energyN : st.crowd;
    const score = Math.round(acc * 100 * (0.5 + energy / 200));
    st.score.songs.push({ id: this.song.id, title: this.song.title, acc, energy, score }); st.score.performance += score;
    const me = st.playerId;
    if (acc >= 0.9) st.logEvent(me, 'great_song', `Nailed ${this.song.title}`, true, 0.8);
    else if (acc < 0.65) st.logEvent(me, 'rushed', `You rushed ${this.song.title}`, false, 0.9);
    if (this.rhythm.best >= 40) st.logEvent(me, 'combo', `Huge ${this.rhythm.best}-note streak`, true, 0.5);
    for (const [id, n] of Object.entries(this.songMistakes)) if (n >= 2) st.logEvent(id, 'mistakes', `Dropped a few in ${this.song.title}`, false, 0.5 + n * 0.1);
    for (const id of st.bandIds) if (id !== me && !this.songMistakes[id] && Math.random() < 0.35) st.logEvent(id, 'locked_in', `Locked in on ${this.song.title}`, true, 0.5);
    if (this.requested === this.song.id) {
      toast(`🍻 ${this.requester.name} shouts the band a round for playing their request!`, 'good'); st.addMateship(4); st.addBuzz(8);
      for (const id of st.bandIds) if (st.members[id]) st.members[id].buzz += 8;
      st.logEvent(st.lineup.vocals, 'request', `Played ${this.requester.name}'s request`, true, 0.6); this.requested = null;
    }
    if (st.mix[me] > 1) st.mix[me] = 1; // Jamie's boost lasts one song
    audio.play(energy > 60 ? 'cheer' : 'clink', { vol: energy / 80 });
    toast(`${this.song.title}: ${Math.round(acc * 100)}% · Crowd ${Math.round(energy)}`, acc > 0.8 ? 'good' : '');
    this.betweenSongs = true;
    if (!skipped) this.nextTimer = this.later(3200, () => { this.betweenSongs = false; this.nextSong(); });
  }
  endSet() {
    const g = this.g; centerMsg('Thank you, Colac!', 1600); audio.play('cheer', { vol: 1 });
    this.ending = true; this.endTimer = this.later(2400, () => g.setPhase('packup'));
  }
  exit() {
    for (const id of this.timeouts) clearTimeout(id);
    this.player?.stop(0.3); this.rhythm?.destroy(); this.side?.remove(); this.skullUI?.box.remove();
    if (this.climb) { this.climb.a.climbing = false; this.climb.a.pos.y = 0; }
    for (const a of this.g.band.list) { a.away = false; a.stop(); }
    this.g.rig.mode = 'follow';
    for (const m of this.g.band.list) m.tag.visible = m.id !== this.g.state.playerId; this.g.band.jamie.tag.visible = true;
  }
}
export class Gig1 extends Gig { constructor(g) { super(g, 0); } }
export class Gig2 extends Gig { constructor(g) { super(g, 1); } }
