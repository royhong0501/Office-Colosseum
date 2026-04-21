import { MAX_PLAYERS, MIN_PLAYERS, MSG, ALL_CHARACTERS } from '@office-colosseum/shared';

export class Lobby {
  constructor(io) {
    this.io = io;
    this.players = new Map();  // socketId -> { id, name, characterId, ready, isHost, isBot }
    this.nextBotSeq = 1;
  }
  join(socketId, name) {
    if (this.players.has(socketId)) {
      this.broadcast();
      return { ok: true };
    }
    if (this.players.size >= MAX_PLAYERS) return { error: 'full' };
    const isHost = this.players.size === 0;
    this.players.set(socketId, { id: socketId, name, characterId: null, ready: false, isHost, isBot: false });
    this.broadcast();
    return { ok: true };
  }
  leave(socketId) {
    const wasHost = this.players.get(socketId)?.isHost;
    this.players.delete(socketId);
    // 如果沒有真人剩下，清掉所有 bot（空 lobby 保留 bot 無意義）
    const hasRealPlayer = [...this.players.values()].some(p => !p.isBot);
    if (!hasRealPlayer) {
      for (const [id, p] of this.players) {
        if (p.isBot) this.players.delete(id);
      }
    } else if (wasHost) {
      // 把 host 權遞給第一個真人（不是 bot）
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
      name: `Bot-${seq}`,
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
        // keep characterId so players don't have to re-pick
      }
    }
    this.nextBotSeq = 1;
    this.broadcast();
  }
  snapshot() { return { players: [...this.players.values()] }; }
  broadcast() { this.io.emit(MSG.LOBBY_STATE, this.snapshot()); }
}
