import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CHARACTERS, CAT_BREEDS, DOG_BREEDS, getCharacterById } from '../src/characters.js';

test('exactly 20 characters (10 cats + 10 dogs)', () => {
  assert.equal(ALL_CHARACTERS.length, 20);
  assert.equal(CAT_BREEDS.length, 10);
  assert.equal(DOG_BREEDS.length, 10);
});

test('每個角色有皮膚必備欄位（id / name / nameEn / type / color）', () => {
  for (const c of ALL_CHARACTERS) {
    assert.ok(c.id, `missing id: ${JSON.stringify(c)}`);
    assert.ok(c.name, `missing name: ${c.id}`);
    assert.ok(c.nameEn, `missing nameEn: ${c.id}`);
    assert.ok(c.type === 'cat' || c.type === 'dog', `bad type: ${c.id}`);
    assert.match(c.color, /^#[0-9A-Fa-f]{6}$/, `bad color: ${c.id}`);
  }
});

test('所有 id 唯一', () => {
  const ids = ALL_CHARACTERS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('getCharacterById', () => {
  const first = ALL_CHARACTERS[0];
  assert.equal(getCharacterById(first.id), first);
  assert.equal(getCharacterById('nope'), undefined);
});
