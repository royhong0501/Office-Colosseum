import React from 'react';
import { excelColors } from '../../theme.js';

// Props: { log: Array<string> }
export default function BattleLog({ log }) {
  const visible = log.slice(-8);

  return (
    <div style={{
      borderTop: `2px solid ${excelColors.accent}`,
      background: excelColors.headerBg,
      flexShrink: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Formula-bar header */}
      <div style={{
        padding: '2px 8px',
        borderBottom: `1px solid ${excelColors.cellBorder}`,
        fontSize: 10, fontWeight: 700,
        color: excelColors.accent,
        fontFamily: '"Microsoft JhengHei", Consolas, monospace',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          background: excelColors.accent, color: excelColors.cellBg,
          padding: '0 4px', borderRadius: 2, fontSize: 9, fontWeight: 600,
        }}>fx</span>
        <span>公式記錄 — Battle Log</span>
      </div>

      {/* Log entries */}
      <div style={{
        padding: '2px 8px 4px',
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 10, lineHeight: 1.6,
        display: 'flex', flexDirection: 'column', gap: 0,
        maxHeight: 140, overflowY: 'auto',
      }}>
        {visible.map((entry, i) => {
          const isError = entry.includes('ERROR');
          const isSkill = entry.includes('SKILL');
          const isElim = entry.includes('ELIMINATED');
          let color = excelColors.text;
          if (isError) color = excelColors.redAccent;
          else if (isElim) color = excelColors.redAccent;
          else if (isSkill) color = excelColors.blueAccent;

          return (
            <div key={i} style={{
              color,
              borderBottom: `0.5px solid ${excelColors.cellBorder}22`,
              padding: '1px 0',
              fontWeight: isElim ? 700 : 400,
            }}>{entry}</div>
          );
        })}
      </div>
    </div>
  );
}
