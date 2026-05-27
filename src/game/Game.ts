import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader }      from 'three/examples/jsm/shaders/FXAAShader.js';

import { Track } from './Track';
import { Car, CarInput } from './Car';
import { HUD } from './HUD';
import { BackgroundElements } from './BackgroundElements';
import { resolveCollisions } from './Collision';
import { Multiplayer } from './Multiplayer';
import {
  AI_COLORS, AI_NAMES, NUM_AI, TOTAL_LAPS, SPEED_PLAYER_MAX, MAX_LAT,
  DifficultyConfig, CarSpec, TrackDef,
} from './constants';

export interface GameConfig {
  difficulty:  DifficultyConfig;
  track:       TrackDef;
  car:         CarSpec;
  controller:  'keyboard' | 'mouse';
}

// ── Critically-damped spring helper ──────────────────────────────────────────
// omega = natural frequency (rad/s). Higher = faster response. ζ = 1 (no overshoot).
function springStep(
  pos: THREE.Vector3, vel: THREE.Vector3,
  target: THREE.Vector3,
  omega: number, dt: number,
): void {
  // Δx
  const dx = target.clone().sub(pos);
  // Acceleration: spring − damper (critically damped → ζ = 1, c = 2*omega)
  const accel = dx.multiplyScalar(omega * omega)
               .sub(vel.clone().multiplyScalar(2 * omega));
  vel.addScaledVector(accel, dt);
  pos.addScaledVector(vel,   dt);
}

export class Game {
  private renderer:  THREE.WebGLRenderer;
  private scene      = new THREE.Scene();
  private camera     = new THREE.PerspectiveCamera(72, 1, 0.3, 3000);
  private composer!: EffectComposer;
  private _fxaaPass!: ShaderPass;
  private _useComposer = true;

  private track!:   Track;
  private player!:  Car;
  private aiCars:   Car[] = [];
  allCars:          Car[] = [];
  private hud!:     HUD;
  private mp!:      Multiplayer;
  private _bg!:     BackgroundElements;

  private keys: Record<string, boolean> = {};
  private _mouseX    = 0.5;
  private _mouseRBtn = false;
  private _input: CarInput = { accel: false, brake: false, left: false, right: false, handbrake: false, mouseLatTarget: null };

  private elapsed  = 0;
  private lapStart = 0;
  private bestLap: number | null = null;
  private prevLap  = 1;
  private lastRaf  = 0;
  private started  = false;
  private done     = false;

  // ── Spring-damper camera state ─────────────────────────────────────────────
  // Position + velocity pairs for critically-damped springs
  private _camPos    = new THREE.Vector3();
  private _camVel    = new THREE.Vector3();
  private _camLookAt = new THREE.Vector3();
  private _camLookVel = new THREE.Vector3();
  private _camUp     = new THREE.Vector3(0, 1, 0);
  private _camUpVel  = new THREE.Vector3();
  private _currentFOV = 72;

  private _onFinish: (time: number, bestLap: number, pos: number) => void;
  private _config:   GameConfig;
  private _listeners: (() => void)[] = [];
  private _shakeAmt  = 0;

  constructor(
    canvas: HTMLCanvasElement,
    config: GameConfig,
    onFinish: (time: number, bestLap: number, pos: number) => void,
  ) {
    this._config   = config;
    this._onFinish = onFinish;

    const isMobile = window.matchMedia('(pointer: coarse)').matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:       false,  // FXAA handles AA in post-process (sharper than native)
      powerPreference: isMobile ? 'default' : 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure  = 0.80;
    this.renderer.shadowMap.enabled    = false;

    this._setupScene(config);
    this._setupBloom();
    this._setupInput(config.controller);
    this._resize();

    const r = () => this._resize();
    window.addEventListener('resize', r);
    this._listeners.push(() => window.removeEventListener('resize', r));
  }

