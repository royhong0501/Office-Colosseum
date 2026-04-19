import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, applyInput, resolveTick,
  aliveCount, getWinner
} from '../src/simulation.js';
import { MOVE_COOLDOWN_MS } from '../src/constants.js';
import { ALL_CHARACTERS } from '../src/characters.js';

// use actual character ids from the roster (first two)
const PLAYERS = [
  { id: 'a', characterId: ALL_CHARACTERS[0].id },
  { id: 'b', characterId: ALL_CHARACTERS[1].id },
];

test('createInitialState: 2 players at spawns, full HP, alive', () => {
  const s = createInitialState(PLAYERS);
  assert.equal(Object.keys(s.players).length, 2);
  assert.equal(s.phase, 'playing');
  for (const p of Object.values(s.players)) {
    assert.ok(p.alive);
    assert.equal(p.hp, p.maxHp);
  }
});

test('applyInput: movement respects cooldown', () => {
  let s = createInitialState(PLAYERS);
  const before = { ...s.players.a };
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 1 }, 1000);
  assert.equal(s.players.a.x, before.x + 1);
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 2 }, 1000 + MOVE_COOLDOWN_MS - 10);
  assert.equal(s.players.a.x, before.x + 1);
  s = applyInput(s, 'a', { dir: 'right', attack: false, skill: false, seq: 3 }, 1000 + MOVE_COOLDOWN_MS + 1);
  assert.equal(s.players.a.x, before.x + 2);
});

test('attack: out of range = no damage', () => {
  let s = createInitialState(PLAYERS);
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.equal(s.players.b.hp, bHpBefore);
});

test('attack: in range reduces HP', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = s.players.b.x - 1;
  s.players.a.y = s.players.b.y;
  const bHpBefore = s.players.b.hp;
  s = applyInput(s, 'a', { attack: true, seq: 1 }, 1000);
  assert.ok(s.players.b.hp < bHpBefore);
});

test('HP=0 → alive=false; aliveCount drops; getWinner returns last', () => {
  let s = createInitialState(PLAYERS);
  s.players.b.hp = 0;
  const { state } = resolveTick(s, 1000);
  assert.equal(state.players.b.alive, false);
  assert.equal(aliveCount(state), 1);
  assert.equal(getWinner(state), 'a');
});

test('skill respects cooldown', () => {
  let s = createInitialState(PLAYERS);
  s.players.a.x = s.players.b.x - 1; s.players.a.y = s.players.b.y;
  s = applyInput(s, 'a', { skill: true, seq: 1 }, 1000);
  const afterFirst = s.players.b.hp;
  s = applyInput(s, 'a', { skill: true, seq: 2 }, 1001);
  assert.equal(s.players.b.hp, afterFirst);
});
