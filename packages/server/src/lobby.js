import { MAX_PLAYERS, MIN_PLAYERS, MSG } from '@office-colosseum/shared';

export class Lobby {
  constructor(io) {
    this.io = io;
    this.players = new Map();  // socketId -> { id, name, characterId, ready, isHost }
  }
  join(socketId, name) {
    if (this.players.size >= MAX_PLAYERS) return { error: 'full' };
    const isHost = this.players.size === 0;
    this.players.set(socketId, { id: socketId, name, characterId: null, ready: false, isHost });
    this.broadcast();
    return { ok: true };
  }
  leave(socketId) {
    const wasHost = this.players.get(socketId)?.isHost;
    this.players.delete(socketId);
    if (wasHost && this.players.size > 0) {
      const next = this.players.values().next().value;
      next.isHost = true;
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
  resetForNewMatch() {
    for (const p of this.players.values()) {
      p.ready = false;
      // keep characterId so players don't have to re-pick
    }
    this.broadcast();
  }
  snapshot() { return { players: [...this.players.values()] }; }
  broadcast() { this.io.emit(MSG.LOBBY_STATE, this.snapshot()); }
}
