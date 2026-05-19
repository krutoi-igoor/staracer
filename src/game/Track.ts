import * as THREE from 'three';
import { TRACK_WIDTH } from './constants';

const STEPS = 400;

// Circuit control points — a sweeping 3-D loop
const CIRCUIT_PTS = [
  [0,   0,    0  ],
  [70,  12,  -110],
  [180,  0,  -200],
  [280, -18, -100],
  [300,  0,   50 ],
  [240,  20,  170],
  [120,  0,   240],
  [0,  -15,  200 ],
  [-120, 0,   160],
  [-220, 18,   40],
  [-220,-10, -100],
  [-120,  0, -180],
].map(([x,y,z]) => new THREE.Vector3(x, y, z));

export interface TrackFrame {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

export class Track {
  readonly curve: THREE.CatmullRomCurve3;
  private frames: TrackFrame[] = [];

  constructor(scene: THREE.Scene) {
    this.curve = new THREE.CatmullRomCurve3(CIRCUIT_PTS, true, 'catmullrom', 0.5);
    this._buildFrames();
    this._buildMesh(scene);
    this._buildEdges(scene);
    this._buildMinimap();
  }

  private _buildFrames() {
    const worldUp = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const pos    = this.curve.getPoint(t);
      const tangent = this.curve.getTangent(t).normalize();
      const right  = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      const up     = new THREE.Vector3().crossVectors(right, tangent).normalize();
      this.frames.push({ pos, tangent, right, up });
    }
  }

  private _buildMesh(scene: THREE.Scene) {
    const positions = new Float32Array(STEPS * 2 * 3);
    const half = TRACK_WIDTH / 2;

    for (let i = 0; i < STEPS; i++) {
      const { pos, right } = this.frames[i];
      const b = i * 6;
      positions[b    ] = pos.x + right.x * half;
      positions[b + 1] = pos.y + right.y * half;
      positions[b + 2] = pos.z + right.z * half;
      positions[b + 3] = pos.x - right.x * half;
      positions[b + 4] = pos.y - right.y * half;
      positions[b + 5] = pos.z - right.z * half;
    }

    const indices: number[] = [];
    for (let i = 0; i < STEPS; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % STEPS) * 2;
      const d = ((i + 1) % STEPS) * 2 + 1;
      indices.push(a, b, d, a, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.85,
      metalness: 0.1,
    });
    scene.add(new THREE.Mesh(geo, mat));
  }

  private _buildEdges(scene: THREE.Scene) {
    const half = TRACK_WIDTH / 2 + 0.1;
    const leftPts: THREE.Vector3[]  = [];
    const rightPts: THREE.Vector3[] = [];

    for (let i = 0; i <= STEPS; i++) {
      const f = this.frames[i % STEPS];
      leftPts.push( f.pos.clone().addScaledVector(f.right,  half));
      rightPts.push(f.pos.clone().addScaledVector(f.right, -half));
    }

    const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ffee });
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPts),  edgeMat));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPts), edgeMat));
  }

  // Store 2D minimap points for HUD rendering
  minimapPoints: { x: number; z: number }[] = [];

  private _buildMinimap() {
    for (let i = 0; i <= STEPS; i++) {
      const f = this.frames[i % STEPS];
      this.minimapPoints.push({ x: f.pos.x, z: f.pos.z });
    }
  }

  /** Returns world-space position and orientation for a given track param + lateral offset */
  getTransform(t: number, lat: number): { pos: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
    // Clamp t to [0,1)
    t = ((t % 1) + 1) % 1;
    const idx = Math.floor(t * STEPS);
    const f   = this.frames[idx];

    const pos = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, 1.0);
    return { pos, tangent: f.tangent, right: f.right, up: f.up };
  }
}
