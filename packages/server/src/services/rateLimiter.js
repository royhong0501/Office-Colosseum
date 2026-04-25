// Sliding-window rate limiter（INCR + EXPIRE）。
// 用法：await consume({ key, limit, windowSec })
//   - 第一次寫入時設 EXPIRE，避免 key 永久存在
//   - 超過 limit 就 throw RateLimitError

import { getRedis } from '../db/redis.js';

export class RateLimitError extends Error {
  constructor(retryAfterSec) {
    super('rate_limited');
    this.retryAfterSec = retryAfterSec;
  }
}

export async function consume({ key, limit, windowSec }) {
  const r = getRedis();
  const count = await r.incr(key);
  if (count === 1) {
    await r.expire(key, windowSec);
  }
  if (count > limit) {
    const ttl = await r.ttl(key);
    throw new RateLimitError(ttl > 0 ? ttl : windowSec);
  }
  return count;
}

// 重設 limiter（測試用 / login 成功後想清掉 username 鎖）
export async function reset(key) {
  await getRedis().del(key);
}
