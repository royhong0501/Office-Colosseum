// 踩地雷輸入：離散點擊。左鍵翻開、右鍵插旗，各送一次 INPUT。
import { useCallback, useRef } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';

export function useInputMinesweeper() {
  const seq = useRef(0);
  const send = useCallback((action, c, r) => {
    seq.current += 1;
    getSocket().emit(MSG.INPUT, { seq: seq.current, action, c, r });
  }, []);
  const reveal = useCallback((c, r) => send('reveal', c, r), [send]);
  const flag = useCallback((c, r) => send('flag', c, r), [send]);
  return { reveal, flag };
}
