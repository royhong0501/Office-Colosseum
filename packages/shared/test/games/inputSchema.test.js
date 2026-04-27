// sanitizeInput：三款遊戲的 INPUT 白名單。
// Server 收到 client INPUT 後一律過這層，拒絕 NaN/Infinity/型別錯亂、把 enum 限白。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeInput as sanitizeBR } from '../../src/games/br/index.js';
import { sanitizeInput as sanitizeItems } from '../../src/games/items/index.js';
import { sanitizeInput as sanitizeTerritory } from '../../src/games/territory/index.js';

/* ---- BR ---- */

test('br/sanitizeInput：null / 非物件 → null', () => {
  assert.equal(sanitizeBR(null), null);
  assert.equal(sanitizeBR(undefined), null);
  assert.equal(sanitizeBR('hack'), null);
  assert.equal(sanitizeBR(42), null);
});

test('br/sanitizeInput：NaN / Infinity → 0', () => {
  const out = sanitizeBR({ moveX: NaN, moveY: Infinity, aimAngle: -Infinity });
  assert.equal(out.moveX, 0);
  assert.equal(out.moveY, 0);
  assert.equal(out.aimAngle, 0);
});

test('br/sanitizeInput：bool 強制 cast', () => {
  const out = sanitizeBR({ attack: 1, shield: 'yes', dash: {} });
  assert.equal(out.attack, true);
  assert.equal(out.shield, true);
  assert.equal(out.dash, true);

  const out2 = sanitizeBR({ attack: 0, shield: '', dash: null });
  assert.equal(out2.attack, false);
  assert.equal(out2.shield, false);
  assert.equal(out2.dash, false);
});

test('br/sanitizeInput：保留合法數值', () => {
  const out = sanitizeBR({ seq: 7, moveX: 0.7, moveY: -0.3, aimAngle: 1.57, attack: true });
  assert.equal(out.seq, 7);
  assert.equal(out.moveX, 0.7);
  assert.equal(out.moveY, -0.3);
  assert.equal(out.aimAngle, 1.57);
  assert.equal(out.attack, true);
});

test('br/sanitizeInput：seq 強制整數', () => {
  const out = sanitizeBR({ seq: 7.9 });
  assert.equal(out.seq, 7);
  const out2 = sanitizeBR({ seq: 'abc' });
  assert.equal(out2.seq, 0);
});

/* ---- Items ---- */

test('items/sanitizeInput：skill 不在白名單 → null', () => {
  const out = sanitizeItems({ skill: 'evil' });
  assert.equal(out.skill, null);
  const out2 = sanitizeItems({ skill: 'freeze' });
  assert.equal(out2.skill, 'freeze');
});

test('items/sanitizeInput：skill 非 string → null', () => {
  const out = sanitizeItems({ skill: { evil: true } });
  assert.equal(out.skill, null);
  const out2 = sanitizeItems({ skill: 1 });
  assert.equal(out2.skill, null);
});

test('items/sanitizeInput：完整 5 個技能皆通過', () => {
  for (const k of ['freeze', 'undo', 'merge', 'readonly', 'validate']) {
    assert.equal(sanitizeItems({ skill: k }).skill, k);
  }
});

test('items/sanitizeInput：無 shield/dash 欄位', () => {
  const out = sanitizeItems({ moveX: 1, attack: true, shield: true, dash: true });
  assert.equal(out.shield, undefined);
  assert.equal(out.dash, undefined);
  assert.equal(out.attack, true);
});

/* ---- Territory ---- */

test('territory/sanitizeInput：只保留 move + aim 欄位', () => {
  const out = sanitizeTerritory({
    seq: 3, moveX: 1, moveY: 0, aimAngle: 1.5,
    attack: true, shield: true, skill: 'freeze',  // 雜訊應被過濾
  });
  assert.equal(out.seq, 3);
  assert.equal(out.moveX, 1);
  assert.equal(out.moveY, 0);
  assert.equal(out.aimAngle, 1.5);
  assert.equal(out.attack, undefined);
  assert.equal(out.shield, undefined);
  assert.equal(out.skill, undefined);
});

test('territory/sanitizeInput：null → null', () => {
  assert.equal(sanitizeTerritory(null), null);
});

/* ---- emote 白名單（三款共用規則）---- */

test('br/sanitizeInput：合法 emote 1-6 保留', () => {
  for (let s = 1; s <= 6; s++) {
    assert.equal(sanitizeBR({ emote: s }).emote, s);
  }
});

test('br/sanitizeInput：emote 越界 → null', () => {
  assert.equal(sanitizeBR({ emote: 0 }).emote, null);
  assert.equal(sanitizeBR({ emote: 7 }).emote, null);
  assert.equal(sanitizeBR({ emote: -1 }).emote, null);
});

test('br/sanitizeInput：emote 非整數 → null', () => {
  assert.equal(sanitizeBR({ emote: 1.5 }).emote, null);
  assert.equal(sanitizeBR({ emote: 'evil' }).emote, null);
  assert.equal(sanitizeBR({ emote: {} }).emote, null);
  assert.equal(sanitizeBR({ emote: true }).emote, null);
});

test('br/sanitizeInput：emote 不存在 → null', () => {
  assert.equal(sanitizeBR({}).emote, null);
});

test('items/sanitizeInput：合法 emote 1-6 保留', () => {
  assert.equal(sanitizeItems({ emote: 3 }).emote, 3);
});

test('items/sanitizeInput：emote 7 → null', () => {
  assert.equal(sanitizeItems({ emote: 7 }).emote, null);
});

test('territory/sanitizeInput：合法 emote 保留', () => {
  assert.equal(sanitizeTerritory({ emote: 6 }).emote, 6);
});

test('territory/sanitizeInput：emote 非法 → null', () => {
  assert.equal(sanitizeTerritory({ emote: 'evil' }).emote, null);
  assert.equal(sanitizeTerritory({ emote: 0 }).emote, null);
});
