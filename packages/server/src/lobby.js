import { MAX_PLAYERS, MIN_PLAYERS, MSG, ALL_CHARACTERS, DEFAULT_GAME_TYPE, GAME_TYPES } from '@office-colosseum/shared';

// Player 形狀（broadcast 給 client 的 LOBBY_STATE 也是這個 shape）：
//   { id: socketId, userId, displayName, characterId, ready, isHost, isBot }
// userId 對應 Postgres User.id（bot 為 null）。

export class Lobby {
  constructor(io) {
    this.io = io;
    this.players = new Map();  // socketId -> Player
    this.nextBotSeq = 1;
    this.gameType = DEFAULT_GAME_TYPE;
    this.config = {};
  }
  // user 是來自 socket.data.user 的 { id, displayName }（測試會直接餵 fake）
  join(socketId, user) {
    const userId = user?.id ?? null;
    const displayName = user?.displayName || 'Player';
    const prev = this.players.get(socketId);
    if (prev) {
      // idempotent：保留 characterId / ready / isHost，更新身分資訊
      prev.userId = userId;
      prev.displayName = displayName;
      this.broadcast();
      return { ok: true };
    }
    if (this.players.size >= MAX_PLAYERS) return { error: 'full' };
    const isHost = this.players.size === 0;
    this.players.set(socketId, {
      id: socketId, userId, displayName, characterId: null,
      ready: false, isHost, isBot: false,
    });
    this.broadcast();
    return { ok: true };
  }
  leave(socketId) {
    const wasHost = this.players.get(socketId)?.isHost;
    this.players.delete(socketId);
    const hasRealPlayer = [...this.players.values()].some(p => !p.isBot);
    if (!hasRealPlayer) {
      for (const [id, p] of this.players) {
        if (p.isBot) this.players.delete(id);
      }
    } else if (wasHost) {
      const nextHost = [...this.players.values()].find(p => !p.isBot);
      if (nextHost) nextHost.isHost = true;
    }
    this.broadcast();
  }
  pick(socketId, characterId) {
    const p = this.players.get(socketId); if (!p) return;
    p.characterId = characterId; this.broadcast();
  }
  setReady(socketId, ready) {
    const p = this.players.get(socketId); if (!p) return;
    p.ready = ready; this.broadcast();
  }
  setGameType(requesterId, gameType, config = {}) {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return { error: 'not_host' };
    if (!GAME_TYPES.includes(gameType)) return { error: 'unknown_game_type' };
    this.gameType = gameType;
    this.config = config ?? {};
    for (const p of this.players.values()) {
      if (!p.isBot) p.ready = false;
    }
    this.broadcast();
    return { ok: true };
  }
  canStart() {
    if (this.players.size < MIN_PLAYERS) return false;
    return [...this.players.values()].every(p => p.ready && p.characterId);
  }
  addBot(requesterId) {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return { error: 'not_host' };
    if (this.players.size >= MAX_PLAYERS) return { error: 'lobby_full' };
    const seq = this.nextBotSeq++;
    const id = `bot-${seq}`;
    const character = ALL_CHARACTERS[Math.floor(Math.random() * ALL_CHARACTERS.length)];
    this.players.set(id, {
      id,
      userId: null,
      displayName: `Bot-${seq}`,
      characterId: character.id,
      ready: true,
      isHost: false,
      isBot: true,
    });
    this.broadcast();
    return { ok: true, botId: id };
  }
  removeBot(requesterId, botId) {
    const requester = this.players.get(requesterId);
    if (!requester?.isHost) return { error: 'not_host' };
    const target = this.players.get(botId);
    if (!target?.isBot) return { error: 'not_bot' };
    this.players.delete(botId);
    this.broadcast();
    return { ok: true };
  }
  resetForNewMatch() {
    for (const [id, p] of this.players) {
      if (p.isBot) {
        this.players.delete(id);
      } else {
        p.ready = false;
      }
    }
    this.nextBotSeq = 1;
    this.broadcast();
  }
  snapshot() {
    return {
      players: [...this.players.values()],
      gameType: this.gameType,
      config: this.config,
    };
  }
  broadcast() { this.io.emit(MSG.LOBBY_STATE, this.snapshot()); }
}
