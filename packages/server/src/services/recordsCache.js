// Records snapshot 快取（Redis，TTL 30s）。
// matchService.getSnapshot 結果為包含最近 N 場 + top 200 玩家聚合，
// 每次 GET_RECORDS 重算成本不低（兩條 prisma include）；30s 內視為 fresh。
//
// 與 leaderboardCache 同樣的 fetcher pattern：caller 傳重算 callback，避免循環 import。
//
// invalidate 在 recordMatch 完成後呼叫，與 invalidateLeaderboard 並列。

import { getRedis } from '../db/redis.js';

const TTL_SEC = 30;
const KEY = (recentLimit) => `cache:records:snapshot:${recentLimit | 0}`;

export async function get(recentLimit, fetcher) {
  const r = getRedis();
  const key = KEY(recentLimit);
  const cached = await r.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const fresh = await fetcher(recentLimit);
  await r.set(key, JSON.stringify(fresh), 'EX', TTL_SEC);
  return fresh;
}

// 寫 match 時呼叫，DEL 所有 cache:records:* key（含未來可能的子 key）。
export async function invalidateRecords() {
  const r = getRedis();
  const keys = await r.keys('cache:records:*');
  if (keys.length > 0) await r.del(...keys);
}
