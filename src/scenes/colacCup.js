import * as THREE from 'three';
import { loadGLB, makeProp, findNode } from '../core/assets.js';
import { Actor } from '../entities/actor.js';

// Marker defaults (CONTRACT.md) used when a marker is missing or the env failed to load.
const DEFAULT_MARKERS = {
  spawn_band: [-12, 0, 29], poi_van: [-12, 0, 32], poi_stage_load: [-8.5, 0, 1.8], poi_bar: [-15.5, 0, 8], poi_lemon_crate: [-15.5, 0, 10.5],
  poi_bookie: [13, 0, 7], poi_mixing_desk: [0, 0, 14], poi_burger_circle: [10, 0, 6], poi_carpark: [0, 0, 40], crowd_area: [0, 0, 9],
  slot_vocals: [-1.0, 1.35, 0.6], slot_lead: [1.0, 1.35, 0.35], slot_rhythm: [3.0, 1.35, 0.2], slot_bass: [-3.0, 1.35, 0.2], slot_drums: [-1.2, 1.35, -0.55],
  climb_semi_rail: [6.0, 0, 1.35], climb_marquee_0: [-17, 0, 17.5], climb_marquee_1: [-5, 0, 21.5], climb_marquee_2: [5, 0, 21.5], climb_marquee_3: [17, 0, 17.5], climb_bar: [-17, 0, 8],
  horse_lane_start: [-60, 0, -19], horse_lane_end: [60, 0, -19],
};
for (let i = 0; i < 12; i++) DEFAULT_MARKERS['car_' + i] = [-22 + (i % 6) * 8.5, 0, i < 6 ? 36 : 46];
for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; DEFAULT_MARKERS['waitstaff_path_' + i] = [Math.cos(a) * 7, 0, 9 + Math.sin(a) * 4]; }

const CAR_COLOURS = [0xc8231c, 0x1f5fbf, 0xf2f2f2, 0x2b2b2b, 0x2f8f4e, 0xf2a91a, 0x8a8f99, 0x6b2fa0, 0x1f8a8a, 0xe8743c, 0xdedad0, 0x0e3a6e];

export class ColacCup {
  constructor(engine, state) {
    this.engine = engine; this.scene = engine.scene; this.state = state;
    this.root = new THREE.Group(); this.root.name = 'world'; this.scene.add(this.root);
    this.markers = {}; this.walk = []; this.colliders = []; this.dynamicColliders = [];
    this.cars = []; this.actors = []; this.crowd = []; this.horses = []; this.stageGear = {}; this.climbPoints = [];
    this.ray = new THREE.Raycaster(); this.down = new THREE.Vector3(0, -1, 0);
  }
  m(name) { // marker world position (Vector3)
    if (this.markers[name]) return this.markers[name].position.clone();
    const d = DEFAULT_MARKERS[name]; return d ? new THREE.Vector3(...d) : new THREE.Vector3();
  }
  mRot(name) { return this.markers[name]?.rotationY ?? 0; }

