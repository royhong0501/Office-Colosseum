// Socket.io entry：handshake middleware 驗 JWT、把 user 寫進 socket.data，
// 之後所有 event handler 都可從 socket.data.user 拿到當前使用者。
//
// 多房模式：連線時 attachToHall + sendListTo，玩家可選擇 CREATE_ROOM / JOIN_ROOM。
// 進房後 PICK / READY / SET_GAME_TYPE / START / INPUT 等都對應到「該 socket 所在的 room」。
//
// 如果連線未帶 token、token 無效、被 revoke 或帳號被停用，handshake 直接失敗，
// client 收到 connect_error 'unauthorized' 並跳回登入頁。

import { MSG } from '@office-colosseum/shared';
import { RoomManager } from './rooms.js';
import * as matchService from './services/matchService.js';
import { verifyAndLoad } from './auth/middleware.js';
import { hsetOnline, hdelOnline } from './services/presenceService.js';
import { registerChatHandlers, setPresenceStatus } from './chatHandlers.js';

// INPUT 事件用 in-memory per-socket 滑窗。30Hz 預期 30/s，給 3x buffer 容許小爆量；
// 超過此上限直接 drop（不回 ERROR — 避免被攻擊者拿來做訊號），日誌只在 windows 之間 warn 一次。
const INPUT_RATE_PER_SEC = 90;
const INPUT_WINDOW_MS = 1000;

