// Socket.io entry：handshake middleware 驗 JWT、把 user 寫進 socket.data，
// 之後所有 event handler 都可從 socket.data.user 拿到當前使用者。
//
// 如果連線未帶 token、token 無效、被 revoke 或帳號被停用，handshake 直接失敗，
// client 收到 connect_error 'unauthorized' 並跳回登入頁。

import { MSG } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';
import * as matchService from './services/matchService.js';
import { verifyAndLoad } from './auth/middleware.js';
import { hsetOnline, hdelOnline } from './services/presenceService.js';
import { registerChatHandlers } from './chatHandlers.js';

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

  const lobby = new Lobby(io);
  let match = null;

  function replyError(socket, code, msg) {
    socket.emit(MSG.ERROR, { code, msg: msg ?? code });
  }

  io.on('connection', socket => {
    const user = socket.data.user;
    hsetOnline(user.id, socket.id).catch(() => {});
    registerChatHandlers(io, socket);

    // INPUT rate limit 狀態（per-socket，連線結束自動 GC）
    let inputCount = 0;
    let inputWindowEndsAt = Date.now() + INPUT_WINDOW_MS;
    let inputDropWarnedAt = 0;

    // JOIN 不再相信 client payload；身分一律從 socket.data.user 取
    socket.on(MSG.JOIN, () => lobby.join(socket.id, user));

    socket.on(MSG.GET_RECORDS, async () => {
      try {
        const snapshot = await matchService.getSnapshot();
        socket.emit(MSG.RECORDS, snapshot);
      } catch (e) {
        console.warn('[GET_RECORDS] failed:', e.message);
        replyError(socket, 'records_failed');
      }
    });
    socket.on(MSG.PICK, ({ characterId }) => lobby.pick(socket.id, characterId));
    socket.on(MSG.READY, ({ ready }) => lobby.setReady(socket.id, ready));
    socket.on(MSG.SET_GAME_TYPE, ({ gameType, config }) => {
      if (match) return replyError(socket, 'match_running');
      const r = lobby.setGameType(socket.id, gameType, config);
      if (r.error) replyError(socket, r.error);
    });
    socket.on(MSG.START, () => {
      const p = lobby.players.get(socket.id);
      if (!p) return replyError(socket, 'not_in_lobby', '你不在 lobby 中');
      if (!p.isHost) return replyError(socket, 'not_host', '只有 host 能開始');
      if (match) return replyError(socket, 'match_running', '已有比賽進行中');
      if (!lobby.canStart()) return replyError(socket, 'not_ready', 'canStart 為 false');

      try {
        match = new Match(
          io,
          [...lobby.players.values()],
          lobby.gameType,
          lobby.config,
          () => {
            match = null;
            lobby.resetForNewMatch();
          },
        );
        match.start();
      } catch (err) {
        console.error('[START] failed:', err);
        replyError(socket, 'start_failed', err.message);
        match = null;
      }
    });
    socket.on(MSG.INPUT, input => {
      if (!match) return;
      const now = Date.now();
      if (now >= inputWindowEndsAt) {
        inputCount = 0;
        inputWindowEndsAt = now + INPUT_WINDOW_MS;
      }
      inputCount++;
      if (inputCount > INPUT_RATE_PER_SEC) {
        // 同一 window 只 warn 一次，避免日誌洪水
        if (inputDropWarnedAt < inputWindowEndsAt - INPUT_WINDOW_MS) {
          console.warn(`[input] rate limit exceeded user=${user.username} socket=${socket.id}`);
          inputDropWarnedAt = now;
        }
        return;
      }
      match.queueInput(socket.id, input);
    });
    socket.on(MSG.PAUSED, ({ paused }) => { if (match) match.setPaused(socket.id, paused); });
    socket.on(MSG.LEAVE, () => lobby.leave(socket.id));
    socket.on(MSG.ADD_BOT, () => {
      if (match) return replyError(socket, 'not_in_lobby');
      const result = lobby.addBot(socket.id);
      if (result.error) replyError(socket, result.error);
    });
    socket.on(MSG.REMOVE_BOT, ({ botId }) => {
      if (match) return replyError(socket, 'not_in_lobby');
      const result = lobby.removeBot(socket.id, botId);
      if (result.error) replyError(socket, result.error);
    });
    socket.on('disconnect', () => {
      lobby.leave(socket.id);
      if (match) match.setPaused(socket.id, false);
      hdelOnline(user.id).catch(() => {});
    });

    // Debug overlay 量 RTT 用：client emit 帶 ack，server 立刻回 ack。
    // 不放進 MSG 是因為這純 dev 用，不是公開 protocol。
    socket.on('ping_diag', (_payload, ack) => {
      if (typeof ack === 'function') ack();
    });
  });
}
