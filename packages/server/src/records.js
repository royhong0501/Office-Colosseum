// 戰績持久化（v2 schema）— 多遊戲平台專屬。
// v1（舊 arena 版）schema 不相容，init 讀到會直接捨棄重起新檔。
//
// Schema：
//   data = { version: 2, players: { [uuid]: Player }, matches: Match[] }
//   Player = {
//     uuid, lastName, firstSeenAt, lastSeenAt,
//     matches, wins,                            // 總計（跨 gameType）
//     byGameType: {
//       'battle-royale': { matches, wins, ...brStatKeys },
//       'items':         { matches, wins, ...itemsStatKeys },
//       'territory':     { matches, wins, ...territoryStatKeys },
//     },
//     byCharacter: { [characterId]: { matches, wins } },  // 皮膚使用（簡化）
//   }
//   Match = {
//     id, gameType, config, startedAt, endedAt, durationMs,
//     winnerUuid, winnerName,
//     participants: [{
//       uuid, name, characterId, isWinner, isBot,
//       survivedTicks,                   // 通用
//       stats: { /* gameType 特有，見下方 STAT_KEYS */ },
//     }]
//   }

import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 2;
export const MAX_MATCHES = 10;
export const MIN_REAL_PLAYERS = 2;
const WRITE_DEBOUNCE_MS = 1000;

// 每款遊戲聚合會累加的 stat keys（都是數字）。client leaderboard 也依賴這組 keys。
export const STAT_KEYS = {
  'battle-royale': [
    'damageDealt', 'damageTaken', 'kills',
    'bulletsFired', 'bulletsHit', 'dashUsed',
  ],
  'items': [
    'damageDealt', 'damageTaken', 'kills',
    'skillsCast', 'trapsPlaced', 'trapsTriggered',
    'undoUsed',
  ],
  'territory': [
    'cellsPainted', 'areasCaptured', 'cellsCapturedByFormatbrush',
    'teamCellsAtEnd',
    // teamId 不是數值、不計入聚合
  ],
};

let data = emptyData();
let filePath = null;
let writeTimer = null;

function emptyData() {
  return { version: SCHEMA_VERSION, players: {}, matches: [] };
}

function writeNow() {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.warn('[records] write failed:', e.message);
  }
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeNow();
  }, WRITE_DEBOUNCE_MS);
}

export function init(dbPath) {
  filePath = dbPath;
  data = emptyData();
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.version === SCHEMA_VERSION && parsed.players && Array.isArray(parsed.matches)) {
        data = parsed;
      } else {
        console.warn('[records] schema mismatch (found v%s, expected v%s) — starting fresh', parsed?.version, SCHEMA_VERSION);
      }
    }
  } catch (e) {
    console.warn('[records] load failed, starting fresh:', e.message);
    data = emptyData();
  }
}

function ensurePlayerRec(uuid, name, endedAt) {
  let rec = data.players[uuid];
  if (!rec) {
    rec = data.players[uuid] = {
      uuid,
      lastName: name,
      firstSeenAt: endedAt,
      lastSeenAt: endedAt,
      matches: 0, wins: 0,
      byGameType: {},
      byCharacter: {},
    };
  }
  rec.lastName = name;
  rec.lastSeenAt = endedAt;
  return rec;
}

function ensureByGameType(rec, gameType) {
  let g = rec.byGameType[gameType];
  if (!g) {
    g = rec.byGameType[gameType] = { matches: 0, wins: 0 };
    for (const k of STAT_KEYS[gameType] ?? []) g[k] = 0;
  }
  return g;
}

function ensureByCharacter(rec, characterId) {
  let c = rec.byCharacter[characterId];
  if (!c) c = rec.byCharacter[characterId] = { matches: 0, wins: 0 };
  return c;
}

/**
 * 紀錄一場對戰。
 *   gameType: 'battle-royale' | 'items' | 'territory'
 *   config:   遊戲專屬設定（例如 BR 的 mapId）
 *   participants: [{
 *     uuid, name, characterId, isWinner, isBot,
 *     survivedTicks,
 *     stats: { ...gameType 對應 STAT_KEYS 的 key → number },
 *   }]
 */
export function recordMatch({ gameType, config, startedAt, endedAt, participants }) {
  const realParticipants = participants.filter(p => !p.isBot && p.uuid);
  if (realParticipants.length < MIN_REAL_PLAYERS) {
    return { skipped: true, reason: 'not_enough_real_players' };
  }

  const gt = gameType ?? 'battle-royale';
  const statKeys = STAT_KEYS[gt] ?? [];
  const winner = realParticipants.find(p => p.isWinner) ?? null;
  const matchId = `m-${endedAt}-${Math.random().toString(36).slice(2, 5)}`;

  // 清理每位參與者的 stats：只留該 gameType 承認的 keys
  function sanitizeStats(raw) {
    const out = {};
    for (const k of statKeys) out[k] = (raw?.[k] | 0) || 0;
    // territory 有非數值 teamId 要保留（整數，不是 sum 欄）
    if (gt === 'territory' && typeof raw?.teamId === 'number') out.teamId = raw.teamId;
    return out;
  }

  const match = {
    id: matchId,
    gameType: gt,
    config: config ?? {},
    startedAt, endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    winnerUuid: winner?.uuid ?? null,
    winnerName: winner?.name ?? null,
    participants: participants.map(p => ({
      uuid: p.uuid ?? null,
      name: p.name ?? '',
      characterId: p.characterId,
      isWinner: !!p.isWinner,
      isBot: !!p.isBot,
      survivedTicks: p.survivedTicks | 0,
      stats: sanitizeStats(p.stats),
    })),
  };
  data.matches.push(match);
  if (data.matches.length > MAX_MATCHES) {
    data.matches = data.matches.slice(-MAX_MATCHES);
  }

  for (const p of realParticipants) {
    const rec = ensurePlayerRec(p.uuid, p.name, endedAt);
    rec.matches++;
    if (p.isWinner) rec.wins++;

    const g = ensureByGameType(rec, gt);
    g.matches++;
    if (p.isWinner) g.wins++;
    for (const k of statKeys) {
      g[k] = (g[k] | 0) + ((p.stats?.[k] | 0) || 0);
    }

    if (p.characterId) {
      const c = ensureByCharacter(rec, p.characterId);
      c.matches++;
      if (p.isWinner) c.wins++;
    }
  }

  scheduleWrite();
  return { ok: true, matchId };
}

export function getSnapshot() {
  return {
    meta: { version: data.version, totalMatches: data.matches.length },
    players: { ...data.players },
    matches: [...data.matches],
  };
}

// 測試用
export function _reset() {
  data = emptyData();
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
}
export function _flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  writeNow();
}
