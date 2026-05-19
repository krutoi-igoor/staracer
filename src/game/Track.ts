import * as THREE from 'three';
import { TRACK_WIDTH, MAX_LAT, TrackDef } from './constants';

export interface TrackFrame {
  pos:     THREE.Vector3;
  tangent: THREE.Vector3;
  right:   THREE.Vector3;
  up:      THREE.Vector3;
}

export class Track {
  readonly def:    TrackDef;
  readonly steps:  number;
  readonly curve:  THREE.CatmullRomCurve3;
  readonly frames: TrackFrame[] = [];
  racingLineOffsets!: Float32Array;
  minimapPoints: { x: number; z: number }[] = [];

  constructor(scene: THREE.Scene, def: TrackDef) {
    this.def   = def;
    this.steps = def.steps;
    this.curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true, 'catmullrom', 0.5,
    );
    this._buildFrames();
    this._buildRacingLine();
    this._buildMesh(scene);
    this._buildBarriers(scene);
    this._buildStartLine(scene);
    this._buildMinimap();
  }

  private _buildFrames() {
    const worldUp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.steps; i++) {
      const t       = i / this.steps;
      const pos     = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const right   = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      const up      = new THREE.Vector3().crossVectors(right, tangent).normalize();
      this.frames.push({ pos, tangent, right, up });
    }
  }

  getTransform(t: number, lat: number) {
    t = ((t % 1) + 1) % 1;
    const ft   = t * this.steps;
    const idx  = Math.floor(ft) % this.steps;
    const frac = ft - Math.floor(ft);
    const f0   = this.frames[idx];
    const f1   = this.frames[(idx + 1) % this.steps];

    const pos     = f0.pos.clone().lerp(f1.pos, frac);
    const tangent = f0.tangent.clone().lerp(f1.tangent, frac).normalize();
    const right   = f0.right.clone().lerp(f1.right, frac).normalize();
    const up      = f0.up.clone().lerp(f1.up, frac).normalize();

    pos.addScaledVector(right, lat).addScaledVector(up, 0.8);
    return { pos, tangent, right, up };
  }

  getRacingLineOffset(t: number): number {
    t = ((t % 1) + 1) % 1;
    const ft = t * this.steps;
    const i0 = Math.floor(ft) % this.steps;
    const i1 = (i0 + 1) % this.steps;
    const f  = ft - Math.floor(ft);
    return this.racingLineOffsets[i0] * (1 - f) + this.racingLineOffsets[i1] * f;
  }

  private _buildRacingLine() {
    const raw = new Float32Array(this.steps);
    for (let i = 0; i < this.steps; i++) {
      const prev = this.frames[(i - 1 + this.steps) % this.steps];
      const next = this.frames[(i + 1) % this.steps];
      const curr = this.frames[i];
      const c    = new THREE.Vector3().crossVectors(prev.tangent, next.tangent);
      raw[i]     = c.dot(curr.up) * this.steps;
    }
    const sm = new Float32Array(this.steps);
    const W  = 30;
    for (let i = 0; i < this.steps; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += raw[(i + k + this.steps) % this.steps];
      sm[i] = s / (W * 2 + 1);
    }
    this.racingLineOffsets = new Float32Array(this.steps);
    const AHEAD = 25;
    for (let i = 0; i < this.steps; i++) {
      let ahead = 0;
      for (let k = 0; k < AHEAD; k++) ahead += sm[(i + k) % this.steps];
      ahead /= AHEAD;
      const target = -ahead * (MAX_LAT * 0.75);
      this.racingLineOffsets[i] = Math.max(-MAX_LAT * 0.8, Math.min(MAX_LAT * 0.8, target));
    }
  }

  private _buildMesh(scene: THREE.Scene) {
    const half   = TRACK_WIDTH / 2;
    const posArr = new Float32Array(this.steps * 2 * 3);
    for (let i = 0; i < this.steps; i++) {
      const { pos, right } = this.frames[i];
      const b = i * 6;
      posArr[b    ] = pos.x + right.x * half; posArr[b + 1] = pos.y + right.y * half; posArr[b + 2] = pos.z + right.z * half;
      posArr[b + 3] = pos.x - right.x * half; posArr[b + 4] = pos.y - right.y * half; posArr[b + 5] = pos.z - right.z * half;
    }
    const indices: number[] = [];
    for (let i = 0; i < this.steps; i++) {
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % this.steps) * 2, d = ((i + 1) % this.steps) * 2 + 1;
      indices.push(a, b, d, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Alternating dark stripe pattern for "tarmac" feel
    const mat = new THREE.MeshStandardMaterial({
      color:     this.def.color,
      roughness: 0.9,
      metalness: 0.05,
      side:      THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Centre dashed line
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < this.steps; i++) {
      if (i % 12 < 6) pts.push(this.frames[i].pos.clone().addScaledVector(this.frames[i].up, 0.85));
    }
    scene.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.PointsMaterial({ color: 0xffee44, size: 0.35 }),
    ));
  }

  private _buildBarriers(scene: THREE.Scene) {
    const half    = TRACK_WIDTH / 2 + 0.4;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00eeff });
    const leftPts: THREE.Vector3[]  = [];
    const rightPts: THREE.Vector3[] = [];
    for (let i = 0; i <= this.steps; i++) {
      const f = this.frames[i % this.steps];
      leftPts.push( f.pos.clone().addScaledVector(f.right,  half).addScaledVector(f.up, 0.9));
      rightPts.push(f.pos.clone().addScaledVector(f.right, -half).addScaledVector(f.up, 0.9));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPts),  edgeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPts), edgeMat));
  }

  private _buildStartLine(scene: THREE.Scene) {
    const f    = this.frames[0];
    const half = TRACK_WIDTH / 2;
    const geo  = new THREE.PlaneGeometry(TRACK_WIDTH, 1.2);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
    mesh.position.copy(f.pos).addScaledVector(f.up, 0.9);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.tangent);
    scene.add(mesh);
  }

  private _buildMinimap() {
    for (let i = 0; i < this.steps; i++) {
      const f = this.frames[i];
      this.minimapPoints.push({ x: f.pos.x, z: f.pos.z });
    }
  }
}
