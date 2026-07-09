// 接龍盤面：stock / waste / 4 foundation / 7 tableau。
// 互動：點來源牌（選取）→ 點目標堆（移動）。移動成功後實體牌「滑行」到目標（push 手感）。
//        點 stock 抽牌；雙擊面朝上頂牌 → 快速歸位 foundation（無滑行）。
// 面朝下的牌只畫牌背（server 不送 identity）。卡面貼近設計稿：白底、角落 pip「7♠」、牌背斜紋。

import { useEffect, useRef, useState } from 'react';
import { SUIT_SYMBOLS, isRed } from '@office-colosseum/shared/src/games/solitaire/constants.js';

const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankLabel = (r) => RANK_LABEL[r] ?? String(r);

const CARD_W = 64;
const CARD_H = 90;
const COVER = 26;          // 疊牌露出高度
const FLIGHT_MS = 620;     // 滑行時長（放慢讓推牌看得清楚）
const PUSHER = 84;         // 推牌小貓尺寸

const RED = '#b83a2c';
const BLK = '#2c241a';
const cardBaseStyle = {
  width: CARD_W, height: CARD_H, boxSizing: 'border-box',
  border: '1px solid #b7ad93', borderRadius: 5,
  background: '#fbf8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.28)',
  fontFamily: 'var(--font-mono)', fontWeight: 700,
  position: 'relative', userSelect: 'none',
};

function CardFace({ card, faceDown, selected, onClick, onDoubleClick, style }) {
  if (faceDown) {
    return (
      <div onClick={onClick} style={{
        ...cardBaseStyle,
        background: 'repeating-linear-gradient(45deg, #6d5f4a 0 5px, #5a4d3a 5px 10px)',
        borderColor: '#4a3f30',
        ...style,
      }} />
    );
  }
  const color = card && isRed(card.s) ? RED : BLK;
  const label = `${rankLabel(card.r)}${SUIT_SYMBOLS[card.s]}`;
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        ...cardBaseStyle,
        color,
        border: selected ? '2px solid var(--accent)' : cardBaseStyle.border,
        boxShadow: selected ? '0 0 0 2px var(--accent), 0 2px 6px rgba(0,0,0,0.35)' : cardBaseStyle.boxShadow,
        cursor: 'pointer',
        ...style,
      }}
    >
      <span style={{ position: 'absolute', top: 4, left: 6, fontSize: 16, lineHeight: 1 }}>{label}</span>
      <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 30, opacity: 0.9 }}>
        {SUIT_SYMBOLS[card.s]}
      </span>
      <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 13, lineHeight: 1, transform: 'rotate(180deg)' }}>{label}</span>
    </div>
  );
}

function EmptySlot({ label, hint, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: CARD_W, height: CARD_H, boxSizing: 'border-box',
      border: `1px dashed ${hint ? 'var(--accent)' : 'rgba(255,255,255,0.5)'}`,
      borderRadius: 5, background: 'rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)', fontSize: 22,
      cursor: 'pointer', userSelect: 'none',
    }}>{label}</div>
  );
}

