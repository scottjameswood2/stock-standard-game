// Touch controls for phones & tablets: virtual stick, drag-to-look, action buttons, rhythm lane pads.
// Every button simply fires the same keyboard events the desktop game uses, so all systems just work.
import { el, layer } from './ui.js';
import { audio } from '../core/audio.js';

export const IS_TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (e) { return false; } })();

export function key(code, type = 'keydown') { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true })); }
export function tap(code) { key(code, 'keydown'); setTimeout(() => key(code, 'keyup'), 60); }

export class TouchControls {
  constructor(game) {
    this.g = game; this.input = game.input; this.mode = 'off';
    document.body.classList.add('touch');
    const root = this.root = el('div', { class: 'touch-ui' }); layer('touch').append(root);
    // --- left: movement stick ---
    this.stickZone = el('div', { class: 't-stickzone pe' });
    this.stickBase = el('div', { class: 't-stick' }, this.knob = el('div', { class: 't-knob' }));
    this.stickZone.append(this.stickBase); root.append(this.stickZone);
    this.stickId = null; this.stickOrigin = null;
    this.stickZone.addEventListener('pointerdown', e => { e.preventDefault(); audio.init(); this.stickId = e.pointerId; this.stickOrigin = { x: e.clientX, y: e.clientY }; const zr = this.stickZone.getBoundingClientRect(); this.stickBase.style.left = (e.clientX - zr.left) + 'px'; this.stickBase.style.top = (e.clientY - zr.top) + 'px'; this.stickBase.classList.add('on'); try { this.stickZone.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } });
    this.stickZone.addEventListener('pointermove', e => { if (e.pointerId !== this.stickId) return; this.moveStick(e.clientX - this.stickOrigin.x, e.clientY - this.stickOrigin.y); });
    const endStick = e => { if (e.pointerId !== this.stickId) return; this.stickId = null; this.moveStick(0, 0); this.stickBase.classList.remove('on'); };
    this.stickZone.addEventListener('pointerup', endStick); this.stickZone.addEventListener('pointercancel', endStick);
    // --- right: drag to look (on the canvas itself) ---
    const cv = game.engine.renderer.domElement; cv.style.touchAction = 'none';
    this.looks = new Map();
    cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; audio.init(); this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    cv.addEventListener('pointermove', e => { const l = this.looks.get(e.pointerId); if (!l) return; this.input.mouse.dx += (e.clientX - l.x) * 1.6; this.input.mouse.dy += (e.clientY - l.y) * 1.6; l.x = e.clientX; l.y = e.clientY; });
    const endLook = e => this.looks.delete(e.pointerId);
    cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
    // --- right: action buttons ---
    const btn = (label, code, cls = '', hold = false) => {
      const b = el('button', { class: 't-btn pe ' + cls }, label);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.init(); b.classList.add('down'); hold ? key(code) : tap(code); });
      const up = () => { b.classList.remove('down'); if (hold) key(code, 'keyup'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      return b;
    };
    this.roamBtns = el('div', { class: 't-actions' },
      btn('Use', 'KeyE', 'big'), btn('Throw', 'KeyF'), this.ammo = el('button', { class: 't-btn pe small' }, '🍔'),
      btn('Swap', 'Tab', 'small'), this.runBtn = el('button', { class: 't-btn pe small' }, 'Run'), btn('🙅', 'KeyC', 'small', true), btn('📱', 'KeyP', 'small'), btn('🔭', 'KeyV', 'small'));
    this.runBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.input.touchRunToggle = !this.input.touchRunToggle; this.runBtn.classList.toggle('lit', this.input.touchRunToggle); });
    this.ammo.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const o = ['bun', 'patty', 'lemon']; const n = o[(o.indexOf(game.throwables.selected) + 1) % 3]; game.throwables.cycle(n); this.ammo.textContent = { bun: '🍔', patty: '🟤', lemon: '🍋' }[n]; });
    root.append(this.roamBtns);
    this.pauseBtn = btn('❚❚', 'Escape', 't-pause'); root.append(this.pauseBtn);
    // --- gig: 4 lane pads + ability strip ---
    this.pads = el('div', { class: 't-pads' });
    ['KeyD', 'KeyF', 'KeyJ', 'KeyK'].forEach((code, i) => {
      const p = el('div', { class: 't-pad pe lane' + i });
      p.addEventListener('pointerdown', e => { e.preventDefault(); audio.init(); p.classList.add('down'); key(code); });
      const up = () => { p.classList.remove('down'); key(code, 'keyup'); };
      p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('pointerleave', up);
      this.pads.append(p);
    });
    root.append(this.pads);
    this.gigBtns = el('div', { class: 't-gigbtns' }, btn('Ability', 'KeyQ'), btn('🔭', 'KeyV', 'small'), this.upBtn = btn('▲', 'KeyW', 'small', true), this.downBtn = btn('▼', 'KeyS', 'small', true), this.runCrowd = btn('Crowd run', 'KeyG', 'small'));
    root.append(this.gigBtns);
    // tap the on-screen prompt / cards to trigger them
    document.addEventListener('pointerdown', e => {
      const pr = e.target.closest?.('.prompt'); if (pr) { e.preventDefault(); tap('KeyE'); return; }
      const card = e.target.closest?.('.req-card'); if (card) { const k = card.querySelector('.kbd')?.textContent?.trim(); if (k) { e.preventDefault(); tap(k === 'SPACE' ? 'Space' : 'Key' + k); } }
    }, true);
    this.setMode('off');
  }
  moveStick(dx, dy) {
    const r = 55, d = Math.hypot(dx, dy), k = d > r ? r / d : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.input.touch.lx = dx * k / r; this.input.touch.ly = dy * k / r;
    this.input.touchRun = this.input.touchRunToggle || d > r * 1.35;
  }
  setMode(mode) { // 'off' | 'roam' | 'gig' | 'menu'
    this.mode = mode;
    const show = (e, v) => { e.style.display = v ? '' : 'none'; };
    show(this.stickZone, mode === 'roam'); show(this.roamBtns, mode === 'roam'); show(this.pads, mode === 'gig'); show(this.gigBtns, mode === 'gig');
    show(this.pauseBtn, mode === 'roam' || mode === 'gig');
    if (mode !== 'roam') this.moveStick(0, 0);
  }
  update() {
    const g = this.g, ph = g.phase;
    let mode = 'off';
    if (ph && g.phaseName !== 'results' && g.phaseName !== 'burger') mode = ph.roam ? 'roam' : (g.phaseName.startsWith('gig') ? 'gig' : 'off');
    if (document.querySelector('.layer-screen .screen')) mode = 'off';
    if (mode !== this.mode) this.setMode(mode);
    if (mode === 'gig') {
      const pid = g.state.playerId;
      this.runCrowd.style.display = pid === 'dave_young' ? '' : 'none';
      const ud = pid === 'dave_young' || !!ph.skull; this.upBtn.style.display = ud ? '' : 'none'; this.downBtn.style.display = ud ? '' : 'none';
      // line the pads up with the rhythm highway
      const cv = document.getElementById('rhythm');
      if (cv) { const r = cv.getBoundingClientRect(); Object.assign(this.pads.style, { left: r.left + 'px', width: r.width + 'px', height: Math.max(90, r.height * 0.5) + 'px' }); }
    }
  }
}

