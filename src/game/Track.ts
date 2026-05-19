import * as THREE from 'three';
import { TRACK_WIDTH, MAX_LAT } from './constants';

const STEPS = 600;

// A more interesting F1-style circuit with hairpin + esses + long straight
const CIRCUIT_PTS: [number, number, number][] = [
  [  0,   0,    0],   // S/F straight
  [120,   0,  -60],   // fast right entry
  [220,   6, -160],   // sweeping right
  [280,   0, -260],   // hairpin approach
  [250, -10, -340],   // hairpin apex
  [140,  -4, -360],   // hairpin exit
  [ 20,   0, -310],   // back straight start
  [-100,  6, -260],   // esses left
  [-180,  0, -180],   // esses right
  [-200, -8,  -80],   // stadium section
  [-160,  0,   30],   // medium right
  [ -60,  8,  110],   // long right-hander
  [  60,  4,  140],   // straight
  [ 120,  0,   80],   // chicane right
  [  80, -4,   20],   // chicane left → back to start
];

export interface TrackFrame {
  pos:     THREE.Vector3;
  tangent: THREE.Vector3;
  right:   THREE.Vector3;
  up:      THREE.Vector3;
}

export class Track {
  readonly curve: THREE.CatmullRomCurve3;
  readonly frames: TrackFrame[] = [];
  racingLineOffsets!: Float32Array;
  minimapPoints: { x: number; z: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.curve = new THREE.CatmullRomCurve3(
      CIRCUIT_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true, 'catmullrom', 0.5,
    );
    this._buildFrames();
    this._buildRacingLine();
    this._buildTrackMesh(scene);
    this._buildBarriers(scene);
    this._buildMinimap();
  }

  // ── Frame table ────────────────────────────────────────────────────────────

  private _buildFrames() {
    const worldUp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < STEPS; i++) {
      const t       = i / STEPS;
      const pos     = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const right   = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      const up      = new THREE.Vector3().crossVectors(right, tangent).normalize();
      this.frames.push({ pos, tangent, right, up });
    }
  }

  // ── Smooth interpolated transform (eliminates jitter) ──────────────────────

  getTransform(t: number, lat: number): { pos: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
    t = ((t % 1) + 1) % 1;
    const ft   = t * STEPS;
    const idx  = Math.floor(ft) % STEPS;
    const frac = ft - Math.floor(ft);
    const f0   = this.frames[idx];
    const f1   = this.frames[(idx + 1) % STEPS];

    const pos     = f0.pos.clone().lerp(f1.pos, frac);
    const tangent = f0.tangent.clone().lerp(f1.tangent, frac).normalize();
    const right   = f0.right.clone().lerp(f1.right, frac).normalize();
    const up      = f0.up.clone().lerp(f1.up, frac).normalize();

    const worldPos = pos.clone().addScaledVector(right, lat).addScaledVector(up, 0.8);
    return { pos: worldPos, tangent, right, up };
  }

  getRacingLineOffset(t: number): number {
    t = ((t % 1) + 1) % 1;
    const ft  = t * STEPS;
    const i0  = Math.floor(ft) % STEPS;
    const i1  = (i0 + 1) % STEPS;
    const f   = ft - Math.floor(ft);
    return this.racingLineOffsets[i0] * (1 - f) + this.racingLineOffsets[i1] * f;
  }

  // ── Racing line (outer → apex → outer) ─────────────────────────────────────

  private _buildRacingLine() {
    const raw  = new Float32Array(STEPS);

    // Signed curvature at each step
    for (let i = 0; i < STEPS; i++) {
      const prev = this.frames[(i - 1 + STEPS) % STEPS];
      const next = this.frames[(i + 1) % STEPS];
      const curr = this.frames[i];
      const c    = new THREE.Vector3().crossVectors(prev.tangent, next.tangent);
      raw[i]     = c.dot(curr.up) * STEPS;
    }

    // Smooth (wide kernel)
    const sm = new Float32Array(STEPS);
    const W  = 30;
    for (let i = 0; i < STEPS; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += raw[(i + k + STEPS) % STEPS];
      sm[i] = s / (W * 2 + 1);
    }

    // Racing line = outside of upcoming curve → inside at apex → outside on exit
    // Look AHEAD for entry, use current for apex
    this.racingLineOffsets = new Float32Array(STEPS);
    const AHEAD = 25;
    for (let i = 0; i < STEPS; i++) {
      let ahead = 0;
      for (let k = 0; k < AHEAD; k++) ahead += sm[(i + k) % STEPS];
      ahead /= AHEAD;
      // Positive curvature (right turn) → target negative lat (outside = left)
      const target = -ahead * (MAX_LAT * 0.75);
      this.racingLineOffsets[i] = Math.max(-MAX_LAT * 0.8, Math.min(MAX_LAT * 0.8, target));
    }
  }

  // ── Track mesh ────────────────────────────────────────────────────────────

  private _buildTrackMesh(scene: THREE.Scene) {
    const half   = TRACK_WIDTH / 2;
    const posArr = new Float32Array(STEPS * 2 * 3);

    for (let i = 0; i < STEPS; i++) {
      const { pos, right } = this.frames[i];
      const b = i * 6;
      posArr[b    ] = pos.x + right.x * half;
      posArr[b + 1] = pos.y + right.y * half;
      posArr[b + 2] = pos.z + right.z * half;
      posArr[b + 3] = pos.x - right.x * half;
      posArr[b + 4] = pos.y - right.y * half;
      posArr[b + 5] = pos.z - right.z * half;
    }

    const indices: number[] = [];
    for (let i = 0; i < STEPS; i++) {
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % STEPS) * 2, d = ((i + 1) % STEPS) * 2 + 1;
      indices.push(a, b, d, a, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color:     0x1a1a2e,
      roughness: 0.9,
      metalness: 0.05,
      side:      THREE.DoubleSide,  // ← fixes see-through
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Centre dashed line (yellow)
    const centrePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= STEPS; i++) {
      if (i % 10 < 5) centrePoints.push(this.frames[i % STEPS].pos.clone());
    }
    scene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(centrePoints),
      new THREE.PointsMaterial({ color: 0xffee44, size: 0.3 }),
    ));
  }

  // ── Barriers ─────────────────────────────────────────────────────────────

  private _buildBarriers(scene: THREE.Scene) {
    const half = TRACK_WIDTH / 2 + 0.3;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00eeff, linewidth: 2 });
    const leftPts: THREE.Vector3[]  = [];
    const rightPts: THREE.Vector3[] = [];

    for (let i = 0; i <= STEPS; i++) {
      const f = this.frames[i % STEPS];
      leftPts.push( f.pos.clone().addScaledVector(f.right,  half).addScaledVector(f.up, 0.8));
      rightPts.push(f.pos.clone().addScaledVector(f.right, -half).addScaledVector(f.up, 0.8));
    }

    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPts),  edgeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPts), edgeMat));

    // Barrier top edge (thinner, dimmer)
    const topMat = new THREE.LineBasicMaterial({ color: 0x003344 });
    const leftTop: THREE.Vector3[]  = [];
    const rightTop: THREE.Vector3[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const f = this.frames[i % STEPS];
      leftTop.push( f.pos.clone().addScaledVector(f.right,  half).addScaledVector(f.up, 2.5));
      rightTop.push(f.pos.clone().addScaledVector(f.right, -half).addScaledVector(f.up, 2.5));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftTop),  topMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightTop), topMat));
  }

  private _buildMinimap() {
    for (let i = 0; i < STEPS; i++) {
      const f = this.frames[i];
      this.minimapPoints.push({ x: f.pos.x, z: f.pos.z });
    }
  }
}
