import * as THREE from 'three';
import { Track } from './Track';
import { Trail } from './Trail';
import {
  TOTAL_LAPS, SPEED_PLAYER_MAX, SPEED_ACCEL, SPEED_BRAKE, SPEED_FRICTION,
  LAT_ACCEL, LAT_DAMP, MAX_LAT, FALL_TRIGGER,
  CURV_DRIFT, CURV_LOOK,
  DRAFT_RANGE, DRAFT_LAT_THRESH, DRAFT_BOOST,
  RUBBER_BAND_LEAD, RUBBER_BAND_MAX,
  CAR_RADIUS,
  DifficultyConfig, CarSpec,
} from './constants';

function trackDelta(a: number, b: number): number {
  let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d;
}

function buildBody(spec: CarSpec, color: number): THREE.Group {
  const g   = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive:          color,
    emissiveIntensity: 1.4,
    roughness:         0.3,
    metalness:         0.5,
  });

  const W  = spec.width;
  const L  = spec.length;
  const bw = W * 0.52;   // body (shaft) half-width — narrower than shoulders
  const H  = 0.22;       // car height (extrusion)

  // Arrow shape in XY plane, tip pointing in +Y (becomes +Z after rotation)
  const shape = new THREE.Shape();
  shape.moveTo(0,       L * 0.50);   // front tip
  shape.lineTo( W*0.5,  L * 0.06);   // right shoulder outer
  shape.lineTo( bw*0.5, L * 0.03);   // right shoulder inner
  shape.lineTo( bw*0.5, -L * 0.50);  // right rear
  shape.lineTo(-bw*0.5, -L * 0.50);  // left rear
  shape.lineTo(-bw*0.5, L * 0.03);   // left shoulder inner
  shape.lineTo(-W*0.5,  L * 0.06);   // left shoulder outer
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);    // XY plane → XZ plane; +Y → +Z (forward); extrusion → -Y
  geo.translate(0, H / 2, 0);  // center vertically

  g.add(new THREE.Mesh(geo, mat));

  // Colored underglow on track surface matching car color
  const puddle = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width * 1.8, spec.length * 1.5),
    new THREE.MeshBasicMaterial({
      color,
      blending:    THREE.AdditiveBlending,
      transparent: true,
      opacity:     0.15,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = -0.3;
  g.add(puddle);

  return g;
}

export interface CarInput {
  accel:          boolean;
  brake:          boolean;
  left:           boolean;
  right:          boolean;
  handbrake:      boolean;
  mouseLatTarget: number | null;
}

/** Grid slot: which starting row/side */
export interface GridSlot { row: number; side: -1 | 0 | 1 }

export class Car {
  readonly mesh:     THREE.Group;
  readonly isPlayer: boolean;
  readonly color:    number;
  readonly name:     string;
  readonly spec:     CarSpec;
  private  _trail:   Trail;

  trackT       = 0;
  lateral      = 0;
  /** Lateral velocity in track-space units per second */
  lateralVel   = 0;
  speed        = 0;
  lap          = 1;
  finished     = false;
  draftLevel   = 0;

  currentTangent = new THREE.Vector3(0, 0, 1);
  currentUp      = new THREE.Vector3(0, 1, 0);

  // Collision shake
  lastImpact   = 0;

  // Fall / respawn
  falling       = false;
  fallVel       = 0;
  fallDepth     = 0;
  fallTumble    = 0;
  fallAxis      = new THREE.Vector3(1, 0, 0);
  respawning    = false;
  respawnTimer  = 0;

  /** AI: preferred side of track (-1 left, 0 center, +1 right) */
  private _latBias: number;
  private _aiBase:  number;
  private _diff:    DifficultyConfig | null;

  constructor(
    scene: THREE.Scene, color: number, isPlayer: boolean, startT: number,
    spec: CarSpec, diff: DifficultyConfig | null,
    slot: GridSlot = { row: 0, side: 0 },
    name = 'You',
  ) {
    this.color    = color;
    this.name     = name;
    this.isPlayer = isPlayer;
    this.trackT   = startT;
    this.spec     = spec;
    this._diff    = diff;
    this._aiBase  = diff ? diff.aiSpeedBase + (Math.random() * 2 - 1) * diff.aiSpeedVar : 0;

    // Give each AI a distinct lateral personality (spreads them across the track)
    this._latBias = slot.side * MAX_LAT * (0.28 + Math.random() * 0.18);

    // Stagger starting lateral position
    this.lateral = isPlayer ? 0 : slot.side * MAX_LAT * 0.35;

    this.mesh  = buildBody(spec, color);
    this._trail = new Trail(scene, color, isPlayer ? 0.9 : 0.5);
    scene.add(this.mesh);
  }

  get totalProgress() { return (this.lap - 1) + this.trackT; }
  get alive()         { return !this.falling && !this.respawning; }

  update(dt: number, input: CarInput | null, track: Track, allCars: Car[], playerCar?: Car) {
    if (this.finished) return;

    // ── Respawn blink ─────────────────────────────────────────────────────
    if (this.respawning) {
      this.respawnTimer -= dt;
      this.mesh.visible  = Math.floor(this.respawnTimer * 10) % 2 === 0;
      if (this.respawnTimer <= 0) { this.respawning = false; this.mesh.visible = true; }
      this._placeMesh(track);
      return;
    }

    // ── Falling ───────────────────────────────────────────────────────────
    if (this.falling) {
      this.fallVel    += 28 * dt;
      this.fallDepth  += this.fallVel * dt;
      this.fallTumble += dt * 5;
      const { pos } = track.getTransform(this.trackT, this.lateral);
      this.mesh.position.copy(pos).y -= this.fallDepth;
      this.mesh.setRotationFromAxisAngle(this.fallAxis, this.fallTumble);
      if (this.fallDepth > 60) {
        this.falling = false; this.fallDepth = 0; this.fallVel = 0;
        this.lateral = 0; this.lateralVel = 0; this.speed *= 0.3;
        this.respawning = true; this.respawnTimer = 3.0;
        this.fallAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      }
      return;
    }

    // ── Draft ─────────────────────────────────────────────────────────────
    let drafting = false;
    for (const o of allCars) {
      if (o === this || !o.alive) continue;
      const ahead  = trackDelta(this.trackT, o.trackT);
      const latGap = Math.abs(this.lateral - o.lateral) / MAX_LAT;
      if (ahead > 0 && ahead < DRAFT_RANGE && latGap < DRAFT_LAT_THRESH) { drafting = true; break; }
    }
    this.draftLevel = drafting
      ? Math.min(1, this.draftLevel + dt * 4)
      : Math.max(0, this.draftLevel - dt * 3);

    const draftBoost = this.draftLevel * DRAFT_BOOST;

    // ── Centrifugal drift (corner push-out) ───────────────────────────────
    const curvDrift = this._computeCurvDrift(track) * (this.speed / SPEED_PLAYER_MAX);

    // ── Player controls ───────────────────────────────────────────────────
    if (this.isPlayer && input) {
      const spdMax = SPEED_PLAYER_MAX * this.spec.topSpeedMult + draftBoost;

      // Longitudinal
      if (input.accel)     this.speed = Math.min(this.speed + SPEED_ACCEL * this.spec.accelMult * dt, spdMax);
      if (input.brake)     this.speed = Math.max(this.speed - SPEED_BRAKE * dt, 0);
      if (input.handbrake) this.speed *= (1 - 5 * dt);
      if (!input.accel && !input.brake && !input.handbrake)
        this.speed = Math.max(this.speed - SPEED_FRICTION * dt, 0);

      // Lateral — momentum model (not instant snap)
      if (input.mouseLatTarget !== null) {
        // Mouse: spring toward target position
        const err = input.mouseLatTarget - this.lateral;
        this.lateralVel += err * 9.0 * dt - this.lateralVel * (LAT_DAMP - 0.5) * dt;
      } else {
        // Keyboard: velocity-based steering
        const steerDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        this.lateralVel += steerDir * LAT_ACCEL * this.spec.handleMult * dt;
        this.lateralVel -= this.lateralVel * LAT_DAMP * dt;
      }

      // Apply centrifugal drift + lateral velocity
      this.lateralVel += curvDrift * dt;
      this.lateral    += this.lateralVel * dt;

      // No artificial clamp — the fall zone IS the edge of the track
      // (FALL_TRIGGER check below is the only boundary)

    } else if (!this.isPlayer) {
      this._aiStep(dt, track, allCars, draftBoost, playerCar);
    }

    // ── Fall check — BEFORE any clamp ─────────────────────────────────────
    if (this.isPlayer && Math.abs(this.lateral) > FALL_TRIGGER) {
      this.falling = true;
      this.fallAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return;
    }
    // Clamp AI safely within track
    if (!this.isPlayer) {
      this.lateral = Math.max(-MAX_LAT * 0.88, Math.min(MAX_LAT * 0.88, this.lateral));
    }

    // ── Advance T ─────────────────────────────────────────────────────────
    const prev   = this.trackT;
    this.trackT += this.speed * dt;
    if (this.trackT >= 1) {
      this.trackT -= 1;
      if (prev > 0.5) {
        this.lap++;
        if (this.lap > TOTAL_LAPS) { this.finished = true; this.lap = TOTAL_LAPS; }
      }
    }

    this._placeMesh(track);
  }

  /** Compute centrifugal drift force: positive = drifts right (track turns left) */
  private _computeCurvDrift(track: Track): number {
    const steps = track.steps;
    const i0    = Math.floor(((this.trackT + 1) % 1) * steps) % steps;
    const i1    = (i0 + CURV_LOOK) % steps;
    const t0    = track.frames[i0].tangent;
    const t1    = track.frames[i1].tangent;
    const up    = track.frames[i0].up;
    const cross = _v3.crossVectors(t0, t1);
    return cross.dot(up) * CURV_DRIFT;
  }

  private _placeMesh(track: Track) {
    const { pos, tangent, up } = track.getTransform(this.trackT, this.lateral);
    this.currentTangent.copy(tangent);
    this.currentUp.copy(up);
    this.mesh.position.copy(pos);
    this.mesh.up.copy(up);
    this.mesh.lookAt(pos.clone().add(tangent));
    this._trail.update(pos.clone().addScaledVector(tangent, -this.spec.length * 0.5));
  }

  private _aiStep(dt: number, track: Track, allCars: Car[], draftBoost: number, player?: Car) {
    const cfg    = this._diff!;
    const spdMax = this._aiBase * this.spec.topSpeedMult + draftBoost;

    // Mild rubber-band: catch up if player is far ahead
    let rbBonus = 0;
    if (player) {
      const gap = player.totalProgress - this.totalProgress;
      if (gap > RUBBER_BAND_LEAD) rbBonus = Math.min((gap - RUBBER_BAND_LEAD) * 2.0, 1.0) * RUBBER_BAND_MAX;
    }

    this.speed += ((spdMax + rbBonus) - this.speed) * Math.min(dt * 2, 1);
    this.speed  = Math.max(0, Math.min(spdMax + rbBonus, this.speed));

    // Target = racing line + this AI's personality bias
    let target = track.getRacingLineOffset(
      ((this.trackT + cfg.aiLookAhead / track.steps) + 1) % 1,
    ) + this._latBias;

    // Avoidance: push away from nearby cars
    let avoid = 0;
    for (const o of allCars) {
      if (o === this) continue;
      const delta = trackDelta(this.trackT, o.trackT);
      if (Math.abs(delta) < 0.012) {
        const latDiff = this.lateral - o.lateral;
        if (Math.abs(latDiff) < MAX_LAT * 0.55) avoid += Math.sign(latDiff) * MAX_LAT * 0.45;
      }
    }

    // Blocking (hard/insane only): shade toward player's lateral when they're behind
    if (cfg.aiBlock && player && player.alive) {
      const behindDist = trackDelta(this.trackT, player.trackT);
      if (behindDist > 0 && behindDist < 0.025) target = target * 0.3 + player.lateral * 0.7;
    }

    this.lateral += (target + avoid - this.lateral) * Math.min(dt * cfg.aiReaction, 1);
  }

  applyLateralImpulse(amount: number) {
    this.lateral    += amount;
    this.lateralVel += amount * 2.5;  // cascades into momentum
    this.speed       = Math.max(this.speed * 0.88, 0);
    this.lastImpact  = Date.now();
  }

  minimapPos(track: Track) {
    const { pos } = track.getTransform(this.trackT, this.lateral);
    return { x: pos.x, z: pos.z };
  }

  dispose() {
    this._trail.dispose();
  }
}

// Scratch vector to avoid allocation in hot path
const _v3 = new THREE.Vector3();
