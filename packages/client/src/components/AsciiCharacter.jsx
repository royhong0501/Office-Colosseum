import React from 'react';
import { excelColors } from '../theme.js';

export default function AsciiCharacter({ character, scale = 1, highlight = false, direction = 1, animating = false }) {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    if (!animating) return;
    const id = setInterval(() => setFrame(f => f + 1), 200);
    return () => clearInterval(id);
  }, [animating]);

  const shake = animating ? (frame % 2 === 0 ? 1 : -1) : 0;

  return React.createElement('pre', {
    style: {
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 11 * scale,
      lineHeight: 1.2,
      color: highlight ? excelColors.accent : excelColors.text,
      textAlign: 'center',
      margin: 0,
      transform: `scaleX(${direction}) translateX(${shake}px)`,
      textShadow: highlight ? `0 0 8px ${character.color}60` : 'none',
      transition: 'transform 0.15s',
    }
  }, character.ascii.join('\n'));
}
