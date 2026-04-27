// 聊天 socket handlers：在 io.on('connection') 內呼叫 registerChatHandlers(io, socket, deps) 接上。
//
// channel 廣播 scope：
//   public   → io.to('chat:public')                — 全站
//   announce → io.to('chat:public')                — 全站可讀，但寫權限只有 ADMIN
//   room     → io.to(`chat:room:${roomId}`)        — 限該 room 的玩家 + 觀戰者
//   dm       → io.to(`chat:user:${recipientId}`)   + sender echo
//
// 上線名單（presence）：用 process 內 Map<userId, {displayName, sockets, status}> 維護 + 透過
// `setPresenceStatus(userId, status)` 改 status 並廣播；socketHandlers 進房 / 離房 / 對戰
// 結束時呼叫此 setter。

import { MSG } from '@office-colosseum/shared';
import * as defaultChatService from './services/chatService.js';
import { ChatValidationError } from './services/chatService.js';
import { RateLimitError } from './services/rateLimiter.js';

// userId -> { displayName, sockets: Set<socketId>, status: 'online' | 'in_match' }
const onlinePresence = new Map();
let cachedIo = null;

function presenceList() {
  const list = [];
  for (const [userId, info] of onlinePresence.entries()) {
    if (info.sockets.size > 0) {
      list.push({ userId, displayName: info.displayName, status: info.status ?? 'online' });
    }
  }
  return list;
}

function broadcastPresence(io) {
  io.to('chat:public').emit(MSG.CHAT_PRESENCE, { users: presenceList() });
}

/** socketHandlers 進房時呼叫 'in_match'、離房 / match end 呼叫 'online'。 */
export function setPresenceStatus(userId, status) {
  const slot = onlinePresence.get(userId);
  if (!slot) return;
  if (slot.status === status) return;
  slot.status = status;
  if (cachedIo) broadcastPresence(cachedIo);
}

function replyChatError(socket, code) {
  socket.emit(MSG.ERROR, { code, msg: code });
}

function broadcastNewMessage(io, socket, msg) {
  if (msg.channel === 'public' || msg.channel === 'announce') {
    io.to('chat:public').emit(MSG.CHAT_MSG, msg);
  } else if (msg.channel === 'room') {
    io.to(`chat:room:${msg.roomId}`).emit(MSG.CHAT_MSG, msg);
  } else if (msg.channel === 'dm') {
    io.to(`chat:user:${msg.recipientId}`).emit(MSG.CHAT_MSG, msg);
    socket.emit(MSG.CHAT_MSG, msg);  // echo 給寄件者
  }
}

function notifyMentions(io, mentionUserIds, msg) {
  for (const uid of mentionUserIds) {
    if (uid === msg.senderId) continue;   // 提及自己不通知
    io.to(`chat:user:${uid}`).emit(MSG.CHAT_MENTION_NOTIFY, {
      messageId: msg.id,
      channel: msg.channel,
      roomId: msg.roomId,
      senderName: msg.senderName,
      content: msg.content,
    });
  }
}

