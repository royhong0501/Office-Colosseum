import React from 'react';
import { excelColors } from '../theme.js';

export default function Cell({ children, header, selected, style, onClick }) {
  return React.createElement('div', {
    style: {
      padding: '4px 6px',
      border: `0.5px solid ${excelColors.cellBorder}`,
      background: header ? excelColors.headerBg : selected ? excelColors.selectedCell : 'transparent',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 11,
      color: excelColors.text,
      fontWeight: header ? 600 : 400,
      cursor: onClick ? 'pointer' : 'default',
      userSelect: 'none',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...style,
    },
    onClick,
  }, children);
}