  private _setupScene(cfg: GameConfig) {
    this.scene.background = new THREE.Color(0x000000);

    // Ambient — keeps void from being 100% black on dark surfaces
    this.scene.add(new THREE.AmbientLight(0x20243a, 2.5));

    // Key light: slightly from upper-right, blue-white. Gives cars sharp highlights.
    const key = new THREE.DirectionalLight(0x9ab8ff, 2.4);
    key.position.set(0.6, 1.4, 1.0);
    this.scene.add(key);

    // Fill light: from lower-left, warm tint. Fills in car underside.
    const fill = new THREE.DirectionalLight(0x3366cc, 0.8);
    fill.position.set(-1.0, -0.5, -0.8);
    this.scene.add(fill);

    // Rim light: from behind, to silhouette the car against the void
    const rim = new THREE.DirectionalLight(0x4488ff, 1.2);
    rim.position.set(0, 0.5, -2.0);
    this.scene.add(rim);

    this.track = new Track(this.scene, cfg.track);
    this.hud   = new HUD(this.track);
    this.mp    = new Multiplayer(this.scene);
    this._bg   = new BackgroundElements(this.camera, this.scene);

    const ROW_GAP   = 0.0105;
    const SIDES: (-1 | 0 | 1)[] = [-1, 1, -1, 1, -1, 1, -1];
    const aiColors  = AI_COLORS.filter(c => c !== cfg.car.color);
    while (aiColors.length < NUM_AI) aiColors.push(AI_COLORS[aiColors.length % AI_COLORS.length]);
    const aiNames   = AI_NAMES.filter((_, i) => AI_COLORS[i] !== cfg.car.color);
    while (aiNames.length < NUM_AI) aiNames.push(AI_NAMES[aiNames.length % AI_NAMES.length]);

    this.player = new Car(
      this.scene, cfg.car.color, true,
      ROW_GAP * (NUM_AI + 0.5), cfg.car, null, { row: 0, side: 0 }, 'You',
    );
    for (let i = 0; i < NUM_AI; i++) {
      const row  = Math.floor(i / 2) + 1;
      const side = SIDES[i];
      this.aiCars.push(new Car(
        this.scene, aiColors[i], false,
        ROW_GAP * (NUM_AI - i - 1), cfg.car, cfg.difficulty, { row, side }, aiNames[i],
      ));
    }
    this.allCars = [this.player, ...this.aiCars];

    // Warm the camera spring to avoid a pop at frame 0
    const f0 = this.track.getTransform(this.player.trackT, 0);
    this._camPos.copy(f0.pos).addScaledVector(f0.tangent, -12).addScaledVector(f0.up, 3.0);
    this._camLookAt.copy(f0.pos).addScaledVector(f0.tangent, 10);
    this._camUp.copy(f0.up);
  }

  private _setupBloom() {
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile) { this._useComposer = false; return; }

    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(devicePixelRatio, 2);

