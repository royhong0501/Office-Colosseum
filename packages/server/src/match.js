// 通用 Match dispatcher：依 gameType 載入對應的 simulation + bot 模組，
// 跑共用的 30Hz tick loop。遊戲專屬邏輯都推進 shared/games/<id>/ 與
// server/src/games/<id>Bot.js。
//
// Stats 累積：每 tick 掃新 events，依 gameType 對應到 STAT_KEYS 的欄位。
//   BR:      damage → dmgDealt/Taken; damage kind='bullet' → bulletsHit（source 方）;
//            projectile_spawn → bulletsFired; dash_move → dashUsed;
//            eliminated + lastDamageSource → kills
//   Items:   damage/kills 同上；skill_cast → skillsCast（+undoUsed 若 kind='undo'）;
//            trap_placed → trapsPlaced +1 skillsCast; trap_triggered → ownerId trapsTriggered
//   Territory: paint(per-player) → cellsPainted; area_captured → 隊內每人 areasCaptured +1 +
//            cellsCapturedByFormatbrush += cells.length;
//            end: 掃 state.cells 算 teamCellsAtEnd 寫入該隊每人 + 記 teamId

import { TICK_MS, MSG } from '@office-colosseum/shared';
import { loadGame } from './games/index.js';
import * as records from './records.js';
import { STAT_KEYS } from './records.js';

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
      name: p.name,
      uuid: p.uuid ?? null,
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
      this.stats[p.id] = blankStats(gameType);
      if (p.isBot) this.botSeqMap.set(p.id, 0);
    }
    // 歸功 kill 用：targetId → 最後一次傷害的 sourceId
    this.lastDamageSource = new Map();
  }

  start() {
    const payload = this.game.sim.buildMatchStartPayload(this.state, this.config);
    this.io.emit(MSG.MATCH_START, payload);
    this.interval = setInterval(() => this.tick(Date.now()), TICK_MS);
  }

  queueInput(playerId, input) { this.inputs.set(playerId, input); }

  tick(now) {
    const { sim, bot } = this.game;
    const eventsStartIdx = this.state.events.length;

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
    this._accumulateEvents(newEvents);

    this.io.emit(MSG.SNAPSHOT, sim.buildSnapshotPayload(state, newEvents));

    if (state.phase === 'ended' || sim.aliveCount(state) <= 1) this.end();
  }

  _accumulateEvents(events) {
    const gs = (pid) => this.stats[pid]?.gameStats;
    for (const e of events) {
      switch (e.type) {
        case 'damage': {
          const src = gs(e.sourceId), tgt = gs(e.targetId);
          if (src) src.damageDealt = (src.damageDealt | 0) + (e.amount | 0);
          if (tgt) tgt.damageTaken = (tgt.damageTaken | 0) + (e.amount | 0);
          if (e.kind === 'bullet' && src) {
            src.bulletsHit = (src.bulletsHit | 0) + 1;
          }
          if (e.sourceId && e.targetId) {
            this.lastDamageSource.set(e.targetId, e.sourceId);
          }
          break;
        }
        case 'eliminated': {
          const killer = this.lastDamageSource.get(e.playerId);
          const kgs = gs(killer);
          if (kgs) kgs.kills = (kgs.kills | 0) + 1;
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
            g.skillsCast = (g.skillsCast | 0) + 1;  // 放 trap 也算施展技能
          }
          break;
        }
        case 'trap_triggered': {
          const g = gs(e.ownerId);
          if (g) g.trapsTriggered = (g.trapsTriggered | 0) + 1;
          break;
        }
        case 'paint': {
          const g = gs(e.playerId);
          if (g) g.cellsPainted = (g.cellsPainted | 0) + (e.cells?.length ?? 1);
          break;
        }
        case 'area_captured': {
          // 隊內每人同獲歸屬：areasCaptured +1、cellsCapturedByFormatbrush += cells.length
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

  _finalizeTerritoryStats() {
    // 掃 state.cells 算每隊擁有格數，寫入該隊所有 player 的 stats
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
        uuid: p.uuid,
        name: p.name,
        characterId: p.characterId,
        isWinner: p.id === winnerId,
        isBot: !!p.isBot,
        survivedTicks: s.survivedTicks | 0,
        stats: { ...s.gameStats },
      };
    });
    try {
      records.recordMatch({
        gameType: this.gameType,
        config: this.config,
        startedAt: this.startedAtMs,
        endedAt,
        participants,
      });
    } catch (err) {
      console.warn('[match] records.recordMatch failed:', err.message);
    }
    // MATCH_END summary 保留舊 shape（player UI 可能仍讀 dmgDealt）——從新 stats 對映
    const legacySummary = {};
    for (const p of this.players) {
      const s = this.stats[p.id] ?? blankStats(this.gameType);
      legacySummary[p.id] = {
        dmgDealt: s.gameStats.damageDealt | 0,
        dmgTaken: s.gameStats.damageTaken | 0,
        survivedTicks: s.survivedTicks | 0,
        stats: { ...s.gameStats },
      };
    }
    this.io.emit(MSG.MATCH_END, { winnerId, summary: legacySummary });
    if (this.onEnd) this.onEnd();
  }

  setPaused(playerId, paused) {
    if (this.state.players[playerId]) this.state.players[playerId].paused = paused;
  }
}

function blankStats(gameType) {
  const gameStats = {};
  for (const k of STAT_KEYS[gameType] ?? []) gameStats[k] = 0;
  if (gameType === 'territory') gameStats.teamId = null;
  return { survivedTicks: 0, gameStats };
}
