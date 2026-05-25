import * as THREE from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { Track } from './Track';
import { Car, CarInput, GridSlot } from './Car';
import { HUD } from './HUD';
import { resolveCollisions } from './Collision';
import { Multiplayer } from './Multiplayer';
import { Scores } from './Scores';
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

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene     = new THREE.Scene();
  private camera    = new THREE.PerspectiveCamera(72, 1, 0.3, 3000);
  private composer!: EffectComposer;

  private track!:   Track;
  private player!:  Car;
  private aiCars:   Car[] = [];
  private allCars:  Car[] = [];
  private hud!:     HUD;
  private mp!:      Multiplayer;

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

  private _camPos    = new THREE.Vector3();
  private _camLookAt = new THREE.Vector3();
  private _currentFOV = 72;

  // Speed-line particles (void streaks)
  private _speedLines!: THREE.LineSegments;
  private _slBuf!:      Float32Array;
  private _slAttr!:     THREE.BufferAttribute;

  private _onFinish: (time: number, bestLap: number, pos: number) => void;
  private _config:   GameConfig;
  private _listeners: (() => void)[] = [];

  /** Camera shake — decays over time after collision */
  private _shakeAmt  = 0;

  constructor(
    canvas: HTMLCanvasElement,
    config: GameConfig,
    onFinish: (time: number, bestLap: number, pos: number) => void,
  ) {
    this._config   = config;
    this._onFinish = onFinish;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000005);
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.75;

    this._setupScene(config);
    this._setupBloom();
    this._setupInput(config.controller);
    this._buildSpeedLines();
    this._resize();

    const r = () => this._resize();
    window.addEventListener('resize', r);
    this._listeners.push(() => window.removeEventListener('resize', r));
  }

  private _setupScene(cfg: GameConfig) {
    // Pure black void — no fog, no background geometry
    this.scene.background = new THREE.Color(0x000000);

    // Minimal ambient so car geometry is readable
    this.scene.add(new THREE.AmbientLight(0x111111, 1.0));

    this.track = new Track(this.scene, cfg.track);
    this.hud   = new HUD(this.track);
    this.mp    = new Multiplayer(this.scene);

    // Staggered starting grid: pairs left/right each row
    //   Player = pole position (front), AI fill rows behind
    //   row 0 = T offset 0 (ahead), each row further back by 0.010 fraction
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

    const f0 = this.track.getTransform(this.player.trackT, 0);
    this._camPos.copy(f0.pos).addScaledVector(f0.tangent, -14).addScaledVector(f0.up, 3.5);
    this._camLookAt.copy(f0.pos).addScaledVector(f0.tangent, 8);
  }

  private _setupBloom() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.35,  // strength — strong white glow, matches reference
      0.45,  // radius   — soft but contained halo
      0.60,  // threshold — fires on bright whites (edge lines, cars) not dark surfaces
    );
    this.composer.addPass(bloom);
  }

  private _buildSpeedLines() {
    const N = 400;
    this._slBuf  = new Float32Array(N * 2 * 3);
    this._slAttr = new THREE.BufferAttribute(this._slBuf, 3).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N; i++) this._resetLine(i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this._slAttr);
    this._speedLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0.0,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    }));
    this._speedLines.frustumCulled = false;
    this.scene.add(this._speedLines);
  }

  private _resetLine(i: number) {
    // Reset to a point in a tube around the camera forward axis
    const r   = 1.5 + Math.random() * 4;
    const ang  = Math.random() * Math.PI * 2;
    this._slBuf[i * 3    ] = Math.cos(ang) * r;
    this._slBuf[i * 3 + 1] = Math.sin(ang) * r;
    this._slBuf[i * 3 + 2] = -(40 + Math.random() * 60); // ahead in camera space
  }

  private _setupInput(controller: 'keyboard' | 'mouse') {
    this._mouseX = window.innerWidth / 2;

    const kd = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = true; };
    const ku = (e: KeyboardEvent) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this._listeners.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
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
  }

  private _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
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

    const dt = Math.min((raf - this.lastRaf) / 1000, 1 / 30);
    this.lastRaf = raf;

    if (!this.started) {
      this._updateCamera(0);
      this.composer.render();
      return;
    }

    this.elapsed += dt;
    if (this.lapStart === 0) this.lapStart = this.elapsed;

    this._readInput();

    for (const car of this.allCars) {
      car.update(dt, car.isPlayer ? this._input : null, this.track, this.allCars, this.player);
    }
    const prevLat  = this.player.lateral;
    resolveCollisions(this.allCars);
    // Trigger camera shake when player is knocked sideways
    const latDelta = Math.abs(this.player.lateral - prevLat);
    if (latDelta > 0.15) this._shakeAmt = Math.min(this._shakeAmt + latDelta * 1.2, 0.9);

    this.mp.send(this.player.trackT, this.player.lateral, this.player.lap);
    this.mp.update(this.track);

    // Lap timing
    if (this.player.lap !== this.prevLap) {
      const lapTime = this.elapsed - this.lapStart;
      if (this.bestLap === null || lapTime < this.bestLap) this.bestLap = lapTime;
      this.lapStart = this.elapsed;
      this.prevLap  = this.player.lap;
    }

    // Finish
    if (this.player.finished && !this.done) {
      this.done = true;
      const sorted = [...this.allCars].sort((a, b) => b.totalProgress - a.totalProgress);
      this._onFinish(this.elapsed, this.bestLap ?? this.elapsed, sorted.indexOf(this.player) + 1);
    }

    this._updateSpeedLines(dt);
    this._updateCamera(dt);
    this.hud.update(this.player, this.allCars, this.elapsed, this.bestLap, this.track);
    this.composer.render();
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

    const { pos, tangent, up } = this.track.getTransform(this.player.trackT, this.player.lateral * 0.45);

    const camH    = 2.8 + spd * 1.2;
    const camDist = 14 - spd * 3;

    const desired     = pos.clone().addScaledVector(tangent, -camDist).addScaledVector(up, camH);
    const desiredLook = pos.clone().addScaledVector(tangent, 9).addScaledVector(up, -0.4);

    // Dynamic FOV
    const targetFOV  = 72 + spd * 32;
    this._currentFOV += (targetFOV - this._currentFOV) * Math.min(dt * 5, 1);
    this.camera.fov   = this._currentFOV;
    this.camera.updateProjectionMatrix();

    if (dt <= 0) {
      this._camPos.copy(desired);
      this._camLookAt.copy(desiredLook);
    } else {
      const a  = 1 - Math.pow(0.001, dt / 0.10);
      const al = 1 - Math.pow(0.001, dt / 0.06);
      this._camPos.lerp(desired, a);
      this._camLookAt.lerp(desiredLook, al);
    }

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLookAt);
    this.camera.up.copy(up);

    // Camera shake from collisions
    if (this._shakeAmt > 0.01) {
      this._shakeAmt *= (1 - dt * 9);
      const s = this._shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.3;
    }
  }

  private _updateSpeedLines(dt: number) {
    const spd = this.player.speed / SPEED_PLAYER_MAX;
    const mat = this._speedLines.material as THREE.LineBasicMaterial;

    // Only show at higher speeds
    mat.opacity = Math.max(0, (spd - 0.5) * 1.4);

    if (spd < 0.3) return;

    // Move lines toward camera (in camera-local Z)
    const streak = 80 * spd * dt;
    this._speedLines.position.copy(this.camera.position);
    this._speedLines.quaternion.copy(this.camera.quaternion);

    for (let i = 0; i < 200; i++) {
      this._slBuf[i * 6 + 2] += streak;
      this._slBuf[i * 6 + 5] += streak;
      // Reset when they pass behind camera
      if (this._slBuf[i * 6 + 2] > 2) this._resetLine(i);
    }
    this._slAttr.needsUpdate = true;
  }

  destroy() {
    this.done = true;
    this._listeners.forEach(fn => fn());
    this.allCars.forEach(c => c.dispose());
    this.mp.destroy();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
