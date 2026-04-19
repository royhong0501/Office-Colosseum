import React from 'react';
import { excelColors } from '../theme.js';

export default function CellGrid({ children, cols, style }) {
  return React.createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns: cols || 'repeat(auto-fill, minmax(120px, 1fr))',
      border: `1px solid ${excelColors.cellBorder}`,
      background: excelColors.cellBg,
      ...style,
    }
  }, children);
}
