import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSpawnPositions } from '../src/spawns.js';
import { ARENA_COLS, ARENA_ROWS } from '../src/constants.js';

test('returns n unique positions within grid', () => {
  for (let n = 2; n <= 8; n++) {
    const spawns = getSpawnPositions(n);
    assert.equal(spawns.length, n);
    const set = new Set(spawns.map(p => `${p.x},${p.y}`));
    assert.equal(set.size, n);
    for (const s of spawns) {
      assert.ok(s.x >= 0 && s.x < ARENA_COLS);
      assert.ok(s.y >= 0 && s.y < ARENA_ROWS);
    }
  }
});
