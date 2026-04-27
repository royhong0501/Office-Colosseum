// 戰鬥畫面共用：監聽 hold T + 數字 1-6 觸發 emote。
// - hold T 期間 emoteOpen = true，畫面下方 EmoteBar 顯示。
// - hold 期間按 1-6 → 寫入 pendingRef，由父元件每 tick consume()。
// - preventDefault + stopPropagation 在 hold T 期間攔截 1-6，避免 Items 的技能誤觸。
// - input/textarea 有 focus 時整組 disabled（chat composer 不誤觸）。
// - window blur 時 emoteOpen 自動 reset。

import { useCallback, useEffect, useRef, useState } from 'react';

const SLOT_RE = /^Digit[1-6]$/;

export function useEmoteInput() {
  const [emoteOpen, setEmoteOpen] = useState(false);
  const emoteOpenRef = useRef(false);
  const pendingRef = useRef(null);

  // 同步 ref 與 state（事件 handler 用 ref 讀）
  useEffect(() => { emoteOpenRef.current = emoteOpen; }, [emoteOpen]);

  useEffect(() => {
    function isFormFocus(target) {
      if (!target) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    const onKeyDown = (e) => {
      if (isFormFocus(e.target)) return;
      if (e.code === 'KeyT') {
        if (!e.repeat) setEmoteOpen(true);
        return;
      }
      if (emoteOpenRef.current && SLOT_RE.test(e.code)) {
        const slot = parseInt(e.code.slice(-1), 10);
        if (slot >= 1 && slot <= 6) pendingRef.current = slot;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'KeyT') setEmoteOpen(false);
    };
    const onBlur = () => setEmoteOpen(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const consume = useCallback(() => {
    const v = pendingRef.current;
    pendingRef.current = null;
    return v;
  }, []);

  return { emoteOpen, consume };
}
