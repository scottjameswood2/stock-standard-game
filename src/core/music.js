// Procedural pub-rock band: builds note events for every part from songs.json and plays them live
// with WebAudio synths. Also derives the 4-lane rhythm-game chart for whichever part the player plays.
import { audio } from './audio.js';

const DEG = { I: 0, i: 0, ii: 2, iii: 4, IV: 5, iv: 5, V: 7, v: 7, vi: 9, bVI: 8, bVII: 10, bIII: 3 };
const PENT = [0, 3, 5, 7, 10];       // minor pentatonic (blues-rock lead)
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) { let s = 0; for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function buildSong(song) {
  const r = rng(song.id), spb = 60 / song.bpm, bar = spb * 4, off = spb * (song.feel === 'shuffle' ? 2 / 3 : 0.5);
  const parts = { drums: [], bass: [], rhythm: [], lead: [], vocals: [] };
  const sections = []; let t = 0, barIndex = 0;
  for (const [name, bars, chords] of song.sections) {
    const secStart = t; sections.push({ name, start: t, end: t + bars * bar, bars });
    let phrase = null;
    for (let b = 0; b < bars; b++) {
      const deg = chords[b % chords.length]; const root = song.key + (DEG[deg] ?? 0);
      const minor = /^[a-z]/.test(deg) && deg !== 'bVII';
      const bt = t, energy = name === 'chorus' || name === 'solo' ? 1 : name === 'intro' || name === 'outro' ? 0.6 : 0.8;
      // DRUMS (lane: 0 kick, 1 snare, 2 hat, 3 crash)
      if (b === 0 || (name === 'chorus' && b % 4 === 0)) parts.drums.push({ t: bt, lane: 3, kind: 'crash', v: 0.7 });
      for (let beat = 0; beat < 4; beat++) {
        const bb = bt + beat * spb;
        if (beat === 0 || beat === 2) parts.drums.push({ t: bb, lane: 0, kind: 'kick', v: 1 });
        if (beat === 2 && r() < 0.4 * energy) parts.drums.push({ t: bb + off, lane: 0, kind: 'kick', v: 0.8, ghost: true });
        if (beat === 1 || beat === 3) parts.drums.push({ t: bb, lane: 1, kind: 'snare', v: 1 });
        parts.drums.push({ t: bb, lane: 2, kind: 'hat', v: 0.55, ghost: beat % 2 === 1 && energy < 0.9 });
        parts.drums.push({ t: bb + off, lane: 2, kind: 'hat', v: 0.35, ghost: true });
      }
      if (b === bars - 1 && name !== 'outro') { // fill
        for (let k = 0; k < 4; k++) parts.drums.push({ t: bt + 3 * spb + k * spb / 4, lane: k < 2 ? 1 : 3, kind: k < 2 ? 'snare' : 'tom', v: 0.8, ghost: k % 2 === 1 });
      }
      // BASS
      for (let e = 0; e < 8; e++) {
        const tt = bt + Math.floor(e / 2) * spb + (e % 2 ? off : 0);
        let note = root - 12; if (note < 28) note += 12;
        if (e === 6 && r() < 0.5) note += 7; if (e === 7 && r() < 0.35) note += 12;
        parts.bass.push({ t: tt, midi: note, dur: spb * 0.45, v: e % 2 ? 0.75 : 1, ghost: e % 2 === 1 });
      }
      // RHYTHM GUITAR power chords (quarters, accents on 1 and the "and" of 2)
      const pattern = energy >= 1 ? [0, 1, 1.5, 2, 3, 3.5] : [0, 1.5, 2, 3];
      for (const p of pattern) parts.rhythm.push({ t: bt + Math.floor(p) * spb + (p % 1 ? off : 0), midi: root, minor, dur: spb * (p % 1 ? 0.4 : 0.8), v: p === 0 ? 1 : 0.8, ghost: p % 1 !== 0 });
      // LEAD
      if (name === 'solo' || name === 'intro' || (name === 'chorus' && b % 2 === 1)) {
        const dens = name === 'solo' ? 8 : 4;
        let idx = Math.floor(r() * 5);
        for (let k = 0; k < dens; k++) {
          if (name !== 'solo' && r() < 0.25) continue;
          idx = Math.max(0, Math.min(9, idx + Math.floor(r() * 5) - 2));
          const midi = song.key + 12 + PENT[idx % 5] + 12 * Math.floor(idx / 5);
          parts.lead.push({ t: bt + k * bar / dens, midi, dur: bar / dens * 0.9, v: 0.9, ghost: name !== 'solo' && k % 2 === 1, solo: name === 'solo' });
        }
      }
      // VOCALS (verse/chorus/bridge): 3-4 notes per bar following chord tones, phrase repeats every 2 bars
      if (name === 'verse' || name === 'chorus' || name === 'bridge') {
        if (!phrase || b % 2 === 0) phrase = [0, 1, 2, 3].map(() => Math.floor(r() * 5));
        const tones = [0, 4, 7, 9, 12];
        const rhythm = name === 'chorus' ? [0, 1, 2, 2.5, 3] : [0.5, 1.5, 2.5, 3];
        rhythm.forEach((p, k) => {
          const midi = song.key + 12 + (DEG[deg] ?? 0) % 12 + tones[phrase[k % 4]] - (minor && tones[phrase[k % 4]] === 4 ? 1 : 0);
          parts.vocals.push({ t: bt + p * spb, midi: midi > song.key + 26 ? midi - 12 : midi, dur: spb * 0.8, v: 0.8 });
        });
      }
      t += bar; barIndex++;
    }
  }
  return { song, parts, sections, length: t, spb, bar };
}

// Rhythm-game chart for a part: 4 lanes, density by difficulty.
export function buildChart(built, part, difficulty = 1) {
  const src = built.parts[part]; const notes = [];
  const minGap = [0.42, 0.26, 0.17][difficulty] ?? 0.26;
  let candidates = src.filter(n => !n.ghost || difficulty >= 2);
  if (part === 'drums') candidates = candidates.filter(n => n.kind !== 'hat' || difficulty >= 2 || Math.abs((n.t / built.spb) % 2) < 0.01);
  // lane assignment for pitched parts: rank pitches into 4 buckets
  if (part !== 'drums') {
    const pitches = [...new Set(candidates.map(n => n.midi))].sort((a, b) => a - b);
    candidates = candidates.map(n => ({ ...n, lane: Math.min(3, Math.floor(pitches.indexOf(n.midi) / Math.max(1, pitches.length) * 4)) }));
  }
  let last = -9;
  for (const n of candidates.sort((a, b) => a.t - b.t)) {
    if (n.t < 1.0) continue;
    if (n.t - last < minGap) continue;
    notes.push({ t: n.t, lane: n.lane, hit: false, missed: false, solo: !!n.solo });
    last = n.t;
  }
  return notes;
}

// Live player: schedules synth voices ahead of time; per-part gain lets the game mute a part on misses.
export class SongPlayer {
  constructor(built) {
    this.built = built; this.ctx = audio.ctx; this.parts = {}; this.idx = {}; this.playing = false;
    this.speed = 1; this.extraBars = 0;
    if (!this.ctx) return;
    this.bus = this.ctx.createGain(); this.bus.gain.value = 1; this.bus.connect(audio.music);
    const lvl = { drums: 0.9, bass: 0.8, rhythm: 0.42, lead: 0.4, vocals: 0.3 };
    for (const p of Object.keys(built.parts)) {
      const g = this.ctx.createGain(); g.gain.value = lvl[p]; g.connect(this.bus); this.parts[p] = { gain: g, base: lvl[p] }; this.idx[p] = 0;
    }
    // shared distortion for guitars
    this.dist = {};
    for (const p of ['rhythm', 'lead']) {
      const ws = this.ctx.createWaveShaper(); ws.curve = audio.distCurve; ws.oversample = '2x';
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p === 'lead' ? 4200 : 2800;
      ws.connect(lp); lp.connect(this.parts[p].gain); this.dist[p] = ws;
    }
  }
  start(delay = 0.3) {
    if (!this.ctx) { this.t0 = performance.now() / 1000 + delay; this.playing = true; return; }
    this.t0 = this.ctx.currentTime + delay; this.playing = true;
    this.timer = setInterval(() => this.schedule(), 25); this.schedule();
  }
  stop(fade = 0.4) {
    this.playing = false; clearInterval(this.timer);
    if (this.bus) { this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3); setTimeout(() => this.bus.disconnect(), fade * 1000 + 300); }
  }
  get time() { // song position in seconds
    if (!this.ctx) return performance.now() / 1000 - this.t0;
    return this.ctx.currentTime - this.t0 - (this.ctx.outputLatency || 0);
  }
  setPartLevel(part, mult, ramp = 0.03) { const p = this.parts[part]; if (p) p.gain.gain.setTargetAtTime(p.base * mult, this.ctx.currentTime, ramp); }
  schedule() {
    const ahead = this.ctx.currentTime + 0.2;
    for (const [part, evs] of Object.entries(this.built.parts)) {
      let i = this.idx[part];
      while (i < evs.length && this.t0 + evs[i].t < ahead) { const e = evs[i]; const at = this.t0 + e.t; if (at > this.ctx.currentTime - 0.02) this.voice(part, e, at); i++; }
      this.idx[part] = i;
    }
  }
  voice(part, e, t) {
    const a = audio, dest = this.parts[part].gain;
    switch (part) {
      case 'drums':
        if (e.kind === 'kick') { a.tone(t, 150, 0.32, { gain: 0.9 * e.v, slideTo: 42, dest }); a.noise(t, 0.02, { freq: 3000, gain: 0.15, dest }); }
        else if (e.kind === 'snare') { a.noise(t, 0.18, { freq: 1900, q: 0.7, gain: 0.55 * e.v, dest }); a.tone(t, 190, 0.09, { type: 'triangle', gain: 0.3 * e.v, dest }); }
        else if (e.kind === 'hat') a.noise(t, 0.045, { type: 'highpass', freq: 7500, gain: 0.22 * e.v, dest });
        else if (e.kind === 'crash') a.noise(t, 1.3, { type: 'highpass', freq: 5000, gain: 0.3 * e.v, dest });
        else if (e.kind === 'tom') a.tone(t, 130, 0.25, { gain: 0.6 * e.v, slideTo: 80, dest });
        break;
      case 'bass': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(e.midi);
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + e.dur);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * e.v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur + 0.05);
        o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + e.dur + 0.1); break;
      }
      case 'rhythm': {
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * e.v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
        g.connect(this.dist.rhythm);
        for (const [iv, det] of [[0, -6], [7, 5], [12, 0]]) { const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(e.midi - 12 + iv); o.detune.value = det; o.connect(g); o.start(t); o.stop(t + e.dur + 0.05); }
        break;
      }
      case 'lead': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(e.midi);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6; const lg = this.ctx.createGain(); lg.gain.value = e.dur > 0.25 ? 12 : 0; lfo.connect(lg); lg.connect(o.detune);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * e.v, t + 0.01); g.gain.setTargetAtTime(0.0001, t + e.dur * 0.8, 0.05);
        o.connect(g); g.connect(this.dist.lead); o.start(t); lfo.start(t); o.stop(t + e.dur + 0.3); lfo.stop(t + e.dur + 0.3); break;
      }
      case 'vocals': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(e.midi);
        const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.2; const lg = this.ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.detune);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * e.v, t + 0.05); g.gain.setTargetAtTime(0.0001, t + e.dur * 0.85, 0.06);
        const f1 = this.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 6;
        const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1200; f2.Q.value = 7;
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest); o.start(t); lfo.start(t); o.stop(t + e.dur + 0.4); lfo.stop(t + e.dur + 0.4); break;
      }
    }
  }
}

// Solo Extension: repeat the [insertT - dur, insertT) window of every part, pushing everything after it back.
// Safe as long as insertT is beyond the scheduler's look-ahead.
export function extendAt(built, chart, insertT, dur) {
  for (const evs of Object.values(built.parts)) {
    const copy = evs.filter(e => e.t >= insertT - dur && e.t < insertT).map(e => ({ ...e, t: e.t + dur }));
    for (const e of evs) if (e.t >= insertT) e.t += dur;
    const at = evs.findIndex(e => e.t >= insertT); evs.splice(at < 0 ? evs.length : at, 0, ...copy);
  }
  if (chart) {
    const copy = chart.filter(n => n.t >= insertT - dur && n.t < insertT).map(n => ({ ...n, t: n.t + dur, hit: false, missed: false }));
    for (const n of chart) if (n.t >= insertT) n.t += dur;
    const at = chart.findIndex(n => n.t >= insertT); chart.splice(at < 0 ? chart.length : at, 0, ...copy);
  }
  for (const s of built.sections) { if (s.start >= insertT) { s.start += dur; s.end += dur; } else if (s.end >= insertT - 0.001) s.end += dur; }
  built.length += dur;
}
