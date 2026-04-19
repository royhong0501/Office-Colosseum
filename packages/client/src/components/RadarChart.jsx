import React from 'react';
import { excelColors } from '../theme.js';

export default function RadarChart({ stats, size = 160, color = '#8B7355', label }) {
  const canvasRef = React.useRef(null);
  const labels = ['HP', 'ATK', 'DEF', 'SPD', 'SPC'];
  const maxStat = 130;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2, r = size * 0.38;
    ctx.clearRect(0, 0, size, size);

    // Draw grid
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const rr = r * ring / 4;
        const x = cx + Math.cos(angle) * rr;
        const y = cy + Math.sin(angle) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = excelColors.cellBorder;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Axes
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.strokeStyle = excelColors.cellBorder;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Data
    const values = [stats.hp, stats.atk, stats.def, stats.spd, stats.spc];
    ctx.beginPath();
    values.forEach((v, i) => {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const rr = r * Math.min(v / maxStat, 1);
      const x = cx + Math.cos(angle) * rr;
      const y = cy + Math.sin(angle) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color + '40';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = excelColors.text;
    ctx.textAlign = 'center';
    labels.forEach((lbl, i) => {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const x = cx + Math.cos(angle) * (r + 14);
      const y = cy + Math.sin(angle) * (r + 14) + 3;
      ctx.fillText(`${lbl}:${values[i]}`, x, y);
    });
  }, [stats, size, color]);

  return React.createElement('canvas', { ref: canvasRef, width: size, height: size, style: { display: 'block' } });
}
