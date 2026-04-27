// BR 輸入捕捉：WASD/方向鍵移動 + 滑鼠 aim + LMB 射擊 held + RMB 舉盾 held + Shift 衝刺 one-shot。
// 回傳 readInput() 每 tick 呼叫一次；dash 是 one-shot 所以讀完清掉。

import { useCallback, useEffect, useRef } from 'react';
import { ARENA_COLS, ARENA_ROWS } from '@office-colosseum/shared/src/games/br/constants.js';

export function useInputBR(arenaRef, selfPosRef) {
  const keys = useRef(new Set());
  const leftDown = useRef(false);
  const rightDown = useRef(false);
  const dashPending = useRef(false);
  const mouseWorld = useRef({ x: 10, y: 4.5 });
  const seq = useRef(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (k === 'shift') dashPending.current = true;
    };
    const onKeyUp = (e) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => {
      keys.current.clear();
      leftDown.current = false;
      rightDown.current = false;
    };
    // window 層的 mouseup 避免滑鼠拖出 arena 後卡住
    const onMouseUp = (e) => {
      if (e.button === 0) leftDown.current = false;
      else if (e.button === 2) rightDown.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // 掛到 arenaRef 上：mousedown / mousemove / contextmenu
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const onMouseDown = (e) => {
      if (e.button === 0) leftDown.current = true;
      else if (e.button === 2) { rightDown.current = true; e.preventDefault(); }
    };
    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      // SVG xMidYMid meet: 算 scale 時取短邊對齊
      const scale = Math.min(rect.width / ARENA_COLS, rect.height / ARENA_ROWS);
      const offsetX = (rect.width - ARENA_COLS * scale) / 2;
      const offsetY = (rect.height - ARENA_ROWS * scale) / 2;
      const wx = (e.clientX - rect.left - offsetX) / scale;
      const wy = (e.clientY - rect.top - offsetY) / scale;
      mouseWorld.current = { x: wx, y: wy };
    };
    const onContextMenu = (e) => e.preventDefault();
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, [arenaRef]);

  // useCallback([], ...) 鎖死 readInput 引用：body 只讀寫 ref，不需要 deps。
  // 父層 BattleRoyale 把它放進 setInterval 的 useEffect deps 裡，引用穩定才不會
  // 每次 snapshot re-render 都把 input timer reset 掉。
  const readInput = useCallback(() => {
    let mx = 0, my = 0;
    if (keys.current.has('w') || keys.current.has('arrowup')) my -= 1;
    if (keys.current.has('s') || keys.current.has('arrowdown')) my += 1;
    if (keys.current.has('a') || keys.current.has('arrowleft')) mx -= 1;
    if (keys.current.has('d') || keys.current.has('arrowright')) mx += 1;

    const self = selfPosRef.current ?? { x: ARENA_COLS / 2, y: ARENA_ROWS / 2 };
    const m = mouseWorld.current;
    const aimAngle = Math.atan2(m.y - self.y, m.x - self.x);

    const dash = dashPending.current;
    dashPending.current = false;

    seq.current += 1;
    return {
      seq: seq.current,
      moveX: mx,
      moveY: my,
      aimAngle,
      attack: leftDown.current,
      shield: rightDown.current,
      dash,
    };
  }, [selfPosRef]);

  return readInput;
}
