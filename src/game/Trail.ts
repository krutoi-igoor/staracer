import * as THREE from 'three';

const TRAIL_LEN = 32;

export class Trail {
  private _buf:  Float32Array;
  private _attr: THREE.BufferAttribute;
  private _geo:  THREE.BufferGeometry;
  private _count = 0;
  readonly line: THREE.Line;

  constructor(scene: THREE.Scene, color: number, opacity = 0.8) {
    this._buf  = new Float32Array(TRAIL_LEN * 3);
    this._attr = new THREE.BufferAttribute(this._buf, 3);
    this._attr.setUsage(THREE.DynamicDrawUsage);
    this._geo  = new THREE.BufferGeometry();
    this._geo.setAttribute('position', this._attr);
    this._geo.setDrawRange(0, 0);

    this.line = new THREE.Line(this._geo, new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  update(pos: THREE.Vector3) {
    const n = Math.min(this._count, TRAIL_LEN - 1);
    for (let i = n; i > 0; i--) {
      this._buf[i * 3    ] = this._buf[(i - 1) * 3    ];
      this._buf[i * 3 + 1] = this._buf[(i - 1) * 3 + 1];
      this._buf[i * 3 + 2] = this._buf[(i - 1) * 3 + 2];
    }
    this._buf[0] = pos.x;
    this._buf[1] = pos.y;
    this._buf[2] = pos.z;
    this._count  = Math.min(this._count + 1, TRAIL_LEN);
    this._attr.needsUpdate = true;
    this._geo.setDrawRange(0, this._count);
  }

  dispose() {
    this._geo.dispose();
  }
}
