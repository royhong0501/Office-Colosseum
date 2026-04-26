// matchFallbackQueue：戰績寫入失敗的 ndjson queue。
// 每個測試用獨立 tmp 檔避免互相干擾。

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 透過 env var 改 queue path（matchFallbackQueue.js 支援）
let tmpFile;
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `match-fallback-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ndjson`);
  process.env.MATCH_FALLBACK_PATH = tmpFile;
});
afterEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  delete process.env.MATCH_FALLBACK_PATH;
});

// 動態 import 確保每個測試都讀新的 env var
async function loadModule() {
  const mod = await import('../src/services/matchFallbackQueue.js?cache=' + Math.random());
  return mod;
}

const samplePayload = {
  gameType: 'battle-royale',
  config: { mapId: 'budget' },
  startedAt: 1000,
  endedAt: 2000,
  participants: [{ userId: 'u1', displayName: 'A', characterId: 'munchkin', dmgDealt: 50, dmgTaken: 0, survivedTicks: 100, isWinner: true, isBot: false }],
};

test('enqueue + readAll：寫入後讀回，含 queuedAt timestamp', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  const all = m.readAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].gameType, 'battle-royale');
  assert.equal(typeof all[0].queuedAt, 'number');
  assert.ok(all[0].queuedAt >= 1000);
});

test('enqueue 多次：每次 append，順序保留', async () => {
  const m = await loadModule();
  m.enqueue({ ...samplePayload, startedAt: 1 });
  m.enqueue({ ...samplePayload, startedAt: 2 });
  m.enqueue({ ...samplePayload, startedAt: 3 });
  const all = m.readAll();
  assert.equal(all.length, 3);
  assert.deepEqual(all.map(a => a.startedAt), [1, 2, 3]);
});

test('readAll：檔案不存在 → 空陣列', async () => {
  const m = await loadModule();
  assert.deepEqual(m.readAll(), []);
});

test('readAll：損壞行直接跳過、好行保留', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  // 手動加一行壞 JSON
  fs.appendFileSync(tmpFile, 'this is not json\n', 'utf8');
  m.enqueue({ ...samplePayload, startedAt: 9999 });
  const all = m.readAll();
  assert.equal(all.length, 2);
  assert.equal(all[1].startedAt, 9999);
});

test('writeAll([]) → 移除整個檔案', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  assert.ok(fs.existsSync(tmpFile));
  m.writeAll([]);
  assert.ok(!fs.existsSync(tmpFile));
});

test('replay 全部成功 → 檔案被清掉', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  m.enqueue({ ...samplePayload, startedAt: 5000 });
  let calls = 0;
  const fakeRecord = async () => { calls++; return { ok: true }; };
  const r = await m.replay(fakeRecord);
  assert.equal(r.replayed, 2);
  assert.equal(r.kept, 0);
  assert.equal(calls, 2);
  assert.ok(!fs.existsSync(tmpFile));
});

test('replay 全部失敗 → 條目保留', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  m.enqueue({ ...samplePayload, startedAt: 5000 });
  const fakeRecord = async () => { throw new Error('db down'); };
  const r = await m.replay(fakeRecord);
  assert.equal(r.replayed, 0);
  assert.equal(r.kept, 2);
  assert.equal(m.count(), 2);
});

test('replay 部分失敗：成功的移除、失敗的留下', async () => {
  const m = await loadModule();
  m.enqueue({ ...samplePayload, startedAt: 1 });
  m.enqueue({ ...samplePayload, startedAt: 2 });
  m.enqueue({ ...samplePayload, startedAt: 3 });
  const fakeRecord = async (p) => {
    if (p.startedAt === 2) throw new Error('hiccup');
    return { ok: true };
  };
  const r = await m.replay(fakeRecord);
  assert.equal(r.replayed, 2);
  assert.equal(r.kept, 1);
  const remaining = m.readAll();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].startedAt, 2);
});

test('replay：recordFn 回傳 {skipped:true} 不算錯，移除條目', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  const fakeRecord = async () => ({ skipped: true, reason: 'not_enough_real_players' });
  const r = await m.replay(fakeRecord);
  assert.equal(r.replayed, 1);
  assert.equal(r.kept, 0);
  assert.equal(m.count(), 0);
});

test('replay 空 queue → no-op', async () => {
  const m = await loadModule();
  const r = await m.replay(async () => { throw new Error('should not be called'); });
  assert.equal(r.replayed, 0);
  assert.equal(r.kept, 0);
});

test('payload 內含 queuedAt 時，replay 給 recordFn 的 payload 不含 queuedAt', async () => {
  const m = await loadModule();
  m.enqueue(samplePayload);
  let received;
  const fakeRecord = async (p) => { received = p; return { ok: true }; };
  await m.replay(fakeRecord);
  assert.ok(received);
  assert.equal(received.queuedAt, undefined);
  assert.equal(received.gameType, 'battle-royale');
});
