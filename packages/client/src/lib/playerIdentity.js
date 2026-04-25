// 帳號系統導入後，這支從「localStorage UUID + name」改為包裝 auth.js。
// 既有畫面可繼續呼叫 getPlayerUuid()/getStoredPlayerName() 取得當前 user 資訊。
// 真正的身分（帳號 / 角色）由 lib/auth.js 管理。

import { getCurrentUser, updateDisplayName } from './auth.js';

const MAX_LEN = 16;

export function getStoredPlayerName() {
  return getCurrentUser()?.displayName ?? '';
}

export function getJoinName() {
  return getCurrentUser()?.displayName ?? 'Player';
}

// 寫名稱現在是一個 server roundtrip。失敗 swallow，下游不需要等。
export function setPlayerName(name) {
  const trimmed = String(name ?? '').trim().slice(0, MAX_LEN);
  if (!trimmed) return;
  if (trimmed === getCurrentUser()?.displayName) return;
  updateDisplayName(trimmed).catch((e) => console.warn('[displayName] update failed:', e.message));
}

export function getPlayerUuid() {
  // 沿用舊命名給 records / stats 查表用：對映到目前帳號的 user.id。
  return getCurrentUser()?.id ?? '';
}

export const PLAYER_NAME_MAX = MAX_LEN;
