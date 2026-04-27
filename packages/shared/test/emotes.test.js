import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOTES, EMOTE_CD_MS, applyEmoteInput } from '../src/emotes.js';

test('emotes: 共 6 個 slot 且 slot 1-6 連續', () => {
  assert.equal(EMOTES.length, 6);
  EMOTES.forEach((e, i) => {
    assert.equal(e.slot, i + 1);
    assert.equal(typeof e.kaomoji, 'string');
    assert.ok(e.kaomoji.length > 0);
    assert.equal(typeof e.label, 'string');
  });
});

test('emotes: EMOTE_CD_MS = 3000', () => {
  assert.equal(EMOTE_CD_MS, 3000);
});

function makePlayer(over = {}) {
  return { id: 'p1', paused: false, alive: true, emoteCdUntil: 0, ...over };
}

function makeState() {
  return { events: [] };
}

test('applyEmoteInput: 合法 slot 1-6 + 無 cooldown → push event + 設 cooldown', () => {
  const p = makePlayer();
  const s = makeState();
  applyEmoteInput(p, { emote: 3 }, s, 1000);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].kind, 'emote');
  assert.equal(s.events[0].playerId, 'p1');
  assert.equal(s.events[0].slot, 3);
  assert.equal(s.events[0].atMs, 1000);
  assert.equal(p.emoteCdUntil, 1000 + EMOTE_CD_MS);
});

test('applyEmoteInput: cooldown 期間再按 → noop', () => {
  const p = makePlayer({ emoteCdUntil: 5000 });
  const s = makeState();
  applyEmoteInput(p, { emote: 1 }, s, 4999);
  assert.equal(s.events.length, 0);
  assert.equal(p.emoteCdUntil, 5000);
});

test('applyEmoteInput: cooldown 邊界 (now === emoteCdUntil) → 允許', () => {
  const p = makePlayer({ emoteCdUntil: 5000 });
  const s = makeState();
  applyEmoteInput(p, { emote: 1 }, s, 5000);
  assert.equal(s.events.length, 1);
});

test('applyEmoteInput: slot 越界 → noop', () => {
  for (const bad of [0, 7, -1, 100]) {
    const p = makePlayer();
    const s = makeState();
    applyEmoteInput(p, { emote: bad }, s, 1000);
    assert.equal(s.events.length, 0, `slot=${bad} 應被擋`);
    assert.equal(p.emoteCdUntil, 0);
  }
});

test('applyEmoteInput: 非整數 slot → noop', () => {
  for (const bad of [1.5, 'foo', {}, true]) {
    const p = makePlayer();
    const s = makeState();
    applyEmoteInput(p, { emote: bad }, s, 1000);
    assert.equal(s.events.length, 0);
  }
});

test('applyEmoteInput: emote = null → noop（一般 tick）', () => {
  const p = makePlayer();
  const s = makeState();
  applyEmoteInput(p, { emote: null }, s, 1000);
  assert.equal(s.events.length, 0);
  assert.equal(p.emoteCdUntil, 0);
});

test('applyEmoteInput: 沒帶 emote 欄位 → noop', () => {
  const p = makePlayer();
  const s = makeState();
  applyEmoteInput(p, {}, s, 1000);
  assert.equal(s.events.length, 0);
});

test('applyEmoteInput: player.paused → noop', () => {
  const p = makePlayer({ paused: true });
  const s = makeState();
  applyEmoteInput(p, { emote: 6 }, s, 1000);
  assert.equal(s.events.length, 0);
});

test('applyEmoteInput: player.alive === false → 仍會發（刻意允許）', () => {
  const p = makePlayer({ alive: false });
  const s = makeState();
  applyEmoteInput(p, { emote: 3 }, s, 1000);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].slot, 3);
});

test('applyEmoteInput: 玩家初次 emote（emoteCdUntil 未初始化也行）', () => {
  const p = { id: 'p1', paused: false, alive: true };  // 沒有 emoteCdUntil
  const s = makeState();
  applyEmoteInput(p, { emote: 1 }, s, 1000);
  assert.equal(s.events.length, 1);
  assert.equal(p.emoteCdUntil, 1000 + EMOTE_CD_MS);
});
