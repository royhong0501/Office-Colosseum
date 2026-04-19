import { ARENA_COLS, ARENA_ROWS } from './constants.js';

const SPAWNS_8 = [
  { x: 0, y: 0 }, { x: ARENA_COLS - 1, y: 0 },
  { x: 0, y: ARENA_ROWS - 1 }, { x: ARENA_COLS - 1, y: ARENA_ROWS - 1 },
  { x: 7, y: 0 }, { x: 8, y: ARENA_ROWS - 1 },
  { x: 0, y: 4 }, { x: ARENA_COLS - 1, y: 5 },
];

export function getSpawnPositions(n) {
  return SPAWNS_8.slice(0, n);
}
