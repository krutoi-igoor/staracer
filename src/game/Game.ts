import * as THREE from 'three';
import { Track } from './Track';
import { Car, CarInput } from './Car';
import { HUD } from './HUD';
import { Sound } from './Sound';
import { resolveCollisions } from './Collision';
import { Multiplayer } from './Multiplayer';
import { AI_COLORS, NUM_AI, PLAYER_COLOR, TOTAL_LAPS, SPEED_PLAYER_MAX } from './constants';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene    = new THREE.Scene();
  private camera   = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);

  private track!:    Track;
  private player!:   Car;
  private aiCars:    Car[]  = [];
  private allCars:   Car[]  = [];

  private hud!:      HUD;
  private sound      = new Sound();
  private mp!:       Multiplayer;

  private keys: Record<string, boolean> = {};
  private input: CarInput = { accel: false, brake: false, left: false, right: false, handbrake: false };
  private prevSteerDir = 0;

  // Timing
  private lastRafTime = 0;
  private elapsed     = 0;
  private lapStart    = 0;
  private bestLap: number | null = null;
  private prevLap     = 1;

  // State
  private started     = false;
  private finishShown = false;

  // Smooth camera state
  private _camPos    = new THREE.Vector3();
  private _camLookAt = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000008);
    this.renderer.shadowMap.enabled = true;

    this._setupScene();
    this._setupInput();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
  }

  private _setupScene() {
    this.scene.fog = new THREE.FogExp2(0x000008, 0.0015);
    this.scene.add(new THREE.AmbientLight(0x112244, 2.0));

    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(80, 200, 80);
    this.scene.add(dir);

    // Rim light from below (illuminates underside)
    const rim = new THREE.DirectionalLight(0x002244, 0.6);
    rim.position.set(0, -100, 0);
    this.scene.add(rim);

    // Starfield
    const starPos = new Float32Array(4000 * 3);
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 2500;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true })));

    this.track = new Track(this.scene);
    this.hud   = new HUD(this.track);
    this.mp    = new Multiplayer(this.scene);

    // Stagger start positions
    const GAP = 0.011;
    this.player = new Car(this.scene, PLAYER_COLOR, true, GAP * NUM_AI);
    for (let i = 0; i < NUM_AI; i++) {
      this.aiCars.push(new Car(this.scene, AI_COLORS[i % AI_COLORS.length], false, GAP * i));
    }
    this.allCars = [this.player, ...this.aiCars];

    // Init camera position off a track frame so no jump on first frame
    const f0 = this.track.getTransform(this.player.trackT, 0);
    this._camPos.copy(f0.pos).addScaledVector(f0.tangent, -22).addScaledVector(f0.up, 8);
    this._camLookAt.copy(f0.pos).addScaledVector(f0.tangent, 10);
  }

  private _setupInput() {
    const down = (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = true;
      // Init sound on first keypress (browser autoplay policy)
      this.sound.init();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   e => { this.keys[e.key.toLowerCase()] = false; });
  }

  private _handleResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this._runCountdown();
  }

  private _runCountdown() {
    const countEl  = document.getElementById('countdown')!;
    const centerEl = document.getElementById('hud-center')!;
    centerEl.style.display = 'block';

    let n = 3;
    countEl.textContent = String(n);

    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        countEl.textContent = String(n);
      } else {
        countEl.textContent = 'GO!';
        setTimeout(() => {
          centerEl.style.display = 'none';
          this.started  = true;
          this.lapStart = performance.now() / 1000;
        }, 500);
        clearInterval(tick);
      }
    }, 1000);

    requestAnimationFrame(t => this._loop(t));
  }

  private _loop(rafTime: number) {
    requestAnimationFrame(t => this._loop(t));

    // Cap dt at one frame — prevents spiral of death on tab switch
    const dt = Math.min((rafTime - this.lastRafTime) / 1000, 1 / 30);
    this.lastRafTime = rafTime;

    if (!this.started) {
      this._updateCamera(0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsed += dt;
    this._readInput();

    // Physics
    for (const car of this.allCars) {
      car.update(dt, car.isPlayer ? this.input : null, this.track, this.allCars);
    }
    resolveCollisions(this.allCars);

    // Multiplayer: send our state, update remote meshes
    this.mp.send(this.player.trackT, this.player.lateral, this.player.lap);
    this.mp.update(this.track);

    // Lap tracking
    if (this.player.lap !== this.prevLap) {
      const lapTime = this.elapsed - this.lapStart;
      if (this.bestLap === null || lapTime < this.bestLap) this.bestLap = lapTime;
      this.lapStart = this.elapsed;
      this.prevLap  = this.player.lap;
    }

    // Finish
    if (this.player.finished && !this.finishShown) {
      this.finishShown = true;
      const center = document.getElementById('hud-center')!;
      center.style.display = 'block';
      document.getElementById('finish')!.textContent = 'FINISH!';
    }

    // Sound
    const steerDir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const steerChange = steerDir - this.prevSteerDir;
    this.sound.update(this.player.speed, SPEED_PLAYER_MAX, steerDir * 2);
    this.prevSteerDir = steerDir;

    this._updateCamera(dt);
    this.hud.update(this.player, this.allCars, this.elapsed, this.bestLap, this.track);
    this.renderer.render(this.scene, this.camera);
  }

  private _readInput() {
    const k = this.keys;
    this.input = {
      accel:     !!(k['w'] || k['arrowup']),
      brake:     !!(k['s'] || k['arrowdown']),
      left:      !!(k['a'] || k['arrowleft']),
      right:     !!(k['d'] || k['arrowright']),
      handbrake: !!(k[' ']),
    };
  }

  private _updateCamera(dt: number) {
    // Use the interpolated track transform — never getWorldDirection()
    const { pos, tangent, up } = this.track.getTransform(
      this.player.trackT, this.player.lateral * 0.4,
    );

    // Camera sits 22 units behind + 8 up, looks 12 units ahead
    const desired     = pos.clone().addScaledVector(tangent, -22).addScaledVector(up, 8);
    const desiredLook = pos.clone().addScaledVector(tangent, 12);

    if (dt <= 0) {
      this._camPos.copy(desired);
      this._camLookAt.copy(desiredLook);
    } else {
      // Frame-rate-independent smooth follow (τ ≈ 0.12 s)
      const alpha     = 1 - Math.pow(0.001, dt / 0.12);
      const alphaLook = 1 - Math.pow(0.001, dt / 0.08);
      this._camPos.lerp(desired, alpha);
      this._camLookAt.lerp(desiredLook, alphaLook);
    }

    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLookAt);
    this.camera.up.copy(up);
  }
}
