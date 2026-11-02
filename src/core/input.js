// Keyboard + mouse (drag or pointer-lock look) + optional gamepad.
export class Input {
  constructor(canvas) {
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, left: false, right: false, leftPressed: false };
    this.canvas = canvas; this.locked = false; this.dragging = false; this.listeners = [];
    this.gp = { lx: 0, ly: 0, rx: 0, ry: 0, buttons: [], prev: [] };
    this.touch = { lx: 0, ly: 0 }; this.touchRun = false;
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (!this.down.has(k)) { this.pressed.add(k); for (const l of this.listeners) l(k, e); }
      this.down.add(k);
    });
    window.addEventListener('keyup', e => { this.down.delete(e.code); this.released.add(e.code); });
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
      this.dragging = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; this.dragging = false; });
    window.addEventListener('mousemove', e => {
      if (this.locked || this.dragging) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }
  onKey(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(l => l !== fn); }; }
  lock() { try { this.canvas.requestPointerLock?.(); } catch (e) { /* ignore */ } }
  unlock() { try { document.exitPointerLock?.(); } catch (e) { /* ignore */ } }
  isDown(...codes) { return codes.some(c => this.down.has(c)); }
  wasPressed(...codes) { return codes.some(c => this.pressed.has(c)); }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(x => x);
    const g = this.gp; g.prev = g.buttons;
    if (!p) { g.lx = this.touch.lx; g.ly = this.touch.ly; g.rx = g.ry = 0; g.buttons = []; return; }
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    g.lx = dz(p.axes[0] || 0) + this.touch.lx; g.ly = dz(p.axes[1] || 0) + this.touch.ly; g.rx = dz(p.axes[2] || 0); g.ry = dz(p.axes[3] || 0);
    g.buttons = p.buttons.map(b => b.pressed);
    // map gamepad buttons to key codes so every system works with a pad
    const map = { 0: 'KeyE', 1: 'KeyQ', 2: 'KeyF', 3: 'KeyR', 4: 'KeyD', 5: 'KeyK', 6: 'KeyF', 7: 'KeyJ', 9: 'Escape', 8: 'Tab', 12: 'KeyW', 13: 'KeyS', 14: 'Digit1', 15: 'Digit2' };
    g.buttons.forEach((b, i) => {
      const code = map[i]; if (!code) return;
      if (b && !g.prev[i]) { this.pressed.add(code); this.down.add(code); for (const l of this.listeners) l(code, {}); }
      if (!b && g.prev[i]) { this.down.delete(code); this.released.add(code); }
    });
  }
  endFrame() { this.pressed.clear(); this.released.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; this.mouse.leftPressed = false; }
}
