// JWT jti blocklist（Redis）。
// logout 與 admin 停用帳號時把 jti 寫進來，TTL = token 剩餘秒數。
//
// 為了讓「停用帳號」能批量 revoke 該使用者的所有 active token，
// signToken 時也把 jti 加進 user:<id>:jtis set；revokeAllForUser 時 SMEMBERS + 批量寫 blocklist。

import { getRedis } from '../db/redis.js';

const KEY_BLOCKED = (jti) => `blk:jti:${jti}`;
const KEY_USER_JTIS = (userId) => `user:${userId}:jtis`;
const USER_JTIS_TTL_SEC = 60 * 60 * 24 * 2;  // 2 天，比 token 24h 多一倍 buffer

export async function trackJti(userId, jti, ttlSec) {
  const r = getRedis();
  await r.sadd(KEY_USER_JTIS(userId), jti);
  await r.expire(KEY_USER_JTIS(userId), USER_JTIS_TTL_SEC);
}

export async function blockJti(jti, ttlSec) {
  const ttl = Math.max(1, Math.floor(ttlSec));
  await getRedis().set(KEY_BLOCKED(jti), '1', 'EX', ttl);
}

export async function isBlocked(jti) {
  const v = await getRedis().get(KEY_BLOCKED(jti));
  return v === '1';
}

// admin 停用帳號或重設密碼時：把該 user 所有已知 jti 都寫進 blocklist。
export async function revokeAllForUser(userId, ttlSec = 60 * 60 * 24) {
  const r = getRedis();
  const jtis = await r.smembers(KEY_USER_JTIS(userId));
  if (jtis.length === 0) return 0;
  const pipeline = r.pipeline();
  for (const jti of jtis) pipeline.set(KEY_BLOCKED(jti), '1', 'EX', Math.max(1, Math.floor(ttlSec)));
  pipeline.del(KEY_USER_JTIS(userId));
  await pipeline.exec();
  return jtis.length;
}
