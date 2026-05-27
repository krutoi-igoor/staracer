import * as THREE from 'three';

/**
 * BackgroundElements — all screen-space atmosphere effects in Three.js.
 *
 * Attached as children of the camera so they are always screen-centered.
 * Rendered with depthTest: false so they don't fight the 3D depth buffer.
 *
 * 1. Concentric elliptical rings  — the dark tunnel/hoop background.
 *    renderOrder: -1 → painted before scene objects; overwritten by track/cars.
 *
 * 2. Radial speed lines — white streaks from periphery inward.
 *    renderOrder:  1 → painted after scene; additively blended on top.
 */
export class BackgroundElements {
  private _speedLines!: THREE.LineSegments;
  private _slBuf!:      Float32Array;
  private _slAttr!:     THREE.BufferAttribute;
  private _slState!:    Float32Array;  // [angle, radius] per line
  private static readonly SL_N = 200;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    // Camera must be in the scene for its children to render
    scene.add(camera);
    this._buildRings(camera);
    this._buildSpeedLines(camera);
  }

  // ─── Concentric rings ──────────────────────────────────────────────────────
  private _buildRings(camera: THREE.PerspectiveCamera) {
    const group = new THREE.Group();

    // Ring radii in camera-space units (at z=-28 in front of camera).
    // At FOV 72°, tan(36°)≈0.727 → visible half-width at z=28 ≈ 20 units.
    // We want rings of various sizes to fill the frame.
    const radii = [2, 4, 7, 11, 16, 22, 29, 37];

    for (let i = 0; i < radii.length; i++) {
      const r     = radii[i];
      const inner = r - 0.055 - i * 0.008;
      const outer = r + 0.055 + i * 0.008;

      // Clamp inner >= tiny positive value
      const ringGeo = new THREE.RingGeometry(
        Math.max(0.01, inner), outer,
        96,   // segments
      );
      const mat = new THREE.MeshBasicMaterial({
        color:       0x1e2d45,    // dark navy-gray — visible but very subtle
        transparent: true,
        opacity:     0.12 - i * 0.010,   // outer rings are fainter
        depthWrite:  false,
        depthTest:   false,
        side:        THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.z = -28;   // in front of camera
      mesh.scale.y    = 0.28;  // flatten into ellipse (perspective compression)
      mesh.renderOrder = -1;   // render before scene content
      group.add(mesh);
    }

    camera.add(group);
  }

  // ─── Speed lines ──────────────────────────────────────────────────────────
  private _buildSpeedLines(camera: THREE.PerspectiveCamera) {
    const N = BackgroundElements.SL_N;
    this._slState = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      this._slState[i * 2    ] = Math.random() * Math.PI * 2;   // angle
      this._slState[i * 2 + 1] = 3 + Math.random() * 20;        // radius
    }

    this._slBuf  = new Float32Array(N * 2 * 3);
    this._slAttr = new THREE.BufferAttribute(this._slBuf, 3);
    this._slAttr.setUsage(THREE.DynamicDrawUsage);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this._slAttr);
    // Draw exactly N line-segments initially
    geo.setDrawRange(0, N * 2);

    this._speedLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color:       0xffffff,
      transparent: true,
      opacity:     0,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      depthTest:   false,
    }));
    this._speedLines.renderOrder  = 1;   // render after scene
    this._speedLines.frustumCulled = false;

    // Park in front of camera (same plane as rings but slightly closer)
    this._speedLines.position.z = -26;

    camera.add(this._speedLines);
  }

  /** Called every frame from Game.
   *  @param speedFraction  0–1  (player.speed / SPEED_PLAYER_MAX)
   *  @param dt             frame delta-time in seconds
   */
  update(speedFraction: number, dt: number) {
    const mat = this._speedLines.material as THREE.LineBasicMaterial;

    // Fade in above 30% speed
    const targetOpacity = Math.max(0, Math.min(0.55, (speedFraction - 0.30) * 1.6));
    mat.opacity += (targetOpacity - mat.opacity) * Math.min(dt * 6, 1);

    if (mat.opacity < 0.005) return;

    const N        = BackgroundElements.SL_N;
    const velocity = 12 * speedFraction * speedFraction * dt;  // outward speed
    const maxR     = 25;   // camera-space units (beyond screen edge)
    const minR     = 2.5;  // central dead zone

    for (let i = 0; i < N; i++) {
      let   r     = this._slState[i * 2 + 1];
      const angle = this._slState[i * 2    ];

      // Advance outward — reset to center when off screen
      r += velocity * (0.7 + (i % 7) * 0.08);
      if (r > maxR) {
        r = minR + Math.random() * 2;
        this._slState[i * 2] = Math.random() * Math.PI * 2;
      }
      this._slState[i * 2 + 1] = r;

      // Streak: two vertices at different radii, same angle
      const len  = (0.2 + r * 0.10) * speedFraction;
      const r0   = r, r1 = r + len;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);

      const b = i * 6;
      // y scaled by 0.28 for ellipse (matches ring flattening)
      this._slBuf[b    ] = cosA * r0;  this._slBuf[b + 1] = sinA * r0 * 0.28;  this._slBuf[b + 2] = 0;
      this._slBuf[b + 3] = cosA * r1;  this._slBuf[b + 4] = sinA * r1 * 0.28;  this._slBuf[b + 5] = 0;
    }
    this._slAttr.needsUpdate = true;
  }
}
