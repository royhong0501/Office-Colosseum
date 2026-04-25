// ioredis client singleton。
// REDIS_URL 例如 redis://localhost:6379。Lazy connect 避免測試環境崩潰。

import Redis from 'ioredis';

let client = null;

export function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    client.on('error', (e) => console.warn('[redis] error:', e.message));
  }
  return client;
}

export async function disconnectRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}
