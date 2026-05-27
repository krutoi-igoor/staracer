import * as THREE from 'three';

const TRAIL_SEGS = 80; // number of ribbon segments

/**
 * Wide ribbon trail — stores N world-space positions + right vectors,
 * builds a quad-strip mesh that fades from full-opacity at the front
 * to transparent at the tail. Looks like thick glowing streaks.
 */
export class Trail {
  private _positions: THREE.Vector3[] = [];
  private _rights:    THREE.Vector3[] = [];
  private _posArr:    Float32Array;
  private _alphaArr:  Float32Array;
  private _posAttr:   THREE.BufferAttribute;
  private _alphaAttr: THREE.BufferAttribute;
  private _geo:       THREE.BufferGeometry;
  private _mesh:      THREE.Mesh;
  private _width:     number;

  constructor(scene: THREE.Scene, color: number, width: number, opacity = 1.0) {
    this._width = width;

    const N = TRAIL_SEGS;
    // 2 vertices per segment (left + right edge of ribbon)
    this._posArr   = new Float32Array(N * 2 * 3);
    this._alphaArr = new Float32Array(N * 2);

    // Build static index array for quad strip: (N-1) quads × 2 triangles × 3 idx
    const indices: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, c, b,  b, c, d);
    }

    this._geo = new THREE.BufferGeometry();
    this._posAttr   = new THREE.BufferAttribute(this._posArr,   3).setUsage(THREE.DynamicDrawUsage);
    this._alphaAttr = new THREE.BufferAttribute(this._alphaArr, 1).setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute('position', this._posAttr);
    this._geo.setAttribute('aAlpha',   this._alphaAttr);
    this._geo.setIndex(indices);
    this._geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
      vertexShader: /* glsl */`
        attribute float aAlpha;
        varying   float vAlpha;
        void main() {
          vAlpha      = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });

    this._mesh = new THREE.Mesh(this._geo, mat);
    this._mesh.frustumCulled = false;
    scene.add(this._mesh);
  }

  /**
   * Call once per frame.  pos = world position of the trail origin (back of car).
   * right = world-space right vector of the car.
   */
  update(pos: THREE.Vector3, right: THREE.Vector3) {
    this._positions.unshift(pos.clone());
    this._rights.unshift(right.clone());

    if (this._positions.length > TRAIL_SEGS) {
      this._positions.pop();
      this._rights.pop();
    }

    const n  = this._positions.length;
    const hw = this._width * 0.5;

    for (let i = 0; i < n; i++) {
      const p = this._positions[i];
      const r = this._rights[i];
      const b = i * 6;
      // Left vertex
      this._posArr[b    ] = p.x - r.x * hw;
      this._posArr[b + 1] = p.y - r.y * hw;
      this._posArr[b + 2] = p.z - r.z * hw;
      // Right vertex
      this._posArr[b + 3] = p.x + r.x * hw;
      this._posArr[b + 4] = p.y + r.y * hw;
      this._posArr[b + 5] = p.z + r.z * hw;

      // Alpha: sharp at front, smooth cubic fade to zero
      const t  = i / (n - 1);                // 0 = front, 1 = tail
      const a  = Math.pow(1 - t, 1.6);
      this._alphaArr[i * 2    ] = a;
      this._alphaArr[i * 2 + 1] = a;
    }

    this._posAttr.needsUpdate   = true;
    this._alphaAttr.needsUpdate = true;
    // Draw (n-1) quads → (n-1)*6 indices
    this._geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  dispose() {
    this._geo.dispose();
    (this._mesh.material as THREE.ShaderMaterial).dispose();
  }
}
