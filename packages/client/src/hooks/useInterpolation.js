// Snapshot interpolation：把 server 30Hz 送來的 entity 位置在 60Hz 螢幕上補成平滑動畫。
//
// 設計：
// - useRafTick：強制呼叫者每幀 re-render（rAF 驅動）。Arena 內部跑這個。
// - useTrackSnapshot：在 render 期間追蹤一個 prop 的「上一個」與「目前」snapshot ref，
//   並記下 currAt（目前 snapshot 抵達時間）。同步更新（渲染同 frame 即可讀新值）。
// - lerpT(currAt)：算出當前 frame 對應 t ∈ [0,1]。
// - interpolateMap / interpolateList：對 entity 的 x/y 做 lerp，其他欄位保留 curr 值。
//
// 注意：視覺位置會比 server 真實位置慢一個 tick (33ms)。傷害 / 命中 / 規則判定永遠
// 在 server 算，命中對 client 看到的是過去的位置，不影響玩法公平性。
//
// teleport 處理：兩 snapshot 之間距離 > 3 cells 視為瞬移，直接顯示 curr，不做 lerp，
// 否則玩家會看到角色「滑」過半張地圖。BR dash 通常 2 cell（不會超過），items
// validate trap 隨機傳送會超過。

import { useEffect, useRef, useState } from 'react';
import { TICK_MS } from '@office-colosseum/shared';

const TELEPORT_DIST_SQ = 9; // (3 cells)^2

/** 強制 60Hz re-render 的 hook，靠 requestAnimationFrame。Arena 元件呼叫一次即可。 */
export function useRafTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setN(n => (n + 1) | 0);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);
}

/**
 * 追蹤 value 的 prev/curr ref + 抵達時間戳。
 * 在 render 中同步更新（沒走 useEffect，避免延遲一幀）。
 * 由於只動 ref、且更新條件純粹是引用比對，這個 in-render 副作用是 React 安全的常見模式。
 */
export function useTrackSnapshot(value) {
  const prevRef = useRef(null);
  const currRef = useRef(value);
  const currAtRef = useRef(performance.now());
  if (currRef.current !== value) {
    prevRef.current = currRef.current;
    currRef.current = value;
    currAtRef.current = performance.now();
  }
  return { prev: prevRef.current, curr: currRef.current, currAt: currAtRef.current };
}

/** 算當前 frame 在「上一 snapshot → 目前 snapshot」之間的進度 t ∈ [0,1]。 */
export function lerpT(currAt) {
  const elapsed = performance.now() - currAt;
  if (elapsed <= 0) return 0;
  if (elapsed >= TICK_MS) return 1;
  return elapsed / TICK_MS;
}

/** 補幀 keyed-by-id 的 entity 集合（players）。回傳新 object，每個 entity 是新 obj。 */
export function interpolateMap(prev, curr, t) {
  if (!curr) return {};
  if (!prev || t >= 1) return curr;
  const out = {};
  for (const id in curr) {
    const c = curr[id];
    const p = prev[id];
    if (!p) { out[id] = c; continue; }
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > TELEPORT_DIST_SQ) {
      out[id] = c;
    } else {
      out[id] = { ...c, x: p.x + dx * t, y: p.y + dy * t };
    }
  }
  return out;
}

/** 補幀 array of entity（bullets）。以 id 比對。 */
export function interpolateList(prev, curr, t) {
  if (!curr) return [];
  if (!prev || t >= 1) return curr;
  const prevById = new Map();
  for (const e of prev) prevById.set(e.id, e);
  return curr.map(c => {
    const p = prevById.get(c.id);
    if (!p) return c;
    const dx = c.x - p.x, dy = c.y - p.y;
    if (dx * dx + dy * dy > TELEPORT_DIST_SQ) return c;
    return { ...c, x: p.x + dx * t, y: p.y + dy * t };
  });
}