  async load(onMsg) {
    onMsg?.('Raking the racecourse…');
    const env = await loadGLB('assets/env/colac_cup.glb');
    if (env) {
      const s = env.scene; this.root.add(s); s.updateMatrixWorld(true);
      const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
      s.traverse(o => {
        const n = o.name || '';
        if (o.isMesh) { o.castShadow = !/ground|track|dust|hill|gravel/i.test(n); o.receiveShadow = true; }
        if (n.startsWith('walk_')) { this.walk.push(o); }
        if (n.startsWith('col_')) { const b = new THREE.Box3().setFromObject(o); this.colliders.push({ box: b, name: n }); o.visible = false; }
        if (o.isMesh && o.material && o.material.name === 'collider') o.visible = false;
        if (/^(spawn_|poi_|slot_|climb_|car_\d|waitstaff_path_|horse_lane_|crowd_area)/.test(n) && !o.isMesh) {
          const p = new THREE.Vector3(); o.getWorldPosition(p); o.getWorldQuaternion(tmpQ); tmpE.setFromQuaternion(tmpQ, 'YXZ');
          const sc = new THREE.Vector3(); o.getWorldScale(sc);
          this.markers[n] = { position: p, rotationY: tmpE.y, scale: sc };
        }
      });
      for (const w of this.walk) { w.visible = w.visible && !/ramp_col/.test(w.name); }
    } else {
      this.buildFallbackEnv();
    }
    if (!this.walk.length) { const g = new THREE.Mesh(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ visible: false })); g.name = 'walk_fallback'; this.root.add(g); this.walk.push(g); }
    // big static meshes the camera shouldn't clip through (trailer, marquees, bar, trees…)
    this.camBlockers = [];
    this.root.traverse(o => { if (!o.isMesh || !o.visible || o.isSkinnedMesh || /^(walk_|col_)/.test(o.name) || /ground|dust|track|hill|gravel|grass|bunting|flag/i.test(o.name)) return;
      const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()); if (Math.max(sz.x, sz.z) > 1.2 && sz.y > 1.2 && Math.max(sz.x, sz.y, sz.z) < 60) this.camBlockers.push(o); });
    for (let i = 0; i < 4; i++) this.climbPoints.push({ id: 'climb_marquee_' + i, label: 'marquee pole', pos: this.m('climb_marquee_' + i), height: 3.4 });
    this.climbPoints.push({ id: 'climb_semi_rail', label: "semi's side rail", pos: this.m('climb_semi_rail'), height: 4.4 });
    this.climbPoints.push({ id: 'climb_bar', label: 'bar tent', pos: this.m('climb_bar'), height: 2.8 });
    onMsg?.('Parking the utes…'); await this.placeCars();
    onMsg?.('Loading the van…'); await this.placeProps();
    onMsg?.('Saddling the horses…'); await this.placeHorses();
    this.root.updateMatrixWorld(true);
  }

  buildFallbackEnv() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6d9a3a }));
    g.name = 'walk_ground'; g.receiveShadow = true; this.root.add(g); this.walk.push(g);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 2.5), new THREE.MeshStandardMaterial({ color: 0x8a5a33 })); deck.position.set(0, 1.25, 0); deck.name = 'walk_deck'; this.root.add(deck); this.walk.push(deck);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x777777 }));
    ramp.position.set(-8.05, 0.67, 0.5); ramp.rotation.z = Math.atan2(1.35, 3.1); ramp.name = 'walk_ramp'; this.root.add(ramp); this.walk.push(ramp);
    const back = new THREE.Mesh(new THREE.BoxGeometry(13, 3, 0.1), new THREE.MeshStandardMaterial({ color: 0x1f4fa6 })); back.position.set(0, 2.85, -1.2); this.root.add(back);
    this.colliders.push({ box: new THREE.Box3(new THREE.Vector3(-6.5, 0, -1.3), new THREE.Vector3(6.5, 1.2, 1.3)), name: 'col_trailer' });
  }

  async placeCars() {
    const tpl = { car: await makeProp('car'), ute: await makeProp('ute') };
    for (let i = 0; i < 12; i++) {
      const kind = i % 3 === 2 ? 'ute' : 'car';
      const obj = tpl[kind].clone(true); obj.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
      const p = this.m('car_' + i); obj.position.copy(p); obj.rotation.y = this.markers['car_' + i] ? this.mRot('car_' + i) : (i < 6 ? 0 : Math.PI);
      const colour = CAR_COLOURS[i % CAR_COLOURS.length];
      obj.traverse(o => { if (o.isMesh && (o.name.includes('CarPaint') || o.material?.name?.includes('CarPaint'))) o.material.color.set(colour); });
      this.root.add(obj); obj.updateMatrixWorld(true);
      const lights = ['AlarmLight_L', 'AlarmLight_R'].map(n => findNode(obj, n)).filter(Boolean);
      const lightMats = []; for (const l of lights) l.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); lightMats.push(o.material); } });
      const wipers = ['Wiper_L', 'Wiper_R'].map(n => findNode(obj, n)).filter(Boolean);
      const heads = ['Headlight_L', 'Headlight_R'].map(n => findNode(obj, n)).filter(Boolean);
      const headMats = []; for (const l of heads) l.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); headMats.push(o.material); } });
      const box = new THREE.Box3().setFromObject(obj);
      const car = { id: i, obj, kind, box, lightMats, headMats, wipers, wiperBase: wipers.map(w => w.rotation.z), alarm: 0, wipe: 0, colour, name: `${['red', 'blue', 'white', 'black', 'green', 'yellow', 'silver', 'purple', 'teal', 'orange', 'cream', 'navy'][i]} ${kind}` };
      this.cars.push(car); this.dynamicColliders.push({ box, name: 'car' });
    }
  }
  trigger(car, kind) { // lemon hit reaction
    if (kind === 'alarm') car.alarm = 6; else if (kind === 'wipers') car.wipe = 4; else car.honk = 1;
  }
  updateCars(dt, t) {
    for (const c of this.cars) {
      if (c.alarm > 0) {
        c.alarm -= dt; const on = Math.sin(t * 14) > 0 && c.alarm > 0;
        for (const m of c.lightMats) { if (m.emissive) { m.emissive.set(on ? 0xff8a00 : 0x000000); m.emissiveIntensity = on ? 3 : 0; } }
        for (const m of c.headMats) { if (m.emissive) { m.emissive.set(on ? 0xfff2c0 : 0x000000); m.emissiveIntensity = on ? 2 : 0; } }
      }
      if (c.wipe > 0) {
        c.wipe -= dt; c.wipers.forEach((w, i) => { w.rotation.z = c.wiperBase[i] + (c.wipe > 0 ? Math.sin(t * 7) * 0.9 : 0); });
      }
    }
  }

  async placeProps() {
    const add = async (name, pos, rotY = 0, parent = this.root) => { const o = await makeProp(name); o.position.copy(pos); o.rotation.y = rotY; parent.add(o); return o; };
    const v = (x, y, z) => new THREE.Vector3(x, y, z);
    this.van = await add('van', this.m('poi_van'), this.markers.poi_van ? this.mRot('poi_van') : Math.PI / 2);
    this.van.updateMatrixWorld(true); this.dynamicColliders.push({ box: new THREE.Box3().setFromObject(this.van).expandByScalar(-0.05), name: 'van' });
    const desk = this.m('poi_mixing_desk');
    this.mixingDesk = await add('mixing_desk', desk, 0); // operator stands at local +Z facing -Z (the stage)
    this.mixingDesk.updateMatrixWorld(true); this.dynamicColliders.push({ box: new THREE.Box3().setFromObject(this.mixingDesk), name: 'desk' });
    const bar = this.m('poi_bar');
    this.burgerStall = await add('bbq_grill', v(bar.x + 0.5, 0, bar.z - 4.2), Math.PI / 2);
    this.lemonCrate = await add('lemon_crate', v(...this.m('poi_lemon_crate').toArray()).setY(0), 0);
    if (!this.markers.poi_lemon_crate) this.lemonCrate.position.y = 0;
    const bc = this.m('poi_burger_circle'); this.circleGrill = await add('bbq_grill', bc, 0);
    // Stage gear: hidden until carried in during load-in.
    const deckY = 1.35, sv = n => this.m('slot_' + n);
    const gear = {
      drums: ['drum_kit', sv('drums').setY(deckY), 0], amp_lead: ['amp_stack', v(1.5, deckY, -0.75), 0], amp_bass: ['amp_stack', v(-3.7, deckY, -0.75), 0],
      amp_rhythm: ['amp', v(3.6, deckY, -0.7), 0], mic: ['mic_stand', sv('vocals').clone().setY(deckY).add(v(0, 0, 0.35)), 0],
      wedges: ['wedge', v(-1.0, deckY, 1.0), Math.PI], wedge2: ['wedge', v(1.2, deckY, 1.0), Math.PI], wedge3: ['wedge', v(3.0, deckY, 0.95), Math.PI],
      setlist: ['setlist', v(-0.45, deckY + 0.005, 1.05), 0.3],
    };
    for (const [k, [name, pos, rot]] of Object.entries(gear)) { const o = await add(name, pos, rot); o.visible = false; this.stageGear[k] = o; }
    // cable coils for pack-up
    this.cables = [];
    for (const [x, z] of [[-3.2, 0.8], [-0.3, 0.9], [1.9, 0.8], [3.8, 0.6]]) { const o = await add('cable_coil', v(x, deckY + 0.01, z), Math.random() * 3); o.visible = false; this.cables.push(o); }
    // gear spawned at van for load-in
    this.vanGearTemplates = {};
    for (const n of ['amp', 'amp_stack', 'drum_kit', 'guitar_lead', 'guitar_rhythm', 'bass', 'mic_stand', 'wedge', 'tarp']) this.vanGearTemplates[n] = await makeProp(n);
  }

  async placeHorses() {
    const tpl = await loadGLB('assets/props/horse.glb');
    const start = this.m('horse_lane_start');
    for (let i = 0; i < 4; i++) {
      let obj, mixer = null;
      if (tpl) {
        const { SkeletonUtils } = await import('../core/assets.js');
        obj = SkeletonUtils.clone(tpl.scene); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.isSkinnedMesh) o.frustumCulled = false; } });
        if (tpl.animations.length) { mixer = new THREE.AnimationMixer(obj); const clip = tpl.animations.find(a => a.name === 'gallop') || tpl.animations[0]; mixer.clipAction(clip).play(); mixer.update(i * 0.13); }
      } else obj = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x6b3a22 }));
      obj.position.set(start.x, 0, start.z - i * 1.6 + 1.6); obj.rotation.y = Math.PI / 2; obj.visible = false;
      this.root.add(obj); this.horses.push({ obj, mixer, x: start.x, speed: 0 });
    }
  }
  startRace() { const s = this.m('horse_lane_start'); this.horses.forEach((h, i) => { h.x = s.x; h.speed = 15 + Math.random() * 3; h.obj.visible = true; }); this.racing = true; this.raceWinner = null; }
  updateRace(dt) {
    if (!this.racing) return;
    const end = this.m('horse_lane_end').x;
    this.horses.forEach((h, i) => {
      h.speed += (Math.random() - 0.5) * dt * 6; h.speed = Math.max(13, Math.min(20, h.speed));
      h.x += h.speed * dt; h.obj.position.x = h.x; h.mixer?.update(dt * h.speed / 15);
      if (h.x >= end && this.raceWinner == null) this.raceWinner = i;
    });
    if (this.horses.every(h => h.x >= end + 8)) { this.racing = false; this.horses.forEach(h => h.obj.visible = false); }
  }

  cameraHit(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from); const d = dir.length(); dir.normalize();
    this.camRay = this.camRay || new THREE.Raycaster(); this.camRay.set(from, dir); this.camRay.far = d;
    const h = this.camRay.intersectObjects(this.camBlockers, false)[0];
    return h ? from.clone().addScaledVector(dir, Math.max(0.8, h.distance - 0.35)) : null;
  }
  groundAt(x, z, fromY = 0) {
    this.ray.set(new THREE.Vector3(x, fromY + 1.2, z), this.down); this.ray.far = 6;
    const hits = this.ray.intersectObjects(this.walk, false);
    return hits.length ? hits[0].point.y : 0;
  }
  // push a circle (x,z,r) out of static/dynamic boxes and other actors
  resolve(x, z, r, self) {
    let bumped = null;
    const y = self ? self.pos.y : 0;
    for (const list of [this.colliders, this.dynamicColliders]) for (const c of list) {
      const b = c.box; if (y > b.max.y - 0.25 || y + 1.6 < b.min.y) continue;
      const cx = Math.max(b.min.x, Math.min(x, b.max.x)), cz = Math.max(b.min.z, Math.min(z, b.max.z));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
        else { // inside: push out along the shallowest axis
          const opts = [[b.min.x - r - x, 0], [b.max.x + r - x, 0], [0, b.min.z - r - z], [0, b.max.z + r - z]].sort((a, b2) => Math.hypot(...a) - Math.hypot(...b2));
          x += opts[0][0]; z += opts[0][1];
        }
      }
    }
    if (self) for (const a of this.actors) {
      if (a === self || a.climbing || Math.abs(a.pos.y - y) > 1) continue;
      // only the player (and NPC-vs-NPC) collide with people; AI bandmates slip through the crowd
      if (self !== this.playerActor && a !== this.playerActor && !(self.isNPC && a.isNPC)) continue;
      const dx = x - a.pos.x, dz = z - a.pos.z, rr = r + a.radius, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d * (a.isNPC && !self.isNPC ? 0.8 : 0.5); x += dx * k; z += dz * k; bumped = a; }
    }
    x = Math.max(-60, Math.min(60, x)); z = Math.max(-9, Math.min(56, z));
    if (self) self.bumped = bumped;
    return { x, z, bumped };
  }

  async spawnActor(opts) { const a = new Actor(this, opts); await a.load(); this.root.add(a.group); this.actors.push(a); return a; }

  update(dt, t) { this.updateCars(dt, t); this.updateRace(dt); }
}
