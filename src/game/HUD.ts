import { Track } from './Track';
import { Car } from './Car';
import { TOTAL_LAPS } from './constants';
import { Scores } from './Scores';

export class HUD {
  private speedEl   = document.getElementById('speed-display')!;
  private lapEl     = document.getElementById('lap')!;
  private timeEl    = document.getElementById('time')!;
  private bestEl    = document.getElementById('best')!;
  private draftEl   = document.getElementById('draft-val')!;
  private lbEl      = document.getElementById('leaderboard')!;
  private respEl    = document.getElementById('respawn-overlay') as HTMLElement;
  private respNum   = document.getElementById('respawn-num') as HTMLElement;

  private mmCtx:   CanvasRenderingContext2D;
  private mmW = 140; private mmH = 140;
  private mmMinX = 0; private mmMaxX = 1;
  private mmMinZ = 0; private mmMaxZ = 1;

  constructor(track: Track) {
    const mm = document.getElementById('minimap') as HTMLCanvasElement;
    mm.width  = this.mmW;
    mm.height = this.mmH;
    this.mmCtx = mm.getContext('2d')!;
    const pts = track.minimapPoints;
    this.mmMinX = Math.min(...pts.map(p => p.x));
    this.mmMaxX = Math.max(...pts.map(p => p.x));
    this.mmMinZ = Math.min(...pts.map(p => p.z));
    this.mmMaxZ = Math.max(...pts.map(p => p.z));
  }

  private _mm(x: number, z: number): [number, number] {
    const p  = 10;
    const mx = p + ((x - this.mmMinX) / (this.mmMaxX - this.mmMinX)) * (this.mmW - p * 2);
    const mz = p + ((z - this.mmMinZ) / (this.mmMaxZ - this.mmMinZ)) * (this.mmH - p * 2);
    return [mx, mz];
  }

  update(player: Car, allCars: Car[], elapsed: number, bestLap: number | null, track: Track) {
    // Stats panel
    const speedKmh = Math.round(player.speed * 10000);
    this.speedEl.textContent = String(speedKmh).padStart(3, '0');
    this.lapEl.textContent   = String(Math.min(player.lap, TOTAL_LAPS));
    this.timeEl.textContent  = Scores.fmt(elapsed);
    this.bestEl.textContent  = bestLap !== null ? Scores.fmt(bestLap) : '--:--.---';

    // Draft: show number when active, OFF otherwise
    if (player.draftLevel > 0.05) {
      this.draftEl.textContent = String(Math.round(player.draftLevel * 100));
      this.draftEl.classList.add('active');
    } else {
      this.draftEl.textContent = 'OFF';
      this.draftEl.classList.remove('active');
    }

    // Leaderboard
    const sorted = [...allCars].sort((a, b) => b.totalProgress - a.totalProgress);
    this.lbEl.innerHTML = sorted.map((car, idx) => {
      const hex   = '#' + car.color.toString(16).padStart(6, '0');
      const isYou = car.isPlayer;
      const lap   = `L${Math.min(car.lap, TOTAL_LAPS)}`;
      return `<div class="lb-row${isYou ? ' lb-you' : ''}">
        <span class="lb-rank">${idx + 1}</span>
        <span class="lb-dot" style="background:${isYou ? '#fff' : hex};box-shadow:0 0 4px ${isYou ? '#fff8' : hex + '88'}"></span>
        <span class="lb-name">${car.name}</span>
        <span class="lb-lap">${lap}</span>
      </div>`;
    }).join('');

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

    // Draw track outline
    const pts = track.minimapPoints;
    ctx.beginPath();
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      const [mx, mz] = this._mm(p.x, p.z);
      i === 0 ? ctx.moveTo(mx, mz) : ctx.lineTo(mx, mz);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Draw car dots
    for (const car of sorted) {
      const mp = car.minimapPos(track);
      const [mx, mz] = this._mm(mp.x, mp.z);
      const hex = '#' + car.color.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(mx, mz, car.isPlayer ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = car.isPlayer ? '#fff' : hex;
      ctx.fill();
    }
  }
}
