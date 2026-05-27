// ─── Track geometry ──────────────────────────────────────────────────────────
export const TRACK_WIDTH   = 11;
export const TOTAL_LAPS    = 3;
export const NUM_AI        = 7;

// ─── Difficulty presets ───────────────────────────────────────────────────────
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
  { id: 'easy',   label: 'Easy',   aiSpeedBase: 0.027, aiSpeedVar: 0.007, aiReaction: 1.2, aiLookAhead: 10, aiBlock: false },
  { id: 'medium', label: 'Medium', aiSpeedBase: 0.040, aiSpeedVar: 0.006, aiReaction: 2.8, aiLookAhead: 30, aiBlock: false },
  { id: 'hard',   label: 'Hard',   aiSpeedBase: 0.047, aiSpeedVar: 0.004, aiReaction: 4.2, aiLookAhead: 48, aiBlock: true  },
  { id: 'insane', label: 'Insane', aiSpeedBase: 0.051, aiSpeedVar: 0.002, aiReaction: 7.5, aiLookAhead: 68, aiBlock: true  },
];

// ─── Car specs — width:length ratio ~1:1.3 (stubby arrows, matches reference) ─
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
  { id: 'arrow',   label: 'Arrow',   color: 0xffffff, width: 1.0,  length: 1.4, topSpeedMult: 1.00, accelMult: 1.00, handleMult: 1.00, desc: 'Balanced all-rounder'         },
  { id: 'bullet',  label: 'Bullet',  color: 0xff2244, width: 0.85, length: 1.8, topSpeedMult: 1.28, accelMult: 0.72, handleMult: 0.68, desc: 'Top-speed monster — hard to steer' },
  { id: 'wedge',   label: 'Wedge',   color: 0x33aaff, width: 1.4,  length: 1.2, topSpeedMult: 0.88, accelMult: 1.30, handleMult: 1.48, desc: 'High cornering grip'          },
  { id: 'blade',   label: 'Blade',   color: 0xffcc00, width: 0.80, length: 1.6, topSpeedMult: 1.15, accelMult: 1.10, handleMult: 0.95, desc: 'Pierces the draft'            },
  { id: 'dart',    label: 'Dart',    color: 0x00ff88, width: 0.9,  length: 1.3, topSpeedMult: 0.88, accelMult: 1.45, handleMult: 1.55, desc: 'Explosive acceleration'       },
  { id: 'phantom', label: 'Phantom', color: 0xcc44ff, width: 1.25, length: 1.5, topSpeedMult: 1.08, accelMult: 0.88, handleMult: 1.18, desc: 'Ghostly handler'              },
];

// ─── Track definitions ────────────────────────────────────────────────────────
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
    id: 'midnight', label: 'Midnight Circuit', desc: 'F1-style · hairpin & esses',
    color: 0x030312, steps: 1200,
    points: [
      [   0,   0,    0], [ 120,   0,  -60], [ 220,  10, -160], [ 280,   0, -260],
      [ 250, -18, -345], [ 140,  -5, -365], [  20,   0, -315], [-105,  12, -265],
      [-185,   0, -185], [-205, -15,  -82], [-165,   0,   32], [ -62,  14,  112],
      [  62,   6,  142], [ 122,   0,   82], [  82,  -5,   22],
    ],
  },
  {
    id: 'neon_oval', label: 'Neon Oval', desc: 'High-speed oval · chicane',
    color: 0x020210, steps: 1000,
    points: [
      [   0,  0,    0], [ 100,  0,  -40], [ 220,  6,  -90], [ 300,  0, -190],
      [ 290, -7, -300], [ 220,  0, -390], [ 100,  6, -430], [   0,  0, -450],
      [-100,  0, -430], [-180,  6, -390], [-200,  0, -295], [-170, -7, -182],
      [-100,  0,  -82], [ -20,  6,  -32],
    ],
  },
  {
    id: 'alpine', label: 'Alpine Helix', desc: 'Elevation changes · tight hairpins',
    color: 0x020d02, steps: 1400,
    points: [
      [   0,   0,    0], [  85,  22,  -85], [ 175,  48, -135], [ 205,  62, -215],
      [ 162,  65, -315], [  52,  52, -378], [ -72,  35, -335], [-155,  20, -248],
      [-185,  10, -145], [-142,   3,  -62], [ -52,   0,   22], [  52,   6,   62],
    ],
  },
];

// ─── Player physics ───────────────────────────────────────────────────────────
export const SPEED_PLAYER_MAX = 0.052;
export const SPEED_ACCEL      = 0.022;
export const SPEED_BRAKE      = 0.040;
export const SPEED_FRICTION   = 0.010;

export const LAT_ACCEL        = 14.0;
export const LAT_DAMP         = 4.5;
export const MAX_LAT          = TRACK_WIDTH * 0.46;

export const CURV_DRIFT       = 30.0;
export const CURV_LOOK        = 15;
export const FALL_TRIGGER     = TRACK_WIDTH * 0.50;

// ─── Draft ────────────────────────────────────────────────────────────────────
export const CAR_RADIUS       = 1.6;
export const DRAFT_RANGE      = 0.020;
export const DRAFT_LAT_THRESH = 0.40;
export const DRAFT_BOOST      = 0.008;

// ─── AI rubber-band ───────────────────────────────────────────────────────────
export const RUBBER_BAND_LEAD = 0.12;
export const RUBBER_BAND_MAX  = 0.007;

export const AI_COLORS = [0xff3366, 0x44aaff, 0xffcc00, 0x00ff88, 0xaa44ff, 0xff8844, 0x44ffcc];
export const AI_NAMES  = ['Mint', 'Azure', 'Amber', 'Violet', 'Coral', 'Slate', 'Lime'];
export const MULTIPLAYER_URL = (import.meta as any).env?.VITE_PARTY_URL ?? '';
