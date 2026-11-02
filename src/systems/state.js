// Central game state: lineup, meters, per-member mood, the gig event log, achievements & save data.
import { toast } from '../ui/ui.js';
import { audio } from '../core/audio.js';

export const ACHIEVEMENTS = {
  lemons: { name: 'When Life Gives You Lemons', desc: 'Set off every car alarm at the Colac Cup.', hidden: true },
  hoverer: { name: 'The Hoverer', desc: 'Snag canapés from every tray (Colac edition: both waitstaff).', hidden: true },
  bun_voyage: { name: 'Bun Voyage', desc: 'Hit the venue coordinator with a bun (Yarra Valley wedding).', hidden: true, future: true },
  beret_beat: { name: 'Beret Beat', desc: 'Play a gig with Dunny on drums.', hidden: true },
  skull_legend: { name: 'Skull Legend', desc: 'Finish the beer AND the solo in the Solo Skull.' },
  shout_king: { name: 'Shout of the Day', desc: 'Shout the whole band and Jamie in one round.' },
  over_under: { name: 'Over-Under Hero', desc: 'Wrap every lead over-under without a mistake.' },
  beret_rescue: { name: 'Beret Rescue', desc: 'Return Dunny\'s beret after it gets knocked off.' },
  full_send: { name: 'Full Send', desc: 'Climb to the very top mid-song without falling.' },
  bookie: { name: 'Each-Way Legend', desc: 'Win a bet with the bookie.' },
  skol: { name: 'Skol-Off Champion', desc: 'Win a skol-off against a punter.' },
  balanced: { name: 'Classic Burger', desc: 'Give a bun-patty-bun burger that references real gig events.' },
  racecourse_legend: { name: 'Racecourse Legends', desc: 'Earn 3 stars at the Colac Cup.' },
};

const SAVE_KEY = 'stockstandard_save_v1';
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }

export class GameState {
  constructor(roster, songs) {
    this.roster = roster; this.songs = songs;
    const s = loadSave();
    this.save = { achievements: s.achievements || {}, traits: s.traits || {}, buffs: s.buffs || {}, challenges: s.challenges || [], reputation: s.reputation || { colac: 0 }, gigs: s.gigs || 0, unlocks: s.unlocks || [], bestScore: s.bestScore || 0 };
    this.settings = Object.assign({ difficulty: 1, voice: true, volume: 0.8, shortGig: false }, s.settings || {});
    this.reset();
  }
  reset() {
    this.lineup = { ...this.roster.defaultLineup }; this.playerId = 'scotty_woods';
    this.mateship = 50; this.buzz = 10; this.crowd = 30; this.wallet = 80; this.heat = 0; this.lemonStreak = 0;
    this.mix = {}; this.members = {}; this.log = []; this.score = { performance: 0, songs: [], burger: 0, bonus: 0 };
    this.sick = null; this.phase = 'title'; this.carsAlarmed = new Set(); this.traysHit = new Set();
    this.flags = {};
  }
  member(id) { return this.roster.members.find(m => m.id === id) || this.roster.crew.find(m => m.id === id); }
  get band() { return Object.entries(this.lineup).map(([slot, id]) => ({ slot, id, ...this.member(id) })); }
  get bandIds() { return Object.values(this.lineup); }
  slotOf(id) { return Object.entries(this.lineup).find(([, v]) => v === id)?.[0]; }
  initMembers() {
    this.members = {};
    for (const id of [...this.bandIds, 'jamie']) {
      const buff = this.save.buffs[id] || {};
      this.members[id] = { mood: 60 + (buff.mood || 0), sulking: false, shouted: 0, drinks: 0, carried: 0, helped: 0, canapes: 0, hits: 0, misses: 0, noodled: 0, mistakes: 0, accuracy: [], buzz: 5, timingBuff: buff.timing || 0, annoyed: 0 };
      this.mix[id] = 1;
    }
  }
  synergies() {
    const ids = this.bandIds, out = [];
    for (const s of this.roster.synergies) {
      const ok = s.members.every(m => m.includes('@') ? this.lineup[m.split('@')[1]] === m.split('@')[0] : ids.includes(m));
      if (ok) out.push(s.id);
    }
    return out;
  }
  hasSyn(id) { return this.synergies().includes(id); }
  hasAbility(memberId, ab) { return this.bandIds.includes(memberId) && (this.member(memberId)?.abilities || []).includes(ab); }
  anyAbility(ab) { return this.bandIds.some(id => (this.member(id)?.abilities || []).includes(ab)); }
  get player() { return this.member(this.playerId); }

  // meters
  addMateship(n, why) { const mult = n > 0 && this.save.traits[this.playerId] === 'too_soft' ? 0.7 : 1; this.mateship = Math.max(0, Math.min(100, this.mateship + n * mult)); if (why) toast(`${n >= 0 ? '+' : ''}${Math.round(n * mult)} Mateship · ${why}`, n >= 0 ? 'good' : 'bad'); }
  addBuzz(n) { this.buzz = Math.max(0, Math.min(100, this.buzz + n)); }
  addCrowd(n) { this.crowd = Math.max(0, Math.min(100, this.crowd + n)); }
  addCash(n) { this.wallet = Math.max(0, this.wallet + n); if (n > 0) audio.play('cash'); }
  mood(id, n) { const m = this.members[id]; if (m) m.mood = Math.max(0, Math.min(100, m.mood + n)); }
  buzzBand() { return this.buzz < 20 ? 'Sober' : this.buzz < 55 ? 'Sweet spot' : this.buzz < 75 ? 'Loose' : this.buzz < 90 ? 'Wobbly' : 'Cooked'; }
  buzzConfidence() { return this.buzz >= 20 && this.buzz <= 55 ? 1.12 : this.buzz > 75 ? 0.9 : 1; }

  // gig event log → feedback chips
  logEvent(who, type, text, positive, weight = 1) { this.log.push({ who, type, text, positive, weight, t: Date.now(), phase: this.phase }); }
  eventsFor(id) { return this.log.filter(e => e.who === id); }

  unlock(id) {
    if (this.save.achievements[id]) return;
    this.save.achievements[id] = Date.now(); audio.play('achievement');
    toast(`🏆 Achievement: ${ACHIEVEMENTS[id]?.name || id}`, 'ach'); this.persist();
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...this.save, settings: this.settings })); } catch (e) { /* storage unavailable */ } }
}
