// BR client-side prediction hook：本地玩家「移動 + 自己射擊」預測 + 對 server 權威結果做 reconciliation。
//
// 高階流程：
//   pushInput(input)   — 每 30Hz tick 由 BattleRoyale 呼叫；本地立即推進 predictedSelf 並可能生 ghost bullet
//   applySnapshot(snap)— 收到 server SNAPSHOT 時呼叫；丟掉已 ack input、重置 predictedSelf 為 server 權威值、
//                        重跑剩下未 ack 的 input（reconciliation）、必要時啟動 lerp 修正、ghost bullet dedupe
//   getRender()        — 60Hz rAF 期間 ArenaBR 呼叫，回傳當下要顯示的 self（含 lerp 修正進度）+ unmatched ghost bullets
//
// 與 server 行為對齊：核心 stepPredictLocal 來自 @office-colosseum/shared/games/br/simulation.js，跟
// server applyInput + resolveTick 共用同一條 movement / fire helpers，所以預測值與 server 計算有最大重合度。
//
// 已知近似：使用 Date.now() 比對 shootCdUntil 等 server 時間欄位，會吃 client/server 時鐘 drift（一般 <50ms）；
// 主要影響「自己 ghost 子彈 vs server bullet 配對」的精度，非邏輯漂移。dash / shield_break 完全交 server 權威。

import { useCallback, useEffect, useRef } from 'react';
import { TICK_MS } from '@office-colosseum/shared';
import {
  stepPredictLocal,
} from '@office-colosseum/shared/src/games/br/simulation.js';
import { expandCovers } from '@office-colosseum/shared/src/games/br/maps.js';
import {
  PREDICTION_CORRECTION_THRESHOLD,
  PREDICTION_CORRECTION_TICKS,
  PREDICTION_GHOST_BULLET_TIMEOUT_MS,
  PREDICTION_INPUT_BUFFER_MAX,
} from '@office-colosseum/shared/src/games/br/constants.js';

const CORRECTION_DUR_MS = PREDICTION_CORRECTION_TICKS * TICK_MS;

