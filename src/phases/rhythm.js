import { layer, el } from '../ui/ui.js';
import { audio } from '../core/audio.js';

export const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
const LANE_COL = ['#3fbf5f', '#e8453c', '#f2c41a', '#3b7dd8'];
const LANE_LABEL = ['D', 'F', 'J', 'K'];

// 4-lane note highway drawn on a 2D canvas + hit judging.
export class Rhythm {
  constructor() {
    this.canvas = el('canvas', { id: 'rhythm' }); this.ctx = this.canvas.getContext('2d');
    this.notes = []; this.combo = 0; this.best = 0; this.hits = 0; this.perfects = 0; this.misses = 0; this.total = 0;
    this.flash = [0, 0, 0, 0]; this.judge = null; this.window = 0.1; this.perfect = 0.045; this.drift = 0; this.lookahead = 1.6;
    this.onHit = null; this.onMiss = null; this.disabledUntil = -1; this.label = ''; this.soloGlow = 0; this.hidden = false;
    layer('rhythm').append(this.canvas); this.resize(); window.addEventListener('resize', this._rs = () => this.resize());
  }
  resize() { const w = Math.min(520, window.innerWidth - 20), h = Math.min(300, window.innerHeight * 0.42); this.canvas.width = w * 2; this.canvas.height = h * 2; this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; this.W = w; this.H = h; }
  load(notes) { this.notes = notes; this.total = notes.length; this.hits = this.perfects = this.misses = this.combo = 0; }
  destroy() { this.canvas.remove(); window.removeEventListener('resize', this._rs); }
  press(lane, songTime) {
    this.flash[lane] = 1;
    if (songTime < this.disabledUntil) return;
    const t = songTime + this.drift;
    let best = null, bd = 1e9;
    for (const n of this.notes) { if (n.hit || n.missed || n.lane !== lane) continue; const d = Math.abs(n.t - t); if (d < bd) { bd = d; best = n; } if (n.t > t + this.window) break; }
    if (best && bd <= this.window) {
      best.hit = true; this.hits++; this.combo++; this.best = Math.max(this.best, this.combo);
      const perfect = bd <= this.perfect; if (perfect) this.perfects++;
      this.judge = { text: perfect ? 'PERFECT' : 'GOOD', col: perfect ? '#f2a91a' : '#ffffff', t: performance.now() };
      this.onHit?.(best, perfect);
    } else { // stray press = clunk, small penalty but no combo loss unless far from any note
      audio.play('clunk', { vol: 0.4 }); this.onStray?.();
    }
  }
  update(songTime) {
    const t = songTime + this.drift;
    for (const n of this.notes) {
      if (n.t > t) break;
      if (!n.hit && !n.missed && t - n.t > this.window) {
        n.missed = true;
        if (songTime < this.disabledUntil) continue;
        this.misses++; this.combo = 0; this.judge = { text: 'MISS', col: '#e8453c', t: performance.now() }; this.onMiss?.(n);
      }
    }
    this.draw(songTime);
  }
  accuracy() { const judged = this.hits + this.misses; return judged ? this.hits / judged : 1; }
  draw(songTime) {
    const c = this.ctx, W = this.W, H = this.H, s = 2; c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, W, H);
    if (this.hidden) return;
    const topW = W * 0.42, botW = W * 0.92, hitY = H - 46, topY = 6;
    const laneX = (lane, y) => { const k = (y - topY) / (hitY - topY); const w = topW + (botW - topW) * k; return W / 2 - w / 2 + w * (lane + 0.5) / 4; };
    const laneW = y => { const k = (y - topY) / (hitY - topY); return (topW + (botW - topW) * k) / 4; };
    // highway
    c.beginPath(); c.moveTo(W / 2 - topW / 2, topY); c.lineTo(W / 2 + topW / 2, topY); c.lineTo(W / 2 + botW / 2 + 10, H); c.lineTo(W / 2 - botW / 2 - 10, H); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(19,35,92,0.0)'); g.addColorStop(0.3, 'rgba(19,35,92,0.55)'); g.addColorStop(1, 'rgba(19,35,92,0.85)');
    c.fillStyle = g; c.fill();
    if (this.soloGlow > 0) { c.fillStyle = `rgba(242,169,26,${0.18 * this.soloGlow})`; c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(W / 2 - topW / 2 + topW * i / 4, topY); c.lineTo(W / 2 - botW / 2 + botW * i / 4, hitY + 30); c.stroke(); }
    // hit targets
    for (let l = 0; l < 4; l++) {
      const x = laneX(l, hitY), r = laneW(hitY) * 0.36; this.flash[l] *= 0.85;
      c.beginPath(); c.arc(x, hitY, r, 0, Math.PI * 2); c.fillStyle = `rgba(255,255,255,${0.12 + this.flash[l] * 0.5})`; c.fill();
      c.lineWidth = 3; c.strokeStyle = LANE_COL[l]; c.stroke();
      c.fillStyle = '#fff'; c.font = '800 13px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(LANE_LABEL[l], x, hitY + r + 12);
    }
    // notes
    const t = songTime;
    for (const n of this.notes) {
      const dt = n.t - t; if (dt > this.lookahead) break; if (dt < -0.25) continue; if (n.hit) continue;
      const k = 1 - dt / this.lookahead; const y = topY + (hitY - topY) * Math.pow(Math.max(0, k), 1.6);
      const x = laneX(n.lane, y), r = laneW(y) * 0.32;
      c.beginPath(); c.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
      c.fillStyle = n.missed ? 'rgba(120,120,120,0.6)' : LANE_COL[n.lane]; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = n.solo ? '#fff3c4' : 'rgba(0,0,0,0.6)'; c.stroke();
      if (!n.missed) { c.beginPath(); c.ellipse(x, y - r * 0.15, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill(); }
    }
    // judge + combo
    if (this.judge && performance.now() - this.judge.t < 500) {
      const a = 1 - (performance.now() - this.judge.t) / 500; c.globalAlpha = a; c.font = '900 22px Bungee, Impact, sans-serif'; c.fillStyle = this.judge.col; c.strokeStyle = '#1d1a2e'; c.lineWidth = 4;
      c.strokeText(this.judge.text, W / 2, hitY - 70 - (1 - a) * 12); c.fillText(this.judge.text, W / 2, hitY - 70 - (1 - a) * 12); c.globalAlpha = 1;
    }
    if (this.combo >= 5) { c.font = '900 16px Bungee, Impact, sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#1d1a2e'; c.lineWidth = 4; const txt = `${this.combo} combo`; c.strokeText(txt, W / 2, hitY - 44); c.fillText(txt, W / 2, hitY - 44); }
    if (songTime < this.disabledUntil) { c.font = '900 18px Bungee, Impact, sans-serif'; c.fillStyle = '#ffd0c8'; c.fillText(this.label || 'Recovering…', W / 2, H / 2); }
  }
}
