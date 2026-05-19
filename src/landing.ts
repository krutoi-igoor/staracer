import { GameConfig } from './game/Game';
import { DIFFICULTIES, CAR_SPECS, TRACK_DEFS, DifficultyConfig, CarSpec, TrackDef } from './game/constants';
import { Scores } from './game/Scores';

let _selDiff  = DIFFICULTIES[1];
let _selTrack = TRACK_DEFS[0];
let _selCar   = CAR_SPECS[0];
let _selCtrl: 'keyboard' | 'mouse' = 'keyboard';

export function initLanding(onStart: (cfg: GameConfig) => void) {
  document.getElementById('landing')!.style.display = 'flex';

  // ── Difficulty ──────────────────────────────────────────────────────────
  const diffList = document.getElementById('diff-list')!;
  diffList.innerHTML = '';
  DIFFICULTIES.forEach(d => {
    const btn = el('button', 'pill', d.label);
    if (d.id === _selDiff.id) btn.classList.add('selected');
    btn.onclick = () => {
      _selDiff = d;
      diffList.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _updateScores();
    };
    diffList.appendChild(btn);
  });

  // ── Track ───────────────────────────────────────────────────────────────
  const trackList = document.getElementById('track-list')!;
  trackList.innerHTML = '';
  TRACK_DEFS.forEach(t => {
    const btn = el('button', 'track-btn');
    btn.innerHTML = `<span class="tname">${t.label}</span><span class="tdesc">${t.desc}</span>`;
    if (t.id === _selTrack.id) btn.classList.add('selected');
    btn.onclick = () => {
      _selTrack = t;
      trackList.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _updateScores();
    };
    trackList.appendChild(btn);
  });

  // ── Car ─────────────────────────────────────────────────────────────────
  const carList  = document.getElementById('car-list')!;
  const carDesc  = document.getElementById('car-desc')!;
  const carStats = document.getElementById('car-stats')!;
  carList.innerHTML = '';
  CAR_SPECS.forEach(c => {
    const btn = el('button', 'car-btn');
    const hex = '#' + c.color.toString(16).padStart(6, '0');
    btn.innerHTML = `<span class="car-icon" style="--cc:${hex}"></span><span class="clabel">${c.label}</span>`;
    if (c.id === _selCar.id) btn.classList.add('selected');
    btn.onclick = () => {
      _selCar = c;
      carList.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _renderCarInfo(c, carDesc, carStats);
    };
    carList.appendChild(btn);
  });
  _renderCarInfo(_selCar, carDesc, carStats);

  // ── Controller ──────────────────────────────────────────────────────────
  const ctrlBtns = document.querySelectorAll<HTMLElement>('.ctrl-btn');
  ctrlBtns.forEach(b => {
    if (b.dataset.ctrl === _selCtrl) b.classList.add('selected');
    b.onclick = () => {
      _selCtrl = b.dataset.ctrl as 'keyboard' | 'mouse';
      ctrlBtns.forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      document.getElementById('ctrl-hint')!.textContent =
        _selCtrl === 'mouse'
          ? 'Mouse X = steer · Left click = auto-throttle · Right click = brake'
          : 'W/S = throttle/brake · A/D = steer · Space = handbrake';
    };
  });

  // ── Scores ──────────────────────────────────────────────────────────────
  _updateScores();

  // ── Start ───────────────────────────────────────────────────────────────
  const startBtn = document.getElementById('start-btn')!;
  // Remove old listeners by replacing the element
  const newBtn = startBtn.cloneNode(true) as HTMLElement;
  startBtn.parentNode!.replaceChild(newBtn, startBtn);
  newBtn.onclick = () => {
    document.getElementById('landing')!.style.display = 'none';
    onStart({ difficulty: _selDiff, track: _selTrack, car: _selCar, controller: _selCtrl });
  };
}

function _renderCarInfo(c: CarSpec, descEl: HTMLElement, statsEl: HTMLElement) {
  descEl.textContent = c.desc;
  const bar = (v: number) => `<div class="stat-bar"><div class="stat-fill" style="width:${Math.round(v * 100)}%"></div></div>`;
  statsEl.innerHTML = `
    <div class="stat-row"><span>Top Speed</span>${bar(c.topSpeedMult / 1.3)}</div>
    <div class="stat-row"><span>Accel</span>${bar(c.accelMult / 1.5)}</div>
    <div class="stat-row"><span>Handling</span>${bar(c.handleMult / 1.5)}</div>
  `;
}

function _updateScores() {
  const list   = document.getElementById('scores-list')!;
  const header = document.getElementById('scores-header')!;
  const entries = Scores.getBest(_selDiff.id, _selTrack.id);
  header.textContent = `Best Times · ${_selDiff.label} · ${_selTrack.label}`;
  if (entries.length === 0) {
    list.innerHTML = '<div class="no-scores">No times recorded yet</div>';
    return;
  }
  list.innerHTML = entries.map((e, i) =>
    `<div class="score-row"><span class="rank">#${i + 1}</span><span class="rtime">${Scores.fmt(e.raceTime)}</span><span class="rlap">Lap ${Scores.fmt(e.bestLap)}</span><span class="rcar">${e.carId}</span></div>`
  ).join('');
}

function el(tag: string, cls: string, text = ''): HTMLButtonElement {
  const e = document.createElement(tag) as HTMLButtonElement;
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}
