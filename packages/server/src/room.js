// ⚠️ 第二階段多房間預留。目前 socketHandlers 採 singleton（單一 Lobby+Match），
// 本檔與 rooms.js 都未被 server/src/index.js 直接使用，但仍會被 rooms.test.js 匯入測試。
// 切回多房間時：參考 git history 中 multi-room 版 socketHandlers，把 RoomManager 重新接回。

import { MAX_PLAYERS } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';

// 一間房間：獨立的 Lobby + 選擇性跑中的 Match。
// 收到一個「scoped broadcaster」（形同 io.to(roomId)）當成原本的 io，
// 所以 Lobby/Match 內部的 this.io.emit() 只會打到本房的 socket。
export class Room {
  constructor(scope, id, name) {
    this.id = id;
    this.name = name;
    this.createdAt = Date.now();
    this.scope = scope;        // 形同 io.to(roomId)
    this.lobby = new Lobby(scope);
    this.match = null;
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      playerCount: this.lobby.players.size,
      humanCount: [...this.lobby.players.values()].filter((p) => !p.isBot).length,
      maxPlayers: MAX_PLAYERS,
      phase: this.match ? 'playing' : 'lobby',
    };
  }

  hasHuman() {
    return [...this.lobby.players.values()].some((p) => !p.isBot);
  }

  startMatch(onMatchEnd) {
    if (this.match) return { error: 'match_running' };
    this.match = new Match(this.scope, [...this.lobby.players.values()], () => {
      this.match = null;
      this.lobby.resetForNewMatch();
      if (onMatchEnd) onMatchEnd();
    });
    this.match.start();
    return { ok: true };
  }
}
