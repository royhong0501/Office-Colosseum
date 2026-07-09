// 五子棋輸入：離散點擊。點一次送一次 INPUT，不像即時制那樣每 tick 送。
// 回傳穩定的 sendPlace(c, r)；輪到誰 / 是否空格的判斷交給呼叫端（有 state 的 GomokuBattle）。
import { useCallback, useRef } from 'react';
import { getSocket } from '../../../net/socket.js';
import { MSG } from '@office-colosseum/shared';

export function useInputGomoku() {
  const seq = useRef(0);
  return useCallback((c, r) => {
    seq.current += 1;
    getSocket().emit(MSG.INPUT, { seq: seq.current, action: 'place', c, r });
  }, []);
}
