// singleton Lobby + Match，多遊戲平台：Match 依 lobby.gameType 分派。
// （房間管理檔 rooms.js / room.js 仍保留為第二階段多房預留）

import { MSG } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';
import * as records from './records.js';

export function registerSocketHandlers(io) {
  const lobby = new Lobby(io);
  let match = null;

  function replyError(socket, code, msg) {
    socket.emit(MSG.ERROR, { code, msg: msg ?? code });
  }

  io.on('connection', socket => {
    socket.on(MSG.JOIN, ({ name, uuid }) => lobby.join(socket.id, name || 'Player', uuid ?? null));
    socket.on(MSG.GET_RECORDS, () => {
      socket.emit(MSG.RECORDS, records.getSnapshot());
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
    socket.on(MSG.INPUT, input => { if (match) match.queueInput(socket.id, input); });
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
    });
  });
}
