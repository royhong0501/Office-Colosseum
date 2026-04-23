import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as records from '../src/records.js';

function tmpFile() {
  return path.join(os.tmpdir(), `oc-records-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
}

function makeParticipant(overrides = {}) {
  return {
    uuid: 'uuid-a', name: 'Alice', characterId: 'munchkin',
    dmgDealt: 100, dmgTaken: 50, survivedTicks: 600,
    isWinner: false, isBot: false,
    ...overrides,
  };
}

beforeEach(() => {
  records._reset();
  records.init(null);
});

test('少於 MIN_REAL_PLAYERS 個真人 → 跳過、不累積', () => {
  const r = records.recordMatch({
    startedAt: 1000, endedAt: 5000,
    participants: [makeParticipant({ uuid: 'uuid-a', isWinner: true })],
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'not_enough_real_players');
  assert.equal(records.getSnapshot().meta.totalMatches, 0);
});

test('沒 uuid 的真人視同非真人 → 不算進 MIN_REAL_PLAYERS', () => {
  const r = records.recordMatch({
    startedAt: 1000, endedAt: 5000,
    participants: [
      makeParticipant({ uuid: null, name: 'NoUuid' }),
      makeParticipant({ uuid: 'uuid-a', isWinner: true }),
    ],
  });
  assert.equal(r.skipped, true);
});

test('記錄一場 2 人對戰：matches 與 player aggregate 正確', () => {
  const r = records.recordMatch({
    startedAt: 1000, endedAt: 10000,
    participants: [
      makeParticipant({ uuid: 'uuid-a', name: 'Alice', characterId: 'munchkin',
        dmgDealt: 300, dmgTaken: 100, survivedTicks: 900, isWinner: true }),
      makeParticipant({ uuid: 'uuid-b', name: 'Bob', characterId: 'husky',
        dmgDealt: 100, dmgTaken: 300, survivedTicks: 600, isWinner: false }),
    ],
  });
  assert.ok(r.ok);
  const snap = records.getSnapshot();
  assert.equal(snap.meta.totalMatches, 1);
  assert.equal(snap.matches[0].winnerUuid, 'uuid-a');
  assert.equal(snap.matches[0].winnerName, 'Alice');
  assert.equal(snap.matches[0].durationMs, 9000);

  const alice = snap.players['uuid-a'];
  assert.equal(alice.matches, 1);
  assert.equal(alice.wins, 1);
  assert.equal(alice.dmgDealt, 300);
  assert.equal(alice.dmgTaken, 100);
  assert.equal(alice.byCharacter.munchkin.wins, 1);

  const bob = snap.players['uuid-b'];
  assert.equal(bob.matches, 1);
  assert.equal(bob.wins, 0);
  assert.equal(bob.dmgDealt, 100);
  assert.equal(bob.byCharacter.husky.wins, 0);
});

test('bot 不寫入 players 聚合但會留在 match.participants', () => {
  records.recordMatch({
    startedAt: 1000, endedAt: 5000,
    participants: [
      makeParticipant({ uuid: 'uuid-a', isWinner: true }),
      makeParticipant({ uuid: 'uuid-b', name: 'Bob', isWinner: false }),
      makeParticipant({ uuid: null, name: 'Bot-1', isBot: true }),
    ],
  });
  const snap = records.getSnapshot();
  assert.equal(Object.keys(snap.players).length, 2, '只有 2 個真人進聚合');
  assert.equal(snap.matches[0].participants.length, 3, 'match 仍保留 bot');
  assert.ok(snap.matches[0].participants.some(p => p.isBot));
});

test('累積多場：matches/wins/dmg 逐場加總', () => {
  const base = {
    participants: [
      makeParticipant({ uuid: 'uuid-a', name: 'Alice', dmgDealt: 100, dmgTaken: 50, survivedTicks: 300, isWinner: true }),
      makeParticipant({ uuid: 'uuid-b', name: 'Bob', dmgDealt: 50, dmgTaken: 100, survivedTicks: 200, isWinner: false }),
    ],
  };
  records.recordMatch({ startedAt: 1000, endedAt: 2000, ...base });
  records.recordMatch({ startedAt: 3000, endedAt: 4000, ...base });
  records.recordMatch({ startedAt: 5000, endedAt: 6000, ...base });
  const alice = records.getSnapshot().players['uuid-a'];
  assert.equal(alice.matches, 3);
  assert.equal(alice.wins, 3);
  assert.equal(alice.dmgDealt, 300);
  assert.equal(alice.dmgTaken, 150);
  assert.equal(alice.survivedTicks, 900);
});

test('改名後 lastName 更新、但 uuid 聚合仍同一筆', () => {
  records.recordMatch({
    startedAt: 1000, endedAt: 2000,
    participants: [
      makeParticipant({ uuid: 'uuid-a', name: '阿貓', isWinner: true }),
      makeParticipant({ uuid: 'uuid-b', name: 'Bob' }),
    ],
  });
  records.recordMatch({
    startedAt: 3000, endedAt: 4000,
    participants: [
      makeParticipant({ uuid: 'uuid-a', name: '橘貓', isWinner: true }),
      makeParticipant({ uuid: 'uuid-b', name: 'Bob' }),
    ],
  });
  const alice = records.getSnapshot().players['uuid-a'];
  assert.equal(alice.lastName, '橘貓');
  assert.equal(alice.matches, 2);
});

test('matches 超過 MAX_MATCHES 時只保留最近 N 場', () => {
  for (let i = 0; i < records.MAX_MATCHES + 5; i++) {
    records.recordMatch({
      startedAt: i * 1000, endedAt: i * 1000 + 500,
      participants: [
        makeParticipant({ uuid: 'uuid-a', isWinner: true }),
        makeParticipant({ uuid: 'uuid-b' }),
      ],
    });
  }
  const snap = records.getSnapshot();
  assert.equal(snap.matches.length, records.MAX_MATCHES, '只留最後 MAX_MATCHES 場');
  // players 聚合仍累積全部
  assert.equal(snap.players['uuid-a'].matches, records.MAX_MATCHES + 5);
});

test('init + recordMatch + _flush 後可從檔案重新載入', () => {
  const file = tmpFile();
  try {
    records.init(file);
    records.recordMatch({
      startedAt: 1000, endedAt: 2000,
      participants: [
        makeParticipant({ uuid: 'uuid-a', isWinner: true }),
        makeParticipant({ uuid: 'uuid-b' }),
      ],
    });
    records._flush();
    assert.ok(fs.existsSync(file));

    // 模擬 server 重啟
    records._reset();
    records.init(file);
    const snap = records.getSnapshot();
    assert.equal(snap.meta.totalMatches, 1);
    assert.equal(snap.players['uuid-a'].wins, 1);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('init 遇到損壞檔案不會 crash，回到空狀態', () => {
  const file = tmpFile();
  try {
    fs.writeFileSync(file, '{ not valid json');
    records.init(file);
    assert.equal(records.getSnapshot().meta.totalMatches, 0);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
