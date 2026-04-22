import { useEffect, useRef } from 'react';
import { ARENA_RADIUS } from '@office-colosseum/shared';

// 滑鼠 + WASD 混合輸入：
//   WASD / 方向鍵 → moveX/moveY 單位向量（連續移動）
//   滑鼠位置      → aimAngle（相對玩家自己的世界座標）
//   左鍵 held     → attack
//   右鍵 one-shot → skill
export function useInputCapture(arenaRef, selfPosRef) {
  const keys = useRef(new Set());
  const mouseWorld = useRef({ x: 1, y: 0 });      // 預設朝右
  const leftDown = useRef(false);
  const skillPending = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    const kd = e => { keys.current.add(e.key.toLowerCase()); };
    const ku = e => { keys.current.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const arena = arenaRef.current;
    if (!arena) {
      return () => {
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
      };
    }

    const onMouseMove = (e) => {
      const rect = arena.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      if (size <= 0) return;
      // 畫布以中心為原點，ARENA_RADIUS 對應到 size/2 的半徑
      const scale = size / (2 * ARENA_RADIUS);
      mouseWorld.current.x = (e.clientX - rect.left - rect.width / 2) / scale;
      mouseWorld.current.y = (e.clientY - rect.top - rect.height / 2) / scale;
    };
    const onMouseDown = (e) => {
      if (e.button === 0) leftDown.current = true;
      if (e.button === 2) { skillPending.current = true; e.preventDefault(); }
    };
    const onMouseUp = (e) => {
      if (e.button === 0) leftDown.current = false;
    };
    const onContextMenu = (e) => e.preventDefault();

    arena.addEventListener('mousemove', onMouseMove);
    arena.addEventListener('mousedown', onMouseDown);
    arena.addEventListener('mouseup', onMouseUp);
    arena.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      arena.removeEventListener('mousemove', onMouseMove);
      arena.removeEventListener('mousedown', onMouseDown);
      arena.removeEventListener('mouseup', onMouseUp);
      arena.removeEventListener('contextmenu', onContextMenu);
    };
  }, [arenaRef]);

  return () => {
    const k = keys.current;
    let mx = 0, my = 0;
    if (k.has('w') || k.has('arrowup'))    my -= 1;
    if (k.has('s') || k.has('arrowdown'))  my += 1;
    if (k.has('a') || k.has('arrowleft'))  mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;

    const self = selfPosRef?.current ?? { x: 0, y: 0 };
    const aimAngle = Math.atan2(
      mouseWorld.current.y - self.y,
      mouseWorld.current.x - self.x,
    );

    const attack = leftDown.current;
    const skill = skillPending.current;
    skillPending.current = false;

    return { seq: ++seq.current, moveX: mx, moveY: my, aimAngle, attack, skill };
  };
}
