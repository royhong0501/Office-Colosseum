// 經典大逃殺常數（單位：格子）
// 場地採 corner-origin：x ∈ [0, ARENA_COLS]、y ∈ [0, ARENA_ROWS]，每 cell = 1 世界單位。

// 場地 28×14（比原 20×9 大約 2.18×，多人對戰更有走位空間）
export const ARENA_COLS = 28;
export const ARENA_ROWS = 14;
export const CELL = 1;

// 玩家
export const MAX_HP = 100;
export const PLAYER_RADIUS = 0.4;       // 命中半徑（格子單位）

// 移動（cells/sec）
export const MOVE_SPEED = 5.2;
export const MOVE_SPEED_SHIELD = 3.1;   // 舉盾時 -40%

// 射擊 / 子彈
export const SHOOT_CD_MS = 280;
export const BULLET_DMG = 14;
export const BULLET_SPEED = 16;          // cells/sec
export const BULLET_MAX_DIST = 14;       // cells
export const PROJECTILE_RADIUS = 0.15;

// 舉盾
export const SHIELD_REDUCTION = 0.7;     // 傷害 × (1 - 0.7) = 30%

// 衝刺
export const DASH_CELLS = 2;
export const DASH_CD_MS = 6000;
export const DASH_INVULN_MS = 200;

// 毒圈（報錯區）
export const POISON_DPS = 5;
export const POISON_SEVERE_MULT = 2;
export const POISON_START_MS = 30000;    // 開場 30 秒才出第 1 波
export const POISON_WAVE_INTERVAL_MS = 15000;
