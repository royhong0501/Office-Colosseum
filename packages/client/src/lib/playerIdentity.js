const KEY = 'oc.playerName';
const MAX_LEN = 16;

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

export function getStoredPlayerName() {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function getJoinName() {
  const stored = getStoredPlayerName().trim();
  return stored || `Player-${randomSuffix()}`;
}

export function setPlayerName(name) {
  try {
    const trimmed = String(name ?? '').trim().slice(0, MAX_LEN);
    if (trimmed) localStorage.setItem(KEY, trimmed);
    else localStorage.removeItem(KEY);
  } catch {}
}

export const PLAYER_NAME_MAX = MAX_LEN;
