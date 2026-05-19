import * as THREE from 'three';
import { Track } from './Track';
import { Car, CarInput } from './Car';
import { HUD } from './HUD';
import { AI_COLORS, NUM_AI, PLAYER_COLOR, TOTAL_LAPS } from './constants';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene   = new THREE.Scene();
  private camera  = new THREE.PerspectiveCamera(65, 1, 0.5, 3000);

  private track!: Track;
  private player!: Car;
  private aiCars: Car[] = [];
  private allCars: Car[] = [];
  private hud!: HUD;

  private keys: Record<string, boolean> = {};
  private input: CarInput = { accel: false, brake: false, left: false, right: false, handbrake: false };

  private lastTime  = 0;
  private elapsed   = 0;
  private lapStart  = 0;
  private bestLap: number | null = null;
  private prevLap   = 1;

  private countdownTimer = 3;
  private started = false;
  private finishShown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000005);

    this._setupScene();
    this._setupInput();
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());

    this.hud = new HUD(this.track);
  }

  private _setupScene() {
    // Ambient + directional light
    this.scene.add(new THREE.AmbientLight(0x111133, 1.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(100, 200, 100);
    this.scene.add(dir);

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starPos  = new Float32Array(3000 * 3);
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 2000;
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));

    // Track
    this.track = new Track(this.scene);

    // Cars — stagger starting positions
    const GAP = 0.012;
    this.player = new Car(this.scene, PLAYER_COLOR, true, GAP * (NUM_AI));

    for (let i = 0; i < NUM_AI; i++) {
      this.aiCars.push(new Car(this.scene, AI_COLORS[i % AI_COLORS.length], false, GAP * i));
    }

    this.allCars = [this.player, ...this.aiCars];
  }

  private _setupInput() {
    window.addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.key.toLowerCase()] = false; });
  }

  private _readInput() {
    const k = this.keys;
    this.input = {
      accel:     k['w'] || k['arrowup'],
      brake:     k['s'] || k['arrowdown'],
      left:      k['a'] || k['arrowleft'],
      right:     k['d'] || k['arrowright'],
      handbrake: k[' '],
    };
  }

  private _handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this._countdown();
  }

  private _countdown() {
    const el = document.getElementById('countdown')!;
    document.getElementById('hud-center')!.style.display = 'block';

    let n = 3;
    el.textContent = String(n);
    const tick = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = String(n);
      } else {
        el.textContent = 'GO!';
        setTimeout(() => {
          document.getElementById('hud-center')!.style.display = 'none';
          this.started = true;
          this.lapStart = performance.now() / 1000;
        }, 600);
        clearInterval(tick);
      }
    }, 1000);

    requestAnimationFrame(t => this._loop(t));
  }

  private _loop(time: number) {
    requestAnimationFrame(t => this._loop(t));

    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (!this.started) {
      this._updateCamera(0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsed += dt;
    this._readInput();

    for (const car of this.allCars) {
      car.update(dt, car.isPlayer ? this.input : null, this.track, this.allCars);
    }

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
      const hc = document.getElementById('hud-center')!;
      const ft = document.getElementById('finish')!;
      hc.style.display = 'block';
      ft.textContent   = 'FINISH!';
    }

    this._updateCamera(dt);
    this.hud.update(this.player, this.allCars, this.elapsed, this.bestLap, this.track);
    this.renderer.render(this.scene, this.camera);
  }

  private _camPos = new THREE.Vector3();

  private _updateCamera(dt: number) {
    const fwd = new THREE.Vector3();
    this.player.mesh.getWorldDirection(fwd); // -Z direction = car forward

    const desired = this.player.mesh.position.clone()
      .addScaledVector(fwd, -22)
      .add(new THREE.Vector3(0, 9, 0));

    if (dt === 0) {
      this._camPos.copy(desired);
    } else {
      this._camPos.lerp(desired, 1 - Math.pow(0.01, dt));
    }

    this.camera.position.copy(this._camPos);

    const lookTarget = this.player.mesh.position.clone().addScaledVector(fwd, 14);
    this.camera.lookAt(lookTarget);
  }
}
