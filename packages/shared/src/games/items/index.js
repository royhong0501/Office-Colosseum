export * from './constants.js';
export {
  GAME_ID, NAME,
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner,
  buildSnapshotPayload, buildMatchStartPayload,
  sanitizeInput,
} from './simulation.js';
