// Pixel canvas helper: draws pixelated shapes onto a small canvas.
// ESM 版（原設計稿的 window.Pix 改為 export）。
export class Pix {
  constructor(size = 40) {
    this.size = size;
    this.canvas = document.createElement("canvas");
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
  }
  clear() { this.ctx.clearRect(0, 0, this.size, this.size); }
  px(x, y, color) { if (!color) return; this.ctx.fillStyle = color; this.ctx.fillRect(x | 0, y | 0, 1, 1); }
  rect(x, y, w, h, color) { if (!color) return; this.ctx.fillStyle = color; this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  circle(cx, cy, r, color) {
    if (!color) return;
    this.ctx.fillStyle = color;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * 0.3) this.ctx.fillRect(cx + x, cy + y, 1, 1);
  }
  ellipse(cx, cy, rx, ry, color) {
    if (!color) return;
    this.ctx.fillStyle = color;
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const v = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (v <= 1.02) this.ctx.fillRect(cx + x, cy + y, 1, 1);
      }
  }
  triangle(x1, y1, x2, y2, x3, y3, color) {
    if (!color) return;
    this.ctx.fillStyle = color;
    const minX = Math.min(x1, x2, x3) | 0, maxX = Math.max(x1, x2, x3) | 0;
    const minY = Math.min(y1, y2, y3) | 0, maxY = Math.max(y1, y2, y3) | 0;
    const sign = (px, py, ax, ay, bx, by) =>
      (px - bx) * (ay - by) - (ax - bx) * (py - by);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x + 0.5, y + 0.5, x1, y1, x2, y2);
        const d2 = sign(x + 0.5, y + 0.5, x2, y2, x3, y3);
        const d3 = sign(x + 0.5, y + 0.5, x3, y3, x1, y1);
        const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(neg && pos)) this.ctx.fillRect(x, y, 1, 1);
      }
  }
  outline(color) {
    const img = this.ctx.getImageData(0, 0, this.size, this.size);
    const d = img.data;
    const s = this.size;
    const filled = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) filled[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    const n = color.startsWith("#") ? color.slice(1) : color;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    const next = new Uint8ClampedArray(d);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const idx = y * s + x;
        if (filled[idx]) continue;
        const has =
          (x > 0 && filled[idx - 1]) || (x < s - 1 && filled[idx + 1]) ||
          (y > 0 && filled[idx - s]) || (y < s - 1 && filled[idx + s]);
        if (has) { next[idx * 4] = r; next[idx * 4 + 1] = g; next[idx * 4 + 2] = b; next[idx * 4 + 3] = 255; }
      }
    this.ctx.putImageData(new ImageData(next, s, s), 0, 0);
  }
}
