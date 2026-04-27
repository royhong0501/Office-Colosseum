// 訂閱 SNAPSHOT 累積目前活著的 emote。
// 內部 state 是 { [playerId]: { slot, startedAt, expiresAt } }。
// 每 frame（rAF）過期清理；event.atMs 來自 server，所以 expiresAt 也是 server 時鐘。
// 為避免 client / server 時鐘漂移過久，過期判定用「Date.now() > expiresAt + tolerance」其實沒必要——
// emote 只活 2.5s，漂移幾百 ms 不影響玩家觀感，直接 client now 比即可。

import { useEffect, useRef, useState } from 'react';
import { MSG } from '@office-colosseum/shared';
import { getSocket } from '../../net/socket.js';

const EMOTE_DURATION_MS = 2500;

export function useEmoteFeed() {
  const [active, setActive] = useState({});
  const activeRef = useRef({});
  const rafRef = useRef(0);

  // 同步 ref 與 state，handler 用 ref 寫
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const socket = getSocket();
    let dirty = false;

    const onSnapshot = (snap) => {
      const events = snap?.events;
      if (!Array.isArray(events) || events.length === 0) return;
      let mutated = null;
      for (const e of events) {
        if (e.kind !== 'emote') continue;
        if (mutated === null) mutated = { ...activeRef.current };
        const startedAt = Number.isFinite(e.atMs) ? e.atMs : Date.now();
        mutated[e.playerId] = {
          slot: e.slot,
          startedAt,
          expiresAt: startedAt + EMOTE_DURATION_MS,
        };
      }
      if (mutated !== null) {
        activeRef.current = mutated;
        dirty = true;
      }
    };

    function tick() {
      const now = Date.now();
      const cur = activeRef.current;
      let removed = null;
      for (const [pid, e] of Object.entries(cur)) {
        if (now > e.expiresAt) {
          if (removed === null) removed = { ...cur };
          delete removed[pid];
        }
      }
      if (removed !== null) {
        activeRef.current = removed;
        dirty = true;
      }
      if (dirty) {
        dirty = false;
        setActive(activeRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    socket.on(MSG.SNAPSHOT, onSnapshot);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      socket.off(MSG.SNAPSHOT, onSnapshot);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return active;
}
