import * as THREE from 'three';
import { Track } from './Track';
import { Car, CarInput } from './Car';
import { HUD } from './HUD';
import { resolveCollisions } from './Collision';
import { Multiplayer } from './Multiplayer';
import { Scores, ScoreEntry } from './Scores';
import {
  AI_COLORS, NUM_AI, TOTAL_LAPS, SPEED_PLAYER_MAX, MAX_LAT,
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
  private scene    = new THREE.Scene();
  private camera   = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);

  private track!:  Track;
  private player!: Car;
  private aiCars:  Car[] = [];
  private allCars: Car[] = [];
  private hud!:    HUD;
  private mp!:     Multiplayer;

  private keys: Record<string, boolean> = {};
  private _mouseX      = window.innerWidth / 2;
  private _mouseLBtn   = false;
  private _mouseRBtn   = false;
  private _input: CarInput = { accel: false, brake: false, left: false, right: false, handbrake: false, mouseLatTarget: null };

  private elapsed   = 0;
  private lapStart  = 0;
  private bestLap:  number | null = null;
  private prevLap   = 1;
  private lastRaf   = 0;
  private started   = false;
  private done      = false;
  private finishPos = 1;

  private _camPos    = new THREE.Vector3();
  private _camLookAt = new THREE.Vector3();

  private _onFinish: (time: number, lap: number, pos: number) => void;
  private _config: GameConfig;

  // Event listeners for cleanup
  private _listeners: (() => void)[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    config: GameConfig,
    onFinish: (time: number, bestLap: number, pos: number) => void,
  ) {
    this._config   = config;
    this._onFinish = onFinish;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000008);

    this._setupScene(config);
    this._setupInput(config.controller);
    this._resize();

    const resizeFn = () => this._resize();
    window.addEventListener('resize', resizeFn);
    this._listeners.push(() => window.removeEventListener('resize', resizeFn));
  }

  private _setupScene(cfg: GameConfig) {
    this.scene.fog = new THREE.FogExp2(0x000008, 0.0015);
    this.scene.add(new THREE.AmbientLight(0x112244, 2.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(80, 200, 80);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x002244, 0.6);
    rim.position.set(0, -100, 0);
    this.scene.add(rim);

    // Stars
    const sp = new Float32Array(4000 * 3);
    for (let i = 0; i < sp.length; i++) sp[i] = (Math.random() - 0.5) * 2500;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4 })));

    this.track = new Track(this.scene, cfg.track);
    this.hud   = new HUD(this.track);
    this.mp    = new Multiplayer(this.scene);

    // Stagger grid
    const GAP = 0.011;

    // AI colors excluding player color
    const aiColors = AI_COLORS.filter(c => c !== cfg.car.color);
    while (aiColors.length < NUM_AI) aiColors.push(AI_COLORS[aiColors.length % AI_COLORS.length]);

    this.player = new Car(this.scene, cfg.car.color, true, GAP * NUM_AI, cfg.car, null);
    for (let i = 0; i < NUM_AI; i++) {
      this.aiCars.push(new Car(this.scene, aiColors[i], false, GAP * i, cfg.car, cfg.difficulty));
    }
    this.allCars = [this.player, ...this.aiCars];

    // Init camera
    const f0 = this.track.getTransform(this.player.trackT, 0);
    this._camPos.copy(f0.pos).addScaledVector(f0.tangent, -22).addScaledVector(f0.up, 8);
    this._camLookAt.copy(f0.pos).addScaledVector(f0.tangent, 12);
  }

  private _setupInput(controller: 'keyboard' | 'mouse') {
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
      const md = (e: MouseEvent) => { if (e.button === 0) this._mouseLBtn = true; if (e.button === 2) this._mouseRBtn = true; };
      const mu = (e: MouseEvent) => { if (e.button === 0) this._mouseLBtn = false; if (e.button === 2) this._mouseRBtn = false; };
      const cm = (e: MouseEvent) => e.preventDefault();
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const countEl  = document.getElementById('countdown')!;
    const centerEl = document.getElementById('hud-center')!;
    centerEl.style.display = 'block';
    let n = 3;
    countEl.textContent = String(n);
    document.getElementById('finish')!.textContent = '';

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
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsed += dt;
    if (this.lapStart === 0) this.lapStart = this.elapsed;

    this._readInput();

    for (const car of this.allCars) {
      car.update(dt, car.isPlayer ? this._input : null, this.track, this.allCars, this.player);
    }
    resolveCollisions(this.allCars);
    this.mp.send(this.player.trackT, this.player.lateral, this.player.lap);
    this.mp.update(this.track);

    // Lap timing
    if (this.player.lap !== this.prevLap) {
      const lapTime = this.elapsed - this.lapStart;
      if (this.bestLap === null || lapTime < this.bestLap) this.bestLap = lapTime;
      this.lapStart = this.elapsed;
      this.prevLap  = this.player.lap;
    }

    // Race finish
    if (this.player.finished && !this.done) {
      this.done = true;
      const sorted    = [...this.allCars].sort((a, b) => b.totalProgress - a.totalProgress);
      this.finishPos  = sorted.indexOf(this.player) + 1;
      this._onFinish(this.elapsed, this.bestLap ?? this.elapsed, this.finishPos);
    }

    this._updateCamera(dt);
    this.hud.update(this.player, this.allCars, this.elapsed, this.bestLap, this.track);
    this.renderer.render(this.scene, this.camera);
  }

  private _readInput() {
    const k = this.keys;
    if (this._config.controller === 'mouse') {
      const norm       = (this._mouseX / window.innerWidth) * 2 - 1;
      const latTarget  = norm * MAX_LAT;
      this._input = {
        accel: !this._mouseRBtn,
        brake: this._mouseRBtn,
        left: false, right: false, handbrake: !!k[' '],
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
    const { pos, tangent, up } = this.track.getTransform(this.player.trackT, this.player.lateral * 0.4);
    const desired     = pos.clone().addScaledVector(tangent, -22).addScaledVector(up, 8);
    const desiredLook = pos.clone().addScaledVector(tangent, 12);

    if (dt <= 0) {
      this._camPos.copy(desired);
      this._camLookAt.copy(desiredLook);
    } else {
      const a  = 1 - Math.pow(0.001, dt / 0.12);
      const al = 1 - Math.pow(0.001, dt / 0.08);
      this._camPos.lerp(desired, a);
      this._camLookAt.lerp(desiredLook, al);
    }
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLookAt);
    this.camera.up.copy(up);
  }

  destroy() {
    this.done = true;
    this._listeners.forEach(fn => fn());
    this.mp.destroy();
    this.renderer.dispose();
  }
}
