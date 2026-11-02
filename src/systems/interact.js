import * as THREE from 'three';
import { setPrompt } from '../ui/ui.js';

// Registry of things the player can press E on. Each: { id, pos(): Vector3, radius, label(): string|null, action(), key }
export class Interactions {
  constructor() { this.items = new Map(); this.current = null; this.enabled = true; }
  add(item) { this.items.set(item.id, { radius: 1.8, key: 'E', ...item }); return item.id; }
  remove(id) { this.items.delete(id); }
  clearTag(tag) { for (const [k, v] of this.items) if (v.tag === tag) this.items.delete(k); }
  update(player) {
    this.current = null;
    if (!this.enabled || !player) { setPrompt(null); return; }
    let best = null, bd = 1e9;
    const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    for (const it of this.items.values()) {
      if (it.enabled && !it.enabled()) continue;
      const p = typeof it.pos === 'function' ? it.pos() : it.pos; if (!p) continue;
      const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > it.radius || Math.abs((p.y || 0) - player.pos.y) > (it.dy ?? 1.6)) continue;
      const facing = d < 0.6 ? 1 : (fwd.x * dx + fwd.z * dz) / d;
      const score = d - facing * 0.6 - (it.priority || 0);
      if (score < bd) { const l = it.label(); if (l) { bd = score; best = { ...it, text: l }; } }
    }
    this.current = best;
    setPrompt(best ? best.text : null, best ? best.key : 'E');
  }
  trigger() { if (this.current) { const id = this.current.id; const it = this.items.get(id); it?.action(); return true; } return false; }
}
