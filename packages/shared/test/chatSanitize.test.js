// chatSanitize：聊天訊息 server 端 sanitize。
// React 已 escape HTML，但仍要剝 ASCII 控制字元 / bidi override / 零寬字元。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeChatContent } from '../src/chatSanitize.js';

test('非 string 輸入 → 空字串', () => {
  assert.equal(sanitizeChatContent(null), '');
  assert.equal(sanitizeChatContent(undefined), '');
  assert.equal(sanitizeChatContent(42), '');
  assert.equal(sanitizeChatContent({}), '');
});

test('純文字保留', () => {
  assert.equal(sanitizeChatContent('hello world'), 'hello world');
  assert.equal(sanitizeChatContent('哈囉，你好'), '哈囉，你好');
});

test('保留 \\t \\n \\r（多行訊息）', () => {
  assert.equal(sanitizeChatContent('line1\nline2'), 'line1\nline2');
  assert.equal(sanitizeChatContent('a\tb'), 'a\tb');
});

test('剝 ASCII 控制字元（NULL / 退格 / DEL）', () => {
  assert.equal(sanitizeChatContent('hi\x00there'), 'hithere');
  assert.equal(sanitizeChatContent('a\x08b\x7Fc'), 'abc');
});

test('剝零寬字元（U+200B–U+200F、U+FEFF）', () => {
  assert.equal(sanitizeChatContent('he​llo'), 'hello');
  assert.equal(sanitizeChatContent('te‌s‍t'), 'test');
  assert.equal(sanitizeChatContent('﻿word'), 'word');
});

test('剝 bidi override（U+202A–U+202E、U+2066–U+2069）', () => {
  // 經典攻擊：「‮evil.exe」會在 UI 顯示成 ⏤exe.live
  assert.equal(sanitizeChatContent('‮evil.exe'), 'evil.exe');
  assert.equal(sanitizeChatContent('hi‪there‬'), 'hithere');
  assert.equal(sanitizeChatContent('a⁦b⁩c'), 'abc');
});

test('保留 emoji', () => {
  assert.equal(sanitizeChatContent('hi 👋 world 🌏'), 'hi 👋 world 🌏');
});

test('NFC 正規化', () => {
  // 「é」可由 U+00E9 或 U+0065 + U+0301 組成，sanitize 後應一致
  const composed = 'café';
  const decomposed = 'café';
  const out1 = sanitizeChatContent(composed);
  const out2 = sanitizeChatContent(decomposed);
  assert.equal(out1, out2);
});

test('trim 空白', () => {
  assert.equal(sanitizeChatContent('   hello   '), 'hello');
  assert.equal(sanitizeChatContent('\n\nhi\n\n'), 'hi');
});

test('零寬字元 + 空白 → 空字串（避免攻擊者送看似有內容、實則全空）', () => {
  assert.equal(sanitizeChatContent('​​​'), '');
  assert.equal(sanitizeChatContent('  ​  '), '');
});

test('長度繞過防禦：先 sanitize 再算長度', () => {
  // 攻擊者塞 1000 個零寬字元想繞過 chat_too_long → sanitize 後變極短
  const evil = 'A' + '​'.repeat(1000) + 'B';
  const out = sanitizeChatContent(evil);
  assert.equal(out, 'AB');
  assert.equal(out.length, 2);
});

test('混合髒資料：控制字元 + bidi + emoji + 中英文', () => {
  const evil = '  \x00 hi‮ 你好 👋 ​ world \x7F  ';
  const out = sanitizeChatContent(evil);
  assert.equal(out, 'hi 你好 👋  world');
});
