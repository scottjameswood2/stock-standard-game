import * as THREE from 'three';
import { el, showScreen, closeScreen, toast, menu } from '../ui/ui.js';
import { audio } from '../core/audio.js';

const PRICE = 7;

// Bar: queues, shouts, carrying drinks (slosh), deliveries, water & snags.
export class Drinks {
  constructor(game) { this.g = game; this.slosh = 0; this.recipients = []; this.queues = [3, 5, 2]; this.lastVel = new THREE.Vector3(); this.busy = false; }
  rerollQueues() { this.queues = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6)); }
  openBar() {
    const g = this.g, st = g.state; this.rerollQueues();
    const tall = st.hasAbility(st.playerId, 'tall_poppy');
    const shortest = this.queues.indexOf(Math.min(...this.queues));
    g.player.enabled = false;
    menu('The Bar Tent', tall ? 'Tall Poppy: you can see over everyone. Shortest queue highlighted.' : 'Pick a queue. Can\'t see over the fascinators… (James Huntersmith could.)',
      this.queues.map((q, i) => ({ label: `Queue ${i + 1}`, price: tall ? `${q} deep` : '?', on: tall && i === shortest, action: () => this.waitInQueue(q) })),
      { onClose: () => { g.player.enabled = true; }, closeLabel: 'Walk away' });
  }
  waitInQueue(len) {
    const g = this.g, secs = Math.max(1, len * 1.1);
    const fill = el('div', { style: { height: '100%', width: '0%', background: '#f2a91a', transition: `width ${secs}s linear` } });
    showScreen(el('div', { class: 'panel mini' }, el('h2', {}, 'Waiting at the bar…'), el('div', { class: 'small' }, `${len} punter${len > 1 ? 's' : ''} ahead of you. Someone's ordering eleven espresso martinis.`),
      el('div', { class: 'gauge' }, fill)));
    requestAnimationFrame(() => requestAnimationFrame(() => fill.style.width = '100%'));
    setTimeout(() => this.orderMenu(), secs * 1000);
  }
  orderMenu() {
    const g = this.g, st = g.state;
    const opts = [
      { icon: '🍻', label: 'Shout a round…', action: () => this.shoutMenu() },
      { icon: '🍺', label: 'Schooner for me', price: `$${PRICE}`, disabled: st.wallet < PRICE, action: () => { st.addCash(-PRICE); this.drinkSelf(); this.orderMenu(); } },
      { icon: '💧', label: 'Water (lowers Buzz)', price: 'free', action: () => { st.addBuzz(-12); audio.play('gulp'); toast('Water. Hydration is mateship with yourself. −Buzz', 'good'); this.orderMenu(); } },
      { icon: '🌭', label: 'Snag in bread (lowers Buzz)', price: '$4', disabled: st.wallet < 4, action: () => { st.addCash(-4); st.addBuzz(-16); audio.play('gulp'); toast('Snag with onions. Big −Buzz', 'good'); this.orderMenu(); } },
      { icon: '🎉', label: 'Shout THE WHOLE CROWD', price: '$90', disabled: st.wallet < 90, action: () => { st.addCash(-90); st.addCrowd(18); audio.play('cheer'); toast('You shouted the crowd! +18 Crowd Energy. Wallet: pain.', 'good'); st.logEvent(st.playerId, 'shout_crowd', 'Shouted the whole crowd', true, 0.6); this.orderMenu(); } },
    ];
    menu('What\'ll it be?', `Wallet $${Math.round(st.wallet)} · Buzz: ${st.buzzBand()}`, opts, { onClose: () => { g.player.enabled = true; } });
  }
  drinkSelf() { const st = this.g.state, a = this.g.player.actor; st.addBuzz(12); a.playOnce('drink', 1500); audio.play('gulp'); st.members[st.playerId] && st.members[st.playerId].drinks++; }
  shoutMenu() {
    const g = this.g, st = g.state, me = st.playerId;
    const people = [...st.bandIds, 'jamie'];
    const sel = new Set(people);
    const list = el('div', {});
    const total = el('div', { style: { fontWeight: 900, margin: '8px 0' } });
    const refresh = () => { total.textContent = `${sel.size} drinks · $${sel.size * PRICE} · Mateship multiplier ×${(1 + 0.25 * Math.max(0, sel.size - 1)).toFixed(2)}`; };
    for (const id of people) {
      const m = st.member(id), mood = st.members[id];
      const row = el('div', { class: 'opt on' }, el('span', {}, id === me ? `🍺 ${m.name} (you)` : `🍺 ${m.name}${id === 'jamie' ? ' — better mix!' : ''}${mood?.sulking ? ' 😤 sulking' : ''}`));
      row.addEventListener('click', () => { if (sel.has(id)) { sel.delete(id); row.classList.remove('on'); } else { sel.add(id); row.classList.add('on'); } refresh(); audio.play('click'); });
      list.append(row);
    }
    refresh();
    const go = el('button', { class: 'btn red', onclick: () => {
      const cost = sel.size * PRICE; if (st.wallet < cost) { toast('Not enough cash, legend.', 'bad'); return; }
      st.addCash(-cost); closeScreen(); g.player.enabled = true; this.startCarry([...sel]);
    } }, 'Shout!');
    showScreen(el('div', { class: 'panel menu' }, el('h2', {}, 'Shout a round'), el('div', { class: 'small' }, 'Tap to include or leave out. Forget a bandmate and they\'ll sulk until you make it up. Shouting Jamie = your channel goes up in the mix.'), list, total,
      el('div', { class: 'row' }, el('button', { class: 'btn ghost', onclick: () => this.orderMenu() }, 'Back'), el('div', { class: 'spacer' }), go)));
  }
  startCarry(ids) {
    const g = this.g, st = g.state, me = st.playerId, a = g.player.actor;
    const band = st.bandIds;
    if (ids.includes(me)) { this.drinkSelf(); ids = ids.filter(i => i !== me); }
    const forgotten = band.filter(id => id !== me && !ids.includes(id));
    if (ids.length) for (const id of forgotten) { st.members[id].sulking = true; st.mood(id, -10); toast(`${st.member(id).name} noticed they weren't in the shout… 😤`, 'bad'); st.logEvent(me, 'forgot_shout', `Left ${st.member(id).name} out of the shout`, false, 0.8); st.logEvent(id, 'forgotten', 'Got left out of a shout', false, 0.2); }
    if (ids.length >= band.length - 1 + 1 && ids.includes('jamie') && forgotten.length === 0) st.unlock('shout_king');
    this.recipients = ids.slice(); this.roundSize = ids.length + (forgotten.length ? 0 : 1);
    a.drinksCarried = ids.length; this.slosh = 0;
    if (ids.length) {
      a.attach('schooner', 'socket_hand_R', 'drinkR'); if (ids.length > 1) a.attach('schooner', 'socket_hand_L', 'drinkL');
      toast(`Carrying ${ids.length} drinks. Walk carefully. Bumping punters spills them!`);
      g.hud.setObjective(`Deliver drinks: ${ids.map(i => st.member(i).name).join(', ')}`);
    }
    st.logEvent(me, 'shout', `Shouted a round (${ids.length + 1})`, true, 1 + ids.length * 0.2);
    for (const id of ids) this.g.interact.add({
      id: 'deliver_' + id, tag: 'deliver', radius: 2.0, priority: 1,
      pos: () => g.band.get(id)?.pos, enabled: () => this.recipients.includes(id) && id !== st.playerId,
      label: () => `Give ${st.member(id).name} a schooner`, action: () => this.deliver(id),
    });
  }
  deliver(id) {
    const g = this.g, st = g.state, a = g.player.actor, target = g.band.get(id);
    this.recipients = this.recipients.filter(r => r !== id); a.drinksCarried = this.recipients.length;
    if (!a.drinksCarried) { a.detach('drinkR'); a.detach('drinkL'); g.hud.setObjective(g.phaseObjective || ''); } else if (a.drinksCarried === 1) a.detach('drinkL');
    audio.play('clink'); target.drinking = 1.8; target.playOnce?.('drink', 1600);
    const mult = 1 + 0.25 * Math.max(0, (this.roundSize || 1) - 1);
    const m = st.members[id];
    if (m) { m.shouted++; m.buzz += 12; if (m.sulking) { m.sulking = false; toast(`${st.member(id).name} has forgiven you.`, 'good'); } }
    st.mood(id, 10);
    if (id === 'jamie') { st.mix[st.playerId] = 1.3; g.labels.bubble(target.group, 'Legend. Turning you up next song.'); st.logEvent('jamie', 'got_shout', 'Thanks for the beer — you got turned up', true, 0.3); st.logEvent(st.playerId, 'shouted_jamie', 'Shouted Jamie a beer', true, 0.8); }
    else { g.labels.bubble(target.group, ['Cheers mate!', 'You beauty!', 'Legend!', 'Ooh, a cold one!'][Math.floor(Math.random() * 4)]); st.logEvent(id, 'thanks_shout', 'Thanks for the shout', true, 0.2); }
    st.addMateship(3 * mult, `drink for ${st.member(id).name}`);
    g.interact.remove('deliver_' + id); g.hud.dirty = true;
  }
  update(dt) {
    const a = this.g.player.actor; if (!a || !a.drinksCarried) { this.slosh = Math.max(0, this.slosh - dt); return; }
    const acc = a.vel.clone().sub(this.lastVel).length() / Math.max(dt, 1e-3); this.lastVel.copy(a.vel);
    const buzz = this.g.state.buzz;
    this.slosh += (acc * 0.012 + a.speed * 0.02 * (a.speed > 3 ? 3 : 1)) * dt * (1 + buzz / 60) * (1 + a.drinksCarried * 0.15);
    if (a.bumped && a.bumped.isNPC) { this.slosh += 0.5; a.bumped = null; this.g.labels.bubble(a.group, 'Whoa whoa whoa', 900); }
    this.slosh = Math.max(0, this.slosh - dt * 0.18);
    if (this.slosh >= 1) {
      this.slosh = 0.45; const lost = this.recipients.pop(); a.drinksCarried = this.recipients.length; audio.play('spill');
      toast(`🍺 Spilled ${this.g.state.member(lost).name}'s drink!`, 'bad'); this.g.state.logEvent(this.g.state.playerId, 'spill', 'Spilled a drink on the long walk back', false, 0.4);
      this.g.interact.remove('deliver_' + lost);
      if (!a.drinksCarried) { a.detach('drinkR'); a.detach('drinkL'); this.g.hud.setObjective(this.g.phaseObjective || ''); } else if (a.drinksCarried === 1) a.detach('drinkL');
    }
    this.g.hud.dirty = true;
  }
}
