import * as THREE from 'three';

/**
 * Ribbon trail behind each car.
 * Width = car's base width; 4–6 car-lengths long; solid at source → transparent.
 */
export class Trail {
  private static readonly SEGS = 30;

  private _posArr:   Float32Array;
  private _alphaArr: Float32Array;
  private _posAttr:  THREE.BufferAttribute;
  private _alphaAttr: THREE.BufferAttribute;
  private _geo:      THREE.BufferGeometry;
  private _mesh:     THREE.Mesh;

  private _count = 0;   // how many positions have been recorded

  constructor(scene: THREE.Scene, color: number, width: number, opacity: number) {
    const N = Trail.SEGS;
    this._posArr   = new Float32Array(N * 2 * 3);
    this._alphaArr = new Float32Array(N * 2);

    this._posAttr   = new THREE.BufferAttribute(this._posArr,   3).setUsage(THREE.DynamicDrawUsage);
    this._alphaAttr = new THREE.BufferAttribute(this._alphaArr, 1).setUsage(THREE.DynamicDrawUsage);

    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, c, b,  b, c, d);
    }

    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', this._posAttr);
    this._geo.setAttribute('aAlpha',   this._alphaAttr);
    this._geo.setIndex(idx);
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
   * Call once per frame with the car's rear-center position and right vector.
   * @param pos   rear center of the car
   * @param right track-right unit vector (for ribbon width)
   * @param width half-width of the ribbon
   */
  update(pos: THREE.Vector3, right: THREE.Vector3, width: number) {
    const N = Trail.SEGS;
    if (this._count < N) this._count++;

    // Shift history backward (oldest drops off end)
    for (let i = this._count - 1; i > 0; i--) {
      const dst = i * 6, src = (i - 1) * 6;
      this._posArr[dst    ] = this._posArr[src    ];
      this._posArr[dst + 1] = this._posArr[src + 1];
      this._posArr[dst + 2] = this._posArr[src + 2];
      this._posArr[dst + 3] = this._posArr[src + 3];
      this._posArr[dst + 4] = this._posArr[src + 4];
      this._posArr[dst + 5] = this._posArr[src + 5];
    }
    // Insert newest at index 0
    const hw = width * 0.5;
    const L  = pos.clone().addScaledVector(right,  hw);
    const R  = pos.clone().addScaledVector(right, -hw);
    this._posArr[0] = L.x; this._posArr[1] = L.y; this._posArr[2] = L.z;
    this._posArr[3] = R.x; this._posArr[4] = R.y; this._posArr[5] = R.z;

    // Recompute alpha: newest = 1.0, oldest = 0.0, quadratic falloff
    for (let i = 0; i < this._count; i++) {
      const t = i / Math.max(1, this._count - 1);
      const a = (1 - t) * (1 - t);   // quadratic: full at start, 0 at end
      this._alphaArr[i * 2    ] = a;
      this._alphaArr[i * 2 + 1] = a;
    }

    this._posAttr.needsUpdate   = true;
    this._alphaAttr.needsUpdate = true;

    const indexCount = Math.max(0, this._count - 1) * 6;
    this._geo.setDrawRange(0, indexCount);
  }

  dispose() {
    this._geo.dispose();
    this._mesh.removeFromParent();
  }
}