// Phone-friendly versions of the keyboard mini-games: tappable sequences, hold-to-push faders, OVER/UNDER buttons.
export function touchifyScreens() {
  const obs = new MutationObserver(() => {
    const scr = document.querySelector('.layer-screen'); if (!scr) return;
    scr.querySelectorAll('.seq .kbd:not([data-t])').forEach(k => { k.dataset.t = 1; k.classList.add('pe'); k.style.cursor = 'pointer'; k.addEventListener('pointerdown', e => { e.preventDefault(); const seq = [...k.parentNode.children]; const next = seq.find(x => !x.classList.contains('done')); if (next) tap('Key' + next.textContent.trim()); }); });
    scr.querySelectorAll('.gauge:not([data-t])').forEach(gg => {
      gg.dataset.t = 1; const panel = gg.closest('.panel'); if (!panel || panel.dataset.t) return; panel.dataset.t = 1;
      const hint = el('div', { class: 't-hint' }, 'Tap / hold here'); panel.append(hint);
      panel.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.preventDefault(); key('Space'); });
      panel.addEventListener('pointerup', () => key('Space', 'keyup'));
    });
    scr.querySelectorAll('[data-want]:not([data-t])').forEach(w => {
      w.dataset.t = 1; const row = el('div', { class: 'row', style: { justifyContent: 'center', gap: '14px' } },
        Object.assign(el('button', { class: 'btn' }, '⤴️ OVER'), { onpointerdown: e => { e.preventDefault(); tap('KeyA'); } }),
        Object.assign(el('button', { class: 'btn navy' }, '⤵️ UNDER'), { onpointerdown: e => { e.preventDefault(); tap('KeyD'); } }));
      w.after(row);
    });
  });
  obs.observe(document.getElementById('ui'), { childList: true, subtree: true });
}
