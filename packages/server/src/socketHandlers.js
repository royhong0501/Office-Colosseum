import { MSG } from '@office-colosseum/shared';
import { Lobby } from './lobby.js';
import { Match } from './match.js';

export function registerSocketHandlers(io) {
  const lobby = new Lobby(io);
  let match = null;

  io.on('connection', socket => {
    socket.on(MSG.JOIN, ({ name }) => lobby.join(socket.id, name || 'Player'));
    socket.on(MSG.PICK, ({ characterId }) => lobby.pick(socket.id, characterId));
    socket.on(MSG.READY, ({ ready }) => lobby.setReady(socket.id, ready));
    socket.on(MSG.START, () => {
      const p = lobby.players.get(socket.id);
      if (!p?.isHost || !lobby.canStart() || match) return;
      match = new Match(io, [...lobby.players.values()], () => {
        match = null;
        lobby.resetForNewMatch();
      });
      match.start();
    });
    socket.on(MSG.INPUT, input => { if (match) match.queueInput(socket.id, input); });
    socket.on(MSG.PAUSED, ({ paused }) => { if (match) match.setPaused(socket.id, paused); });
    socket.on(MSG.LEAVE, () => lobby.leave(socket.id));
    socket.on('disconnect', () => {
      lobby.leave(socket.id);
      if (match) match.setPaused(socket.id, false);
    });
  });
}
