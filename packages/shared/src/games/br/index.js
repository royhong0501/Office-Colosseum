// 經典大逃殺 — 整合匯出。
// Match dispatcher (server/src/games/index.js) 透過 `import * as brSim` 拿整份 API。

export * from './constants.js';
export * from './maps.js';
export {
  GAME_ID, NAME,
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner,
  buildSnapshotPayload, buildMatchStartPayload,
} from './simulation.js';
