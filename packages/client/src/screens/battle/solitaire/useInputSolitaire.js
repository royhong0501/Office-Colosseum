// 接龍輸入：離散動作。抽牌 / 移牌 / 自動歸位，各送一次 INPUT。
import { useCallback, useRef } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';

export function useInputSolitaire() {
  const seq = useRef(0);
  const emit = useCallback((payload) => {
    seq.current += 1;
    getSocket().emit(MSG.INPUT, { seq: seq.current, ...payload });
  }, []);
  const draw = useCallback(() => emit({ action: 'draw' }), [emit]);
  const auto = useCallback(() => emit({ action: 'auto' }), [emit]);
  const moveCard = useCallback((from, to) => emit({ action: 'move', from, to }), [emit]);
  return { draw, auto, moveCard };
}
