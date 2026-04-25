// 線上玩家：Redis Hash `presence:online`
//   field = userId
//   value = JSON({ socketId, since })
//
// connection 時 hsetOnline，disconnect 時 hdelOnline。

import { getRedis } from '../db/redis.js';

const KEY = 'presence:online';

export async function hsetOnline(userId, socketId) {
  const v = JSON.stringify({ socketId, since: Date.now() });
  await getRedis().hset(KEY, userId, v);
}

export async function hdelOnline(userId) {
  await getRedis().hdel(KEY, userId);
}

export async function listOnline() {
  const raw = await getRedis().hgetall(KEY);
  return Object.entries(raw).map(([userId, json]) => {
    let parsed = {};
    try { parsed = JSON.parse(json); } catch {}
    return { userId, ...parsed };
  });
}