// roomManager 是 server runtime 物件，給 ROOM channel 驗 membership 用
export function registerChatHandlers(io, socket, deps = {}) {
  const chatService = deps.chatService ?? defaultChatService;
  const roomManager = deps.roomManager ?? null;
  cachedIo = io;
  const user = socket.data.user;
  if (!user) return;

  // ---- 加入 rooms（chat:public 全部人都進；chat:user:<id> 個人 DM 信箱） ----
  socket.join('chat:public');
  socket.join(`chat:user:${user.id}`);

  // ---- 維護 online 名單 ----
  const slot = onlinePresence.get(user.id) ?? {
    displayName: user.displayName, sockets: new Set(), status: 'online',
  };
  slot.displayName = user.displayName;
  slot.sockets.add(socket.id);
  if (!slot.status) slot.status = 'online';
  onlinePresence.set(user.id, slot);
  broadcastPresence(io);

  // ---- 上線推送一次 DM 未讀 ----
  chatService.getUnreadCounts({ userId: user.id })
    .then(({ byPeer }) => socket.emit(MSG.CHAT_UNREAD, { byPeer }))
    .catch((e) => console.warn('[chat] getUnreadCounts failed:', e.message));

  // ---- 送訊息 ----
  socket.on(MSG.CHAT_SEND, async (payload) => {
    const { channel, recipientId, roomId, content, replyToId } = payload ?? {};
    try {
      // ANNOUNCE：限 ADMIN
      if (channel === 'announce' && user.role !== 'ADMIN') {
        return replyChatError(socket, 'chat_announce_forbidden');
      }
      // ROOM：sender 必須在該房（玩家或觀戰）
      if (channel === 'room') {
        if (!roomId) return replyChatError(socket, 'chat_room_required');
        if (roomManager) {
          const inRoom = roomManager.getRoomForSocket(socket.id);
          const spectating = roomManager.getSpectatedRoom(socket.id);
          if (inRoom?.id !== roomId && spectating?.id !== roomId) {
            return replyChatError(socket, 'chat_room_not_member');
          }
        }
      }

      const msg = await chatService.sendMessage({
        senderId: user.id, channel, recipientId, roomId, content, replyToId,
      });
      broadcastNewMessage(io, socket, msg);
      if (msg.mentions?.length) notifyMentions(io, msg.mentions, msg);
    } catch (e) {
      if (e instanceof RateLimitError) replyChatError(socket, 'chat_rate_limited');
      else if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else { console.warn('[chat] send failed:', e.message); replyChatError(socket, 'chat_send_failed'); }
    }
  });

  // ---- 拉歷史 ----
  socket.on(MSG.CHAT_HISTORY_REQ, async (payload) => {
    const { channel = 'public', peerId, roomId, before, limit } = payload ?? {};
    try {
      let result;
      if (channel === 'dm') {
        if (!peerId) return replyChatError(socket, 'chat_bad_request');
        result = await chatService.getDmHistory({ userId: user.id, peerId, before, limit });
      } else if (channel === 'announce') {
        result = await chatService.getAnnounceHistory({ before, limit });
      } else if (channel === 'room') {
        if (!roomId) return replyChatError(socket, 'chat_bad_request');
        result = await chatService.getRoomHistory({ roomId, before, limit });
      } else {
        result = await chatService.getPublicHistory({ before, limit });
      }
      socket.emit(MSG.CHAT_HISTORY_RES, {
        channel, peerId: peerId ?? null, roomId: roomId ?? null, ...result,
      });
    } catch (e) {
      if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else { console.warn('[chat] history failed:', e.message); replyChatError(socket, 'chat_history_failed'); }
    }
  });

  // ---- 標記已讀 ----
  // DM：{ peerId } → 把該 peer 寄給我的所有 DM 標已讀
  // ROOM/ANNOUNCE：{ messageId } → 寫一筆 ChatMessageRead，回傳 readByCount
  socket.on(MSG.CHAT_READ, async (payload) => {
    const { peerId, messageId } = payload ?? {};
    try {
      if (peerId) {
        await chatService.markDmRead({ userId: user.id, peerId });
      } else if (messageId) {
        const { count, senderId } = await chatService.markMessageRead({
          userId: user.id, messageId,
        });
        // push 給原發訊者更新自己畫面的「已讀 N」
        if (senderId && senderId !== user.id) {
          io.to(`chat:user:${senderId}`).emit(MSG.CHAT_MSG_READ_UPDATE, {
            messageId, count,
          });
        }
      }
    } catch (e) {
      if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else console.warn('[chat] markRead failed:', e.message);
    }
  });

  // ---- disconnect 清掉 presence slot ----
  socket.on('disconnect', () => {
    const cur = onlinePresence.get(user.id);
    if (!cur) return;
    cur.sockets.delete(socket.id);
    if (cur.sockets.size === 0) onlinePresence.delete(user.id);
    broadcastPresence(io);
  });
}
