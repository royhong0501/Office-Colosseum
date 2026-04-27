// 一間房間：獨立的 Lobby + 選擇性跑中的 Match。
// 收到一個「scoped broadcaster」（形同 io.to(roomId)）當成原本的 io，
// 所以 Lobby/Match 內部的 this.io.emit() 只會打到本房的 socket。

import { MAX_PLAYERS, DEFAULT_GAME_TYPE } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';

export class Room {
  constructor(scope, opts) {
    const {
      id, name,
      mode = DEFAULT_GAME_TYPE,
      mapId = null,
      isPrivate = false,
      password = null,
      capacity = MAX_PLAYERS,
      hostId = null,
      hostUsername = null,
    } = opts ?? {};

    this.id = id;
    this.name = name;
    this.mode = mode;
    this.mapId = mapId;
    this.isPrivate = isPrivate;
    this.password = password;        // 私人房密碼（in-memory plain；v1 用，正式改 hash）
    this.capacity = Math.min(Math.max(capacity | 0, 2), MAX_PLAYERS);
    this.hostId = hostId;
    this.hostUsername = hostUsername;
    this.createdAt = Date.now();
    this.scope = scope;
    this.lobby = new Lobby(scope);
    // 預設 lobby 的 mode/config（避開 setGameType 的 host 檢查）
    this.lobby.gameType = this.mode;
    this.lobby.config = mapId ? { mapId } : {};
    this.match = null;
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      mode: this.mode,
      mapId: this.mapId,
      hostUsername: this.hostUsername,
      isPrivate: this.isPrivate,
      capacity: this.capacity,
      createdAt: this.createdAt,
      playerCount: this.lobby.players.size,
      humanCount: [...this.lobby.players.values()].filter((p) => !p.isBot).length,
      maxPlayers: this.capacity,    // backward compat alias
      phase: this.match ? 'playing' : 'lobby',
      matchStartedAt: this.match?.startedAtMs ?? null,
    };
  }

  hasHuman() {
    return [...this.lobby.players.values()].some((p) => !p.isBot);
  }

  startMatch(onMatchEnd) {
    if (this.match) return { error: 'match_running' };
    this.match = new Match(
      this.scope,
      [...this.lobby.players.values()],
      this.lobby.gameType,
      this.lobby.config,
      () => {
        this.match = null;
        this.lobby.resetForNewMatch();
        if (onMatchEnd) onMatchEnd();
      },
    );
    this.match.start();
    return { ok: true };
  }
}
