import { el, layer } from './ui.js';

const meter = (label, color, zone) => {
  const fill = el('div', { class: 'fill', style: { background: color } });
  const val = el('span', {}, '');
  const bar = el('div', { class: 'bar' }, zone ? el('div', { class: 'zone', style: { left: zone[0] + '%', width: (zone[1] - zone[0]) + '%' } }) : null, fill);
  const box = el('div', { class: 'meter' }, el('div', { class: 'lbl' }, el('span', {}, label), val), bar);
  return { box, fill, val };
};

export class HUD {
  constructor(game) {
    this.g = game; this.root = layer('hud'); this.dirty = true; this.acc = 0; this.visible = false;
    this.top = el('div', { class: 'hud-top' });
    this.m = { mate: meter('MATESHIP', '#2f8f4e'), buzz: meter('BUZZ', '#f2a91a', [20, 55]), crowd: meter('CROWD ENERGY', '#c8231c'), heat: meter('HEAT', '#e8453c'), slosh: meter('SLOSH', '#1f8a8a') };
    for (const k of ['mate', 'buzz', 'crowd', 'heat', 'slosh']) this.top.append(this.m[k].box);
    this.phase = el('div', { class: 'hud-phase' }, this.chip = el('div', { class: 'phase-chip' }, ''), this.obj = el('div', { class: 'objective' }, ''));
    this.right = el('div', { class: 'hud-right' });
    this.wallet = el('div', { class: 'chip' }, '$0'); this.playing = el('div', { class: 'chip' }, '');
    this.pocket = el('div', { class: 'pocket' }); this.carry = el('div', { class: 'chip' }, '');
    this.skipBtn = el('button', { class: 'btn ghost skip-btn pe', onclick: () => this.g.skip() }, 'Skip ⏭');
    this.zoomBtn = el('button', { class: 'btn ghost skip-btn pe', title: 'Zoom out / in (V)', onclick: () => this.g.toggleZoom() }, '🔭 Zoom out');
    this.burgerBtn = el('button', { class: 'btn ghost skip-btn pe', title: 'Jump straight to the Feedback Burger Circle', onclick: () => this.g.skipToBurger() }, 'Skip to feedback 🍔');
    this.right.append(this.skipBtn, this.burgerBtn, this.zoomBtn, this.playing, this.wallet, this.pocket, this.carry);
    this.hint = el('div', { class: 'controls-hint' });
    this.top.append(this.phase);
    this.root.append(this.top, this.right, this.hint);
    this.show(false);
  }
  show(v) { document.body.classList.toggle('ingame', !!v); this.visible = v; for (const e of [this.top, this.phase, this.right, this.hint]) e.style.display = v ? '' : 'none'; }
  setPhase(name, objective) { this.chip.textContent = name; this.setObjective(objective); }
  setObjective(t) { // the objective shrinks & fades after a few seconds so it doesn't block the view
    if (this.obj.innerHTML === (t || '')) return;
    this.obj.innerHTML = t || ''; this.obj.style.display = t ? '' : 'none';
    const key = (t || '').replace(/[\d:]+/g, '');
    if (key !== this.objKey) { this.objKey = key; this.obj.classList.remove('faded'); clearTimeout(this.objT); this.objT = setTimeout(() => this.obj.classList.add('faded'), 5000); }
  }
  setHint(html) {
    this.hint.innerHTML = html; this.hint.style.display = html && this.visible ? '' : 'none'; this.hint.classList.remove('gone');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => this.hint.classList.add('gone'), 9000); // controls hint fades away
  }
  update(dt) {
    if (!this.visible) return;
    this.acc += dt; if (!this.dirty && this.acc < 0.2) return; this.acc = 0; this.dirty = false;
    const st = this.g.state, p = this.g.player.actor;
    const set = (m, v, txt) => { m.fill.style.width = Math.max(0, Math.min(100, v)) + '%'; m.val.textContent = txt; };
    set(this.m.mate, st.mateship, Math.round(st.mateship));
    set(this.m.buzz, st.buzz, st.buzzBand());
    set(this.m.crowd, st.crowd, Math.round(st.crowd));
    const showHeat = st.heat > 0 || st.playerId === 'hayden_joseph';
    this.m.heat.box.style.display = showHeat ? '' : 'none'; set(this.m.heat, st.heat, st.lemonStreak ? `Streak x${st.lemonStreak}` : Math.round(st.heat) + '%');
    const sl = p?.drinksCarried ? this.g.drinks.slosh : -1;
    this.m.slosh.box.style.display = sl >= 0 ? '' : 'none'; if (sl >= 0) set(this.m.slosh, sl * 100, `${p.drinksCarried} drinks`);
    const gp = this.g.phase, onLast = gp && gp.queue && gp.songIdx >= gp.queue.length - 1;
    const songLab = gp && gp.queue ? (onLast ? `Song ${gp.queue.length}/${gp.queue.length} · Skip to pack-up ⏭` : `Song ${Math.max(1, gp.songIdx + 1)}/${gp.queue.length} · Skip to song ${Math.max(1, gp.songIdx + 1) + 1} ⏭`) : 'Skip song ⏭';
    const lab = { loadin: 'Skip load-in ⏭', soundcheck: 'Skip soundcheck ⏭', gig1: songLab, gig2: songLab, setbreak: 'End set break ⏭', packup: 'Skip pack-up ⏭' }[this.g.phaseName];
    this.burgerBtn.style.display = ['loadin', 'soundcheck', 'gig1', 'gig2', 'setbreak', 'packup'].includes(this.g.phaseName) ? '' : 'none';
    this.skipBtn.style.display = lab ? '' : 'none'; if (lab && this.skipBtn.textContent !== lab) this.skipBtn.textContent = lab;
    const zl = this.g.rig.far ? '🔍 Zoom in' : '🔭 Zoom out'; if (this.zoomBtn.textContent !== zl) this.zoomBtn.textContent = zl;
    this.wallet.textContent = `💵 $${Math.round(st.wallet)}`;
    this.playing.textContent = `🎸 ${st.player?.name || ''}`;
    const pk = st.pocket || { bun: 0, patty: 0, lemon: 0 }, sel = this.g.throwables.selected;
    this.pocket.innerHTML = '';
    for (const [k, icon, key] of [['bun', '🍔', '1'], ['patty', '🟤', '2'], ['lemon', '🍋', '3']]) {
      this.pocket.append(el('div', { class: 'chip pe', title: 'Click to select', style: Object.assign({ cursor: 'pointer' }, sel === k ? { background: '#f2a91a' } : {}), onpointerdown: e => { e.preventDefault(); this.g.throwables.cycle(k); if (this.g.touch) this.g.touch.ammo.textContent = { bun: '🍔', patty: '🟤', lemon: '🍋' }[k]; } }, `${key} ${icon} ${k} ×∞`));
    }
    const c = p?.carry ? `📦 Carrying: ${p.carry.label}` : p?.canapeFor ? `🥟 Canapé for ${p.canapeFor.map(c => c.veg ? 'vego' : 'meat').join(', ')}` : p?.holding ? `✋ ${p.holding}` : '';
    this.carry.textContent = c; this.carry.style.display = c ? '' : 'none';
  }
}
