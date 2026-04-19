import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARACTERS, getCharacterById } from '../src/characters.js';

test('exactly 20 characters', () => {
  assert.equal(ALL_CHARACTERS.length, 20);
});

test('every character has required fields', () => {
  for (const c of ALL_CHARACTERS) {
    assert.ok(c.id && c.name && c.type && c.stats);
    assert.ok(typeof c.stats.hp === 'number' && c.stats.hp > 0);
    assert.ok(typeof c.stats.atk === 'number');
    assert.ok(typeof c.stats.def === 'number');
    assert.ok(typeof c.stats.spc === 'number');
  }
});

test('getCharacterById', () => {
  const first = ALL_CHARACTERS[0];
  assert.equal(getCharacterById(first.id), first);
  assert.equal(getCharacterById('nope'), undefined);
});
