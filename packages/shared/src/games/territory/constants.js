// 數據領地爭奪戰常數（corner-origin 22×13 grid）

export const ARENA_COLS = 22;
export const ARENA_ROWS = 13;
export const CELL = 1;

export const MAX_TEAMS = 3;
export const MOVE_SPEED = 4.5;              // cells/sec
export const PLAYER_RADIUS = 0.4;
export const ROUND_DURATION_MS = 180000;    // 3 分鐘

// 3 隊預設顏色（與 design/TerritoryExtras.jsx 的 "cf-default" palette 一致）
export const TEAM_COLORS = [
  { id: 0, name: 'A 隊', base: '#b5d5a6', deep: '#8dba7a', edge: '#6a9358' },
  { id: 1, name: 'B 隊', base: '#e6b5b0', deep: '#d88b8b', edge: '#b05f5f' },
  { id: 2, name: 'C 隊', base: '#f0dca7', deep: '#d8be7a', edge: '#a89250' },
];

// flood fill 控制：每 tick 可檢查次數，避免 O(N²) 暴衝
export const FLOOD_FILL_BUDGET = 1;
