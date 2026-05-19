import { Game, GameConfig } from './game/Game';
import { initLanding } from './landing';
import { Scores } from './game/Scores';
import './style.css';

let game: Game | null = null;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

function showLanding() {
  game?.destroy();
  game = null;
  document.getElementById('game-ui')!.style.display = 'none';
  initLanding(startGame);
}

function startGame(cfg: GameConfig) {
  game?.destroy();
  game = null;
  document.getElementById('hud-center')!.style.display = 'none';
  document.getElementById('finish')!.innerHTML = '';
  document.getElementById('game-ui')!.style.display = 'block';

  game = new Game(canvas, cfg, (raceTime, bestLap, position) => {
    const entry = { difficulty: cfg.difficulty.id, trackId: cfg.track.id, carId: cfg.car.id, raceTime, bestLap, date: Date.now() };
    const isBest = Scores.isNewBest(entry);
    Scores.save(entry);

    const center = document.getElementById('hud-center')!;
    const finEl  = document.getElementById('finish')!;
    document.getElementById('countdown')!.textContent = '';
    center.style.display = 'flex';
    finEl.innerHTML = `
      <div class="finish-pos">P${position}</div>
      <div class="finish-time">${Scores.fmt(raceTime)}</div>
      <div class="finish-lap">Best Lap ${Scores.fmt(bestLap)}</div>
      ${isBest ? '<div class="new-best">🏆 NEW BEST</div>' : ''}
      <div class="finish-btns">
        <button id="btn-restart">RESTART</button>
        <button id="btn-menu">MENU</button>
      </div>
    `;

    document.getElementById('btn-restart')!.onclick = () => startGame(cfg);
    document.getElementById('btn-menu')!.onclick    = () => showLanding();
  });

  game.start();
}

showLanding();
