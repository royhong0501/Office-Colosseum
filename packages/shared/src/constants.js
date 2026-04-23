// 世界幾何：矩形競技場，中心在 (0,0)，浮點座標。
// 16:9 比例，邊界：-ARENA_WIDTH/2 ≤ x ≤ ARENA_WIDTH/2、-ARENA_HEIGHT/2 ≤ y ≤ ARENA_HEIGHT/2
export const ARENA_WIDTH = 24;
export const ARENA_HEIGHT = 13.5;
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
// Strike：射出青綠色飛彈，施法者沿 -facing 後退 STRIKE_RECOIL_DIST 世界單位
export const STRIKE_RECOIL_DIST = 2;
// Burst：3 秒內移動 & 攻擊速度 × BURST_BUFF_MULT
export const BURST_BUFF_DURATION_MS = 3000;
export const BURST_BUFF_MULT = 1.5;
// Shield：持續時間 = base + spc × mult（毫秒）
export const SHIELD_DURATION_BASE_MS = 1500;
export const SHIELD_SPC_MULT_MS = 25;
export const SHIELD_DAMAGE_MULT = 0.5;
// Heal：被動觸發 — HP ≤ maxHp × HEAL_PASSIVE_THRESHOLD 時自動施放，觸發後 HEAL_PASSIVE_CD_MS lockout
export const HEAL_PCT = 0.2;
export const HEAL_SPC_MULT = 0.4;
export const HEAL_PASSIVE_THRESHOLD = 0.3;
export const HEAL_PASSIVE_CD_MS = 6000;
