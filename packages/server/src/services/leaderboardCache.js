// Leaderboard 快取（Redis，TTL 30s）。
// miss 時呼叫 matchService.getLeaderboardFromDb 重算後寫回。
//
// 為了避免循環 import，這支不直接 import matchService —
// 由呼叫端傳 fetcher 進來；或者用 dynamic import。

import { getRedis } from '../db/redis.js';

const TTL_SEC = 30;
const KEY = (gameType) => `cache:leaderboard:${gameType ?? 'all'}`;

export async function get(gameType, fetcher) {
  const r = getRedis();
  const key = KEY(gameType);
  const cached = await r.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const fresh = await fetcher(gameType);
  await r.set(key, JSON.stringify(fresh), 'EX', TTL_SEC);
  return fresh;
}

// 寫 match 時呼叫，DEL 所有 cache:leaderboard:* key。
export async function invalidateLeaderboard() {
  const r = getRedis();
  const keys = await r.keys('cache:leaderboard:*');
  if (keys.length > 0) await r.del(...keys);
}
