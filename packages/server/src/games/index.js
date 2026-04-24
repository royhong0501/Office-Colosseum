// 遊戲模組 registry：gameType → { sim, bot } 映射。
// Match dispatcher 透過 loadGame(gameType) 拿到對應模組，然後通用跑 tick loop。
//
// 加新遊戲：
//   1. packages/shared/src/games/<id>/ 實作 createInitialState / applyInput /
//      resolveTick / aliveCount / getWinner / buildSnapshotPayload / buildMatchStartPayload
//   2. packages/server/src/games/<id>Bot.js 實作 decideBotInput
//   3. 在下方 GAMES 註冊

import * as brSim from '@office-colosseum/shared/src/games/br/index.js';
import * as brBot from './brBot.js';
import * as itemsSim from '@office-colosseum/shared/src/games/items/index.js';
import * as itemsBot from './itemsBot.js';
import * as territorySim from '@office-colosseum/shared/src/games/territory/index.js';
import * as territoryBot from './territoryBot.js';

export const GAMES = {
  'battle-royale': { sim: brSim, bot: brBot },
  'items':         { sim: itemsSim, bot: itemsBot },
  'territory':     { sim: territorySim, bot: territoryBot },
};

export function loadGame(gameType) {
  return GAMES[gameType] ?? null;
}
