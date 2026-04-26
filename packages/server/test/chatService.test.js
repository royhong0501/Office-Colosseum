// chatService 整合測試。
// 需要本機 docker postgres + redis（.env 內有 DATABASE_URL / REDIS_URL）。
// 沒設環境變數時自動 skip 整檔，讓 CI 沒 DB 也能過（其他測試不受影響）。

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const HAS_DB = !!process.env.DATABASE_URL;
const HAS_REDIS = !!process.env.REDIS_URL || true; // ioredis 預設 redis://localhost:6379

if (!HAS_DB) {
  test('chatService skipped (no DATABASE_URL)', { skip: true }, () => {});
} else {
  const { getPrisma, disconnectPrisma } = await import('../src/db/prisma.js');
  const { disconnectRedis } = await import('../src/db/redis.js');
  const { reset: resetRate } = await import('../src/services/rateLimiter.js');
  const chat = await import('../src/services/chatService.js');

  const SUFFIX = randomUUID().slice(0, 8);
  const userA = { username: `chat_a_${SUFFIX}`, displayName: 'Alice' };
  const userB = { username: `chat_b_${SUFFIX}`, displayName: 'Bob' };
  const userC = { username: `chat_c_${SUFFIX}`, displayName: 'Carol' };
  let A, B, C;

  before(async () => {
    const p = getPrisma();
    [A, B, C] = await Promise.all([
      p.user.create({ data: { ...userA, passwordHash: 'x', role: 'PLAYER' } }),
      p.user.create({ data: { ...userB, passwordHash: 'x', role: 'PLAYER' } }),
      p.user.create({ data: { ...userC, passwordHash: 'x', role: 'PLAYER' } }),
    ]);
  });

  after(async () => {
    const p = getPrisma();
    await p.chatMessage.deleteMany({ where: {
      OR: [
        { senderId: { in: [A.id, B.id, C.id] } },
        { recipientId: { in: [A.id, B.id, C.id] } },
      ],
    } });
    await p.user.deleteMany({ where: { id: { in: [A.id, B.id, C.id] } } });
    await disconnectPrisma();
    await disconnectRedis();
  });

  beforeEach(async () => {
    // 每 test 重設 rate limiter，否則第二則就被擋
    await Promise.all([
      resetRate(`chat:${A.id}`),
      resetRate(`chat:${B.id}`),
      resetRate(`chat:${C.id}`),
    ]);
  });

  test('sendMessage: 公開頻道寫入 + 回 wire 形狀正確', async () => {
    const m = await chat.sendMessage({
      senderId: A.id, channel: 'public', recipientId: null, content: 'hello world',
    });
    assert.equal(m.channel, 'public');
    assert.equal(m.senderId, A.id);
    assert.equal(m.senderName, 'Alice');
    assert.equal(m.recipientId, null);
    assert.equal(m.content, 'hello world');
    assert.equal(typeof m.createdAt, 'number');
    assert.equal(m.readAt, null);
  });

  test('sendMessage: DM 寫入 + recipient 資訊', async () => {
    const m = await chat.sendMessage({
      senderId: A.id, channel: 'dm', recipientId: B.id, content: 'private hi',
    });
    assert.equal(m.channel, 'dm');
    assert.equal(m.senderId, A.id);
    assert.equal(m.recipientId, B.id);
    assert.equal(m.recipientName, 'Bob');
  });

  test('sendMessage: 空內容拒絕 chat_empty', async () => {
    await assert.rejects(
      chat.sendMessage({ senderId: A.id, channel: 'public', content: '   ' }),
      (e) => e.code === 'chat_empty',
    );
  });

  test('sendMessage: 超長拒絕 chat_too_long', async () => {
    const huge = 'x'.repeat(501);
    await assert.rejects(
      chat.sendMessage({ senderId: A.id, channel: 'public', content: huge }),
      (e) => e.code === 'chat_too_long',
    );
  });

  test('sendMessage: DM 給自己拒絕 chat_recipient_self', async () => {
    await assert.rejects(
      chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: A.id, content: 'me' }),
      (e) => e.code === 'chat_recipient_self',
    );
  });

  test('sendMessage: DM 給不存在的人拒絕 chat_recipient_invalid', async () => {
    await assert.rejects(
      chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: 'cuid_does_not_exist_xyz', content: 'hi' }),
      (e) => e.code === 'chat_recipient_invalid',
    );
  });

  test('sendMessage: rate limit 第二則 1.5s 內被擋', async () => {
    await chat.sendMessage({ senderId: A.id, channel: 'public', content: 'one' });
    await assert.rejects(
      chat.sendMessage({ senderId: A.id, channel: 'public', content: 'two' }),
      (e) => e.message === 'rate_limited',
    );
  });

  test('getDmHistory: 雙向都被收進來（A→B 與 B→A）', async () => {
    await chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: B.id, content: 'A→B 1' });
    await resetRate(`chat:${A.id}`);
    await chat.sendMessage({ senderId: B.id, channel: 'dm', recipientId: A.id, content: 'B→A 1' });
    await resetRate(`chat:${B.id}`);
    await chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: B.id, content: 'A→B 2' });

    const { messages } = await chat.getDmHistory({ userId: A.id, peerId: B.id });
    const contents = messages.map((m) => m.content);
    assert.ok(contents.includes('A→B 1'));
    assert.ok(contents.includes('B→A 1'));
    assert.ok(contents.includes('A→B 2'));
  });

  test('getUnreadCounts: 排除已讀 + 排除公開頻道 + 排除自己寄給自己的 echo', async () => {
    // A → C 一則 dm（C 未讀）
    await chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: C.id, content: 'unread to C' });
    // 同 A 也對 C 寫公開頻道（不算未讀）→ rate limit reset
    await resetRate(`chat:${A.id}`);
    await chat.sendMessage({ senderId: A.id, channel: 'public', content: 'public from A' });

    const { byPeer } = await chat.getUnreadCounts({ userId: C.id });
    assert.equal(byPeer[A.id] >= 1, true, '應至少有 1 則來自 A 的未讀 DM');
    // C 沒有任何已寄出的，所以自己的 byPeer 不會出現自己
    assert.equal(byPeer[C.id] ?? 0, 0);
  });

  test('markDmRead: 只標自己為 recipient 那批，不影響別人', async () => {
    await resetRate(`chat:${A.id}`);
    await chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: B.id, content: 'A→B 待讀' });
    await resetRate(`chat:${A.id}`);
    await chat.sendMessage({ senderId: A.id, channel: 'dm', recipientId: C.id, content: 'A→C 不該被改' });

    const before = await chat.getUnreadCounts({ userId: C.id });
    const cBefore = before.byPeer[A.id] ?? 0;

    await chat.markDmRead({ userId: B.id, peerId: A.id });

    const bAfter = await chat.getUnreadCounts({ userId: B.id });
    assert.equal((bAfter.byPeer[A.id] ?? 0), 0, 'B 的未讀應歸 0');

    const cAfter = await chat.getUnreadCounts({ userId: C.id });
    assert.equal(cAfter.byPeer[A.id] ?? 0, cBefore, 'C 的未讀數不該被動到');
  });
}
