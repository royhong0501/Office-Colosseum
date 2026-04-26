// 聊天 socket handlers：在 io.on('connection') 內呼叫 registerChatHandlers(io, socket) 接上。
// 公開頻道走 socket.io room 'chat:public'；DM 走 per-user room 'chat:user:<userId>'。
//
// online 名單：在這裡用一個 process 內的 Map<userId, {displayName, sockets:Set}> 維護
// （而不是去 query Redis presence hash 再 join DB），因為 connection / disconnect 在
// 同 process 內已掌握全部資訊，比較直接也避免一次 query。

import { MSG } from '@office-colosseum/shared';
import * as chatService from './services/chatService.js';
import { ChatValidationError } from './services/chatService.js';
import { RateLimitError } from './services/rateLimiter.js';

// userId -> { displayName, sockets: Set<socketId> }
const onlinePresence = new Map();

function presenceList() {
  const list = [];
  for (const [userId, info] of onlinePresence.entries()) {
    if (info.sockets.size > 0) list.push({ userId, displayName: info.displayName });
  }
  return list;
}

function broadcastPresence(io) {
  io.to('chat:public').emit(MSG.CHAT_PRESENCE, { online: presenceList() });
}

function replyChatError(socket, code) {
  socket.emit(MSG.ERROR, { code, msg: code });
}

export function registerChatHandlers(io, socket) {
  const user = socket.data.user;
  if (!user) return;

  // ---- 加入 rooms ----
  socket.join('chat:public');
  socket.join(`chat:user:${user.id}`);

  // ---- 維護 online 名單 ----
  const slot = onlinePresence.get(user.id) ?? { displayName: user.displayName, sockets: new Set() };
  slot.displayName = user.displayName;
  slot.sockets.add(socket.id);
  onlinePresence.set(user.id, slot);
  broadcastPresence(io);

  // ---- 上線推送一次未讀 ----
  chatService.getUnreadCounts({ userId: user.id })
    .then(({ byPeer }) => socket.emit(MSG.CHAT_UNREAD, { byPeer }))
    .catch((e) => console.warn('[chat] getUnreadCounts failed:', e.message));

  // ---- 送訊息 ----
  socket.on(MSG.CHAT_SEND, async (payload) => {
    const { channel, recipientId, content } = payload ?? {};
    try {
      const msg = await chatService.sendMessage({
        senderId: user.id, channel, recipientId, content,
      });
      if (msg.channel === 'public') {
        io.to('chat:public').emit(MSG.CHAT_MSG, msg);
      } else {
        // DM：投遞到收件人個人 room，並且 echo 給自己（保證自己也看到、順序與 server 一致）
        io.to(`chat:user:${msg.recipientId}`).emit(MSG.CHAT_MSG, msg);
        socket.emit(MSG.CHAT_MSG, msg);
      }
    } catch (e) {
      if (e instanceof RateLimitError) replyChatError(socket, 'chat_rate_limited');
      else if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else { console.warn('[chat] send failed:', e.message); replyChatError(socket, 'chat_send_failed'); }
    }
  });

  // ---- 拉歷史 ----
  socket.on(MSG.CHAT_HISTORY_REQ, async (payload) => {
    const { peerId, before, limit } = payload ?? {};
    try {
      const result = peerId
        ? await chatService.getDmHistory({ userId: user.id, peerId, before, limit })
        : await chatService.getPublicHistory({ before, limit });
      socket.emit(MSG.CHAT_HISTORY_RES, { peerId: peerId ?? null, ...result });
    } catch (e) {
      if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else { console.warn('[chat] history failed:', e.message); replyChatError(socket, 'chat_history_failed'); }
    }
  });

  // ---- 標記已讀 ----
  socket.on(MSG.CHAT_READ, async (payload) => {
    const { peerId } = payload ?? {};
    try {
      await chatService.markDmRead({ userId: user.id, peerId });
    } catch (e) {
      if (e instanceof ChatValidationError) replyChatError(socket, e.code);
      else console.warn('[chat] markDmRead failed:', e.message);
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
