// Territory 輸入：只有 WASD。無 aim / 無 attack / 無 skill。
import { useCallback, useEffect, useRef } from 'react';

export function useInputTerritory() {
  const keys = useRef(new Set());
  const seq = useRef(0);

  useEffect(() => {
    const onKeyDown = (e) => keys.current.add(e.key.toLowerCase());
    const onKeyUp = (e) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => keys.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // 穩定引用，避免父層 useEffect 因 readInput 改變被 30Hz 重建 input timer
  const readInput = useCallback(() => {
    let mx = 0, my = 0;
    if (keys.current.has('w') || keys.current.has('arrowup')) my -= 1;
    if (keys.current.has('s') || keys.current.has('arrowdown')) my += 1;
    if (keys.current.has('a') || keys.current.has('arrowleft')) mx -= 1;
    if (keys.current.has('d') || keys.current.has('arrowright')) mx += 1;
    seq.current += 1;
    return { seq: seq.current, moveX: mx, moveY: my, aimAngle: 0 };
  }, []);
  return readInput;
}
