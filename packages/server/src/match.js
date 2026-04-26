// 通用 Match dispatcher：依 gameType 載入對應的 simulation + bot 模組，
// 跑共用的 30Hz tick loop。遊戲專屬邏輯都推進 shared/games/<id>/ 與
// server/src/games/<id>Bot.js。

import { TICK_MS, MSG } from '@office-colosseum/shared';
import { loadGame } from './games/index.js';
import * as matchService from './services/matchService.js';
import { enqueue as enqueueMatchFallback } from './services/matchFallbackQueue.js';

export class Match {
  constructor(io, lobbyPlayers, gameType, config, onEnd) {
    const game = loadGame(gameType);
    if (!game) throw new Error(`Match: unknown gameType ${gameType}`);

    this.io = io;
    this.onEnd = onEnd;
    this.gameType = gameType;
    this.config = config ?? {};
    this.game = game;
    this.players = lobbyPlayers.map(p => ({
      id: p.id,
      displayName: p.displayName ?? p.name ?? '',
      userId: p.userId ?? null,
      characterId: p.characterId,
      isBot: !!p.isBot,
    }));
    this.startedAtMs = Date.now();
    this.state = game.sim.createInitialState(this.players, this.config, this.startedAtMs);
    this.inputs = new Map();
    this.interval = null;
    this.stats = {};
    this.botSeqMap = new Map();
    for (const p of this.players) {
      this.stats[p.id] = { dmgDealt: 0, dmgTaken: 0, survivedTicks: 0 };
      if (p.isBot) this.botSeqMap.set(p.id, 0);
    }
  }

  start() {
    const payload = this.game.sim.buildMatchStartPayload(this.state, this.config);
    this.io.emit(MSG.MATCH_START, payload);
    this.interval = setInterval(() => this.tick(Date.now()), TICK_MS);
  }

  queueInput(playerId, input) {
    const sanitize = this.game.sim.sanitizeInput;
    const clean = sanitize ? sanitize(input) : input;
    if (!clean) return;
    this.inputs.set(playerId, clean);
  }

  tick(now) {
    const { sim, bot } = this.game;
    const eventsStartIdx = this.state.events.length;

    // bot input 走同一條 applyInput 路徑
    for (const p of this.players) {
      if (!p.isBot) continue;
      const statePlayer = this.state.players[p.id];
      if (!statePlayer || !statePlayer.alive) continue;
      let input;
      try {
        input = bot.decideBotInput(this.state, p.id, now);
      } catch (err) {
        console.warn(`bot ${p.id} decide failed:`, err);
        input = { moveX: 0, moveY: 0, aimAngle: 0, attack: false, shield: false, dash: false };
      }
      const nextSeq = (this.botSeqMap.get(p.id) ?? 0) + 1;
      this.botSeqMap.set(p.id, nextSeq);
      input.seq = nextSeq;
      this.inputs.set(p.id, input);
    }

    for (const [pid, input] of this.inputs) {
      this.state = sim.applyInput(this.state, pid, input, now);
    }
    this.inputs.clear();
    const { state } = sim.resolveTick(this.state, now);
    this.state = state;
    const newEvents = state.events.slice(eventsStartIdx);

    for (const p of Object.values(state.players)) {
      if (p.alive) this.stats[p.id].survivedTicks++;
    }
    for (const e of newEvents) {
      if (e.type === 'damage' && e.sourceId && e.targetId) {
        if (this.stats[e.sourceId]) this.stats[e.sourceId].dmgDealt += e.amount;
        if (this.stats[e.targetId]) this.stats[e.targetId].dmgTaken += e.amount;
      }
    }

    this.io.emit(MSG.SNAPSHOT, sim.buildSnapshotPayload(state, newEvents));

    if (state.phase === 'ended' || sim.aliveCount(state) <= 1) this.end();
  }

  end() {
    clearInterval(this.interval); this.interval = null;
    const winnerId = this.game.sim.getWinner(this.state);
    const endedAt = Date.now();
    const participants = this.players.map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      characterId: p.characterId,
      dmgDealt: this.stats[p.id]?.dmgDealt ?? 0,
      dmgTaken: this.stats[p.id]?.dmgTaken ?? 0,
      survivedTicks: this.stats[p.id]?.survivedTicks ?? 0,
      isWinner: p.id === winnerId,
      isBot: !!p.isBot,
    }));
    const recordPayload = {
      gameType: this.gameType,
      config: this.config,
      startedAt: this.startedAtMs,
      endedAt,
      participants,
    };
    matchService.recordMatch(recordPayload).catch(err => {
      console.warn('[match] recordMatch failed, enqueueing fallback:', err.message);
      enqueueMatchFallback(recordPayload);
    });
    this.io.emit(MSG.MATCH_END, { winnerId, summary: this.stats });
    if (this.onEnd) this.onEnd();
  }

  setPaused(playerId, paused) {
    if (this.state.players[playerId]) this.state.players[playerId].paused = paused;
  }
}
