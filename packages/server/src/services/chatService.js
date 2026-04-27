// 聊天服務：訊息持久化於 Postgres（ChatMessage 表）+ 已讀記錄（ChatMessageRead 表）。
//
// channel 'public' / 'announce' / 'room' / 'dm' 對應 Prisma enum PUBLIC / ANNOUNCE / ROOM / DM。
// 所有 method 吃 plain object、回 plain object（外部不需要碰 Prisma 型別）。
//
// 跨領域權限檢查（ANNOUNCE 限 ADMIN、ROOM 限房內成員）放在 chatHandlers，這層只做：
//   - 內容 sanitize / 長度 / channel enum / DM recipient 驗證
//   - replyTo 必須是同一 channel（且若是 DM/ROOM 還需要同 peer/room）
//   - mention parse 寫入 metadata
//   - rate limit

import { getPrisma } from '../db/prisma.js';
import { consume, RateLimitError } from './rateLimiter.js';
import {
  CHAT_CONTENT_MAX, CHAT_RATE_LIMIT_SEC, CHAT_HISTORY_PAGE_SIZE,
  sanitizeChatContent,
} from '@office-colosseum/shared';

export class ChatValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const CHANNEL_TO_DB = {
  public: 'PUBLIC',
  announce: 'ANNOUNCE',
  room: 'ROOM',
  dm: 'DM',
};
const CHANNEL_TO_WIRE = {
  PUBLIC: 'public',
  ANNOUNCE: 'announce',
  ROOM: 'room',
  DM: 'dm',
};

// mention regex：@username 形式（alnum + _ . -），跟 admin/routes.js 的 username 規則一致
const MENTION_REGEX = /@([a-zA-Z0-9_.-]+)/g;

function toWireMessage(row, { readByCount } = {}) {
  return {
    id: row.id,
    channel: CHANNEL_TO_WIRE[row.channel] ?? row.channel.toLowerCase(),
    senderId: row.senderId,
    senderName: row.sender?.displayName ?? '',
    recipientId: row.recipientId ?? null,
    recipientName: row.recipient?.displayName ?? null,
    roomId: row.roomId ?? null,
    replyToId: row.replyToId ?? null,
    replyToContent: row.replyTo?.content ?? null,
    replyToSenderName: row.replyTo?.sender?.displayName ?? null,
    mentions: row.metadata?.mentions ?? [],
    content: row.content,
    createdAt: row.createdAt.getTime(),
    readAt: row.readAt ? row.readAt.getTime() : null,
    readByCount: typeof readByCount === 'number' ? readByCount : (row._count?.reads ?? 0),
  };
}

/**
 * 解析 content 中的 @mention，回傳 { userIds, usernames }。
 * 命中的 username 會去查 User 表，過濾掉不存在 / disabled 的。
 */
async function resolveMentions(content) {
  const usernames = new Set();
  for (const m of content.matchAll(MENTION_REGEX)) {
    if (m[1]) usernames.add(m[1].toLowerCase());
  }
  if (usernames.size === 0) return { userIds: [], usernames: [] };
  const rows = await getPrisma().user.findMany({
    where: {
      username: { in: [...usernames], mode: 'insensitive' },
      disabled: false,
    },
    select: { id: true, username: true },
  });
  return {
    userIds: rows.map((r) => r.id),
    usernames: rows.map((r) => r.username),
  };
}

