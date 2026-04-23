import { useEffect, useRef } from 'react';
import { ARENA_WIDTH, ARENA_HEIGHT } from '@office-colosseum/shared';

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
      if (rect.width <= 0 || rect.height <= 0) return;
      // SVG 用 preserveAspectRatio="xMidYMid meet" → viewBox 等比例置中填入 rect。
      // 以較緊的軸做 scale 與 letterbox 偏移，確保 world (0,0) 對應螢幕中心、邊界與 viewBox 同步。
      const scaleX = rect.width / ARENA_WIDTH;
      const scaleY = rect.height / ARENA_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      mouseWorld.current.x = (e.clientX - rect.left - rect.width / 2) / scale;
      mouseWorld.current.y = (e.clientY - rect.top - rect.height / 2) / scale;
    };
    const onMouseDown = (e) => {
      if (e.button === 0) leftDown.current = true;
      if (e.button === 2) { skillPending.current = true; e.preventDefault(); }
    };
    // mouseup 掛在 window：玩家把滑鼠拖出 arena 放開時也能收到，避免 leftDown 卡住狂打
    const onMouseUp = (e) => {
      if (e.button === 0) leftDown.current = false;
    };
    // 視窗失焦也視為放開（alt-tab、切到老闆鍵）
    const onBlur = () => { leftDown.current = false; };
    const onContextMenu = (e) => e.preventDefault();

    arena.addEventListener('mousemove', onMouseMove);
    arena.addEventListener('mousedown', onMouseDown);
    arena.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      arena.removeEventListener('mousemove', onMouseMove);
      arena.removeEventListener('mousedown', onMouseDown);
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
