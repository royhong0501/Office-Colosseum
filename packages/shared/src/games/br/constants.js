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

// 舉盾（弧形 + 耐久版）
//   - 弧寬：正前方 ±SHIELD_ARC_HALF_RAD（90° 扇形）；中心線 = aimAngle
//   - 弧內：100% 擋下子彈、消耗對應盾耐久
//   - 弧外：完全不擋（按原 BULLET_DMG 扣 HP）
//   - 盾耐久歸 0 → 鎖死 5s 不能舉，5s 到一次回滿
//   - 舉盾時不能射擊（LMB 互斥）
export const SHIELD_MAX_HP = 100;
export const SHIELD_ARC_DEG = 90;
export const SHIELD_ARC_HALF_RAD = (SHIELD_ARC_DEG / 2) * Math.PI / 180;
export const SHIELD_BREAK_LOCK_MS = 5000;
// @deprecated v1 全方位減傷模型已淘汰（弧形版改為弧內 100% 擋、弧外 0% 擋）。
// 保留 export 以免外部引用爆炸；新程式不應再讀這個值。
export const SHIELD_REDUCTION = 0.7;

// 衝刺
export const DASH_CELLS = 2;
export const DASH_CD_MS = 6000;
export const DASH_INVULN_MS = 200;

// 毒圈（報錯區）
export const POISON_DPS = 5;
export const POISON_SEVERE_MULT = 2;
export const POISON_START_MS = 30000;    // 開場 30 秒才出第 1 波
export const POISON_WAVE_INTERVAL_MS = 15000;

// Client-side prediction（只給 client 用；server 不讀這些）
//   - CORRECTION_THRESHOLD：predicted vs server 位置差 > 此值才啟動 lerp 修正，否則直接 snap
//   - CORRECTION_TICKS：lerp 修正分散到幾個 tick 完成（5 tick ≈ 166ms，肉眼難察）
//   - GHOST_BULLET_TIMEOUT_MS：ghost 子彈超過此時間沒配對到 server projectile_spawn → 視為被 server 拒絕並淡出
//   - GHOST_DEDUPE_WINDOW_MS：本地 ghost spawnedAtMs 與 server bullet spawnedAtMs 差距在此窗內視為同一發
//   - INPUT_BUFFER_MAX：unackedInputs 上限（防 server 長時間沒 ack 時無限堆積）
export const PREDICTION_CORRECTION_THRESHOLD = 0.35;
export const PREDICTION_CORRECTION_TICKS = 5;
export const PREDICTION_GHOST_BULLET_TIMEOUT_MS = 300;
export const PREDICTION_GHOST_DEDUPE_WINDOW_MS = 150;
export const PREDICTION_INPUT_BUFFER_MAX = 90;
