// 通用 Match dispatcher：依 gameType 載入對應的 simulation + bot 模組，
// 跑共用的 30Hz tick loop。遊戲專屬邏輯都推進 shared/games/<id>/ 與
// server/src/games/<id>Bot.js。
//
// stats 累積：每 tick 掃 newEvents → 累加進 this.stats[playerId].gameStats，
// 結算時連同 dmgDealt/dmgTaken/survivedTicks（legacy 欄位）一起寫進 MatchParticipant。

import { TICK_MS, MSG } from '@office-colosseum/shared';
import { loadGame } from './games/index.js';
import * as matchService from './services/matchService.js';
import { STAT_KEYS } from './services/matchService.js';
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
    // 廣播 scope 由 caller 決定：傳進來的 io 已經是 io.to(roomId) 的 BroadcastOperator
    // （Room.scope），this.io.emit() 自然只發給該 room 的 socket。Match 自己不需 join socket。
    this.state = game.sim.createInitialState(this.players, this.config, this.startedAtMs);
    this.inputs = new Map();
    this.interval = null;
    this.stats = {};
    this.botSeqMap = new Map();
    for (const p of this.players) {
      this.stats[p.id] = blankStats(gameType);
      if (p.isBot) this.botSeqMap.set(p.id, 0);
    }
    // kill 歸功：targetId → 最後一次傷害的 sourceId
    this.lastDamageSource = new Map();
    // client-side prediction：每位玩家最後處理的 input.seq；client reconciliation 用。
    // 透過 buildSnapshotPayload(state, events, { acks }) 廣播。
    this.lastSeqByPlayer = {};
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
      // 記錄該玩家最後處理的 seq（供 client prediction reconciliation）；bot 也記錄但 client 不會關心。
      if (typeof input.seq === 'number') this.lastSeqByPlayer[pid] = input.seq | 0;
    }
    this.inputs.clear();
    const { state } = sim.resolveTick(this.state, now);
    this.state = state;
    const newEvents = state.events.slice(eventsStartIdx);

    for (const p of Object.values(state.players)) {
      if (p.alive) this.stats[p.id].survivedTicks++;
    }
    this._accumulateEvents(newEvents);

    this.io.emit(MSG.SNAPSHOT, sim.buildSnapshotPayload(state, newEvents, { acks: this.lastSeqByPlayer }));

    if (state.phase === 'ended' || sim.aliveCount(state) <= 1) this.end();
  }

  /**
   * 把 events 對應到 stats 累計欄位。每款 gameType 各取自己關心的 event types：
   *   damage / eliminated → 共通 (BR + Items)
   *   projectile_spawn / dash_move / shield_block 等 → BR
   *   skill_cast / trap_placed / trap_triggered → Items
   *   paint / area_captured → Territory
   * 不認得的 event 不會 crash（switch default 略過）。
   */
  _accumulateEvents(events) {
    const gs = (pid) => this.stats[pid]?.gameStats;
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          const src = gs(e.sourceId), tgt = gs(e.targetId);
          if (src) src.damageDealt = (src.damageDealt | 0) + (e.amount | 0);
          if (tgt) tgt.damageTaken = (tgt.damageTaken | 0) + (e.amount | 0);
          if (e.kind === 'bullet' && src) src.bulletsHit = (src.bulletsHit | 0) + 1;
          if (e.sourceId && e.targetId) this.lastDamageSource.set(e.targetId, e.sourceId);
          break;
        }
        case 'eliminated': {
          const killerId = this.lastDamageSource.get(e.playerId);
          const k = gs(killerId);
          if (k) k.kills = (k.kills | 0) + 1;
          break;
        }
        case 'projectile_spawn': {
          const g = gs(e.ownerId);
          if (g) g.bulletsFired = (g.bulletsFired | 0) + 1;
          break;
        }
        case 'dash_move': {
          const g = gs(e.playerId);
          if (g) g.dashUsed = (g.dashUsed | 0) + 1;
          break;
        }
        case 'skill_cast': {
          const g = gs(e.playerId);
          if (g) {
            g.skillsCast = (g.skillsCast | 0) + 1;
            if (e.kind === 'undo') g.undoUsed = (g.undoUsed | 0) + 1;
          }
          break;
        }
        case 'trap_placed': {
          const g = gs(e.ownerId);
          if (g) {
            g.trapsPlaced = (g.trapsPlaced | 0) + 1;
            g.skillsCast = (g.skillsCast | 0) + 1;
            const k = `skill_${e.kind}`;
            g[k] = (g[k] | 0) + 1;
          }
          break;
        }
        case 'trap_triggered': {
          const g = gs(e.ownerId);
          if (g) {
            g.trapsTriggered = (g.trapsTriggered | 0) + 1;
            const k = `trig_${e.kind}`;
            g[k] = (g[k] | 0) + 1;
          }
          break;
        }
        case 'paint': {
          // territory paint event：兩種 shape 都吃
          //   v1（舊批次）{ cells: [[c,r,teamId],...] } — 沒 playerId 無法歸屬，跳過
          //   v2（新版）{ playerId, teamId, cells: [[c,r],...] } — 有 playerId
          if (e.playerId) {
            const g = gs(e.playerId);
            if (g) g.cellsPainted = (g.cellsPainted | 0) + (e.cells?.length ?? 1);
          }
          break;
        }
        case 'area_captured': {
          // 隊內每人同獲歸屬
          const team = this.state?.teams?.find(t => t.id === e.teamId);
          if (team) {
            for (const pid of team.playerIds) {
              const g = gs(pid);
              if (g) {
                g.areasCaptured = (g.areasCaptured | 0) + 1;
                g.cellsCapturedByFormatbrush = (g.cellsCapturedByFormatbrush | 0) + (e.cells?.length ?? 0);
              }
            }
          }
          break;
        }
        default: break;
      }
    }
  }

  /** Territory 結算：把每隊的 teamCellsAtEnd + teamId 寫進該隊每人 gameStats */
  _finalizeTerritoryStats() {
    const teamCount = new Map();
    for (const tid of Object.values(this.state.cells ?? {})) {
      teamCount.set(tid, (teamCount.get(tid) ?? 0) + 1);
    }
    for (const p of this.players) {
      const sp = this.state.players[p.id];
      const teamId = sp?.teamId ?? null;
      const g = this.stats[p.id]?.gameStats;
      if (!g) continue;
      g.teamId = teamId;
      g.teamCellsAtEnd = teamId != null ? (teamCount.get(teamId) ?? 0) : 0;
    }
  }

  end() {
    clearInterval(this.interval); this.interval = null;
    if (this.gameType === 'territory') this._finalizeTerritoryStats();

    const winnerId = this.game.sim.getWinner(this.state);
    const endedAt = Date.now();
    const participants = this.players.map(p => {
      const s = this.stats[p.id] ?? blankStats(this.gameType);
      return {
        userId: p.userId,
        displayName: p.displayName,
        characterId: p.characterId,
        // legacy 欄位（DB schema 仍保留）
        dmgDealt: s.gameStats.damageDealt | 0,
        dmgTaken: s.gameStats.damageTaken | 0,
        survivedTicks: s.survivedTicks | 0,
        isWinner: p.id === winnerId,
        isBot: !!p.isBot,
        // 新欄位：per-gameType 細節（matchService 會 sanitize 並寫入 stats JSON）
        stats: { ...s.gameStats },
      };
    });
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

  /** 給觀戰者中途加入時的「當前 state」snapshot；下游用 game.sim.buildSpectatorInitPayload */
  getSpectatorInitPayload() {
    const sim = this.game.sim;
    if (typeof sim.buildSpectatorInitPayload !== 'function') {
      // 後備：用 buildMatchStartPayload（territory/items 等 state 簡單者皆可）
      return sim.buildMatchStartPayload(this.state, this.config);
    }
    return sim.buildSpectatorInitPayload(this.state, this.config);
  }
}

function blankStats(gameType) {
  const gameStats = {};
  for (const k of STAT_KEYS[gameType] ?? []) gameStats[k] = 0;
  if (gameType === 'territory') gameStats.teamId = null;
  return { survivedTicks: 0, gameStats };
}
