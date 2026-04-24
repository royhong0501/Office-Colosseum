// 大逃殺 · 地圖選擇（對外身分：Excel「插入地圖」對話框）。
// 改寫自 design/ScreenBattleRoyale.jsx 的 ScreenBattleRoyale_B。

import { useState } from 'react';
import SheetWindow from '../../../components/SheetWindow.jsx';
import {
  MAPS, ARENA_COLS, ARENA_ROWS,
} from '@office-colosseum/shared/src/games/br/index.js';

/* ------------------------------------------------------------
   Mini-map：把一張 map 畫成 ARENA_COLS × ARENA_ROWS 的 SVG 格子圖
   ------------------------------------------------------------ */
function MiniMapForMap({ map, highlightCovers = true }) {
  const coverRects = map.covers.map(([c, r, w, h], i) => (
    <rect
      key={`cv-${i}`}
      x={c} y={r} width={w} height={h}
      fill="var(--accent)"
      opacity={highlightCovers ? 0.75 : 0.45}
      stroke="var(--line)"
      strokeWidth={0.04}
    />
  ));
  // 模擬毒圈邊緣
  const poison = [];
  for (let c = 0; c < ARENA_COLS; c++) {
    poison.push(<rect key={`pt-${c}`} x={c} y={0} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
    poison.push(<rect key={`pb-${c}`} x={c} y={ARENA_ROWS - 1} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
  }
  for (let r = 0; r < ARENA_ROWS; r++) {
    poison.push(<rect key={`pl-${r}`} x={0} y={r} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
    poison.push(<rect key={`pr-${r}`} x={ARENA_COLS - 1} y={r} width={1} height={1} fill="var(--accent-danger)" opacity={0.12} />);
  }
  return (
    <svg
      viewBox={`0 0 ${ARENA_COLS} ${ARENA_ROWS}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', background: 'var(--bg-input)' }}
    >
      {Array.from({ length: ARENA_COLS + 1 }).map((_, i) => (
        <line key={`v-${i}`} x1={i} x2={i} y1={0} y2={ARENA_ROWS} stroke="var(--line-soft)" strokeWidth={0.02} />
      ))}
      {Array.from({ length: ARENA_ROWS + 1 }).map((_, i) => (
        <line key={`h-${i}`} x1={0} x2={ARENA_COLS} y1={i} y2={i} stroke="var(--line-soft)" strokeWidth={0.02} />
      ))}
      {poison}
      {coverRects}
    </svg>
  );
}

export default function MapSelect({ onConfirm, onBack }) {
  const [mapIdx, setMapIdx] = useState(0);
  const [tab, setTab] = useState('all');
  const map = MAPS[mapIdx];

  return (
    <SheetWindow
      fileName="資料清理報告_SHEET-0471.xlsx"
      cellRef="A1"
      formula={
        <>
          <span className="fn">=INSERT.MAP</span>()
          <span style={{ color: 'var(--ink-muted)', marginLeft: 12 }}>// 插入地圖對話框</span>
        </>
      }
      tabs={[
        { id: 'mode', label: '選擇模式' },
        { id: 'br', label: '大逃殺' },
      ]}
      activeTab="br"
      onTabSelect={(id) => { if (id === 'mode') onBack?.(); }}
      statusLeft="就緒 — 插入地圖對話框"
      statusRight="方案 B · 插入圖表對話框"
      fullscreen
    >
      {/* 底層試算表 */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: 'var(--bg-paper)', overflow: 'hidden' }}>
        {/* 欄列 header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px repeat(22, 1fr)',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg-chrome)',
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)',
        }}>
          <div style={{ padding: '3px 0', textAlign: 'center', borderRight: '1px solid var(--line)' }}></div>
          {'ABCDEFGHIJKLMNOPQRSTUV'.split('').map((c) => (
            <div key={c} style={{ padding: '3px 0', textAlign: 'center', borderRight: '1px solid var(--line-soft)' }}>{c}</div>
          ))}
        </div>
        {Array.from({ length: 22 }).map((_, r) => (
          <div key={r} style={{
            display: 'grid',
            gridTemplateColumns: '40px repeat(22, 1fr)',
            borderBottom: '1px solid var(--line-soft)',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)',
            height: 22,
          }}>
            <div style={{ padding: '3px 0', textAlign: 'center', borderRight: '1px solid var(--line)', background: 'var(--bg-chrome)' }}>{r + 1}</div>
            {Array.from({ length: 22 }).map((_, c) => (
              <div key={c} style={{ borderRight: '1px solid var(--line-soft)' }}></div>
            ))}
          </div>
        ))}

        {/* 對話框 overlay */}
        <div style={{
          position: 'absolute',
          top: 34,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 680,
          background: 'var(--bg-paper)',
          border: '1px solid var(--line)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.14)',
          fontSize: 12,
        }}>
          {/* 標題列 */}
          <div style={{
            padding: '7px 10px',
            background: 'var(--bg-chrome)',
            borderBottom: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>插入地圖</span>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'var(--ink-muted)' }}>
              <span>?</span>
              <span style={{ cursor: 'pointer' }} onClick={onBack}>×</span>
            </div>
          </div>

          {/* tabs */}
          <div style={{
            padding: '8px 12px 0',
            borderBottom: '1px solid var(--line)',
            display: 'flex', fontSize: 11.5,
          }}>
            {[['recommended', '建議的地圖'], ['all', '所有地圖']].map(([k, label]) => (
              <div key={k}
                   onClick={() => setTab(k)}
                   style={{
                     padding: '6px 14px',
                     borderTop: tab === k ? '1px solid var(--line)' : '1px solid transparent',
                     borderLeft: tab === k ? '1px solid var(--line)' : '1px solid transparent',
                     borderRight: tab === k ? '1px solid var(--line)' : '1px solid transparent',
                     background: tab === k ? 'var(--bg-paper)' : 'transparent',
                     marginBottom: -1,
                     fontWeight: tab === k ? 600 : 400,
                     cursor: 'pointer',
                   }}>
                {label}
              </div>
            ))}
          </div>

          {/* body */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 360 }}>
            {/* 左側縮圖列 */}
            <div style={{
              borderRight: '1px solid var(--line)',
              background: 'var(--bg-paper)',
              padding: '8px 10px',
              maxHeight: 400,
              overflowY: 'auto',
            }}>
              {MAPS.map((m, i) => (
                <div key={m.id}
                     onClick={() => setMapIdx(i)}
                     style={{
                       marginBottom: 8,
                       padding: 4,
                       border: i === mapIdx ? '2px solid var(--accent-link)' : '1px solid var(--line-soft)',
                       background: 'var(--bg-paper)',
                       cursor: 'pointer',
                     }}>
                  <div style={{ aspectRatio: '20 / 9', background: 'var(--bg-input)', overflow: 'hidden' }}>
                    <MiniMapForMap map={m} />
                  </div>
                  <div style={{
                    fontSize: 9.5, fontFamily: 'var(--font-mono)',
                    color: 'var(--ink-muted)', marginTop: 3,
                    textAlign: 'center', lineHeight: 1.3,
                  }}>
                    MAP {String(i + 1).padStart(2, '0')} · {m.name}
                  </div>
                </div>
              ))}
            </div>

            {/* 右側大預覽 */}
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{map.name}</div>
              <div style={{
                aspectRatio: '20 / 9',
                background: 'var(--bg-paper)',
                border: '1px solid var(--line-soft)',
                marginBottom: 10,
              }}>
                <MiniMapForMap map={map} />
              </div>
              <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 6 }}>
                {map.pitch}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {map.tags.map((t) => (
                  <span key={t} className="mc-tag">{t}</span>
                ))}
              </div>
              <div style={{
                fontSize: 10.5, fontFamily: 'var(--font-mono)',
                color: 'var(--ink-muted)', lineHeight: 1.7,
              }}>
                建議人數：{map.meta['建議人數']} · 掩體：{map.meta['掩體密度']} · 毒圈：{map.meta['毒圈節奏']}
              </div>
            </div>
          </div>

          {/* 底部按鈕 */}
          <div style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg-paper-alt)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>
            <div
              className="btn-cell primary"
              style={{ minWidth: 80 }}
              onClick={() => onConfirm?.(map.id)}
            >
              確定
            </div>
            <div className="btn-cell" style={{ minWidth: 80 }} onClick={onBack}>
              取消
            </div>
          </div>
        </div>
      </div>
    </SheetWindow>
  );
}
