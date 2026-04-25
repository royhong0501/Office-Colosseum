import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as records from '../src/records.js';

function tmpFile() {
  return path.join(os.tmpdir(), `oc-records-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
}

/**
 * 建一個 BR participant；可帶 stats override。
 */
function brPart(overrides = {}) {
  const { stats = {}, ...rest } = overrides;
  return {
    uuid: 'uuid-a', name: 'Alice', characterId: 'munchkin',
    isWinner: false, isBot: false,
    survivedTicks: 600,
    stats: { damageDealt: 100, damageTaken: 50, kills: 0, bulletsFired: 0, bulletsHit: 0, dashUsed: 0, ...stats },
    ...rest,
  };
}

function itemsPart(overrides = {}) {
  const { stats = {}, ...rest } = overrides;
  return {
    uuid: 'uuid-a', name: 'Alice', characterId: 'munchkin',
    isWinner: false, isBot: false,
    survivedTicks: 600,
    stats: { damageDealt: 50, damageTaken: 30, kills: 0, skillsCast: 3, trapsPlaced: 2, trapsTriggered: 1, undoUsed: 1, ...stats },
    ...rest,
  };
}

function terrPart(overrides = {}) {
  const { stats = {}, ...rest } = overrides;
  return {
    uuid: 'uuid-a', name: 'Alice', characterId: 'munchkin',
    isWinner: false, isBot: false,
    survivedTicks: 900,
    stats: { cellsPainted: 50, areasCaptured: 2, cellsCapturedByFormatbrush: 12, teamCellsAtEnd: 100, teamId: 0, ...stats },
    ...rest,
  };
}

beforeEach(() => {
  records._reset();
  records.init(null);
});

test('少於 MIN_REAL_PLAYERS 個真人 → 跳過', () => {
  const r = records.recordMatch({
    gameType: 'battle-royale',
    startedAt: 1000, endedAt: 5000,
    participants: [brPart({ uuid: 'uuid-a', isWinner: true })],
  });
  assert.equal(r.skipped, true);
});

test('BR：recordMatch 寫入 byGameType.battle-royale 聚合正確', () => {
  const r = records.recordMatch({
    gameType: 'battle-royale',
    config: { mapId: 'annual-budget' },
    startedAt: 1000, endedAt: 10000,
    participants: [
      brPart({ uuid: 'uuid-a', name: 'Alice', isWinner: true,
               stats: { damageDealt: 300, damageTaken: 100, kills: 2, bulletsFired: 50, bulletsHit: 20, dashUsed: 3 } }),
      brPart({ uuid: 'uuid-b', name: 'Bob', isWinner: false,
               stats: { damageDealt: 100, damageTaken: 300, kills: 0, bulletsFired: 30, bulletsHit: 5, dashUsed: 1 } }),
    ],
  });
  assert.ok(r.ok);
  const snap = records.getSnapshot();
  assert.equal(snap.matches[0].gameType, 'battle-royale');
  assert.equal(snap.matches[0].config.mapId, 'annual-budget');

  const alice = snap.players['uuid-a'];
  assert.equal(alice.matches, 1);
  assert.equal(alice.wins, 1);
  const aliceBR = alice.byGameType['battle-royale'];
  assert.equal(aliceBR.matches, 1);
  assert.equal(aliceBR.wins, 1);
  assert.equal(aliceBR.damageDealt, 300);
  assert.equal(aliceBR.kills, 2);
  assert.equal(aliceBR.bulletsFired, 50);
  assert.equal(aliceBR.bulletsHit, 20);
  assert.equal(aliceBR.dashUsed, 3);

  const bobBR = snap.players['uuid-b'].byGameType['battle-royale'];
  assert.equal(bobBR.wins, 0);
  assert.equal(bobBR.damageTaken, 300);
});

test('Items：byGameType.items 正確 + characters aggregate', () => {
  records.recordMatch({
    gameType: 'items',
    startedAt: 1000, endedAt: 5000,
    participants: [
      itemsPart({ uuid: 'uuid-a', isWinner: true,
                  stats: { damageDealt: 80, damageTaken: 20, kills: 1, skillsCast: 5, trapsPlaced: 3, trapsTriggered: 2, undoUsed: 1 } }),
      itemsPart({ uuid: 'uuid-b', name: 'Bob', characterId: 'husky',
                  stats: { damageDealt: 40, damageTaken: 80, kills: 0, skillsCast: 2, trapsPlaced: 1, trapsTriggered: 0, undoUsed: 0 } }),
    ],
  });
  const snap = records.getSnapshot();
  const alice = snap.players['uuid-a'];
  const aliceItems = alice.byGameType.items;
  assert.equal(aliceItems.skillsCast, 5);
  assert.equal(aliceItems.trapsPlaced, 3);
  assert.equal(aliceItems.undoUsed, 1);
  assert.equal(alice.byCharacter.munchkin.matches, 1);
  assert.equal(alice.byCharacter.munchkin.wins, 1);
});

test('Territory：byGameType.territory 正確（cellsPainted / areasCaptured / teamCellsAtEnd）', () => {
  records.recordMatch({
    gameType: 'territory',
    startedAt: 1000, endedAt: 5000,
    participants: [
      terrPart({ uuid: 'uuid-a', isWinner: true,
                 stats: { cellsPainted: 80, areasCaptured: 3, cellsCapturedByFormatbrush: 20, teamCellsAtEnd: 150, teamId: 0 } }),
      terrPart({ uuid: 'uuid-b', name: 'Bob',
                 stats: { cellsPainted: 40, areasCaptured: 1, cellsCapturedByFormatbrush: 5, teamCellsAtEnd: 80, teamId: 1 } }),
    ],
  });
  const snap = records.getSnapshot();
  const aliceTerr = snap.players['uuid-a'].byGameType.territory;
  assert.equal(aliceTerr.cellsPainted, 80);
  assert.equal(aliceTerr.areasCaptured, 3);
  assert.equal(aliceTerr.cellsCapturedByFormatbrush, 20);
  assert.equal(aliceTerr.teamCellsAtEnd, 150);
});

test('不同 gameType 的場次分別進 byGameType、總 matches/wins 跨累積', () => {
  records.recordMatch({
    gameType: 'battle-royale',
    startedAt: 1000, endedAt: 2000,
    participants: [
      brPart({ uuid: 'uuid-a', isWinner: true }),
      brPart({ uuid: 'uuid-b', name: 'Bob' }),
    ],
  });
  records.recordMatch({
    gameType: 'items',
    startedAt: 3000, endedAt: 4000,
    participants: [
      itemsPart({ uuid: 'uuid-a', isWinner: true }),
      itemsPart({ uuid: 'uuid-b', name: 'Bob' }),
    ],
  });
  records.recordMatch({
    gameType: 'territory',
    startedAt: 5000, endedAt: 6000,
    participants: [
      terrPart({ uuid: 'uuid-a', isWinner: false }),
      terrPart({ uuid: 'uuid-b', name: 'Bob', isWinner: true }),
    ],
  });
  const alice = records.getSnapshot().players['uuid-a'];
  assert.equal(alice.matches, 3);
  assert.equal(alice.wins, 2);  // BR + Items 贏
  assert.equal(alice.byGameType['battle-royale'].wins, 1);
  assert.equal(alice.byGameType['items'].wins, 1);
  assert.equal(alice.byGameType['territory'].wins, 0);
});

test('bot 仍保留在 match.participants 但不計入 players 聚合', () => {
  records.recordMatch({
    gameType: 'battle-royale',
    startedAt: 1000, endedAt: 5000,
    participants: [
      brPart({ uuid: 'uuid-a', isWinner: true }),
      brPart({ uuid: 'uuid-b', name: 'Bob' }),
      brPart({ uuid: null, name: 'Bot-1', isBot: true }),
    ],
  });
  const snap = records.getSnapshot();
  assert.equal(Object.keys(snap.players).length, 2);
  assert.equal(snap.matches[0].participants.length, 3);
  assert.ok(snap.matches[0].participants.some(p => p.isBot));
});

test('matches 超過 MAX_MATCHES 時只保留最近 N 場', () => {
  for (let i = 0; i < records.MAX_MATCHES + 5; i++) {
    records.recordMatch({
      gameType: 'battle-royale',
      startedAt: i * 1000, endedAt: i * 1000 + 500,
      participants: [
        brPart({ uuid: 'uuid-a', isWinner: true }),
        brPart({ uuid: 'uuid-b', name: 'Bob' }),
      ],
    });
  }
  const snap = records.getSnapshot();
  assert.equal(snap.matches.length, records.MAX_MATCHES);
  assert.equal(snap.players['uuid-a'].matches, records.MAX_MATCHES + 5);
});

test('init + flush 寫檔後可重新載入', () => {
  const file = tmpFile();
  try {
    records.init(file);
    records.recordMatch({
      gameType: 'battle-royale',
      startedAt: 1000, endedAt: 2000,
      participants: [
        brPart({ uuid: 'uuid-a', isWinner: true, stats: { kills: 2 } }),
        brPart({ uuid: 'uuid-b', name: 'Bob' }),
      ],
    });
    records._flush();
    assert.ok(fs.existsSync(file));

    records._reset();
    records.init(file);
    const snap = records.getSnapshot();
    assert.equal(snap.meta.version, records.SCHEMA_VERSION);
    assert.equal(snap.meta.totalMatches, 1);
    assert.equal(snap.players['uuid-a'].byGameType['battle-royale'].kills, 2);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('init 遇到損壞檔案不會 crash', () => {
  const file = tmpFile();
  try {
    fs.writeFileSync(file, '{ not valid json');
    records.init(file);
    assert.equal(records.getSnapshot().meta.totalMatches, 0);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('init 遇到 v1 舊檔會捨棄（schema mismatch）', () => {
  const file = tmpFile();
  try {
    // v1 schema
    fs.writeFileSync(file, JSON.stringify({ version: 1, players: { 'uuid-a': {} }, matches: [{ id: 'x' }] }));
    records.init(file);
    const snap = records.getSnapshot();
    assert.equal(snap.meta.totalMatches, 0, 'v1 應被捨棄');
    assert.equal(Object.keys(snap.players).length, 0);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});
