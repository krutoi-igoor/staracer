export const TRACK_WIDTH         = 16;
export const TOTAL_LAPS          = 3;
export const NUM_AI              = 7;

export const AI_COLORS = [0xff3366, 0x44aaff, 0xffcc00, 0x00ff88, 0xaa44ff, 0xff8844, 0x44ffcc];
export const PLAYER_COLOR        = 0xffffff;

export const SPEED_AI_BASE       = 0.026;
export const SPEED_AI_RANGE      = 0.012;
export const SPEED_PLAYER_MAX    = 0.052;
export const SPEED_ACCEL         = 0.020;
export const SPEED_BRAKE         = 0.040;
export const SPEED_FRICTION      = 0.010;

export const DRAFT_RANGE         = 0.020;
export const DRAFT_LAT_THRESH    = 0.40;
export const DRAFT_BOOST         = 0.008;

export const LAT_SPEED           = 1.8;
export const MAX_LAT             = TRACK_WIDTH * 0.38;

export const CAR_RADIUS          = 1.6;  // for collision
export const MULTIPLAYER_URL     = (import.meta as any).env?.VITE_PARTY_URL ?? '';