export function registerSocketHandlers(io) {
  // === handshake auth middleware ===
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    try {
      const { user } = await verifyAndLoad(token);
      socket.data.user = {
        id: user.id, username: user.username, role: user.role, displayName: user.displayName,
      };
      next();
    } catch (e) {
      next(new Error('unauthorized:' + e.message));
    }
  });

  const roomManager = new RoomManager(io);

  function replyError(socket, code, msg) {
    socket.emit(MSG.ERROR, { code, msg: msg ?? code });
  }
  function getRoom(socket) {
    return roomManager.getRoomForSocket(socket.id);
  }

  io.on('connection', socket => {
    const user = socket.data.user;
    hsetOnline(user.id, socket.id).catch(() => {});
    registerChatHandlers(io, socket, { roomManager });

    // 連線時自動入大廳頻道並送一次當前房間列表
    roomManager.attachToHall(socket);
    roomManager.sendListTo(socket);

    // INPUT rate limit 狀態（per-socket，連線結束自動 GC）
    let inputCount = 0;
    let inputWindowEndsAt = Date.now() + INPUT_WINDOW_MS;
    let inputDropWarnedAt = 0;

    // ---- 大廳事件 ----
    socket.on(MSG.LIST_ROOMS, () => roomManager.sendListTo(socket));

    socket.on(MSG.CREATE_ROOM, (payload) => {
      const r = roomManager.createRoom(socket, payload);
      if (r.error) replyError(socket, r.error);
      // joinRoom 內部會 emit ROOM_JOINED 給該 socket
    });

    socket.on(MSG.JOIN_ROOM, ({ roomId, password } = {}) => {
      const r = roomManager.joinRoom(socket, roomId, { password });
      if (r.error) replyError(socket, r.error);
    });

    socket.on(MSG.LEAVE_ROOM, () => {
      const r = roomManager.leaveRoom(socket);
      if (r?.error) replyError(socket, r.error);
    });

    socket.on(MSG.SPECTATE_ROOM, ({ roomId } = {}) => {
      const r = roomManager.spectate(socket, roomId);
      if (r.error) return replyError(socket, r.error);
      // 立即把當前 match state 推給觀戰者，後續走房內 SNAPSHOT 流
      const payload = r.room.match?.getSpectatorInitPayload();
      if (payload) socket.emit(MSG.SPECTATE_INIT, payload);
    });

    socket.on(MSG.SPECTATE_LEAVE, () => roomManager.unspectate(socket));

    // ---- 房內事件（玩家身份才有效）----
    // JOIN：進房後讓 client 主動 emit JOIN，server 把 socket 寫進 room.lobby.players
    socket.on(MSG.JOIN, () => {
      const room = getRoom(socket);
      if (!room) return replyError(socket, 'not_in_room');
      const r = room.lobby.join(socket.id, user);
      if (r?.error) replyError(socket, r.error);
    });

    socket.on(MSG.GET_RECORDS, async () => {
      try {
        const snapshot = await matchService.getSnapshot();
        socket.emit(MSG.RECORDS, snapshot);
      } catch (e) {
        console.warn('[GET_RECORDS] failed:', e.message);
        replyError(socket, 'records_failed');
      }
    });

    socket.on(MSG.PICK, ({ characterId } = {}) => {
      const room = getRoom(socket);
      if (!room) return;
      room.lobby.pick(socket.id, characterId);
    });

    socket.on(MSG.READY, ({ ready } = {}) => {
      const room = getRoom(socket);
      if (!room) return;
      room.lobby.setReady(socket.id, ready);
    });

    socket.on(MSG.SET_GAME_TYPE, ({ gameType, config } = {}) => {
      const room = getRoom(socket);
      if (!room) return replyError(socket, 'not_in_room');
      if (room.match) return replyError(socket, 'match_running');
      const r = room.lobby.setGameType(socket.id, gameType, config);
      if (r.error) replyError(socket, r.error);
      else {
        // 同步 room 的 mode / mapId（影響大廳列表顯示）
        room.mode = gameType;
        room.mapId = config?.mapId ?? null;
        roomManager.broadcastList();
      }
    });

    socket.on(MSG.START, () => {
      const room = getRoom(socket);
      if (!room) return replyError(socket, 'not_in_room');
      const p = room.lobby.players.get(socket.id);
      if (!p) return replyError(socket, 'not_in_lobby', '你不在 lobby 中');
      if (!p.isHost) return replyError(socket, 'not_host', '只有 host 能開始');
      if (room.match) return replyError(socket, 'match_running', '已有比賽進行中');
      if (!room.lobby.canStart()) return replyError(socket, 'not_ready', 'canStart 為 false');

      const realPlayerIds = [...room.lobby.players.values()]
        .filter((p) => !p.isBot && p.userId)
        .map((p) => p.userId);
      const r = room.startMatch(() => {
        // match end → 玩家狀態回到 online、大廳列表也刷
        for (const uid of realPlayerIds) setPresenceStatus(uid, 'online');
        roomManager.broadcastList();
      });
      if (r.error) {
        console.error('[START] failed:', r.error);
        replyError(socket, 'start_failed', r.error);
      } else {
        // match 開打 → 所有真人變 in_match
        for (const uid of realPlayerIds) setPresenceStatus(uid, 'in_match');
        roomManager.broadcastList();   // status 翻為 playing
      }
    });

    socket.on(MSG.INPUT, input => {
      const room = getRoom(socket);
      if (!room || !room.match) return;
      const now = Date.now();
      if (now >= inputWindowEndsAt) {
        inputCount = 0;
        inputWindowEndsAt = now + INPUT_WINDOW_MS;
      }
      inputCount++;
      if (inputCount > INPUT_RATE_PER_SEC) {
        if (inputDropWarnedAt < inputWindowEndsAt - INPUT_WINDOW_MS) {
          console.warn(`[input] rate limit exceeded user=${user.username} socket=${socket.id}`);
          inputDropWarnedAt = now;
        }
        return;
      }
      room.match.queueInput(socket.id, input);
    });

    socket.on(MSG.PAUSED, ({ paused } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.match) return;
      room.match.setPaused(socket.id, paused);
    });

    socket.on(MSG.LEAVE, () => {
      // 沿用舊 API：等同 LEAVE_ROOM
      const r = roomManager.leaveRoom(socket);
      if (r?.error) replyError(socket, r.error);
    });

    socket.on(MSG.ADD_BOT, () => {
      const room = getRoom(socket);
      if (!room) return replyError(socket, 'not_in_room');
      if (room.match) return replyError(socket, 'match_running');
      const result = room.lobby.addBot(socket.id);
      if (result.error) replyError(socket, result.error);
    });

    socket.on(MSG.REMOVE_BOT, ({ botId } = {}) => {
      const room = getRoom(socket);
      if (!room) return replyError(socket, 'not_in_room');
      if (room.match) return replyError(socket, 'match_running');
      const result = room.lobby.removeBot(socket.id, botId);
      if (result.error) replyError(socket, result.error);
    });

    socket.on('disconnect', () => {
      roomManager.handleDisconnect(socket);
      hdelOnline(user.id).catch(() => {});
    });

    // Debug overlay 量 RTT 用：client emit 帶 ack，server 立刻回 ack。
    socket.on('ping_diag', (_payload, ack) => {
      if (typeof ack === 'function') ack();
    });
  });
}
