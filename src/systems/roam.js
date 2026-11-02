import * as THREE from 'three';
import { el, showScreen, closeScreen, toast, menu, centerMsg } from '../ui/ui.js';
import { audio } from '../core/audio.js';

const CHAT = [
  'Youse are better than the band last year!', 'Is the drummer single? Asking for my nan.', 'Got any AC/DC? No? Fair enough.',
  'I\'ve got $50 on number 4. Play something lucky!', 'Love the beret on that bass player.', 'My fascinator cost more than my car.',
  'You lot from Melbourne? Yeah, I could tell.', 'Can you play louder? The horses can\'t hear.', 'Best day of the year, the Cup.',
];
const HORSES = [{ name: 'Beret Beauty', odds: 3 }, { name: 'Lemon Launcher', odds: 5 }, { name: 'Schooner Sunday', odds: 2 }, { name: 'Truckie\'s Pride', odds: 8 }];

// Free-roam interactions shared by every phase where you can walk around.
export class Roam {
  constructor(game) { this.g = game; this.bet = null; this.lastPunterEvent = 0; }
  setup() {
    const g = this.g, w = g.world, st = g.state, I = g.interact;
    I.add({ id: 'bar', pos: () => w.m('poi_bar'), radius: 2.6, label: () => 'Order at the bar', action: () => g.drinks.openBar() });
    if (false) I.add({ id: 'stall', pos: () => g.world.burgerStall.position, radius: 2.2, label: () => 'Burger stall: grab buns & patties', action: () => this.stall() });
    I.add({ id: 'lemons', pos: () => w.m('poi_lemon_crate'), radius: 2.0, priority: 0.5, label: () => 'Lemon crate 🍋 (press 3 to throw lemons)',
      action: () => { st.pocket.lemon = Math.min(6, st.pocket.lemon + 3); g.throwables.cycle('lemon'); audio.play('pickup'); toast('🍋 +3 lemons. The car park is RIGHT there…'); } });
    I.add({ id: 'bookie', pos: () => w.m('poi_bookie'), radius: 2.4, label: () => this.bet ? `Your bet: $${this.bet.amount} Mateship on ${this.bet.horse.name}` : 'Bookie: have a punt (Mateship points)', action: () => this.bookie() });
    for (const a of g.npcs.waitstaff) I.add({ id: 'canape_' + a.id, pos: () => a.pos, radius: 1.9, priority: 2, label: () => a.offering ? `Take a ${a.veg ? 'vego ' : ''}canapé` : null, action: () => this.canape(a) });
    I.add({ id: 'punter', pos: () => { const p = g.npcs.nearestPunter(g.player.actor.pos, 2.0); this._punter = p; return p ? p.pos : null; }, radius: 2.0, label: () => this._punter ? `Chat with ${this._punter.name}` : null, action: () => this._punter && this.punter(this._punter) });
    for (const m of g.band.list) {
      I.add({ id: 'mate_' + m.id, pos: () => m.pos, radius: 1.8, priority: -0.5, enabled: () => m.id !== st.playerId,
        label: () => g.player.actor.canapeFor?.length ? `Give ${m.name} a canapé` : g.player.actor.holding === 'beret' && m.id === 'dunny' ? 'Put the beret back on Dunny' : st.members[m.id]?.sulking ? `Make it up to ${m.name} (sulking)` : `Yarn with ${m.name}`,
        action: () => this.mate(m) });
    }
    I.add({ id: 'jamie', pos: () => g.band.jamie.pos, radius: 2.2, label: () => g.player.actor.canapeFor?.length ? 'Give Jamie a canapé' : 'Yarn with Jamie', action: () => this.mate(g.band.jamie) });
    I.add({ id: 'beret', pos: () => this.beretObj()?.parent === w.root ? this.beretObj().position : null, radius: 1.6, priority: 3, label: () => 'Pick up Dunny\'s beret', action: () => this.pickBeret() });
  }
  beretObj() { return this.g.band.members.dunny?.beret; }
  pickBeret() {
    const g = this.g, b = this.beretObj(); if (!b) return;
    const a = g.player.actor;
    if (a.id === 'dunny') { g.band.restoreBeret(); toast('Beret back on. Groove restored. 🔴', 'good'); g.state.logEvent('dunny', 'beret_back', 'Got the beret back on', true, 0.3); return; }
    b.parent.remove(b); a.holding = 'beret'; audio.play('pickup'); toast('Got the beret! Take it to Dunny.'); g.hud.dirty = true;
  }
  stall() {
    const st = this.g.state; st.pocket.bun = Math.min(5, st.pocket.bun + 2); st.pocket.patty = Math.min(5, st.pocket.patty + 2);
    audio.play('pickup'); toast('🍔 Pockets full of buns and patties. (1/2 to pick, F to throw)'); this.g.hud.dirty = true;
  }
  canape(a) {
    const g = this.g, st = g.state, p = g.player.actor;
    g.npcs.takeCanape(a); st.traysHit.add(a.id); if (st.traysHit.size >= g.npcs.waitstaff.length) st.unlock('hoverer');
    menu('Canapé acquired', a.veg ? 'A tiny vego tart. Delicate. Powerful.' : 'A party pie. Lava hot.', [
      { icon: '😋', label: 'Eat it (−Buzz)', action: () => { st.addBuzz(-6); audio.play('gulp'); closeScreen(); g.player.enabled = true; } },
      { icon: '🫴', label: 'Save it for a bandmate (canapé run)', action: () => { p.canapeFor = (p.canapeFor || []).concat([{ veg: a.veg }]).slice(-2); toast('Canapé run! Deliver it to a bandmate. Remember who\'s vego.'); closeScreen(); g.player.enabled = true; g.hud.dirty = true; } },
    ], { closeLabel: null });
  }
  mate(m) {
    const g = this.g, st = g.state, p = g.player.actor, mem = st.member(m.id) || {};
    if (p.holding === 'beret' && m.id === 'dunny') {
      p.holding = null; g.band.restoreBeret(); st.unlock('beret_rescue'); st.addMateship(6, 'returned the beret'); st.mood('dunny', 15);
      g.labels.bubble(m.group, 'MY BERET! I love you.'); st.logEvent(st.playerId, 'beret_rescue', 'Found and returned Dunny\'s beret', true, 1.0); return;
    }
    if (p.canapeFor?.length) {
      const c = p.canapeFor.shift(); const veg = !!mem.vegetarian;
      if (veg && !c.veg) { g.labels.bubble(m.group, 'Mate. I\'m vego.'); st.addMateship(-2, `${mem.name} is vegetarian!`); st.logEvent(st.playerId, 'canape_wrong', `Brought ${mem.name} a meat pie (they're vego)`, false, 0.5); }
      else { g.labels.bubble(m.group, veg ? 'You remembered I\'m vego! 🥹' : 'Ooh, party pie!'); st.addMateship(veg ? 6 : 4, `canapé for ${mem.name}${veg ? ' (remembered vego!)' : ''}`); st.mood(m.id, 8); st.logEvent(st.playerId, 'canape_run', `Brought ${mem.name} a canapé`, true, veg ? 0.8 : 0.5); if (st.members[m.id]) { st.members[m.id].canapes++; st.members[m.id].sulking = false; } }
      m.drinking = 1.2; g.hud.dirty = true; return;
    }
    if (st.members[m.id]?.sulking) { g.labels.bubble(m.group, 'Oh NOW you want to talk. Shout me one and we\'re square.'); return; }
    const lines = m.id === 'jamie' ? ['Keep your noodling to yourself in soundcheck, yeah?', 'I can hear you rushing. Everyone can.', 'A beer goes a long way at this desk.'] :
      ['Big one tonight.', 'Don\'t forget to wrap the leads over-under.', 'Have you seen the bookie? Number 3\'s a lock.', 'If Dave climbs the semi again I\'m not catching him.', 'Did someone take my capo?'];
    g.labels.bubble(m.group, lines[Math.floor(Math.random() * lines.length)], 2600); st.mood(m.id, 1);
  }
  punter(a) {
    const g = this.g, st = g.state;
    g.player.actor.faceTowards(a.pos); a.faceTowards(g.player.actor.pos);
    const opts = [
      { icon: '🙌', label: 'High-five', action: () => { closeScreen(); g.player.enabled = true; a.playOnce('cheer', 900); g.player.actor.playOnce('wave', 700); audio.play('clink', { vol: 0.3 }); st.addCrowd(1.5); this.punterEvent(a); } },
      { icon: '🤳', label: 'Selfie', action: () => { closeScreen(); g.player.enabled = true; a.playOnce('wave', 1000); st.addCrowd(2); centerMsg('📸 *click*', 900); this.punterEvent(a, 0.4); } },
      { icon: '💬', label: 'Have a yarn', action: () => { closeScreen(); g.player.enabled = true; g.labels.bubble(a.group, CHAT[Math.floor(Math.random() * CHAT.length)], 3000); this.punterEvent(a); } },
    ];
    menu(a.name, 'A punter in their finest race-day gear.', opts, { closeLabel: 'Nah, all good' });
  }
  punterEvent(a, bonus = 0) {
    const g = this.g, st = g.state, r = Math.random() - bonus;
    if (a.talked++ > 2) return;
    if (r < 0.18 && !a.tipped) { a.tipped = true; const tip = 5 + Math.floor(Math.random() * 16); st.addCash(tip); g.labels.bubble(a.group, `Here, have $${tip} for a beer!`); return; }
    if (r < 0.3) { g.labels.bubble(a.group, 'Skol-off? Me versus you. Right now.'); setTimeout(() => this.skolOff(a), 900); return; }
    if (r < 0.4) { st.addBuzz(10); g.player.actor.playOnce('drink', 1400); g.labels.bubble(a.group, 'Get this into ya, I\'m buying!'); st.addMateship(1); }
  }
  skolOff(a) {
    const g = this.g, st = g.state; let me = 0, them = 0, done = false; const start = performance.now();
    const barMe = el('div', { class: 'fill', style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '0%', background: '#f2a91a' } });
    const barThem = el('div', { class: 'fill', style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '0%', background: '#c8231c' } });
    const box = el('div', { class: 'panel mini' }, el('h2', {}, `Skol-off vs ${a.name}!`), el('div', {}, 'Mash ', el('span', { class: 'kbd' }, 'SPACE'), ' to skol!'),
      el('div', { class: 'small' }, 'You'), el('div', { class: 'gauge' }, barMe), el('div', { class: 'small' }, a.name), el('div', { class: 'gauge' }, barThem));
    showScreen(box); g.player.enabled = false;
    const rate = 15 + Math.random() * 10 + a.drunk * 6;
    const key = e => { if (e.code === 'Space' && !done) { me += 4.2 * (st.buzz > 80 ? 0.7 : 1); audio.play('gulp', { vol: 0.4 }); } };
    window.addEventListener('keydown', key);
    const tick = () => {
      if (done) return; const t = (performance.now() - start) / 1000; them = Math.min(100, t * rate);
      barMe.style.width = Math.min(100, me) + '%'; barThem.style.width = them + '%';
      if (me >= 100 || them >= 100) {
        done = true; window.removeEventListener('keydown', key); closeScreen(); g.player.enabled = true; st.addBuzz(14);
        if (me >= 100) { st.unlock('skol'); st.addCrowd(6); g.labels.bubble(a.group, 'Unreal. Absolute unit.'); toast('You won the skol-off! +Crowd', 'good'); st.logEvent(st.playerId, 'skol_win', 'Won a skol-off against a punter', true, 0.4); }
        else { g.labels.bubble(a.group, 'Too slow, rockstar!'); toast('Lost the skol-off. Buzz up, pride down.', 'bad'); }
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
  bookie() {
    const g = this.g, st = g.state;
    if (this.bet) { toast('Your bet is on. Wait for the next race!'); return; }
    if (!this.g.phase?.allowBets) { g.labels.bubble(g.npcs.bookie.group, 'Come back after the gig, champ.'); return; }
    const opts = HORSES.map((h, i) => ({ icon: '🐎', label: `${h.name}`, price: `$${h.odds}.00`, action: () => this.placeBet(i) }));
    menu('Bookies\' Row', `Bet 10 Mateship points. Current Mateship: ${Math.round(st.mateship)}. Next race runs during pack-up.`, opts, { closeLabel: 'Nah' });
  }
  placeBet(i) {
    const st = this.g.state; if (st.mateship < 10) { toast('Not enough Mateship to punt.', 'bad'); return; }
    st.mateship -= 10; this.bet = { horse: HORSES[i], idx: i, amount: 10 }; closeScreen(); this.g.player.enabled = true;
    toast(`$10 Mateship on ${HORSES[i].name} at $${HORSES[i].odds}.00. Watch the track!`); audio.play('cash');
  }
  raceFinished(winner) {
    const st = this.g.state; const h = HORSES[winner];
    centerMsg(`🏇 ${h.name} wins!`, 2200);
    if (this.bet) {
      if (this.bet.idx === winner) { const win = this.bet.amount * this.bet.horse.odds; st.addMateship(win, 'bookie payout!'); st.unlock('bookie'); }
      else toast(`Your horse ${this.bet.horse.name} ran like it had a schooner too.`, 'bad');
      this.bet = null;
    }
  }
  caught(chase) {
    const g = this.g, st = g.state;
    centerMsg(chase.reason === 'lemons' ? 'BUSTED! 🍋' : 'BUSTED!', 1500);
    st.addMateship(-6, chase.reason === 'lemons' ? 'security caught the lemon bandit' : 'security had words');
    st.addCash(-20); st.heat = 0; st.lemonStreak = 0;
    st.logEvent(chase.target.id, 'busted', chase.reason === 'lemons' ? 'Got busted for pegging lemons at cars' : 'Got sprung by security', false, 0.6);
  }
  update(dt, t) {
    const w = this.g.world;
    if (this._racing && !w.racing) { this._racing = false; this.raceFinished(w.raceWinner ?? 0); this.g.npcs.setMode(this.g.phase?.crowdMode || 'mingle'); }
  }
  startRace() { const w = this.g.world; w.startRace(); this._racing = true; audio.play('gallop'); this.g.npcs.setMode('race'); toast('🏇 And they\'re racing! The crowd turns to the track…'); }
}
