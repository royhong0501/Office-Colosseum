const NAME_KEY = 'oc.playerName';
const UUID_KEY = 'oc.playerUuid';
const MAX_LEN = 16;

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function generateUuid() {
  // 優先用瀏覽器原生 crypto.randomUUID（Chrome/Edge/Firefox/Safari 現代版本皆支援）
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  // fallback：手拼 v4 格式，夠用的隨機性給 LAN 遊戲
  const s = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s()}${s()}-${s()}-4${s().slice(1)}-${s()}-${s()}${s()}${s()}`;
}

export function getStoredPlayerName() {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export function getJoinName() {
  const stored = getStoredPlayerName().trim();
  return stored || `Player-${randomSuffix()}`;
}

export function setPlayerName(name) {
  try {
    const trimmed = String(name ?? '').trim().slice(0, MAX_LEN);
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
    else localStorage.removeItem(NAME_KEY);
  } catch {}
}

// 首次呼叫時生成並存入 localStorage；之後永遠回傳同一組。
// 若 localStorage 不可用（私密模式限制等）→ 退回 session-level 的記憶體快取，
// 這種情況下戰績會跟瀏覽器生命週期綁在一起（可接受，本來就是 A 方案的限制）。
let _sessionUuid = null;
export function getPlayerUuid() {
  try {
    let uuid = localStorage.getItem(UUID_KEY);
    if (!uuid) {
      uuid = generateUuid();
      localStorage.setItem(UUID_KEY, uuid);
    }
    return uuid;
  } catch {
    if (!_sessionUuid) _sessionUuid = generateUuid();
    return _sessionUuid;
  }
}

export const PLAYER_NAME_MAX = MAX_LEN;
