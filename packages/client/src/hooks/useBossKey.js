import { useEffect, useState } from 'react';
import { getSocket } from '../net/socket.js';
import { MSG } from '@office-colosseum/shared';

export function useBossKey() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setHidden(v => {
          const next = !v;
          const socket = getSocket();
          if (socket && socket.connected) socket.emit(MSG.PAUSED, { paused: next });
          return next;
        });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return hidden;
}
