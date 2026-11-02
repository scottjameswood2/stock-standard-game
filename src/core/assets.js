import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();
export const failed = [];

// Hosts that only serve standard web media types get JSON glTF copies (see tools/glb2json.mjs).
const EXT = window.SS_ASSET_EXT || '.glb';
export function loadGLB(path) {
  path = path.replace(/\.glb$/, EXT);
  if (!cache.has(path)) {
    const fail = err => { console.warn('asset failed', path, err); failed.push(path); return null; };
    cache.set(path, EXT === '.glb'
      ? new Promise(res => loader.load(path, g => res(g), undefined, err => res(fail(err))))
      : loadJsonGltf(path).catch(fail));
  }
  return cache.get(path);
}

// JSON glTF with an embedded base64 buffer → rebuild a GLB in memory and parse it (no data: fetches needed).
async function loadJsonGltf(path) {
  const json = await (await fetch(path)).json();
  let bin = null; const b = json.buffers && json.buffers[0];
  if (b && b.uri && b.uri.startsWith('data:')) {
    const str = atob(b.uri.slice(b.uri.indexOf(',') + 1)); bin = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bin[i] = str.charCodeAt(i);
    delete b.uri;
  }
  let jb = new TextEncoder().encode(JSON.stringify(json)); const jl = Math.ceil(jb.length / 4) * 4, bl = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const total = 12 + 8 + jl + (bin ? 8 + bl : 0), out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); out.set(jb, 20); for (let i = 20 + jb.length; i < 20 + jl; i++) out[i] = 0x20;
  if (bin) { const o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004E4942, true); out.set(bin, o + 8); }
  return new Promise((res, rej) => loader.parse(out.buffer, '', res, rej));
}

export async function preload(list, onProgress) {
  let done = 0;
  await Promise.all(list.map(p => loadGLB(p).then(() => onProgress?.(++done / list.length, p))));
}

function prepMaterials(root, { shadows = true } = {}) {
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = shadows; o.receiveShadow = true;
      if (o.isSkinnedMesh) { o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.5); o.frustumCulled = true; } // cheap fixed sphere = real culling for crowds
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m && m.name === 'collider') o.visible = false; }
    }
  });
}

// ---------- characters ----------
const JOINTS = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulder_L', 'upperarm_L', 'forearm_L', 'hand_L', 'thigh_L', 'shin_L', 'foot_L', 'shoulder_R', 'upperarm_R', 'forearm_R', 'hand_R', 'thigh_R', 'shin_R', 'foot_R'];

function placeholderCharacter(color = 0xcc8844) {
  const g = new THREE.Group(); g.name = 'Placeholder';
  const m = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 4, 8), m); body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8b58f })); head.position.y = 1.55; g.add(head);
  for (const j of ['socket_hand_R', 'socket_hand_L', 'socket_head_top', 'socket_guitar', 'socket_back']) { const s = new THREE.Object3D(); s.name = j; s.position.set(j.includes('_L') ? 0.3 : j.includes('_R') ? -0.3 : 0, j.includes('head') ? 1.8 : 1.1, 0.2); g.add(s); }
  return { scene: g, animations: [] };
}

function hexToRGB(h) { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }

// Re-colour a vertex-coloured skinned body: replaces the dominant torso colour (shirt) and hair colour.
function retint(mesh, tint) {
  const geo = mesh.geometry = mesh.geometry.clone();
  const col = geo.getAttribute('color'); const si = geo.getAttribute('skinIndex');
  if (!col || !si) { if (tint.shirt && mesh.material) { mesh.material = mesh.material.clone(); mesh.material.color.set(tint.shirt); } return; }
  const boneIdx = name => mesh.skeleton.bones.findIndex(b => b.name === name);
  const chest = [boneIdx('chest'), boneIdx('spine')], head = boneIdx('head');
  const key = i => `${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`;
  const hist = (filter) => { const h = new Map(); for (let i = 0; i < col.count; i++) if (filter(si.getX(i))) h.set(key(i), (h.get(key(i)) || 0) + 1); return [...h.entries()].sort((a, b) => b[1] - a[1]); };
  const replace = (k, rgb) => { for (let i = 0; i < col.count; i++) if (key(i) === k) col.setXYZ(i, rgb[0], rgb[1], rgb[2]); };
  // never touch skin: the face's dominant colour is the skin tone
  const headHist = head >= 0 ? hist(b => b === head) : [];
  const hands = [boneIdx('hand_L'), boneIdx('hand_R')];
  const skin = hist(b => hands.includes(b))[0]?.[0] || headHist[0]?.[0]; // hands are bare skin
  const rgbOf = k => k.split(',').map(Number), lum = k => { const [r, g, b] = rgbOf(k); return 0.3 * r + 0.59 * g + 0.11 * b; };
  const near = (a, b) => { if (!a || !b) return false; const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 0.12; };
  if (tint.shirt) { const h = hist(b => chest.includes(b)).find(([k]) => !near(k, skin)); if (h) replace(h[0], hexToRGB(tint.shirt)); }
  if (tint.hair && head >= 0) { const h = headHist.find(([k]) => !near(k, skin) && lum(k) > 0.03 && lum(k) < 0.85); if (h) replace(h[0], hexToRGB(tint.hair)); }
  col.needsUpdate = true;
}

export class CharacterModel {
  constructor(gltf, { tint = null, height = null, baseHeight = null } = {}) {
    const src = gltf || placeholderCharacter();
    this.root = SkeletonUtils.clone(src.scene);
    this.root.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); } });
    prepMaterials(this.root);
    this.body = null; this.nodes = {};
    this.root.traverse(o => { if (o.name) this.nodes[o.name] = this.nodes[o.name] || o; if (o.isSkinnedMesh && !this.body) this.body = o; });
    if (tint && this.body) retint(this.body, tint);
    if (height && baseHeight) this.root.scale.setScalar(height / baseHeight);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of (src.animations || [])) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null; this.currentName = '';
  }
  socket(name) { return this.nodes[name] || this.root; }
  has(name) { return !!this.actions[name]; }
  play(name, { fade = 0.2, once = false, speed = 1, restart = false } = {}) {
    const a = this.actions[name] || this.actions.idle;
    if (!a) return;
    a.timeScale = speed;
    if (this.current === a && !restart) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once;
    a.enabled = true; a.setEffectiveWeight(1);
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false); else a.fadeIn(fade);
    a.play(); this.current = a; this.currentName = name;
  }
  update(dt) { this.mixer.update(dt); }
}

export async function makeCharacter(modelId, opts = {}) {
  const g = await loadGLB(`assets/characters/${modelId}.glb`);
  return new CharacterModel(g, opts);
}

// ---------- props ----------
const propFallbackColors = { bun: 0xe9a94b, patty: 0x6b3a22, lemon: 0xf4d21f, schooner: 0xe6a52a };
export async function makeProp(name) {
  const g = await loadGLB(`assets/props/${name}.glb`);
  let obj;
  if (g) { obj = g.scene.clone(true); obj.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); }); }
  else {
    obj = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: propFallbackColors[name] || 0x888888 }));
    obj.name = name;
  }
  prepMaterials(obj);
  obj.userData.animations = g?.animations || [];
  return obj;
}
export function findNode(root, name) { let f = null; root.traverse(o => { if (!f && o.name === name) f = o; }); return f; }
export { SkeletonUtils, JOINTS };
