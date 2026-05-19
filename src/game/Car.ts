import * as THREE from 'three';
import { Track } from './Track';
import {
  TRACK_WIDTH, TOTAL_LAPS,
  SPEED_AI_BASE, SPEED_AI_RANGE, SPEED_PLAYER_MAX,
  SPEED_ACCEL, SPEED_BRAKE, SPEED_FRICTION,
  DRAFT_RANGE, DRAFT_LAT_THRESH, DRAFT_BOOST,
  LAT_SPEED, MAX_LAT, CAR_RADIUS,
} from './constants';

function trackDelta(a: number, b: number): number {
  let d = b - a;
  if (d >  0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function createArrow(color: number): THREE.Group {
  const g = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    flatShading: true,
  });

  // Body — elongated along +Z (forward)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 3.2), mat);
  g.add(body);

  // Nose — cone pointing toward +Z (forward)
  const noseGeo = new THREE.ConeGeometry(0.9, 2.0, 4);
  noseGeo.rotateX(Math.PI / 2);   // tip → +Z (was -π/2 before, which pointed -Z)
  noseGeo.translate(0, 0, 2.6);   // shift ahead of body
  const nose = new THREE.Mesh(noseGeo, mat);
  g.add(nose);

  // Cockpit nub
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.8), mat);
  cockpit.position.set(0, 0.4, 0);
  g.add(cockpit);

  return g;
}

export interface CarInput {
  accel:     boolean;
  brake:     boolean;
  left:      boolean;
  right:     boolean;
  handbrake: boolean;
}

export class Car {
  readonly mesh:     THREE.Group;
  readonly isPlayer: boolean;
  readonly color:    number;

  trackT    = 0;
  lateral   = 0;
  speed     = 0;
  lap       = 1;
  finished  = false;
  draftLevel = 0;

  // Written each update — used by camera and collision
  currentTangent = new THREE.Vector3(0, 0, 1);
  currentUp      = new THREE.Vector3(0, 1, 0);
  currentRight   = new THREE.Vector3(1, 0, 0);

  // Velocity for collision impulses
  lateralVel = 0;

  private _aiLatTarget = 0;
  private _aiBaseSpeed: number;

  constructor(scene: THREE.Scene, color: number, isPlayer: boolean, startT: number) {
    this.color     = color;
    this.isPlayer  = isPlayer;
    this.trackT    = startT;
    this._aiBaseSpeed = SPEED_AI_BASE + Math.random() * SPEED_AI_RANGE;
    this.mesh      = createArrow(color);
    scene.add(this.mesh);
  }

  get totalProgress(): number {
    return (this.lap - 1) + this.trackT;
  }

  update(dt: number, input: CarInput | null, track: Track, allCars: Car[]) {
    if (this.finished) return;

    // ── Drafting ──────────────────────────────────────────────────────────
    let drafting = false;
    for (const other of allCars) {
      if (other === this) continue;
      const ahead  = trackDelta(this.trackT, other.trackT);
      const latGap = Math.abs(this.lateral - other.lateral) / MAX_LAT;
      if (ahead > 0 && ahead < DRAFT_RANGE && latGap < DRAFT_LAT_THRESH) {
        drafting = true; break;
      }
    }
    this.draftLevel = drafting ? Math.min(1, this.draftLevel + dt * 4) : Math.max(0, this.draftLevel - dt * 3);
    const draftBoost = this.draftLevel * DRAFT_BOOST;

    // ── Speed / steering ──────────────────────────────────────────────────
    if (this.isPlayer && input) {
      const maxSpd = SPEED_PLAYER_MAX + draftBoost;
      if (input.accel)    this.speed = Math.min(this.speed + SPEED_ACCEL * dt, maxSpd);
      if (input.brake)    this.speed = Math.max(this.speed - SPEED_BRAKE  * dt, 0);
      if (!input.accel && !input.brake)
        this.speed = Math.max(this.speed - SPEED_FRICTION * dt, 0);
      if (input.handbrake) this.speed *= (1 - 5 * dt);

      const steerScale = Math.min(this.speed / SPEED_PLAYER_MAX, 1);
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.lateral += dir * LAT_SPEED * steerScale * dt * MAX_LAT;
    } else {
      this._aiStep(dt, track, allCars, draftBoost);
    }

    // Keep on track
    this.lateral = Math.max(-MAX_LAT, Math.min(MAX_LAT, this.lateral));

    // ── Advance track T ───────────────────────────────────────────────────
    const prevT = this.trackT;
    this.trackT += this.speed * dt;

    if (this.trackT >= 1) {
      this.trackT -= 1;
      if (prevT > 0.5) {
        this.lap++;
        if (this.lap > TOTAL_LAPS) { this.finished = true; this.lap = TOTAL_LAPS; }
      }
    }

    // ── Place mesh ────────────────────────────────────────────────────────
    const { pos, tangent, up, right } = track.getTransform(this.trackT, this.lateral);
    this.currentTangent.copy(tangent);
    this.currentUp.copy(up);
    this.currentRight.copy(right);

    this.mesh.position.copy(pos);
    this.mesh.up.copy(up);
    // lookAt uses Object3D convention: +Z toward target
    this.mesh.lookAt(pos.clone().add(tangent));
  }

  private _aiStep(dt: number, track: Track, allCars: Car[], draftBoost: number) {
    // Speed control
    const maxSpd = this._aiBaseSpeed + draftBoost;
    this.speed += (maxSpd - this.speed) * Math.min(dt * 2, 1);
    this.speed = Math.max(0, Math.min(maxSpd, this.speed));

    // Racing line target
    const racingTarget = track.getRacingLineOffset(this.trackT);

    // Avoidance: push away from adjacent cars
    let avoidance = 0;
    for (const other of allCars) {
      if (other === this) continue;
      const delta = trackDelta(this.trackT, other.trackT);
      if (Math.abs(delta) < 0.015) {
        const latDiff = this.lateral - other.lateral;
        if (Math.abs(latDiff) < MAX_LAT * 0.4) {
          avoidance += Math.sign(latDiff) * MAX_LAT * 0.35;
        }
      }
    }

    const target = racingTarget + avoidance;
    this.lateral += (target - this.lateral) * Math.min(dt * 2.5, 1);
  }

  /** Apply lateral impulse (used by collision resolution) */
  applyLateralImpulse(amount: number) {
    this.lateral += amount;
    this.speed    = Math.max(this.speed * 0.88, 0);
  }

  /** Returns world XZ position for minimap */
  minimapPos(track: Track): { x: number; z: number } {
    const { pos } = track.getTransform(this.trackT, this.lateral);
    return { x: pos.x, z: pos.z };
  }
}
