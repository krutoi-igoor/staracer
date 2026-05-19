import * as THREE from 'three';
import { Track } from './Track';
import {
  TRACK_WIDTH, TOTAL_LAPS,
  SPEED_AI_BASE, SPEED_AI_MAX, SPEED_PLAYER_MAX,
  SPEED_ACCEL, SPEED_BRAKE, SPEED_FRICTION,
  DRAFT_RANGE, DRAFT_LAT_THRESH, DRAFT_BOOST,
  LAT_SPEED, MAX_LAT,
} from './constants';

function trackDelta(a: number, b: number): number {
  let d = b - a;
  if (d > 0.5)  d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function createArrow(color: number): THREE.Group {
  const g = new THREE.Group();

  // Body
  const bodyGeo = new THREE.BoxGeometry(1.4, 0.5, 3.0);
  // Nose (cone rotated to face +Z → we'll flip group)
  const noseGeo = new THREE.ConeGeometry(1.0, 2.2, 4);
  noseGeo.rotateX(-Math.PI / 2); // tip → +Z
  noseGeo.translate(0, 0, -2.5);

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.55,
    flatShading: true,
  });

  const body = new THREE.Mesh(bodyGeo, mat);
  const nose = new THREE.Mesh(noseGeo, mat);
  g.add(body, nose);

  return g;
}

export interface CarInput {
  accel: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export class Car {
  readonly mesh: THREE.Group;
  readonly isPlayer: boolean;
  readonly color: number;

  trackT    = 0;  // 0–1
  lateral   = 0;  // world units offset from centreline (clamped to ±MAX_LAT)
  speed     = 0;  // laps/sec
  lap       = 1;
  finished  = false;

  // Drafting state (written each frame)
  draftLevel = 0; // 0–1

  // AI steering target
  private _aiLatTarget = 0;
  private _aiSpeedTarget = SPEED_AI_BASE;

  constructor(scene: THREE.Scene, color: number, isPlayer: boolean, startT: number) {
    this.color    = color;
    this.isPlayer = isPlayer;
    this.trackT   = startT;
    this.mesh     = createArrow(color);
    scene.add(this.mesh);
  }

  get totalProgress(): number {
    return (this.lap - 1) + this.trackT;
  }

  update(dt: number, input: CarInput | null, track: Track, allCars: Car[]) {
    if (this.finished) return;

    // ── Draft detection ────────────────────────────────────────────
    let drafting = false;
    for (const other of allCars) {
      if (other === this) continue;
      const ahead = trackDelta(this.trackT, other.trackT);
      const latDiff = Math.abs(this.lateral - other.lateral) / MAX_LAT;
      if (ahead > 0 && ahead < DRAFT_RANGE && latDiff < DRAFT_LAT_THRESH) {
        drafting = true;
        break;
      }
    }
    this.draftLevel = drafting ? 1 : Math.max(0, this.draftLevel - dt * 3);
    const draftBoost = this.draftLevel * DRAFT_BOOST;

    // ── Speed / steering ───────────────────────────────────────────
    if (this.isPlayer && input) {
      const maxSpd = SPEED_PLAYER_MAX + draftBoost;
      if (input.accel)  this.speed = Math.min(this.speed + SPEED_ACCEL * dt, maxSpd);
      if (input.brake)  this.speed = Math.max(this.speed - SPEED_BRAKE * dt, 0);
      if (!input.accel && !input.brake) this.speed = Math.max(this.speed - SPEED_FRICTION * dt, 0);
      if (input.handbrake) this.speed *= (1 - 4 * dt);

      const steerDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.lateral += steerDir * LAT_SPEED * (this.speed / SPEED_PLAYER_MAX) * dt * MAX_LAT;
      this.lateral = Math.max(-MAX_LAT, Math.min(MAX_LAT, this.lateral));
    } else {
      // AI brain
      this._aiUpdate(dt, allCars, draftBoost);
    }

    // ── Advance track position ─────────────────────────────────────
    const prevT = this.trackT;
    this.trackT += this.speed * dt;

    if (this.trackT >= 1) {
      this.trackT -= 1;
      if (prevT > 0.5) { // genuine crossover
        this.lap++;
        if (this.lap > TOTAL_LAPS) {
          this.finished = true;
          this.lap = TOTAL_LAPS;
        }
      }
    }

    // ── Mesh placement ─────────────────────────────────────────────
    const { pos, tangent, up } = track.getTransform(this.trackT, this.lateral);
    this.mesh.position.copy(pos);
    this.mesh.up.copy(up);
    this.mesh.lookAt(pos.clone().add(tangent));
  }

  /** Returns world-space XZ position for minimap rendering */
  trackFrame(track: Track): { x: number; z: number } {
    const { pos } = track.getTransform(this.trackT, this.lateral);
    return { x: pos.x, z: pos.z };
  }

  private _aiUpdate(dt: number, allCars: Car[], draftBoost: number) {
    // Vary target speed slightly per car
    const maxSpd = SPEED_AI_MAX + draftBoost;
    if (Math.random() < 0.01) {
      this._aiSpeedTarget = SPEED_AI_BASE + Math.random() * (maxSpd - SPEED_AI_BASE);
    }
    this.speed += (this._aiSpeedTarget - this.speed) * dt * 2;
    this.speed = Math.max(0, Math.min(maxSpd, this.speed));

    // Steer toward centre, avoid nearby cars
    let latTarget = this._aiLatTarget;
    if (Math.random() < 0.005) {
      this._aiLatTarget = (Math.random() - 0.5) * MAX_LAT * 0.6;
    }
    for (const other of allCars) {
      if (other === this) continue;
      const delta = trackDelta(this.trackT, other.trackT);
      if (Math.abs(delta) < 0.01) {
        const push = this.lateral < other.lateral ? -1 : 1;
        latTarget += push * MAX_LAT * 0.5;
      }
    }
    this.lateral += (latTarget - this.lateral) * dt * 2;
    this.lateral = Math.max(-MAX_LAT, Math.min(MAX_LAT, this.lateral));
  }
}
