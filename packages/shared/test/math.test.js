import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manhattan, calculateDamage, clamp } from '../src/math.js';

test('manhattan distance', () => {
  assert.equal(manhattan({x:0,y:0}, {x:3,y:4}), 7);
  assert.equal(manhattan({x:5,y:5}, {x:5,y:5}), 0);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test('calculateDamage: deterministic with seeded rng, floor + min 1', () => {
  const atk = { stats: { atk: 50, spc: 80 } };
  const def = { stats: { def: 40 } };
  const rng = () => 0.5; // variance factor = 0.85 + 0.5*0.3 = 1.0
  // base=50, 1-40/120 = 0.6667, 50*0.6667*1.0 = 33.33 → 33
  assert.equal(calculateDamage(atk, def, false, rng), 33);
  // isSkill: base=80, 80*0.6667*1.0 = 53.33 → 53, *1.5 = 79.5 → 79
  assert.equal(calculateDamage(atk, def, true, rng), 79);
});

test('calculateDamage: min 1 when def is huge', () => {
  const atk = { stats: { atk: 1, spc: 1 } };
  const def = { stats: { def: 9999 } };
  assert.equal(calculateDamage(atk, def, false, () => 0), 1);
});
