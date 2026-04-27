// SVG 頭頂氣泡，渲染在 Arena viewBox 內、世界座標跟著玩家走。
// 外層 <g> 用 attribute transform 定位，內層 <g> 跑 CSS animation
// （outer transform 不能被 inner CSS animation 覆寫）。
// 動畫 2.5s 飄上 + fade out，animation-fill-mode: forwards 讓結束時保持透明。
//
// 視覺實作選擇：用 text + 白色 stroke + paint-order:stroke 取代 rect 背景。
// 等效於「白底黑字」但寬度自適應顏文字內容（最寬翻桌 11 字）；省去手動量寬度。
// 仍保留三角 tail 維持氣泡視覺。

import { EMOTES } from '@office-colosseum/shared';

// Note: startedAtMs 沒進 props — 動畫由 mount 時的 keyframe `forwards` 控制。
// Arena 那層用 `key={"emote-" + pid + "-" + e.startedAt}` 強制 remount，
// 達成「同 player 後發 emote 重置動畫」的效果。

export default function EmoteBubble({ x, y, slot }) {
  const emote = EMOTES.find(e => e.slot === slot);
  if (!emote) return null;

  return (
    <g transform={`translate(${x}, ${y - 0.85})`}>
      <g style={{
        animation: 'emoteBubbleFloat 2.5s ease-out forwards',
        transformOrigin: 'center',
      }}>
        {/* 白色描邊 + 黑字，視覺上像是白底黑邊 */}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="var(--font-mono, monospace)"
          fontSize="0.42"
          fill="var(--ink, #1a1a1a)"
          stroke="var(--bg-paper, #ffffff)"
          strokeWidth="0.12"
          paintOrder="stroke"
          style={{ userSelect: 'none' }}
        >
          {emote.kaomoji}
        </text>
        {/* 朝下三角 tail */}
        <path
          d="M -0.08 0.2 L 0.08 0.2 L 0 0.32 Z"
          fill="var(--bg-paper, #ffffff)"
          stroke="var(--ink, #1a1a1a)"
          strokeWidth="0.018"
        />
      </g>
    </g>
  );
}
