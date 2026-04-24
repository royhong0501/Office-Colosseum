// 道具戰常數（單位：格子；corner-origin：x∈[0,ARENA_COLS], y∈[0,ARENA_ROWS]）

export const ARENA_COLS = 18;
export const ARENA_ROWS = 9;
export const CELL = 1;

// 玩家資源
export const MAX_HP = 100;
export const MAX_MP = 100;
export const MP_REGEN_PER_SEC = 2;         // 每秒 +2 MP
export const PLAYER_RADIUS = 0.4;
export const PROJECTILE_RADIUS = 0.15;

// 基本攻擊（偏向控場 > 對槍，所以傷害比 BR 低、CD 比 BR 長）
export const MOVE_SPEED = 4.8;              // cells/sec
export const MOVE_SPEED_SLOWED = 2.4;       // merge trap debuff 後的移速
export const SHOOT_CD_MS = 600;
export const BULLET_DMG = 10;
export const BULLET_SPEED = 14;
export const BULLET_MAX_DIST = 12;

// 回合
export const ROUND_DURATION_MS = 180000;    // 3 分鐘

// 5 個技能的基本設定
export const SKILLS = {
  freeze:   { mpCost: 20, cdMs: 8000,  durationMs: 2000 },      // trap, 2s 定身
  undo:     { mpCost: 35, cdMs: 12000, rewindMs: 2000 },        // 自身 HP 回 2 秒前 + 清 debuff
  merge:    { mpCost: 15, cdMs: 6000,  durationMs: 3000 },      // trap, 3s 減速 50%
  readonly: { mpCost: 25, cdMs: 10000, durationMs: 5000 },      // trap, 5s silence
  validate: { mpCost: 30, cdMs: 14000 },                        // trap, 隨機傳送
};

export const SKILL_KEYS = ['freeze', 'undo', 'merge', 'readonly', 'validate'];

// undo 用：每 250ms 紀錄 HP snapshot，上限 ~2s / 0.25s = 8 筆
export const HP_HISTORY_INTERVAL_MS = 250;
export const HP_HISTORY_LEN = 12;           // 保留 3 秒給 undo 一點 margin
