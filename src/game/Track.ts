import * as THREE from 'three';
import { TRACK_WIDTH, TrackDef } from './constants';

export interface TrackFrame {
  pos:     THREE.Vector3;
  tangent: THREE.Vector3;
  right:   THREE.Vector3;
  up:      THREE.Vector3;
}

/** Bright neon-ribbon track: dark tarmac surface + glowing edge tubes */
export class Track {
  readonly def:   TrackDef;
  readonly steps: number;
  readonly curve: THREE.CatmullRomCurve3;
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
    this._buildSurface(scene);
    this._buildEdgeTubes(scene);
    this._buildCenterLine(scene);
    this._buildStartGate(scene);
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

    pos.addScaledVector(right, lat).addScaledVector(up, 0.5);
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
      const c = new THREE.Vector3().crossVectors(prev.tangent, next.tangent);
      raw[i] = c.dot(curr.up) * this.steps;
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
    const MAX   = (TRACK_WIDTH / 2) * 0.72;
    for (let i = 0; i < this.steps; i++) {
      let ahead = 0;
      for (let k = 0; k < AHEAD; k++) ahead += sm[(i + k) % this.steps];
      ahead /= AHEAD;
      this.racingLineOffsets[i] = Math.max(-MAX, Math.min(MAX, -ahead * MAX));
    }
  }

  // ── Visuals ───────────────────────────────────────────────────────────────

  /** Track surface — near-black, barely visible, reinforces the ribbon in void aesthetic */
  private _buildSurface(scene: THREE.Scene) {
    const half   = TRACK_WIDTH / 2;
    const posArr = new Float32Array(this.steps * 2 * 3);
    for (let i = 0; i < this.steps; i++) {
      const { pos, right, up } = this.frames[i];
      const b = i * 6;
      const L = pos.clone().addScaledVector(right,  half).addScaledVector(up, -0.05);
      const R = pos.clone().addScaledVector(right, -half).addScaledVector(up, -0.05);
      posArr.set([L.x, L.y, L.z, R.x, R.y, R.z], b);
    }
    const idx: number[] = [];
    for (let i = 0; i < this.steps; i++) {
      const a = i * 2, b = i * 2 + 1;
      const c = ((i + 1) % this.steps) * 2, d = ((i + 1) % this.steps) * 2 + 1;
      idx.push(a, b, d, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color:     0x040410,
      roughness: 1,
      metalness: 0,
      side:      THREE.DoubleSide,
    })));
  }

  /** Glowing edge tubes — these are the hero visual */
  private _buildEdgeTubes(scene: THREE.Scene) {
    const half = TRACK_WIDTH / 2;
    for (const side of [1, -1] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < this.steps; i++) {
        const { pos, right, up } = this.frames[i];
        pts.push(pos.clone().addScaledVector(right, side * half).addScaledVector(up, 0.1));
      }
      const curve  = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);

      // Core bright tube
      const coreGeo = new THREE.TubeGeometry(curve, this.steps, 0.18, 6, true);
      scene.add(new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
        color:             0x00eeff,
        emissive:          0x00eeff,
        emissiveIntensity: 6.0,
        roughness:         0,
        metalness:         0.1,
      })));

      // Outer soft glow tube (wider, semi-transparent, additive)
      const glowGeo = new THREE.TubeGeometry(curve, Math.floor(this.steps / 2), 0.55, 5, true);
      scene.add(new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color:       0x00aacc,
        transparent: true,
        opacity:     0.18,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false,
        side:        THREE.BackSide,
      })));
    }
  }

  /** Dashed centre line */
  private _buildCenterLine(scene: THREE.Scene) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < this.steps; i++) {
      if (i % 16 < 8) {
        const { pos, up } = this.frames[i];
        pts.push(pos.clone().addScaledVector(up, 0.12));
      }
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color:     0xffffff,
      size:      0.22,
      blending:  THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity:   0.4,
    })));
  }

  /** Start/finish glowing gate */
  private _buildStartGate(scene: THREE.Scene) {
    const f    = this.frames[0];
    const half = TRACK_WIDTH / 2;
    const mat  = new THREE.MeshBasicMaterial({
      color:     0xffffff,
      blending:  THREE.AdditiveBlending,
      transparent: true,
      opacity:   0.9,
      depthWrite: false,
      side:      THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(TRACK_WIDTH, 0.5);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(f.pos).addScaledVector(f.up, 0.55);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.tangent);
    scene.add(mesh);
  }

  private _buildMinimap() {
    for (let i = 0; i < this.steps; i++) {
      this.minimapPoints.push({ x: this.frames[i].pos.x, z: this.frames[i].pos.z });
    }
  }
}
