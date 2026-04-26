// 聊天服務：訊息持久化於 Postgres（ChatMessage 表）。
// channel 'public' / 'dm' 對應 Prisma enum PUBLIC / DM。
// 所有 method 吃 plain object、回 plain object（外部不需要碰 Prisma 型別）。

import { getPrisma } from '../db/prisma.js';
import { consume, RateLimitError } from './rateLimiter.js';
import { CHAT_CONTENT_MAX, CHAT_RATE_LIMIT_SEC, CHAT_HISTORY_PAGE_SIZE } from '@office-colosseum/shared';

export class ChatValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const CHANNEL_MAP = { public: 'PUBLIC', dm: 'DM' };

function toWireMessage(row) {
  return {
    id: row.id,
    channel: row.channel === 'PUBLIC' ? 'public' : 'dm',
    senderId: row.senderId,
    senderName: row.sender?.displayName ?? '',
    recipientId: row.recipientId ?? null,
    recipientName: row.recipient?.displayName ?? null,
    content: row.content,
    createdAt: row.createdAt.getTime(),
    readAt: row.readAt ? row.readAt.getTime() : null,
  };
}

// rate limit：每 user CHAT_RATE_LIMIT_SEC 秒內最多 1 則。
// rateLimiter / Redis EXPIRE 都是「秒」粒度，所以常數直接用秒。

export async function sendMessage({ senderId, channel, recipientId, content }) {
  // 1) 驗 channel
  const dbChannel = CHANNEL_MAP[channel];
  if (!dbChannel) throw new ChatValidationError('chat_bad_channel');

  // 2) 驗 content
  const trimmed = (content ?? '').toString();
  if (!trimmed.trim()) throw new ChatValidationError('chat_empty');
  if (trimmed.length > CHAT_CONTENT_MAX) throw new ChatValidationError('chat_too_long');

  // 3) DM 必須有 recipient 且不能是自己
  if (dbChannel === 'DM') {
    if (!recipientId) throw new ChatValidationError('chat_recipient_required');
    if (recipientId === senderId) throw new ChatValidationError('chat_recipient_self');
    const exists = await getPrisma().user.findUnique({
      where: { id: recipientId },
      select: { id: true, disabled: true },
    });
    if (!exists || exists.disabled) throw new ChatValidationError('chat_recipient_invalid');
  }

  // 4) rate limit（throws RateLimitError）
  await consume({ key: `chat:${senderId}`, limit: 1, windowSec: CHAT_RATE_LIMIT_SEC });

  // 5) 寫入
  const row = await getPrisma().chatMessage.create({
    data: {
      channel: dbChannel,
      senderId,
      recipientId: dbChannel === 'DM' ? recipientId : null,
      content: trimmed,
    },
    include: {
      sender: { select: { id: true, displayName: true } },
      recipient: { select: { id: true, displayName: true } },
    },
  });

  return toWireMessage(row);
}

export async function getPublicHistory({ before, limit = CHAT_HISTORY_PAGE_SIZE } = {}) {
  const take = Math.min(Math.max(1, limit | 0), CHAT_HISTORY_PAGE_SIZE);
  const where = { channel: 'PUBLIC' };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await getPrisma().chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    include: { sender: { select: { id: true, displayName: true } } },
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  // 由舊到新交給 client（方便直接 append）
  return { messages: slice.reverse().map(toWireMessage), hasMore };
}

export async function getDmHistory({ userId, peerId, before, limit = CHAT_HISTORY_PAGE_SIZE }) {
  if (!userId || !peerId) throw new ChatValidationError('chat_bad_request');
  const take = Math.min(Math.max(1, limit | 0), CHAT_HISTORY_PAGE_SIZE);
  const where = {
    channel: 'DM',
    OR: [
      { senderId: userId, recipientId: peerId },
      { senderId: peerId, recipientId: userId },
    ],
  };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await getPrisma().chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    include: {
      sender: { select: { id: true, displayName: true } },
      recipient: { select: { id: true, displayName: true } },
    },
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  return { messages: slice.reverse().map(toWireMessage), hasMore };
}

export async function markDmRead({ userId, peerId }) {
  if (!userId || !peerId) throw new ChatValidationError('chat_bad_request');
  const r = await getPrisma().chatMessage.updateMany({
    where: {
      channel: 'DM',
      senderId: peerId,
      recipientId: userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return { updated: r.count };
}

export async function getUnreadCounts({ userId }) {
  const rows = await getPrisma().chatMessage.groupBy({
    by: ['senderId'],
    where: {
      channel: 'DM',
      recipientId: userId,
      readAt: null,
    },
    _count: { _all: true },
  });
  const byPeer = {};
  for (const r of rows) byPeer[r.senderId] = r._count._all;
  return { byPeer };
}

export { RateLimitError };
