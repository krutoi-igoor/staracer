import { Track } from './Track';
import { Car } from './Car';
import { TOTAL_LAPS } from './constants';
import { Scores } from './Scores';

export class HUD {
  private lapEl    = document.getElementById('lap')!;
  private timeEl   = document.getElementById('time')!;
  private bestEl   = document.getElementById('best')!;
  private posEl    = document.getElementById('pos-num')!;
  private speedEl  = document.getElementById('speed-display')!;
  private draftBar = document.getElementById('draft-bar') as HTMLElement;
  private draftVal = document.getElementById('draft-val') as HTMLElement;
  private respEl   = document.getElementById('respawn-overlay') as HTMLElement;
  private respNum  = document.getElementById('respawn-num') as HTMLElement;
  private mmCtx:   CanvasRenderingContext2D;
  private mmW = 120; private mmH = 120;
  private mmMinX = 0; private mmMaxX = 1;
  private mmMinZ = 0; private mmMaxZ = 1;

  constructor(track: Track) {
    const mm = document.getElementById('minimap') as HTMLCanvasElement;
    this.mmCtx = mm.getContext('2d')!;
    const pts = track.minimapPoints;
    this.mmMinX = Math.min(...pts.map(p => p.x));
    this.mmMaxX = Math.max(...pts.map(p => p.x));
    this.mmMinZ = Math.min(...pts.map(p => p.z));
    this.mmMaxZ = Math.max(...pts.map(p => p.z));
  }

  private _mm(x: number, z: number): [number, number] {
    const p  = 8;
    const mx = p + ((x - this.mmMinX) / (this.mmMaxX - this.mmMinX)) * (this.mmW - p * 2);
    const mz = p + ((z - this.mmMinZ) / (this.mmMaxZ - this.mmMinZ)) * (this.mmH - p * 2);
    return [mx, mz];
  }

  update(player: Car, allCars: Car[], elapsed: number, bestLap: number | null, track: Track) {
    this.lapEl.textContent = `${Math.min(player.lap, TOTAL_LAPS)} / ${TOTAL_LAPS}`;
    this.timeEl.textContent = Scores.fmt(elapsed);
    this.bestEl.textContent = bestLap !== null ? Scores.fmt(bestLap) : '--:--.–';

    const sorted = [...allCars].sort((a, b) => b.totalProgress - a.totalProgress);
    this.posEl.textContent = String(sorted.indexOf(player) + 1);

    const speedKmh = Math.round(player.speed * 10000);
    this.speedEl.textContent = String(speedKmh).padStart(3, '0');

    const pct = Math.round(player.draftLevel * 100);
    this.draftBar.style.width = `${pct}%`;
    if (player.draftLevel > 0.05) {
      this.draftVal.textContent = `+${Math.round(player.draftLevel * 18)}`;
      this.draftBar.classList.add('active');
    } else {
      this.draftVal.textContent = 'DRAFT';
      this.draftBar.classList.remove('active');
    }

    // Respawn overlay
    if (player.respawning && player.respawnTimer > 0) {
      this.respEl.style.display = 'flex';
      this.respNum.textContent  = String(Math.ceil(player.respawnTimer));
    } else {
      this.respEl.style.display = 'none';
    }

    // Minimap
    const ctx = this.mmCtx;
    ctx.clearRect(0, 0, this.mmW, this.mmH);
    ctx.beginPath();
    const pts = track.minimapPoints;
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const [mx, mz] = this._mm(p.x, p.z);
      i === 0 ? ctx.moveTo(mx, mz) : ctx.lineTo(mx, mz);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,238,255,0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();

    for (const car of allCars) {
      const mp = car.minimapPos(track);
      const [mx, mz] = this._mm(mp.x, mp.z);
      ctx.beginPath();
      ctx.arc(mx, mz, car.isPlayer ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = car.isPlayer ? '#fff' : `#${car.color.toString(16).padStart(6, '0')}`;
      ctx.fill();
    }
  }
}
