// Items 輸入：WASD 移動 + 滑鼠 aim + LMB held 射擊 + 1–5 one-shot 施技能。
import { useCallback, useEffect, useRef } from 'react';
import {
  ARENA_COLS, ARENA_ROWS, SKILL_KEYS,
} from '@office-colosseum/shared/src/games/items/index.js';

export function useInputItems(arenaRef, selfPosRef) {
  const keys = useRef(new Set());
  const leftDown = useRef(false);
  const pendingSkill = useRef(null);
  const mouseWorld = useRef({ x: ARENA_COLS / 2, y: ARENA_ROWS / 2 });
  const seq = useRef(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      // 數字鍵 1~5 對應 freeze / undo / merge / readonly / validate
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        pendingSkill.current = SKILL_KEYS[idx] ?? null;
      }
    };
    const onKeyUp = (e) => keys.current.delete(e.key.toLowerCase());
    const onBlur = () => { keys.current.clear(); leftDown.current = false; };
    const onMouseUp = (e) => { if (e.button === 0) leftDown.current = false; };
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

  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const onMouseDown = (e) => { if (e.button === 0) leftDown.current = true; };
    const onMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      const scale = Math.min(rect.width / ARENA_COLS, rect.height / ARENA_ROWS);
      const offsetX = (rect.width - ARENA_COLS * scale) / 2;
      const offsetY = (rect.height - ARENA_ROWS * scale) / 2;
      mouseWorld.current = {
        x: (e.clientX - rect.left - offsetX) / scale,
        y: (e.clientY - rect.top - offsetY) / scale,
      };
    };
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mousemove', onMouseMove);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mousemove', onMouseMove);
    };
  }, [arenaRef]);

  // 穩定引用，避免父層 useEffect 因 readInput 改變被 30Hz 重建 input timer
  const readInput = useCallback(() => {
    let mx = 0, my = 0;
    if (keys.current.has('w') || keys.current.has('arrowup')) my -= 1;
    if (keys.current.has('s') || keys.current.has('arrowdown')) my += 1;
    if (keys.current.has('a') || keys.current.has('arrowleft')) mx -= 1;
    if (keys.current.has('d') || keys.current.has('arrowright')) mx += 1;

    const self = selfPosRef.current ?? { x: ARENA_COLS / 2, y: ARENA_ROWS / 2 };
    const m = mouseWorld.current;
    const aimAngle = Math.atan2(m.y - self.y, m.x - self.x);

    const skill = pendingSkill.current;
    pendingSkill.current = null;

    seq.current += 1;
    return {
      seq: seq.current,
      moveX: mx, moveY: my,
      aimAngle,
      attack: leftDown.current,
      skill,
    };
  }, [selfPosRef]);
  return readInput;
}
