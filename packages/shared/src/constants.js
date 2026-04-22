export const ARENA_COLS = 16;
export const ARENA_ROWS = 10;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const SKILL_COOLDOWN_MS = 5000;
export const MOVE_COOLDOWN_MS = 150;
export const ATTACK_COOLDOWN_MS = 250;
export const PROJECTILE_SPEED = 0.4;
export const PROJECTILE_MAX_DIST = 12;

// SPD-based 移動冷卻：baseline spd=60 對應 MOVE_COOLDOWN_MS=150
export const BASELINE_SPD = 60;
export const MOVE_COOLDOWN_MIN_MS = 80;
export const MOVE_COOLDOWN_MAX_MS = 300;

// Skill kind 參數（shield / heal）
export const SHIELD_DURATION_MS = 3000;
export const SHIELD_DAMAGE_MULT = 0.5;
export const HEAL_PCT = 0.3;

// Skill kind 參數（strike / burst / dash 近戰瞬發，繞過投射物系統）
export const ATTACK_RANGE = 2;
export const BURST_MULT = 1.0;
export const DASH_DISTANCE = 3;
export const DASH_DMG_MULT = 0.8;
