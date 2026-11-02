import * as THREE from 'three';
import { audio } from '../core/audio.js';

export const root = document.getElementById('ui');

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v; else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// layers
const layers = {};
export function layer(name) {
  if (!layers[name]) { layers[name] = el('div', { class: 'layer-' + name, style: { position: 'absolute', inset: 0 } }); root.append(layers[name]); }
  return layers[name];
}
export function clear(name) { if (layers[name]) layers[name].innerHTML = ''; }

let screenEl = null;
export function showScreen(node, { dim = true } = {}) {
  closeScreen();
  screenEl = el('div', { class: 'screen' + (dim ? ' dim' : '') }, node);
  layer('screen').append(screenEl); return screenEl;
}
export function closeScreen() { if (screenEl) { screenEl.remove(); screenEl = null; } }
export function screenOpen() { return !!screenEl; }

// toasts
export function toast(text, kind = '') {
  const L = layer('toasts'); let box = L.firstChild; if (!box) { box = el('div', { class: 'toasts' }); L.append(box); }
  const t = el('div', { class: 'toast ' + kind }, text); box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = 0; setTimeout(() => t.remove(), 450); }, kind === 'ach' ? 4000 : 2400);
}
export function centerMsg(text, ms = 1800) { toast(text, 'big'); }
export function centerMsgOld(text, ms = 1800) {
  const m = el('div', { class: 'center-msg' }, text); layer('center').append(m);
  setTimeout(() => { m.style.transition = 'opacity .4s'; m.style.opacity = 0; setTimeout(() => m.remove(), 400); }, ms);
}

// interaction prompt
let promptEl = null;
export function setPrompt(text, key = 'E') {
  if (!text) { if (promptEl) { promptEl.remove(); promptEl = null; } return; }
  if (!promptEl) { promptEl = el('div', { class: 'prompt' }); layer('hud').append(promptEl); }
  const html = `<span class="kbd">${esc(key)}</span>${esc(text)}`;
  if (promptEl.innerHTML !== html) promptEl.innerHTML = html;
}

// world-space labels/bubbles projected each frame
const v = new THREE.Vector3();
export class Labels {
  constructor(camera) { this.camera = camera; this.items = new Set(); this.box = layer('labels'); }
  add(obj, text, { cls = 'tag3d', offset = 2.2, ttl = 0 } = {}) {
    const e = el('div', { class: cls }, text); this.box.append(e);
    const item = { obj, e, offset, ttl, born: performance.now(), visible: true };
    this.items.add(item); return item;
  }
  bubble(obj, text, ms = 1700, offset = 2.35) {
    const live = [...this.items].filter(i => i.e.className === 'bubble');
    for (const i of live) if (i.obj === obj) this.remove(i); // one bubble per person
    while ([...this.items].filter(i => i.e.className === 'bubble').length >= 3) this.remove([...this.items].find(i => i.e.className === 'bubble'));
    return this.add(obj, text, { cls: 'bubble', offset, ttl: Math.min(ms, 2000) });
  }
  remove(item) { if (item) { item.e.remove(); this.items.delete(item); } }
  update() {
    const now = performance.now(), w = window.innerWidth, h = window.innerHeight;
    for (const it of this.items) {
      if (it.ttl && now - it.born > it.ttl) { this.remove(it); continue; }
      if (!it.visible || !it.obj) { it.e.style.display = 'none'; continue; }
      (it.obj.getWorldPosition ? it.obj.getWorldPosition(v) : v.copy(it.obj)); v.y += it.offset;
      v.project(this.camera);
      if (v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2) { it.e.style.display = 'none'; continue; }
      it.e.style.display = ''; it.e.style.left = ((v.x + 1) / 2 * w).toFixed(0) + 'px'; it.e.style.top = ((1 - v.y) / 2 * h).toFixed(0) + 'px';
    }
  }
}

// simple modal menu: options [{label, price, on, disabled, action}]
export function menu(title, subtitle, options, { onClose, closeLabel = 'Done' } = {}) {
  const box = el('div', { class: 'panel menu' }, el('h2', {}, title), subtitle ? el('div', { class: 'small' }, subtitle) : null);
  for (const o of options) {
    if (o.html) { box.append(el('div', { html: o.html })); continue; }
    const row = el('div', { class: 'opt' + (o.on ? ' on' : ''), style: o.disabled ? { opacity: .45, pointerEvents: 'none' } : {} },
      o.icon ? el('span', {}, o.icon) : null, el('span', {}, o.label), o.price != null ? el('span', { class: 'price' }, o.price) : null);
    row.addEventListener('click', () => { audio.play('click'); o.action?.(row); });
    box.append(row);
  }
  if (closeLabel) box.append(el('div', { class: 'row', style: { marginTop: '10px' } }, el('div', { class: 'spacer' }), el('button', { class: 'btn', onclick: () => { closeScreen(); onClose?.(); } }, closeLabel)));
  showScreen(box); return box;
}
