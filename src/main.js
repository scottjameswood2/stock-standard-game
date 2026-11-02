import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { preload, failed } from './core/assets.js';
import { GameState } from './systems/state.js';
import { ColacCup } from './scenes/colacCup.js';
import { NPCs } from './entities/npcs.js';
import { Band } from './entities/band.js';
import { CameraRig, PlayerController } from './entities/player.js';
import { Interactions } from './systems/interact.js';
import { Throwables } from './systems/throwables.js';
import { Drinks } from './systems/drinks.js';
import { Roam } from './systems/roam.js';
import { HUD } from './ui/hud.js';
import { Labels, toast, showScreen, closeScreen, screenOpen, el, layer, centerMsg } from './ui/ui.js';
import { showTitle, showLineup } from './ui/lineup.js';
import { showPause } from './ui/pause.js';
import { PHASES } from './phases/index.js';
import { TouchControls, touchifyScreens, IS_TOUCH } from './ui/touch.js';

class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('game'));
    this.input = new Input(this.engine.renderer.domElement);
    this.rig = new CameraRig(this.engine.camera, this.input);
    this.player = new PlayerController(this.input, this.rig);
    this.labels = new Labels(this.engine.camera);
    this.interact = new Interactions();
    this.phase = null; this.phaseName = ''; this.phaseObjective = '';
    window.__game = this; // handy for debugging in the console
  }
  async boot() {
    const fill = document.getElementById('boot-fill'), msg = document.getElementById('boot-msg');
    const setP = (p, m) => { fill.style.width = Math.round(p * 100) + '%'; if (m) msg.textContent = m; };
    const [roster, songs] = await Promise.all([fetch('data/roster.json').then(r => r.json()), fetch('data/songs.json').then(r => r.json())]);
    this.state = new GameState(roster, songs);
    audio.voice = this.state.settings.voice; audio.volume = this.state.settings.volume;
    const chars = ['dave_young', 'scotty_woods', 'chris_white', 'dunny', 'hayden_joseph', 'jamie', 'racegoer_suit', 'racegoer_sundress', 'racegoer_fascinator', 'racegoer_linen', 'waitstaff', 'security', 'truckie'];
    const props = ['guitar_lead', 'guitar_rhythm', 'bass', 'drum_kit', 'amp', 'amp_stack', 'wedge', 'mic_stand', 'mixing_desk', 'schooner', 'jug', 'water_bottle', 'snag', 'canape_tray', 'bun', 'patty', 'lemon', 'lemon_crate', 'setlist', 'beret', 'capo', 'cable_coil', 'tarp', 'bbq_grill', 'chip_feedback', 'van', 'car', 'ute', 'horse'];
    const list = ['assets/env/colac_cup.glb', ...chars.map(c => `assets/characters/${c}.glb`), ...props.map(p => `assets/props/${p}.glb`)];
    await preload(list, (p, path) => setP(p * 0.7, 'Loading ' + path.split('/').pop().replace('.glb', '').replace(/_/g, ' ') + '…'));
    this.world = new ColacCup(this.engine, this.state);
    await this.world.load(m => setP(0.75, m));
    this.npcs = new NPCs(this.world, this.state, this.labels);
    await this.npcs.spawn(this.state.settings.lowSpec || IS_TOUCH ? 18 : 30, p => setP(0.78 + p * 0.17, 'Herding racegoers…'));
    this.throwables = new Throwables(this); await this.throwables.init();
    this.drinks = new Drinks(this); this.hud = new HUD(this); this.roam = new Roam(this);
    this.npcs.onCaught = chase => this.roam.caught(chase);
    this.rig.collide = (a, b) => this.world.cameraHit(a, b);
    setP(1, 'Ready. Tune up!');
    if (failed.length) console.warn('Missing assets (placeholders used):', failed);
    this.bindKeys();
    if (IS_TOUCH) { this.touch = new TouchControls(this); touchifyScreens(); }
    window.addEventListener('pointerdown', () => audio.init(), { passive: true });
    this.engine.updaters.add((dt, t) => this.update(dt, t));
    this.engine.start();
    setTimeout(() => document.getElementById('boot').classList.add('hide'), 300);
    this.rig.mode = 'shot'; this.rig.setShot(new THREE.Vector3(-9, 4.2, 15), new THREE.Vector3(0, 2.2, 0));
    showTitle(this);
  }
  bindKeys() {
    this.input.onKey(code => {
      audio.init();
      if (code === 'Escape') { if (this.phase?.onEscape?.()) return; if (screenOpen() && this.pauseOpen) { closeScreen(); this.pauseOpen = false; this.engine.paused = false; } else if (!screenOpen() && this.phaseName && this.phaseName !== 'title') showPause(this); return; }
      if (code === 'KeyV') { this.toggleZoom(); return; }
      if (screenOpen()) return;
      if (this.phase?.onKey?.(code)) return;
      if (!this.phase?.roam) return;
      if (code === 'KeyE') this.interact.trigger();
      if (code === 'KeyF') { const h = this.player.actor.heading; const dir = new THREE.Vector3(Math.sin(h), 0.1, Math.cos(h)); this.throwables.throw(this.player.actor, dir); } // throws go where your character faces
      if (code === 'Digit1') this.throwables.cycle('bun'); if (code === 'Digit2') this.throwables.cycle('patty'); if (code === 'Digit3') this.throwables.cycle('lemon');
      if (code === 'KeyH') { this.hintsHidden = !this.hintsHidden; this.hud.hint.style.display = this.hintsHidden ? 'none' : ''; }
      if (code === 'Tab' && this.phase?.allowSwitch !== false) this.switchMember();
    });
    this.engine.renderer.domElement.addEventListener('click', () => { audio.init(); if (this.phase?.roam && !screenOpen() && !IS_TOUCH) this.input.lock(); });
  }
  switchMember() {
    const ids = this.state.bandIds; const i = ids.indexOf(this.state.playerId);
    this.controlMember(ids[(i + 1) % ids.length]);
    toast(`Now playing as ${this.state.player.name}`);
  }
  controlMember(id) {
    const old = this.band.get(this.state.playerId);
    if (old && old !== this.band.get(id)) { old.ai = null; }
    this.state.playerId = id; const a = this.band.get(id); a.ai = null; this.player.control(a); this.world.playerActor = a;
    for (const m of this.band.list) m.tag.visible = m.id !== id;
    this.hud.dirty = true; this.phase?.onSwitch?.(id);
  }
  async startDay() {
    const st = this.state; st.initMembers(); st.pocket = { bun: 2, patty: 2, lemon: 0 };
    if (this.band) { for (const a of this.band.all()) { a.group.parent?.remove(a.group); this.world.actors.splice(this.world.actors.indexOf(a), 1); this.labels.remove(a.tag); } }
    this.band = new Band(this.world, st, this.labels); await this.band.spawn(); this.band.rememberBeret();
    this.controlMember(st.playerId);
    if (st.lineup.drums === 'dunny') st.unlock('beret_beat');
    this.roam.setup();
    this.hud.show(true); this.setPhase('loadin');
  }
  setPhase(name) {
    this.phase?.exit?.(); this.interact.clearTag('phase');
    if (this.band) for (const a of this.band.all()) { a.stop(); a.ai = null; }
    this.phaseName = name; this.state.phase = name;
    const P = PHASES[name]; this.phase = P ? new P(this) : null;
    this.phase?.enter?.();
  }
  toggleZoom() { this.rig.far = !this.rig.far; this.hud.dirty = true; toast(this.rig.far ? '🔭 Zoomed out (V to zoom back in)' : '🔍 Zoomed in'); }
  skipToBurger() { if (this.pauseOpen) return; closeScreen(); this.player.enabled = true; this.setPhase('burger'); }
  skip() { if (this.pauseOpen) return; this.phase?.skip?.(); this.hud.dirty = true; }
  setObjective(t) { this.phaseObjective = t; this.hud.setObjective(t); }
  update(dt, t) {
    this.input.pollGamepad();
    const st = this.state;
    if (this.phase) this.phase.update?.(dt, t);
    const roam = this.phase?.roam && !screenOpen();
    this.player.enabled = !!roam;
    if (this.band) {
      if (this.phase?.drivePlayer !== false) this.player.update(dt, t, st);
      this.band.update(dt, t, st.playerId, this.phase?.bandMode || 'roam');
    }
    if (this.world) this.world.camPos = this.engine.camera.position;
    this.npcs?.update(dt, t, this.player.actor);
    this.world?.update(dt, t);
    this.throwables?.update(dt); this.drinks?.update(dt); this.roam?.update(dt, t);
    this.interact.enabled = !!roam; this.interact.update(roam ? this.player.actor : null);
    // Buzz slowly wears off; crowd ambience follows energy
    st.buzz = Math.max(0, st.buzz - dt * 0.12); st.heat = Math.max(0, st.heat - dt * 0.6);
    audio.setCrowd(this.phaseName === 'gig' ? 0.25 + st.crowd / 120 : 0.35);
    this.hud?.update(dt); this.labels.update(); this.touch?.update();
    if (this.player.actor && this.rig.mode === 'follow') this.engine.focusShadow(this.player.actor.pos); else this.engine.focusShadow(new THREE.Vector3(0, 0, 6));
    this.rig.update(dt, t, this.player.actor, st.buzz);
    this.input.endFrame();
  }
}

const game = new Game();
game.boot().catch(err => {
  console.error(err);
  document.getElementById('boot-msg').textContent = 'Something went wrong loading the game: ' + err.message;
});
export default game;
