export function registerSocketHandlers(io) {
  io.on('connection', socket => {
    console.log('connected', socket.id);
    socket.on('disconnect', () => console.log('disconnected', socket.id));
  });
}
