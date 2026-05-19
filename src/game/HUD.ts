import { Track } from './Track';
import { Car } from './Car';
import { TOTAL_LAPS } from './constants';

export class HUD {
  private lapEl    = document.getElementById('lap')!;
  private timeEl   = document.getElementById('time')!;
  private bestEl   = document.getElementById('best')!;
  private posEl    = document.getElementById('pos-num')!;
  private speedEl  = document.getElementById('speed-display')!;
  private draftBar = document.getElementById('draft-bar')!;
  private draftVal = document.getElementById('draft-val')!;
  private mmCtx: CanvasRenderingContext2D;
  private mmW = 120;
  private mmH = 120;

  // Minimap track bounds
  private mmMinX = 0; private mmMaxX = 1;
  private mmMinZ = 0; private mmMaxZ = 1;

  constructor(track: Track) {
    const mm = document.getElementById('minimap') as HTMLCanvasElement;
    this.mmCtx = mm.getContext('2d')!;
    mm.width  = this.mmW;
    mm.height = this.mmH;

    const pts = track.minimapPoints;
    this.mmMinX = Math.min(...pts.map(p => p.x));
    this.mmMaxX = Math.max(...pts.map(p => p.x));
    this.mmMinZ = Math.min(...pts.map(p => p.z));
    this.mmMaxZ = Math.max(...pts.map(p => p.z));
  }

  private _fmt(sec: number): string {
    const m  = Math.floor(sec / 60);
    const s  = Math.floor(sec % 60);
    const t  = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${t}`;
  }

  private _toMM(x: number, z: number): [number, number] {
    const pad = 8;
    const mx = pad + ((x - this.mmMinX) / (this.mmMaxX - this.mmMinX)) * (this.mmW - pad * 2);
    const mz = pad + ((z - this.mmMinZ) / (this.mmMaxZ - this.mmMinZ)) * (this.mmH - pad * 2);
    return [mx, mz];
  }

  update(player: Car, allCars: Car[], elapsed: number, bestLap: number | null, track: Track) {
    // Lap
    const lap = Math.min(player.lap, TOTAL_LAPS);
    this.lapEl.textContent = `${lap} / ${TOTAL_LAPS}`;

    // Time
    this.timeEl.textContent = this._fmt(elapsed);
    this.bestEl.textContent = bestLap !== null ? this._fmt(bestLap) : '--:--.-';

    // Position
    const sorted = [...allCars].sort((a, b) => b.totalProgress - a.totalProgress);
    const pos = sorted.indexOf(player) + 1;
    this.posEl.textContent = String(pos);

    // Speed
    const spd = Math.round(player.speed * 10000);
    this.speedEl.textContent = String(spd).padStart(3, '0');

    // Draft
    const pct = Math.round(player.draftLevel * 100);
    this.draftBar.style.width = `${pct}%`;
    if (player.draftLevel > 0.05) {
      this.draftVal.textContent = String(Math.round(player.draftLevel * 180));
      this.draftVal.classList.add('active');
    } else {
      this.draftVal.textContent = 'OFF';
      this.draftVal.classList.remove('active');
    }

    // Minimap
    const ctx  = this.mmCtx;
    ctx.clearRect(0, 0, this.mmW, this.mmH);

    // Track outline
    ctx.beginPath();
    const pts = track.minimapPoints;
    for (let i = 0; i < pts.length; i++) {
      const [mx, mz] = this._toMM(pts[i].x, pts[i].z);
      i === 0 ? ctx.moveTo(mx, mz) : ctx.lineTo(mx, mz);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,255,238,0.35)';
    ctx.lineWidth   = 4;
    ctx.stroke();

    // Car dots
    for (const car of allCars) {
      const t  = car.trackFrame(track);
      const [mx, mz] = this._toMM(t.x, t.z);
      ctx.beginPath();
      ctx.arc(mx, mz, car.isPlayer ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = car.isPlayer ? '#fff' : `#${car.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
    }
  }
}
