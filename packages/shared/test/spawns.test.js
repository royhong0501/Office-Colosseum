import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSpawnPositions } from '../src/spawns.js';
import { ARENA_RADIUS } from '../src/constants.js';

test('回傳 n 個不重複且在圓形競技場內的座標', () => {
  for (let n = 2; n <= 8; n++) {
    const spawns = getSpawnPositions(n);
    assert.equal(spawns.length, n);
    const set = new Set(spawns.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
    assert.equal(set.size, n, 'n 個位置應全不重複');
    for (const s of spawns) {
      const r = Math.hypot(s.x, s.y);
      assert.ok(r < ARENA_RADIUS, `spawn r=${r} 應在 ARENA_RADIUS=${ARENA_RADIUS} 內`);
    }
  }
});

test('spawn 位置分佈在半徑 0.7 × ARENA_RADIUS 的圓周上', () => {
  const expected = ARENA_RADIUS * 0.7;
  for (let n = 2; n <= 8; n++) {
    const spawns = getSpawnPositions(n);
    for (const s of spawns) {
      const r = Math.hypot(s.x, s.y);
      assert.ok(Math.abs(r - expected) < 1e-9, `r=${r} 應 ≈ ${expected}`);
    }
  }
});