export function usePredictionBR({ selfId, mapCovers, initialSelf }) {
  // unackedInputs: [{seq, input}]，照 seq 升冪
  const unackedInputs = useRef([]);
  // predictedSelf: 對齊 server 後再 replay unacked 的「最佳估計」
  const predictedSelf = useRef(initialSelf ? { ...initialSelf } : null);
  // 上一次 getRender 給出的 displayed 位置；給 applySnapshot 算 correction delta 用
  const lastDisplayedX = useRef(initialSelf?.x ?? null);
  const lastDisplayedY = useRef(initialSelf?.y ?? null);
  // ghost bullets：本地預測的子彈，等待 server projectile_spawn 配對
  const ghostBullets = useRef(new Map()); // key = ghostKey (string), value = { id, ownerId, x, y, vx, vy, angle, traveled, spawnedAtMs, expireAt, isGhost: true }
  const nextGhostId = useRef(1);
  // lerp 修正：當 reconciled position 與 displayed 差超過 threshold 時，分散 N tick 補回
  const correction = useRef(null); // { deltaX, deltaY, startMs, durMs }
  // map covers Set；mapCovers 改變才重建
  const coversSet = useRef(null);
  const mapCoversRef = useRef(null);

  // mapCovers 同步進 coversSet
  useEffect(() => {
    if (mapCovers && mapCovers !== mapCoversRef.current) {
      coversSet.current = expandCovers(mapCovers);
      mapCoversRef.current = mapCovers;
    }
  }, [mapCovers]);

  // initialSelf 出現後，若 predictedSelf 還沒初始化就 seed 一次
  useEffect(() => {
    if (initialSelf && !predictedSelf.current) {
      predictedSelf.current = { ...initialSelf };
      lastDisplayedX.current = initialSelf.x;
      lastDisplayedY.current = initialSelf.y;
    }
  }, [initialSelf]);

  /**
   * 30Hz tick 時呼叫：本地立即套用 input 推進 predictedSelf。
   * 回 { ghostBullet? }，BattleRoyale 不需要做任何事（hook 已自動加進 ghostBullets map）。
   */
  const pushInput = useCallback((input) => {
    if (!input || typeof input.seq !== 'number') return { ghostBullet: null };

    // 緩衝（cap）
    unackedInputs.current.push({ seq: input.seq, input });
    while (unackedInputs.current.length > PREDICTION_INPUT_BUFFER_MAX) {
      unackedInputs.current.shift();
    }

    // 沒 covers / 沒 self 就先別預測（fallback：純送 input，等 server snap）
    if (!coversSet.current || !predictedSelf.current) return { ghostBullet: null };

    const now = Date.now();
    const result = stepPredictLocal(predictedSelf.current, input, TICK_MS, coversSet.current, now);

    if (result.ghostBullet) {
      const gKey = `g${nextGhostId.current++}`;
      const ghost = {
        ...result.ghostBullet,
        id: gKey,
        isGhost: true,
        expireAt: now + PREDICTION_GHOST_BULLET_TIMEOUT_MS,
      };
      ghostBullets.current.set(gKey, ghost);
      return { ghostBullet: ghost };
    }

    return { ghostBullet: null };
  }, []);

  /**
   * 收到 SNAPSHOT 時呼叫：reconciliation。
   * snap 必須有 .players[selfId] 與 .acks?.[selfId]；前者沒有就略過、後者沒有就退回「無 prediction」模式
   * （直接把 server me 當 predicted，不 replay）。
   */
  const applySnapshot = useCallback((snap) => {
    if (!snap || !snap.players) return;
    const me = snap.players[selfId];
    if (!me) return;

    const ack = snap.acks?.[selfId];

    // 1. 丟掉已 ack 的 input
    if (typeof ack === 'number') {
      while (unackedInputs.current.length && unackedInputs.current[0].seq <= ack) {
        unackedInputs.current.shift();
      }
    }

    // 2. reconcile：以 server me 為起點 + replay unacked
    const reconciled = { ...me };
    if (coversSet.current && typeof ack === 'number') {
      const now = Date.now();
      for (const { input } of unackedInputs.current) {
        stepPredictLocal(reconciled, input, TICK_MS, coversSet.current, now);
      }
    }

    // 3. 啟動 lerp 修正（若顯示與新 predicted 差太遠）
    const prevX = lastDisplayedX.current;
    const prevY = lastDisplayedY.current;
    if (prevX != null && prevY != null) {
      const dx = reconciled.x - prevX;
      const dy = reconciled.y - prevY;
      const distSq = dx * dx + dy * dy;
      const thr = PREDICTION_CORRECTION_THRESHOLD;
      if (distSq > thr * thr) {
        correction.current = {
          deltaX: dx,
          deltaY: dy,
          startMs: performance.now(),
          durMs: CORRECTION_DUR_MS,
        };
      } else {
        correction.current = null;
      }
    } else {
      correction.current = null;
    }

    predictedSelf.current = reconciled;

    // 4. ghost bullet dedupe — 看 events 內 projectile_spawn ownerId === self 的，配對最近的 ghost
    if (Array.isArray(snap.events)) {
      for (const e of snap.events) {
        if (e.type !== 'projectile_spawn' || e.ownerId !== selfId) continue;
        // 配對：找位置差最近的 ghost（spawn 時 server 看到的 x/y 與 client 預測的 x/y 應接近）
        let bestKey = null;
        let bestDistSq = Infinity;
        for (const [key, g] of ghostBullets.current) {
          const ddx = (e.x ?? 0) - g.x;
          const ddy = (e.y ?? 0) - g.y;
          const d = ddx * ddx + ddy * ddy;
          if (d < bestDistSq) { bestDistSq = d; bestKey = key; }
        }
        if (bestKey != null && bestDistSq < 1.0) ghostBullets.current.delete(bestKey);
      }
    }

    // 5. 過期 ghost bullets（server 拒絕了，或太久沒收到對應 spawn event）
    const now = Date.now();
    for (const [key, g] of ghostBullets.current) {
      if (g.expireAt <= now) ghostBullets.current.delete(key);
    }
  }, [selfId]);

  /**
   * 60Hz 渲染期呼叫：回傳當下要顯示的 self 位置（含 lerp 修正進度）+ unmatched ghost bullets。
   */
  const getRender = useCallback(() => {
    if (!predictedSelf.current) {
      return { displayedSelf: null, ghostBullets: [] };
    }

    let dispX = predictedSelf.current.x;
    let dispY = predictedSelf.current.y;

    if (correction.current) {
      const elapsed = performance.now() - correction.current.startMs;
      const t = Math.min(1, elapsed / correction.current.durMs);
      if (t >= 1) {
        correction.current = null;
      } else {
        const remaining = 1 - t;
        dispX = predictedSelf.current.x - correction.current.deltaX * remaining;
        dispY = predictedSelf.current.y - correction.current.deltaY * remaining;
      }
    }

    lastDisplayedX.current = dispX;
    lastDisplayedY.current = dispY;

    const displayedSelf = { ...predictedSelf.current, x: dispX, y: dispY };

    // 過期 ghost：在這裡也清一次（rAF 比 SNAPSHOT 頻率高，視覺上更早消失）
    const now = Date.now();
    const ghosts = [];
    for (const [key, g] of ghostBullets.current) {
      if (g.expireAt <= now) {
        ghostBullets.current.delete(key);
        continue;
      }
      // 推進 ghost bullet 位置（簡單線性，server 配對前讓視覺看起來在飛）
      const dt = TICK_MS / 1000;
      // 用「自 spawn 累積過幾個 tick」估位移而非依賴 frame dt（避免 rAF jitter 累積誤差）
      const elapsedSec = (now - g.spawnedAtMs) / 1000;
      const fx = g.x + g.vx * elapsedSec;
      const fy = g.y + g.vy * elapsedSec;
      ghosts.push({ ...g, x: fx, y: fy, _renderedAt: now, _dt: dt });
    }

    return { displayedSelf, ghostBullets: ghosts };
  }, []);

  /** 切換新 match / 大幅 reset 時清乾淨。 */
  const reset = useCallback((nextSelf) => {
    unackedInputs.current = [];
    ghostBullets.current = new Map();
    correction.current = null;
    predictedSelf.current = nextSelf ? { ...nextSelf } : null;
    lastDisplayedX.current = nextSelf?.x ?? null;
    lastDisplayedY.current = nextSelf?.y ?? null;
  }, []);

  return { pushInput, applySnapshot, getRender, reset };
}
