import fs from 'node:fs';
import path from 'node:path';

export const MAX_MATCHES = 10;
export const MIN_REAL_PLAYERS = 2;
const WRITE_DEBOUNCE_MS = 1000;

let data = emptyData();
let filePath = null;
let writeTimer = null;

function emptyData() {
  return { version: 1, players: {}, matches: [] };
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
      if (parsed?.version === 1 && parsed.players && Array.isArray(parsed.matches)) {
        data = parsed;
      }
    }
  } catch (e) {
    console.warn('[records] load failed, starting fresh:', e.message);
    data = emptyData();
  }
}

// participants: [{ uuid, name, characterId, dmgDealt, dmgTaken, survivedTicks, isWinner, isBot }]
// 至少要有 MIN_REAL_PLAYERS 個非 bot 且有 uuid 的參與者才記錄
export function recordMatch({ startedAt, endedAt, participants }) {
  const realParticipants = participants.filter(p => !p.isBot && p.uuid);
  if (realParticipants.length < MIN_REAL_PLAYERS) {
    return { skipped: true, reason: 'not_enough_real_players' };
  }

  const winner = realParticipants.find(p => p.isWinner) ?? null;
  const matchId = `m-${endedAt}-${Math.random().toString(36).slice(2, 5)}`;
  const match = {
    id: matchId,
    startedAt, endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    winnerUuid: winner?.uuid ?? null,
    winnerName: winner?.name ?? null,
    participants: participants.map(p => ({
      uuid: p.uuid ?? null,
      name: p.name ?? '',
      characterId: p.characterId,
      dmgDealt: p.dmgDealt | 0,
      dmgTaken: p.dmgTaken | 0,
      survivedTicks: p.survivedTicks | 0,
      isWinner: !!p.isWinner,
      isBot: !!p.isBot,
    })),
  };
  data.matches.push(match);
  if (data.matches.length > MAX_MATCHES) {
    data.matches = data.matches.slice(-MAX_MATCHES);
  }

  for (const p of realParticipants) {
    let rec = data.players[p.uuid];
    if (!rec) {
      rec = data.players[p.uuid] = {
        uuid: p.uuid,
        lastName: p.name,
        firstSeenAt: endedAt,
        lastSeenAt: endedAt,
        matches: 0, wins: 0,
        dmgDealt: 0, dmgTaken: 0, survivedTicks: 0,
        byCharacter: {},
      };
    }
    rec.lastName = p.name;
    rec.lastSeenAt = endedAt;
    rec.matches++;
    if (p.isWinner) rec.wins++;
    rec.dmgDealt += p.dmgDealt | 0;
    rec.dmgTaken += p.dmgTaken | 0;
    rec.survivedTicks += p.survivedTicks | 0;

    let charRec = rec.byCharacter[p.characterId];
    if (!charRec) {
      charRec = rec.byCharacter[p.characterId] = {
        matches: 0, wins: 0, dmgDealt: 0, dmgTaken: 0, survivedTicks: 0,
      };
    }
    charRec.matches++;
    if (p.isWinner) charRec.wins++;
    charRec.dmgDealt += p.dmgDealt | 0;
    charRec.dmgTaken += p.dmgTaken | 0;
    charRec.survivedTicks += p.survivedTicks | 0;
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

// 測試用：重置記憶體狀態、不刪檔
export function _reset() {
  data = emptyData();
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
}

// 測試用：立刻寫檔（跳過 debounce）
export function _flush() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  writeNow();
}
