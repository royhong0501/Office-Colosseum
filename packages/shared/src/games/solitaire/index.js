export * from './constants.js';
export {
  GAME_ID, NAME, AUTO_END_ON_LAST_ALIVE,
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner, finalizeStats, hasAnyLegalMove,
  buildBoard, buildSnapshotPayload, buildMatchStartPayload, buildSpectatorInitPayload,
  sanitizeInput,
} from './simulation.js';
