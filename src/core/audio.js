// WebAudio engine: master bus, synthesised SFX, crowd ambience, optional speech lines.
export class AudioEngine {
  constructor() {
    this.ctx = null; this.enabled = true; this.voice = true; this.volume = 0.8;
    this._lastSpeak = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = 0.9; this.music.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 2; const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // distortion curve
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = Math.tanh(x * 6) * 0.9; }
    this.distCurve = curve;
    // crowd ambience: looping band-passed noise whose gain follows crowd energy
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0.0;
    src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.sfx); src.start();
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setCrowd(level) { if (this.crowdGain) this.crowdGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.16, this.now, 0.4); }

  noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.4, attack = 0.002, dest } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(t, freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, release = null, dest, slideTo = null, detune = 0 } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + (release ?? dur) + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.now + 0.005, v = opts.vol ?? 1;
    switch (name) {
      case 'click': this.tone(t, 900, 0.05, { type: 'square', gain: 0.08 * v }); break;
      case 'ok': this.tone(t, 660, 0.08, { type: 'triangle', gain: 0.2 * v }); this.tone(t + 0.07, 990, 0.12, { type: 'triangle', gain: 0.2 * v }); break;
      case 'bad': this.tone(t, 220, 0.25, { type: 'sawtooth', gain: 0.12 * v, slideTo: 140 }); break;
      case 'pickup': this.tone(t, 520, 0.07, { type: 'triangle', gain: 0.18 * v }); this.tone(t + 0.05, 780, 0.09, { type: 'triangle', gain: 0.15 * v }); break;
      case 'drop': this.tone(t, 160, 0.12, { type: 'sine', gain: 0.35 * v, slideTo: 70 }); this.noise(t, 0.08, { freq: 400, gain: 0.2 * v }); break;
      case 'whoosh': this.noise(t, 0.25, { freq: 1500, q: 2, gain: 0.18 * v, attack: 0.08 }); break;
      case 'splat': this.noise(t, 0.18, { type: 'lowpass', freq: 600, gain: 0.5 * v }); this.tone(t, 120, 0.1, { gain: 0.3 * v, slideTo: 60 }); break;
      case 'thud': this.tone(t, 90, 0.18, { gain: 0.5 * v, slideTo: 40 }); break;
      case 'clink': this.tone(t, 2400, 0.25, { gain: 0.12 * v }); this.tone(t + 0.02, 3100, 0.2, { gain: 0.08 * v }); break;
      case 'pour': this.noise(t, 0.6, { type: 'bandpass', freq: 2500, q: 0.8, gain: 0.08 * v, attack: 0.1 }); break;
      case 'gulp': this.tone(t, 180, 0.09, { type: 'sine', gain: 0.25 * v, slideTo: 90 }); break;
      case 'spill': this.noise(t, 0.35, { type: 'highpass', freq: 1800, gain: 0.25 * v, attack: 0.01 }); break;
      case 'cash': this.tone(t, 1300, 0.06, { type: 'square', gain: 0.07 * v }); this.tone(t + 0.07, 1750, 0.2, { type: 'triangle', gain: 0.12 * v }); break;
      case 'honk': { const d = opts.dur ?? 0.7; this.tone(t, 233, d, { type: 'sawtooth', gain: 0.18 * v, attack: 0.02 }); this.tone(t, 277, d, { type: 'sawtooth', gain: 0.14 * v, attack: 0.02 }); break; }
      case 'carhonk': this.tone(t, 420, 0.35, { type: 'square', gain: 0.1 * v }); this.tone(t + 0.45, 420, 0.35, { type: 'square', gain: 0.1 * v }); break;
      case 'alarm': for (let i = 0; i < 8; i++) { this.tone(t + i * 0.25, i % 2 ? 1100 : 750, 0.22, { type: 'square', gain: 0.06 * v }); } break;
      case 'cheer': this.noise(t, 2.2, { freq: 1100, q: 0.5, gain: 0.35 * v, attack: 0.3 }); this.noise(t + 0.1, 1.8, { freq: 2600, q: 0.7, gain: 0.15 * v, attack: 0.3 }); break;
      case 'boo': this.tone(t, 160, 1.0, { type: 'sawtooth', gain: 0.06 * v, slideTo: 110, attack: 0.2 }); this.noise(t, 1.0, { freq: 300, gain: 0.15 * v, attack: 0.2 }); break;
      case 'feedback': { const d = opts.dur ?? 1.5; this.tone(t, 2950, d, { type: 'sine', gain: 0.12 * v, attack: 0.3, slideTo: 3150 }); break; }
      case 'thunder': this.noise(t, 2.5, { type: 'lowpass', freq: 200, gain: 0.6 * v, attack: 0.05 }); break;
      case 'rain': this.noise(t, 4, { type: 'highpass', freq: 3000, gain: 0.1 * v, attack: 0.6 }); break;
      case 'wind': this.noise(t, 2.0, { type: 'bandpass', freq: 500, q: 0.4, gain: 0.25 * v, attack: 0.6 }); break;
      case 'gallop': for (let i = 0; i < 24; i++) { this.tone(t + i * 0.16 + (i % 3) * 0.04, 70 + Math.random() * 20, 0.06, { gain: 0.25 * v }); } break;
      case 'clunk': this.noise(t, 0.08, { freq: 300, q: 3, gain: 0.3 * v }); break;
      case 'crackle': for (let i = 0; i < 10; i++) this.noise(t + Math.random() * 0.6, 0.03, { type: 'highpass', freq: 4000, gain: 0.3 * v }); break;
      case 'collapse': for (let i = 0; i < 6; i++) this.tone(t + i * 0.09, 200 - i * 20, 0.1, { gain: 0.3 * v }); this.play('splat'); break;
      case 'grill': this.noise(t, 1.2, { type: 'highpass', freq: 5000, gain: 0.06 * v, attack: 0.2 }); break;
      case 'achievement': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, f, 0.25, { type: 'triangle', gain: 0.16 * v })); break;
    }
  }

  // Optional voice lines (browser speech synthesis). Rate-limited so it never gets annoying.
  say(text, { force = false, pitch = 1, rate = 1.05 } = {}) {
    if (!this.voice || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (!force && now - this._lastSpeak < 3500) return;
    this._lastSpeak = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices();
      const au = vs.find(v => /en[-_]AU/i.test(v.lang)) || vs.find(v => /en[-_]GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
      if (au) u.voice = au; u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, this.volume + 0.1);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
}
export const audio = new AudioEngine();