export async function sendMessage({
  senderId, channel, recipientId, roomId, content, replyToId,
}) {
  // 1) 驗 channel
  const dbChannel = CHANNEL_TO_DB[channel];
  if (!dbChannel) throw new ChatValidationError('chat_bad_channel');

  // 2) 驗 content：sanitize 先做、再驗空字串與長度
  const trimmed = sanitizeChatContent(content ?? '');
  if (!trimmed) throw new ChatValidationError('chat_empty');
  if (trimmed.length > CHAT_CONTENT_MAX) throw new ChatValidationError('chat_too_long');

  // 3) channel-specific validation
  if (dbChannel === 'DM') {
    if (!recipientId) throw new ChatValidationError('chat_recipient_required');
    if (recipientId === senderId) throw new ChatValidationError('chat_recipient_self');
    const exists = await getPrisma().user.findUnique({
      where: { id: recipientId },
      select: { id: true, disabled: true },
    });
    if (!exists || exists.disabled) throw new ChatValidationError('chat_recipient_invalid');
  }
  if (dbChannel === 'ROOM') {
    if (!roomId) throw new ChatValidationError('chat_room_required');
  }

  // 4) replyToId 必須存在且同 channel + 同 peer/room
  let replyToRow = null;
  if (replyToId) {
    replyToRow = await getPrisma().chatMessage.findUnique({
      where: { id: replyToId },
      select: { id: true, channel: true, recipientId: true, senderId: true, roomId: true },
    });
    if (!replyToRow) throw new ChatValidationError('chat_reply_not_found');
    if (replyToRow.channel !== dbChannel) throw new ChatValidationError('chat_reply_channel_mismatch');
    if (dbChannel === 'ROOM' && replyToRow.roomId !== roomId) {
      throw new ChatValidationError('chat_reply_room_mismatch');
    }
    if (dbChannel === 'DM') {
      const sameDmThread = (replyToRow.senderId === senderId && replyToRow.recipientId === recipientId)
                       || (replyToRow.senderId === recipientId && replyToRow.recipientId === senderId);
      if (!sameDmThread) throw new ChatValidationError('chat_reply_dm_mismatch');
    }
  }

  // 5) rate limit
  await consume({ key: `chat:${senderId}`, limit: 1, windowSec: CHAT_RATE_LIMIT_SEC });

  // 6) parse mentions
  const { userIds: mentionUserIds } = await resolveMentions(trimmed);

  // 7) 寫入
  const row = await getPrisma().chatMessage.create({
    data: {
      channel: dbChannel,
      senderId,
      recipientId: dbChannel === 'DM' ? recipientId : null,
      roomId: dbChannel === 'ROOM' ? roomId : null,
      replyToId: replyToRow?.id ?? null,
      content: trimmed,
      metadata: { mentions: mentionUserIds },
    },
    include: {
      sender: { select: { id: true, displayName: true } },
      recipient: { select: { id: true, displayName: true } },
      replyTo: {
        select: {
          content: true,
          sender: { select: { displayName: true } },
        },
      },
    },
  });

  // mentions 已經寫進 row.metadata 並會在 toWireMessage 透出（msg.mentions）
  return toWireMessage(row, { readByCount: 0 });
}

// 共用 history 查詢：select 訊息 + reply 引用 + 已讀數
const includeForHistory = {
  sender: { select: { id: true, displayName: true } },
  recipient: { select: { id: true, displayName: true } },
  replyTo: {
    select: {
      content: true,
      sender: { select: { displayName: true } },
    },
  },
  _count: { select: { reads: true } },
};

export async function getPublicHistory({ before, limit = CHAT_HISTORY_PAGE_SIZE } = {}) {
  const take = Math.min(Math.max(1, limit | 0), CHAT_HISTORY_PAGE_SIZE);
  const where = { channel: 'PUBLIC' };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await getPrisma().chatMessage.findMany({
    where, orderBy: { createdAt: 'desc' }, take: take + 1, include: includeForHistory,
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  return { messages: slice.reverse().map((r) => toWireMessage(r)), hasMore };
}

export async function getAnnounceHistory({ before, limit = CHAT_HISTORY_PAGE_SIZE } = {}) {
  const take = Math.min(Math.max(1, limit | 0), CHAT_HISTORY_PAGE_SIZE);
  const where = { channel: 'ANNOUNCE' };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await getPrisma().chatMessage.findMany({
    where, orderBy: { createdAt: 'desc' }, take: take + 1, include: includeForHistory,
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  return { messages: slice.reverse().map((r) => toWireMessage(r)), hasMore };
}

export async function getRoomHistory({ roomId, before, limit = CHAT_HISTORY_PAGE_SIZE }) {
  if (!roomId) throw new ChatValidationError('chat_bad_request');
  const take = Math.min(Math.max(1, limit | 0), CHAT_HISTORY_PAGE_SIZE);
  const where = { channel: 'ROOM', roomId };
  if (before) where.createdAt = { lt: new Date(before) };
  const rows = await getPrisma().chatMessage.findMany({
    where, orderBy: { createdAt: 'desc' }, take: take + 1, include: includeForHistory,
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  return { messages: slice.reverse().map((r) => toWireMessage(r)), hasMore };
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
    where, orderBy: { createdAt: 'desc' }, take: take + 1, include: includeForHistory,
  });
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  return { messages: slice.reverse().map((r) => toWireMessage(r)), hasMore };
}

/** DM 已讀（沿用舊 readAt boolean，效率更高，只用在 DM）。 */
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

/** ROOM / ANNOUNCE 訊息已讀記錄（per-message per-user upsert，給「已讀 N」顯示用）。
 *  回傳 { count, senderId } 讓 caller 把更新 push 給原發訊者更新自己畫面的「已讀 N」。 */
export async function markMessageRead({ userId, messageId }) {
  if (!userId || !messageId) throw new ChatValidationError('chat_bad_request');
  await getPrisma().chatMessageRead.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  });
  const [count, msg] = await Promise.all([
    getPrisma().chatMessageRead.count({ where: { messageId } }),
    getPrisma().chatMessage.findUnique({
      where: { id: messageId },
      select: { senderId: true },
    }),
  ]);
  return { count, senderId: msg?.senderId ?? null };
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