export default function ArenaSolitaire({ board, phase, pusherUrl, onPushing, onDraw, onAuto, onMove }) {
  const active = phase === 'playing';
  const { stockCount = 0, waste = [], foundations = [[], [], [], []], tableau = [] } = board ?? {};

  const [sel, setSel] = useState(null);       // { pile, col?, row?, idx?, cards }
  const [flight, setFlight] = useState(null); // { cards, x, y, dx, dy, go, key }
  const selRectRef = useRef(null);            // 選取來源牌的螢幕 rect
  const pendingRef = useRef(null);            // { fromRect, toRect, cards } 等 board 確認
  const pendingTimer = useRef(null);
  const flightKey = useRef(0);

  const clearSel = () => { setSel(null); selRectRef.current = null; };
  const sameSel = (a, b) => a && b && a.pile === b.pile && a.col === b.col && a.row === b.row && a.idx === b.idx;

  // board 變動 → 若有等待中的移動，觸發滑行
  useEffect(() => {
    if (!pendingRef.current) return;
    const p = pendingRef.current;
    pendingRef.current = null;
    clearTimeout(pendingTimer.current);
    if (!p.fromRect || !p.toRect) return;
    const key = ++flightKey.current;
    onPushing?.(true);   // 推牌期間隱藏右下角大化身
    setFlight({
      cards: p.cards,
      x: p.fromRect.left, y: p.fromRect.top,
      dx: p.toRect.left - p.fromRect.left,
      dy: p.toRect.top - p.fromRect.top,
      go: false, key,
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFlight((f) => (f && f.key === key ? { ...f, go: true } : f));
    }));
    setTimeout(() => {
      setFlight((f) => (f && f.key === key ? null : f));
      onPushing?.(false);
    }, FLIGHT_MS + 80);
  }, [board]);

  // 送出移動並登記滑行（等 board 確認後才飛，避免非法移動也動畫）
  const doMove = (to, toEl) => {
    if (!sel) return;
    const fromRect = selRectRef.current;
    const toRect = toEl?.getBoundingClientRect?.() ?? null;
    const cards = sel.cards;
    onMove(sel, to);
    pendingRef.current = { fromRect, toRect, cards };
    clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => { pendingRef.current = null; }, 500);
    clearSel();
  };

  const clickStock = () => { if (active) { clearSel(); onDraw(); } };

  const selectCard = (e, source, cards) => {
    selRectRef.current = e.currentTarget.getBoundingClientRect();
    setSel({ ...source, cards });
  };

  // 點一張面朝上的牌
  const onCardClick = (e, source, cards) => {
    if (!active) return;
    if (!sel) { selectCard(e, source, cards); return; }
    if (sameSel(sel, source)) { clearSel(); return; }   // 再點自己 → 取消
    if (source.pile === 'waste') { selectCard(e, source, cards); return; } // waste 不能當目標 → 改選它
    // 其餘視為移到該牌所在的堆
    if (source.pile === 'tableau') doMove({ pile: 'tableau', col: source.col }, e.currentTarget.closest('[data-drop]'));
    else if (source.pile === 'foundation') doMove({ pile: 'foundation' }, e.currentTarget.closest('[data-drop]'));
  };

  const onFoundationClick = (e, idx) => {
    if (!active) return;
    const el = e.currentTarget;
    if (sel) { doMove({ pile: 'foundation' }, el); return; }
    if (foundations[idx]?.length) selectCard(e, { pile: 'foundation', idx }, [foundations[idx][foundations[idx].length - 1]]);
  };

  const onEmptyColClick = (e, col) => {
    if (!active || !sel) return;
    doMove({ pile: 'tableau', col }, e.currentTarget.closest('[data-drop]'));
  };

  const dblToFoundation = (e, source, cards) => {
    if (!active) return;
    // 雙擊快速歸位（無滑行）
    setSel({ ...source, cards });
    selRectRef.current = e.currentTarget.getBoundingClientRect();
    // 直接送，不登記滑行
    onMove({ ...source, cards }, { pile: 'foundation' });
    clearSel();
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, overflow: 'auto',
      background: '#2f6b3d',
      padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 22,
    }}>
      {/* 上排：stock / waste（左）… foundations（右） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div onClick={clickStock} style={{ cursor: active ? 'pointer' : 'default' }}>
            {stockCount > 0 ? <CardFace faceDown /> : <EmptySlot label="↻" onClick={clickStock} />}
          </div>
          {waste.length
            ? <CardFace
                card={waste[waste.length - 1]}
                selected={sameSel(sel, { pile: 'waste' })}
                onClick={(e) => onCardClick(e, { pile: 'waste' }, [waste[waste.length - 1]])}
                onDoubleClick={(e) => dblToFoundation(e, { pile: 'waste' }, [waste[waste.length - 1]])} />
            : <EmptySlot label="" onClick={() => {}} />}
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {foundations.map((f, idx) => (
            <div key={idx} data-drop="foundation" onClick={(e) => onFoundationClick(e, idx)}>
              {f.length
                ? <CardFace card={f[f.length - 1]} selected={sameSel(sel, { pile: 'foundation', idx })} />
                : <EmptySlot label={SUIT_SYMBOLS[idx]} hint={!!sel} />}
            </div>
          ))}
        </div>
      </div>

      {/* tableau 7 列，平均鋪滿寬度 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {tableau.map((col, ci) => (
          <div
            key={ci}
            data-drop={`tableau:${ci}`}
            onClick={(e) => { if (e.target === e.currentTarget) onEmptyColClick(e, ci); }}
            style={{ width: CARD_W, minHeight: CARD_H, position: 'relative' }}
          >
            {col.length === 0 && <EmptySlot label="K" hint={!!sel} onClick={(e) => onEmptyColClick(e, ci)} />}
            {col.map((c, ri) => {
              const inSel = sel?.pile === 'tableau' && sel.col === ci && ri >= sel.row;
              return (
                <div key={ri} style={{ position: 'absolute', top: ri * COVER, left: 0, zIndex: ri }}>
                  <CardFace
                    card={c.faceUp ? c : null}
                    faceDown={!c.faceUp}
                    selected={inSel}
                    onClick={(e) => { e.stopPropagation(); if (c.faceUp) onCardClick(e, { pile: 'tableau', col: ci, row: ri }, col.slice(ri).map(x => ({ s: x.s, r: x.r }))); }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (c.faceUp && ri === col.length - 1) dblToFoundation(e, { pile: 'tableau', col: ci, row: ri }, [{ s: c.s, r: c.r }]); }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 滑行中的浮動牌 + 在牌後方推的小貓（整組一起從來源滑到目標） */}
      {flight && (() => {
        const horiz = Math.abs(flight.dx) >= Math.abs(flight.dy);
        const pushRight = flight.dx >= 0;
        const pushUp = flight.dy < 0;
        // 貓擺在移動方向的「後方」，看起來像推著牌走
        let catPos;
        if (horiz) {
          catPos = { left: pushRight ? -(PUSHER - 20) : CARD_W - 20, top: CARD_H - PUSHER + 16,
            transform: `scaleX(${pushRight ? 1 : -1}) rotate(6deg)` };
        } else {
          catPos = { left: CARD_W / 2 - PUSHER / 2, top: pushUp ? CARD_H - 24 : -(PUSHER - 24), transform: 'rotate(0deg)' };
        }
        return (
          <div
            key={flight.key}
            style={{
              position: 'fixed', left: flight.x, top: flight.y,
              transform: flight.go ? `translate(${flight.dx}px, ${flight.dy}px)` : 'translate(0,0)',
              transition: `transform ${FLIGHT_MS}ms cubic-bezier(.3,0,.3,1)`,
              pointerEvents: 'none', zIndex: 9999,
            }}
          >
            {/* 推牌的小貓（在牌後方） */}
            {pusherUrl && (
              <img
                src={pusherUrl} alt="" width={PUSHER} height={PUSHER} draggable={false}
                style={{ position: 'absolute', ...catPos, imageRendering: 'pixelated', transformOrigin: 'center bottom',
                  filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.4))' }}
              />
            )}
            {flight.cards.map((c, i) => (
              <div key={i} style={{ position: 'absolute', top: i * COVER, left: 0 }}>
                <CardFace card={c} style={{ boxShadow: '0 6px 14px rgba(0,0,0,0.4)' }} />
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
