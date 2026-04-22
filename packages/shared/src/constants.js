// 世界幾何：圓形競技場，原點 (0,0)，浮點座標
export const ARENA_RADIUS = 8;
export const PLAYER_RADIUS = 0.5;
export const PROJECTILE_RADIUS = 0.2;

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

// 連續移動：每 tick 位移（baseline spd=60 時 = MOVE_STEP）
export const MOVE_STEP = 0.15;
export const MOVE_STEP_MIN = 0.08;
export const MOVE_STEP_MAX = 0.30;
export const BASELINE_SPD = 60;

export const ATTACK_COOLDOWN_MS = 250;
export const SKILL_COOLDOWN_MS = 5000;

export const PROJECTILE_SPEED = 0.4;
export const PROJECTILE_MAX_DIST = 12;

// skill 參數（近戰瞬發以歐氏距離為準）
export const ATTACK_RANGE = 2;
export const BURST_MULT = 1.0;
export const DASH_DISTANCE = 3;
export const DASH_DMG_MULT = 0.8;
export const SHIELD_DURATION_MS = 3000;
export const SHIELD_DAMAGE_MULT = 0.5;
export const HEAL_PCT = 0.3;
