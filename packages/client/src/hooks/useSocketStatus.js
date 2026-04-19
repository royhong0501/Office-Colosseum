import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket.js';

export function useSocketStatus() {
  const socket = getSocket();
  const [status, setStatus] = useState(socket.connected ? 'connected' : 'connecting');

  useEffect(() => {
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onError = () => setStatus('error');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, [socket]);

  return status;
}
