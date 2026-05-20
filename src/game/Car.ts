import * as THREE from 'three';
import { Track } from './Track';
import { Trail } from './Trail';
import {
  TOTAL_LAPS, SPEED_PLAYER_MAX, SPEED_ACCEL, SPEED_BRAKE, SPEED_FRICTION,
  DRAFT_RANGE, DRAFT_LAT_THRESH, DRAFT_BOOST,
  LAT_SPEED, MAX_LAT, FALL_TRIGGER, CAR_RADIUS,
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
    emissiveIntensity: 2.8,
    roughness:         0.2,
    metalness:         0.7,
    flatShading:       false,
  });

  // Main hull — flat and wide
  g.add(new THREE.Mesh(new THREE.BoxGeometry(spec.width, 0.22, spec.length * 0.68), mat));

  // Nose — sharp cone pointing forward (+Z)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(spec.width * 0.38, spec.length * 0.52, 4), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = spec.length * 0.60;
  g.add(nose);

  // Rear fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, spec.length * 0.28), mat);
    fin.position.set(side * spec.width * 0.44, 0.18, -spec.length * 0.28);
    g.add(fin);
  }

  // Cockpit dome (half-sphere)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(spec.width * 0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
  dome.position.set(0, 0.18, 0);
  g.add(dome);

  // Engine glow at rear
  const exhaust = new THREE.Mesh(
    new THREE.CircleGeometry(spec.width * 0.18, 8),
    new THREE.MeshBasicMaterial({
      color:     color,
      blending:  THREE.AdditiveBlending,
      transparent: true,
      opacity:   0.85,
      depthWrite: false,
    }),
  );
  exhaust.rotation.y = Math.PI;
  exhaust.position.z = -(spec.length * 0.34 + 0.05);
  g.add(exhaust);

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

export class Car {
  readonly mesh:     THREE.Group;
  readonly isPlayer: boolean;
  readonly color:    number;
  readonly spec:     CarSpec;
  private  _trail:   Trail;

  trackT     = 0;
  lateral    = 0;
  speed      = 0;
  lap        = 1;
  finished   = false;
  draftLevel = 0;

  currentTangent = new THREE.Vector3(0, 0, 1);
  currentUp      = new THREE.Vector3(0, 1, 0);

  // Fall / respawn
  falling       = false;
  fallVel       = 0;
  fallDepth     = 0;
  fallTumble    = 0;
  fallAxis      = new THREE.Vector3(1, 0, 0);
  respawning    = false;
  respawnTimer  = 0;

  private _aiBase: number;
  private _diff:   DifficultyConfig | null;

  constructor(
    scene: THREE.Scene, color: number, isPlayer: boolean, startT: number,
    spec: CarSpec, diff: DifficultyConfig | null,
  ) {
    this.color    = color;
    this.isPlayer = isPlayer;
    this.trackT   = startT;
    this.spec     = spec;
    this._diff    = diff;
    this._aiBase  = diff
      ? diff.aiSpeedBase + Math.random() * diff.aiSpeedVar
      : 0;
    this.mesh  = buildBody(spec, color);
    this._trail = new Trail(scene, color, isPlayer ? 0.9 : 0.5);
    scene.add(this.mesh);
  }

  get totalProgress() { return (this.lap - 1) + this.trackT; }
  get alive()         { return !this.falling && !this.respawning; }

  update(dt: number, input: CarInput | null, track: Track, allCars: Car[], playerCar?: Car) {
    if (this.finished) return;

    // Respawn blink
    if (this.respawning) {
      this.respawnTimer -= dt;
      this.mesh.visible  = Math.floor(this.respawnTimer * 10) % 2 === 0;
      if (this.respawnTimer <= 0) { this.respawning = false; this.mesh.visible = true; }
      this._placeMesh(track);
      return;
    }

    // Falling
    if (this.falling) {
      this.fallVel    += 28 * dt;
      this.fallDepth  += this.fallVel * dt;
      this.fallTumble += dt * 5;
      const { pos } = track.getTransform(this.trackT, this.lateral);
      this.mesh.position.copy(pos).y -= this.fallDepth;
      this.mesh.setRotationFromAxisAngle(this.fallAxis, this.fallTumble);
      if (this.fallDepth > 60) {
        this.falling = false; this.fallDepth = 0; this.fallVel = 0;
        this.lateral = 0; this.speed = 0;
        this.respawning = true; this.respawnTimer = 3.0;
        this.fallAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      }
      return;
    }

    // Draft
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

    // Player
    if (this.isPlayer && input) {
      const spdMax = SPEED_PLAYER_MAX * this.spec.topSpeedMult + draftBoost;
      if (input.accel)     this.speed = Math.min(this.speed + SPEED_ACCEL * this.spec.accelMult * dt, spdMax);
      if (input.brake)     this.speed = Math.max(this.speed - SPEED_BRAKE * dt, 0);
      if (input.handbrake) this.speed *= (1 - 5 * dt);
      if (!input.accel && !input.brake) this.speed = Math.max(this.speed - SPEED_FRICTION * dt, 0);

      if (input.mouseLatTarget !== null) {
        const diff = input.mouseLatTarget - this.lateral;
        this.lateral += diff * Math.min(dt * 4.5 * this.spec.handleMult, 1);
      } else {
        const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        this.lateral += dir * LAT_SPEED * this.spec.handleMult * Math.min(this.speed / SPEED_PLAYER_MAX, 1) * dt * MAX_LAT;
      }
    } else if (!this.isPlayer) {
      this._aiStep(dt, track, allCars, draftBoost, playerCar);
    }

    // Off-track fall (player only)
    if (this.isPlayer && Math.abs(this.lateral) > FALL_TRIGGER) {
      this.falling = true;
      this.fallAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return;
    }
    this.lateral = Math.max(-MAX_LAT * (this.isPlayer ? 1.1 : 0.88), Math.min(MAX_LAT * (this.isPlayer ? 1.1 : 0.88), this.lateral));

    // Advance T
    const prev = this.trackT;
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
    this.speed  += (spdMax - this.speed) * Math.min(dt * 2, 1);
    this.speed   = Math.max(0, Math.min(spdMax, this.speed));

    let target = track.getRacingLineOffset(
      ((this.trackT + cfg.aiLookAhead / track.steps) + 1) % 1,
    );

    // Avoidance
    let avoid = 0;
    for (const o of allCars) {
      if (o === this) continue;
      const delta = trackDelta(this.trackT, o.trackT);
      if (Math.abs(delta) < 0.015) {
        const latDiff = this.lateral - o.lateral;
        if (Math.abs(latDiff) < MAX_LAT * 0.5) avoid += Math.sign(latDiff) * MAX_LAT * 0.38;
      }
    }

    // Blocking
    if (cfg.aiBlock && player) {
      const behindDist = trackDelta(this.trackT, player.trackT);
      if (behindDist > 0 && behindDist < 0.025) target = target * 0.35 + player.lateral * 0.65;
    }

    this.lateral += (target + avoid - this.lateral) * Math.min(dt * cfg.aiReaction, 1);
  }

  applyLateralImpulse(amount: number) {
    this.lateral += amount;
    this.speed    = Math.max(this.speed * 0.88, 0);
  }

  minimapPos(track: Track) {
    const { pos } = track.getTransform(this.trackT, this.lateral);
    return { x: pos.x, z: pos.z };
  }

  dispose() {
    this._trail.dispose();
  }
}
