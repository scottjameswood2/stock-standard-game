import * as THREE from 'three';

// Renderer, scene, golden-hour lighting, sky dome, main loop.
export class Engine {
  constructor(container) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.mobile = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.6));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf3c890, 60, 190);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, 6, 20);
    this.clock = new THREE.Clock(); this.updaters = new Set(); this.time = 0; this.paused = false;
    this.timeScale = +(new URLSearchParams(location.search).get('ts') || 1); // debug: run game logic faster
    this.setupLights(); this.setupSky();
    window.addEventListener('resize', () => this.resize());
  }
  setupLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0xb0844c, 1.15); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffd29a, 2.6);
    sun.position.set(-38, 26, 44); sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const c = sun.shadow.camera; c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 160;
    s.add(sun); s.add(sun.target);
    this.fill = new THREE.DirectionalLight(0xa9c8ff, 0.45); this.fill.position.set(30, 20, -30); s.add(this.fill);
  }
  // follow a focus point so the shadow frustum stays sharp around the player
  focusShadow(p) { this.sun.target.position.set(p.x, 0, p.z); this.sun.position.set(p.x - 38, 26, p.z + 44); }
  setupSky() {
    const geo = new THREE.SphereGeometry(300, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x5d9be0) }, mid: { value: new THREE.Color(0xf6c58a) }, bot: { value: new THREE.Color(0xf09a5a) }, sunDir: { value: new THREE.Vector3(-0.6, 0.35, 0.7).normalize() } },
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vp;
        void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0), 0.7)) : mix(mid, bot, clamp(-h*4.0,0.0,1.0));
        float s = max(dot(vp, sunDir), 0.0); c += vec3(1.0,0.8,0.5) * pow(s, 64.0) * 0.9 + vec3(1.0,0.7,0.4) * pow(s, 6.0) * 0.18;
        gl_FragColor = vec4(c, 1.0); }`
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.renderOrder = -10; this.scene.add(this.sky);
  }
  setWeather(rain) { // grey things out a little when it rains
    const k = rain ? 1 : 0;
    this.sun.intensity = 2.6 - 1.6 * k; this.hemi.intensity = 1.15 - 0.3 * k;
    this.sky.material.uniforms.mid.value.set(rain ? 0xa9a39a : 0xf6c58a); this.sky.material.uniforms.top.value.set(rain ? 0x6f7d8c : 0x5d9be0);
    this.scene.fog.color.set(rain ? 0xa9a6a0 : 0xf3c890);
  }
  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this.paused) for (let k = 0; k < this.timeScale; k++) { this.time += dt; for (const u of this.updaters) u(dt, this.time); }
      this.sky.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}
