import {
  createInitialState, applyInput, resolveTick, aliveCount, getWinner,
  TICK_MS, MSG,
} from '@office-colosseum/shared';

export class Match {
  constructor(io, lobbyPlayers, onEnd) {
    this.io = io;
    this.onEnd = onEnd;
    this.players = lobbyPlayers.map(p => ({ id: p.id, characterId: p.characterId }));
    this.state = createInitialState(this.players);
    this.inputs = new Map();
    this.interval = null;
    this.stats = {};
    for (const p of this.players) this.stats[p.id] = { dmgDealt: 0, dmgTaken: 0, survivedTicks: 0 };
  }
  start() {
    this.io.emit(MSG.MATCH_START, { state: this.state });
    const startAt = Date.now();
    this.interval = setInterval(() => this.tick(Date.now() - startAt), TICK_MS);
  }
  queueInput(playerId, input) { this.inputs.set(playerId, input); }
  tick(now) {
    const eventsStartIdx = this.state.events.length;
    for (const [pid, input] of this.inputs) {
      this.state = applyInput(this.state, pid, input, now);
    }
    this.inputs.clear();
    const { state } = resolveTick(this.state, now);
    this.state = state;
    const newEvents = state.events.slice(eventsStartIdx);
    for (const p of Object.values(state.players)) {
      if (p.alive) this.stats[p.id].survivedTicks++;
    }
    for (const e of newEvents) {
      if (e.type === 'damage') {
        this.stats[e.sourceId].dmgDealt += e.amount;
        this.stats[e.targetId].dmgTaken += e.amount;
      }
    }
    this.io.emit(MSG.SNAPSHOT, { tick: state.tick, players: state.players, events: newEvents });
    if (state.phase === 'ended' || aliveCount(state) <= 1) this.end();
  }
  end() {
    clearInterval(this.interval); this.interval = null;
    this.io.emit(MSG.MATCH_END, { winnerId: getWinner(this.state), summary: this.stats });
    if (this.onEnd) this.onEnd();
  }
  setPaused(playerId, paused) {
    if (this.state.players[playerId]) this.state.players[playerId].paused = paused;
  }
}