    const rt = new THREE.WebGLRenderTarget(w * dpr, h * dpr, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom — targeted on edge rails (emissiveIntensity 4.5 >> threshold 0.55)
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(w, h),
      1.10,   // strength — same power, cleaner
      0.38,   // radius
      0.55,   // threshold
    ));

    // FXAA — full-screen anti-alias pass (applied after bloom, very cheap)
    this._fxaaPass = new ShaderPass(FXAAShader);
    this._fxaaPass.material.uniforms['resolution'].value.set(
      1 / (w * dpr), 1 / (h * dpr),
    );
    this.composer.addPass(this._fxaaPass);
  }

  private _setupInput(controller: 'keyboard' | 'mouse') {
    this._mouseX = window.innerWidth / 2;

    const kd = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = true; };
    const ku = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup',   ku);
    this._listeners.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup',   ku),
    );

    if (controller === 'mouse') {
      const mm = (e: MouseEvent) => { this._mouseX = e.clientX; };
      const md = (e: MouseEvent) => { if (e.button === 2) this._mouseRBtn = true; };
      const mu = (e: MouseEvent) => { if (e.button === 2) this._mouseRBtn = false; };
      const cm = (e: Event)      => e.preventDefault();
      window.addEventListener('mousemove',   mm);
      window.addEventListener('mousedown',   md);
      window.addEventListener('mouseup',     mu);
      window.addEventListener('contextmenu', cm);
      this._listeners.push(
        () => window.removeEventListener('mousemove',   mm),
        () => window.removeEventListener('mousedown',   md),
        () => window.removeEventListener('mouseup',     mu),
        () => window.removeEventListener('contextmenu', cm),
      );
    }

    this._setupTouchControls();
  }

  private _setupTouchControls() {
    const ui  = document.getElementById('game-ui')!;
    const pad = document.createElement('div');
    pad.id = 'touch-pad';
    pad.innerHTML = `
      <div id="touch-left"  class="t-btn">◀</div>
      <div id="touch-right" class="t-btn">▶</div>
      <div id="touch-accel" class="t-btn t-accel">▲</div>
      <div id="touch-brake" class="t-btn t-brake">▼</div>
    `;
    ui.appendChild(pad);

    const bind = (id: string, key: string) => {
      const el   = document.getElementById(id)!;
      const down = (e: Event) => { e.preventDefault(); this.keys[key] = true; };
      const up   = (e: Event) => { e.preventDefault(); this.keys[key] = false; };
      el.addEventListener('touchstart',  down, { passive: false });
      el.addEventListener('touchend',    up,   { passive: false });
      el.addEventListener('touchcancel', up,   { passive: false });
      this._listeners.push(() => {
        el.removeEventListener('touchstart',  down);
        el.removeEventListener('touchend',    up);
        el.removeEventListener('touchcancel', up);
      });
    };
    bind('touch-left',  'a');
    bind('touch-right', 'd');
    bind('touch-accel', 'w');
    bind('touch-brake', 's');
    this._listeners.push(() => pad.remove());
  }

  private _render() {
    if (this._useComposer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    this.renderer.setSize(w, h);
    if (this._useComposer) {
      this.composer.setSize(w, h);
      if (this._fxaaPass) {
        this._fxaaPass.material.uniforms['resolution'].value.set(1 / (w * dpr), 1 / (h * dpr));
      }
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const countEl  = document.getElementById('countdown')!;
    const centerEl = document.getElementById('hud-center')!;
    centerEl.style.display = 'block';
    document.getElementById('finish')!.innerHTML = '';
    let n = 3;
    countEl.textContent = String(n);

    const tick = setInterval(() => {
      n--;
      if (n > 0) { countEl.textContent = String(n); }
      else {
        countEl.textContent = 'GO!';
        setTimeout(() => {
          centerEl.style.display = 'none';
          this.started  = true;
          this.lapStart = 0;
        }, 500);
        clearInterval(tick);
      }
    }, 1000);

    requestAnimationFrame(t => this._loop(t));
  }

  private _loop(raf: number) {
    if (this.done) return;
    requestAnimationFrame(t => this._loop(t));

    // Cap at 1/60 — tighter physics timestep, prevents large-frame pops
    const dt = Math.min((raf - this.lastRaf) / 1000, 1 / 60);
    this.lastRaf = raf;

    const spd = this.player.speed / SPEED_PLAYER_MAX;
    this._bg.update(spd, dt);

    if (!this.started) {
      this._updateCamera(0);
      this._render();
      return;
    }

    this.elapsed += dt;
    if (this.lapStart === 0) this.lapStart = this.elapsed;

    this._readInput();

    for (const car of this.allCars) {
      car.update(dt, car.isPlayer ? this._input : null, this.track, this.allCars, this.player);
    }
    const prevLat = this.player.lateral;
    resolveCollisions(this.allCars);
    const latDelta = Math.abs(this.player.lateral - prevLat);
    if (latDelta > 0.15) this._shakeAmt = Math.min(this._shakeAmt + latDelta * 1.2, 0.9);

    this.mp.send(this.player.trackT, this.player.lateral, this.player.lap);
    this.mp.update(this.track);

    if (this.player.lap !== this.prevLap) {
      const lapTime = this.elapsed - this.lapStart;
      if (this.bestLap === null || lapTime < this.bestLap) this.bestLap = lapTime;
      this.lapStart = this.elapsed;
      this.prevLap  = this.player.lap;
    }

    if (this.player.finished && !this.done) {
      this.done = true;
      const sorted = [...this.allCars].sort((a, b) => b.totalProgress - a.totalProgress);
      this._onFinish(this.elapsed, this.bestLap ?? this.elapsed, sorted.indexOf(this.player) + 1);
    }

    this._updateCamera(dt);
    this.hud.update(this.player, this.allCars, this.elapsed, this.bestLap, this.track);
    this._render();
  }

  private _readInput() {
    const k = this.keys;
    if (this._config.controller === 'mouse') {
      const norm      = (this._mouseX / window.innerWidth) * 2 - 1;
      const latTarget = norm * MAX_LAT * 0.92;
      this._input = {
        accel: !this._mouseRBtn,
        brake: this._mouseRBtn,
        left: false, right: false,
        handbrake:      !!k[' '],
        mouseLatTarget: latTarget,
      };
    } else {
      this._input = {
        accel:          !!(k['w'] || k['arrowup']),
        brake:          !!(k['s'] || k['arrowdown']),
        left:           !!(k['a'] || k['arrowleft']),
        right:          !!(k['d'] || k['arrowright']),
        handbrake:      !!(k[' ']),
        mouseLatTarget: null,
      };
    }
  }

  private _updateCamera(dt: number) {
    const spd = this.player.speed / SPEED_PLAYER_MAX;

    // Sample track slightly to the player's lateral side for natural framing
    const { pos, tangent, up } = this.track.getTransform(
      this.player.trackT, this.player.lateral * 0.35,
    );

    const camH    = 2.2 + spd * 1.2;
    const camDist = 11  - spd * 2.0;

    const desired     = pos.clone().addScaledVector(tangent, -camDist).addScaledVector(up, camH);
    // Look 12 units ahead, slightly high so you see track coming
    const desiredLook = pos.clone().addScaledVector(tangent, 12).addScaledVector(up, 0.4);

    // Dynamic FOV: widens at speed for cinematic rush
    const targetFOV  = 70 + spd * 30;
    this._currentFOV += (targetFOV - this._currentFOV) * Math.min(dt * 4, 1);
    this.camera.fov   = this._currentFOV;
    this.camera.updateProjectionMatrix();

    if (dt <= 0) {
      // Initialisation — snap without velocity
      this._camPos.copy(desired);
      this._camLookAt.copy(desiredLook);
      this._camUp.copy(up);
    } else {
      // ── Critically-damped springs ─────────────────────────────────────────
      // Position spring: ω=8  → responds in ~0.2 s, buttery smooth
      springStep(this._camPos,    this._camVel,    desired,     8,  dt);
      // Look-at spring: ω=18 → very snappy, anticipates the next curve
      springStep(this._camLookAt, this._camLookVel, desiredLook, 18, dt);
      // Banking spring: ω=11 → fast banking that feels physical, not laggy
      springStep(this._camUp,     this._camUpVel,   up,          11, dt);
      this._camUp.normalize();
    }

    this.camera.position.copy(this._camPos);
    this.camera.up.copy(this._camUp);   // MUST be set before lookAt
    this.camera.lookAt(this._camLookAt);

    // Camera shake on collision
    if (this._shakeAmt > 0.01) {
      this._shakeAmt *= (1 - dt * 10);
      const s = this._shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.2;
    }
  }

  destroy() {
    this.done = true;
    this._listeners.forEach(fn => fn());
    this.allCars.forEach(c => c.dispose());
    this.mp.destroy();
    if (this._useComposer) this.composer.dispose();
    this.renderer.dispose();
  }
}
