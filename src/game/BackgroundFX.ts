/**
 * BackgroundFX — 2D canvas overlay that renders:
 *   1. Concentric elliptical rings centered on the vanishing point (always on)
 *   2. Animated radial speed-lines (screen-space, ramps up with car speed)
 *
 * Sits behind the Three.js canvas (z-index 1) and in front of the HTML body.
 */
export class BackgroundFX {
  private _canvas: HTMLCanvasElement;
  private _ctx:    CanvasRenderingContext2D;
  private _w = 0;
  private _h = 0;

  // Speed-line state: each line = [angle, currentRadius]
  private static readonly NUM_LINES = 180;
  private _lines: Float32Array; // [angle, radius] pairs

  constructor() {
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'bg-canvas';
    this._canvas.style.cssText =
      'position:fixed;inset:0;z-index:1;pointer-events:none;';

    // Insert BEFORE the Three.js canvas so it renders behind it
    const gameCanvas = document.getElementById('canvas');
    document.body.insertBefore(this._canvas, gameCanvas);

    this._ctx = this._canvas.getContext('2d')!;

    // Init speed lines at random angles spread around the center
    const N = BackgroundFX.NUM_LINES;
    this._lines = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      this._lines[i * 2    ] = Math.random() * Math.PI * 2;   // angle
      this._lines[i * 2 + 1] = Math.random() * 300;           // start spread
    }
  }

  /** Called every frame from Game._loop().
   *  @param speedFraction  0–1 (player.speed / SPEED_PLAYER_MAX)
   *  @param dt             frame delta-time in seconds
   */
  update(speedFraction: number, dt: number) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (w !== this._w || h !== this._h) {
      this._w = this._canvas.width  = w;
      this._h = this._canvas.height = h;
    }

    this._ctx.clearRect(0, 0, w, h);

    // Vanishing-point position — horizontal center, ~42% down
    const cx = w * 0.50;
    const cy = h * 0.42;

    this._drawRings(cx, cy, w, h);
    this._updateAndDrawLines(cx, cy, w, h, speedFraction, dt);
  }

  // ─── Concentric rings ──────────────────────────────────────────────────────

  private _drawRings(cx: number, cy: number, w: number, h: number) {
    const maxR   = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.4;
    const NUM    = 10;
    const ctx    = this._ctx;

    for (let i = 0; i < NUM; i++) {
      const t  = (i + 0.5) / NUM;           // 0…1
      const rx = maxR * t;
      const ry = rx * 0.30;                 // flatten into ellipse
      // Outermost rings are faintest; innermost slightly more visible
      const a  = 0.055 * (1 - t * 0.6);

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160,190,255,${a.toFixed(3)})`;
      ctx.lineWidth   = 1.0;
      ctx.stroke();
    }

    // A slightly brighter inner glow arc right at horizon level
    ctx.beginPath();
    ctx.ellipse(cx, cy, maxR * 0.12, maxR * 0.04, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,220,255,0.10)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  // ─── Animated speed lines ─────────────────────────────────────────────────

  private _updateAndDrawLines(
    cx: number, cy: number,
    w: number,  h: number,
    speed: number, dt: number,
  ) {
    if (speed < 0.15) return;

    const intensity  = Math.max(0, Math.min(1, (speed - 0.15) / 0.55));
    if (intensity <= 0) return;

    // How far lines travel per second — scales sharply with speed
    const velocity   = 600 * intensity * intensity * dt;
    const maxR       = Math.hypot(cx, cy) * 1.6;
    const N          = BackgroundFX.NUM_LINES;
    const ctx        = this._ctx;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < N; i++) {
      const angle  = this._lines[i * 2    ];
      let   radius = this._lines[i * 2 + 1];

      // Advance
      radius += velocity * (0.6 + Math.random() * 0.8);
      if (radius > maxR) {
        radius = 2 + Math.random() * 25;
        this._lines[i * 2] = Math.random() * Math.PI * 2;
      }
      this._lines[i * 2 + 1] = radius;

      const len = (8 + radius * 0.22) * intensity;
      const r0  = radius;
      const r1  = radius + len;

      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const x0   = cx + cosA * r0,  y0 = cy + sinA * r0;
      const x1   = cx + cosA * r1,  y1 = cy + sinA * r1;

      // Alpha: faint near center, brighter outward, fade at screen edge
      const edgeFactor = 1 - Math.min(1, radius / maxR);
      const alpha = 0.06 * intensity * edgeFactor;
      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.lineWidth   = 0.8 + intensity * 0.6;
      ctx.stroke();
    }

    ctx.restore();
  }

  dispose() {
    this._canvas.remove();
  }
}
