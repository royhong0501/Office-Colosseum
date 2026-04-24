import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manhattan, euclidean, distSq, clamp } from '../src/math.js';

test('manhattan distance', () => {
  assert.equal(manhattan({x:0,y:0}, {x:3,y:4}), 7);
  assert.equal(manhattan({x:5,y:5}, {x:5,y:5}), 0);
});

test('euclidean distance', () => {
  assert.equal(euclidean({x:0,y:0}, {x:3,y:4}), 5);
  assert.equal(euclidean({x:1,y:1}, {x:1,y:1}), 0);
});

test('distSq', () => {
  assert.equal(distSq({x:0,y:0}, {x:3,y:4}), 25);
  assert.equal(distSq({x:1,y:1}, {x:1,y:1}), 0);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});
