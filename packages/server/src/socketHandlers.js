import { MSG } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';

export function registerSocketHandlers(io) {
  const lobby = new Lobby(io);
  let match = null;

  function replyError(socket, code) {
    socket.emit(MSG.ERROR, { code, msg: code });
  }

  io.on('connection', socket => {
    socket.on(MSG.JOIN, ({ name }) => lobby.join(socket.id, name || 'Player'));
    socket.on(MSG.PICK, ({ characterId }) => lobby.pick(socket.id, characterId));
    socket.on(MSG.READY, ({ ready }) => lobby.setReady(socket.id, ready));
    socket.on(MSG.START, () => {
      const p = lobby.players.get(socket.id);
      const playerDump = [...lobby.players.values()].map(
        x => `${x.id.slice(0, 4)}{host:${x.isHost},ready:${x.ready},char:${x.characterId ?? 'null'}}`,
      ).join(' ');
      if (!p) {
        console.log(`[START] rejected: sender ${socket.id.slice(0, 4)} not in lobby. roster=${playerDump}`);
        socket.emit(MSG.ERROR, { code: 'not_in_lobby', msg: '你不在 lobby 中' });
        return;
      }
      if (!p.isHost) {
        console.log(`[START] rejected: ${p.id.slice(0, 4)} is not host. roster=${playerDump}`);
        socket.emit(MSG.ERROR, { code: 'not_host', msg: '只有 host 能開始' });
        return;
      }
      if (match) {
        console.log(`[START] rejected: match already running. roster=${playerDump}`);
        socket.emit(MSG.ERROR, { code: 'match_running', msg: '已有比賽進行中（server 狀態殘留？請重啟 server）' });
        return;
      }
      if (!lobby.canStart()) {
        console.log(`[START] rejected: canStart false. roster=${playerDump}`);
        socket.emit(MSG.ERROR, { code: 'not_ready', msg: 'canStart 為 false：有人沒準備或沒選角' });
        return;
      }
      console.log(`[START] ok: launching match. roster=${playerDump}`);
      match = new Match(io, [...lobby.players.values()], () => {
        match = null;
        lobby.resetForNewMatch();
      });
      match.start();
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
