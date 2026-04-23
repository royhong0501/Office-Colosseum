import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSpawnPositions } from '../src/spawns.js';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../src/constants.js';

test('回傳 n 個不重複且在矩形競技場內的座標', () => {
  const halfW = ARENA_WIDTH / 2;
  const halfH = ARENA_HEIGHT / 2;
  for (let n = 2; n <= 8; n++) {
    const spawns = getSpawnPositions(n);
    assert.equal(spawns.length, n);
    const set = new Set(spawns.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
    assert.equal(set.size, n, 'n 個位置應全不重複');
    for (const s of spawns) {
      assert.ok(Math.abs(s.x) < halfW, `spawn x=${s.x} 應在 ±${halfW} 內`);
      assert.ok(Math.abs(s.y) < halfH, `spawn y=${s.y} 應在 ±${halfH} 內`);
    }
  }
});

test('spawn 位置分佈在內縮 0.4× 邊界的橢圓上', () => {
  const rx = ARENA_WIDTH * 0.4;
  const ry = ARENA_HEIGHT * 0.4;
  for (let n = 2; n <= 8; n++) {
    const spawns = getSpawnPositions(n);
    for (const s of spawns) {
      const norm = (s.x / rx) ** 2 + (s.y / ry) ** 2;
      assert.ok(Math.abs(norm - 1) < 1e-9, `spawn (${s.x},${s.y}) 應滿足 (x/${rx})² + (y/${ry})² ≈ 1`);
    }
  }
});
