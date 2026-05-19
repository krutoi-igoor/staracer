export const TRACK_WIDTH = 16;
export const TOTAL_LAPS  = 3;
export const NUM_AI      = 7;

export interface DifficultyConfig {
  id:          string;
  label:       string;
  aiSpeedBase: number;
  aiSpeedVar:  number;
  aiReaction:  number;
  aiLookAhead: number;
  aiBlock:     boolean;
}

export const DIFFICULTIES: DifficultyConfig[] = [
  { id: 'easy',   label: 'Easy',   aiSpeedBase: 0.014, aiSpeedVar: 0.004, aiReaction: 1.2, aiLookAhead: 10, aiBlock: false },
  { id: 'medium', label: 'Medium', aiSpeedBase: 0.022, aiSpeedVar: 0.006, aiReaction: 2.2, aiLookAhead: 25, aiBlock: false },
  { id: 'hard',   label: 'Hard',   aiSpeedBase: 0.032, aiSpeedVar: 0.007, aiReaction: 3.8, aiLookAhead: 40, aiBlock: true  },
  { id: 'insane', label: 'Insane', aiSpeedBase: 0.044, aiSpeedVar: 0.004, aiReaction: 6.0, aiLookAhead: 60, aiBlock: true  },
];

export interface CarSpec {
  id:           string;
  label:        string;
  color:        number;
  width:        number;
  length:       number;
  topSpeedMult: number;
  accelMult:    number;
  handleMult:   number;
  desc:         string;
}

export const CAR_SPECS: CarSpec[] = [
  { id: 'arrow',   label: 'Arrow',   color: 0xffffff, width: 1.3, length: 3.2, topSpeedMult: 1.00, accelMult: 1.00, handleMult: 1.00, desc: 'Balanced all-rounder'     },
  { id: 'bullet',  label: 'Bullet',  color: 0xff2244, width: 1.0, length: 4.2, topSpeedMult: 1.28, accelMult: 0.72, handleMult: 0.78, desc: 'Top-speed monster'        },
  { id: 'wedge',   label: 'Wedge',   color: 0x33aaff, width: 1.7, length: 2.8, topSpeedMult: 0.88, accelMult: 1.30, handleMult: 1.38, desc: 'High cornering grip'      },
  { id: 'blade',   label: 'Blade',   color: 0xffcc00, width: 0.9, length: 3.8, topSpeedMult: 1.15, accelMult: 1.10, handleMult: 0.95, desc: 'Pierces the draft'        },
  { id: 'dart',    label: 'Dart',    color: 0x00ff88, width: 1.1, length: 3.0, topSpeedMult: 0.88, accelMult: 1.45, handleMult: 1.45, desc: 'Explosive acceleration'   },
  { id: 'phantom', label: 'Phantom', color: 0xcc44ff, width: 1.5, length: 3.5, topSpeedMult: 1.08, accelMult: 0.88, handleMult: 1.18, desc: 'Ghostly handler'          },
];

export interface TrackDef {
  id:     string;
  label:  string;
  desc:   string;
  color:  number;
  steps:  number;
  points: [number, number, number][];
}

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'midnight', label: 'Midnight Circuit', desc: 'F1-style · hairpin & esses', color: 0x1a1a2e, steps: 600,
    points: [
      [  0,   0,    0], [120,   0,  -60], [220,   6, -160], [280,   0, -260],
      [250, -10, -340], [140,  -4, -360], [ 20,   0, -310], [-100,  6, -260],
      [-180,  0, -180], [-200, -8,  -80], [-160,  0,   30], [ -60,  8,  110],
      [  60,  4,  140], [ 120,  0,   80], [  80, -4,   20],
    ],
  },
  {
    id: 'neon_oval', label: 'Neon Oval', desc: 'High-speed oval · chicane', color: 0x0a0a20, steps: 500,
    points: [
      [   0,  0,    0], [ 100,  0,  -40], [ 220,  5,  -90], [ 300,  0, -190],
      [ 290, -5, -300], [ 220,  0, -390], [ 100,  5, -430], [   0,  0, -450],
      [-100,  0, -430], [-180,  5, -390], [-200,  0, -290], [-170, -5, -180],
      [-100,  0,  -80], [ -20,  5,  -30],
    ],
  },
  {
    id: 'alpine', label: 'Alpine Helix', desc: 'Elevation changes · tight hairpins', color: 0x0d160d, steps: 700,
    points: [
      [   0,   0,    0], [  80,  18,  -80], [ 170,  40, -130], [ 200,  55, -210],
      [ 160,  60, -310], [  50,  48, -370], [ -70,  32, -330], [-150,  18, -240],
      [-180,   8, -140], [-140,   2,  -60], [ -50,   0,   20], [  50,   5,   60],
    ],
  },
];

// Physics
export const SPEED_PLAYER_MAX  = 0.052;
export const SPEED_ACCEL       = 0.022;
export const SPEED_BRAKE       = 0.040;
export const SPEED_FRICTION    = 0.010;

export const LAT_SPEED         = 1.8;
export const MAX_LAT           = TRACK_WIDTH * 0.38;
export const FALL_TRIGGER      = MAX_LAT + 1.2; // past this → fall

export const CAR_RADIUS        = 1.6;
export const DRAFT_RANGE       = 0.020;
export const DRAFT_LAT_THRESH  = 0.40;
export const DRAFT_BOOST       = 0.008;

export const AI_COLORS = [0xff3366, 0x44aaff, 0xffcc00, 0x00ff88, 0xaa44ff, 0xff8844, 0x44ffcc];
export const MULTIPLAYER_URL   = (import.meta as any).env?.VITE_PARTY_URL ?? '';
