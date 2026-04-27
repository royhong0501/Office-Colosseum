// 線上玩家：Redis Hash `presence:online`
//   field = userId
//   value = JSON({ socketId, since, status })
//
// status：'online'（在線）/ 'in_match'（房內 / 對戰中）/ （field 不存在 = offline）
// connection 時 hsetOnline、進房時 setStatus('in_match')、離房 'online'、disconnect hdelOnline。

import { getRedis } from '../db/redis.js';

const KEY = 'presence:online';

export const PRESENCE_STATUS = {
  ONLINE: 'online',
  IN_MATCH: 'in_match',
};

async function readEntry(userId) {
  const raw = await getRedis().hget(KEY, userId);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function hsetOnline(userId, socketId) {
  const v = JSON.stringify({
    socketId, since: Date.now(), status: PRESENCE_STATUS.ONLINE,
  });
  await getRedis().hset(KEY, userId, v);
}

export async function hdelOnline(userId) {
  await getRedis().hdel(KEY, userId);
}

export async function setStatus(userId, status) {
  const entry = (await readEntry(userId)) ?? { socketId: null, since: Date.now() };
  entry.status = status;
  await getRedis().hset(KEY, userId, JSON.stringify(entry));
}

export async function getStatus(userId) {
  const entry = await readEntry(userId);
  return entry?.status ?? null;
}

export async function listOnline() {
  const raw = await getRedis().hgetall(KEY);
  return Object.entries(raw).map(([userId, json]) => {
    let parsed = {};
    try { parsed = JSON.parse(json); } catch {}
    return {
      userId,
      socketId: parsed.socketId ?? null,
      since: parsed.since ?? null,
      status: parsed.status ?? PRESENCE_STATUS.ONLINE,
    };
  });
}
