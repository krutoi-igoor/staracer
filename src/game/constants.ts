// Game-wide constants
export const TRACK_WIDTH    = 14;
export const TOTAL_LAPS     = 3;
export const NUM_AI         = 7;

export const AI_COLORS = [0x00ff88, 0x4488ff, 0xffaa00, 0xff4488, 0xaa44ff, 0x44ffff, 0xff8844];
export const PLAYER_COLOR   = 0xffffff;

// Speed in "laps per second"; display = speed * 10000
export const SPEED_AI_BASE    = 0.028;
export const SPEED_AI_MAX     = 0.042;
export const SPEED_PLAYER_MAX = 0.050;
export const SPEED_ACCEL      = 0.018;  // per second
export const SPEED_BRAKE      = 0.036;
export const SPEED_FRICTION   = 0.012;

// Drafting
export const DRAFT_RANGE     = 0.018; // t-distance window
export const DRAFT_LAT_THRESH = 0.35; // normalised lateral closeness
export const DRAFT_BOOST     = 0.007;

// Lateral handling
export const LAT_SPEED        = 1.6;   // normalised units/sec
export const MAX_LAT          = TRACK_WIDTH * 0.38;
