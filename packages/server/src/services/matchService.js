// Match / Records 服務：取代舊的 records.js JSON 檔。
// 寫入策略：transaction 一次寫 Match + N 個 MatchParticipant。
// 寫入後 invalidate leaderboard cache。

import { getPrisma } from '../db/prisma.js';
import { invalidateLeaderboard } from './leaderboardCache.js';
import { get as getRecordsCache, invalidateRecords } from './recordsCache.js';

export const MIN_REAL_PLAYERS = 2;

// participants: [{ userId, displayName, characterId, dmgDealt, dmgTaken, survivedTicks, isWinner, isBot }]
// userId 是 null（bot）或 Postgres User.id 字串。
// 至少要 MIN_REAL_PLAYERS 個非 bot 才寫入。
export async function recordMatch({ gameType, config, startedAt, endedAt, participants }) {
  const real = participants.filter(p => !p.isBot && p.userId);
  if (real.length < MIN_REAL_PLAYERS) {
    return { skipped: true, reason: 'not_enough_real_players' };
  }

  const winner = real.find(p => p.isWinner) ?? null;
  const prisma = getPrisma();

  const match = await prisma.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        gameType: gameType ?? 'battle-royale',
        config: config ?? {},
        startedAt: new Date(startedAt),
        endedAt: new Date(endedAt),
        durationMs: Math.max(0, endedAt - startedAt),
        winnerId: winner?.userId ?? null,
        participants: {
          create: participants.map(p => ({
            userId: p.isBot ? null : (p.userId ?? null),
            characterId: p.characterId,
            isBot: !!p.isBot,
            displayName: p.displayName ?? '',
            dmgDealt: p.dmgDealt | 0,
            dmgTaken: p.dmgTaken | 0,
            survivedTicks: p.survivedTicks | 0,
            isWinner: !!p.isWinner,
          })),
        },
      },
    });
    return m;
  });

  await Promise.all([
    invalidateLeaderboard().catch(() => {}),
    invalidateRecords().catch(() => {}),
  ]);
  return { ok: true, matchId: match.id };
}

// 給 client GET_RECORDS 用：回個人聚合 + 最近 N 場（限制不再嚴格只有 10 場）。
// 走 30s Redis cache（recordMatch 完成後 invalidate）。
export async function getSnapshot({ recentLimit = 20 } = {}) {
  return getRecordsCache(recentLimit, _buildSnapshotFromDb);
}

async function _buildSnapshotFromDb(recentLimit) {
  const prisma = getPrisma();
  const matches = await prisma.match.findMany({
    orderBy: { endedAt: 'desc' },
    take: recentLimit,
    include: {
      participants: { include: { user: { select: { id: true, displayName: true, username: true } } } },
      winner: { select: { id: true, displayName: true, username: true } },
    },
  });
  // 個人聚合（top 200 by 場次）
  const players = await prisma.user.findMany({
    select: {
      id: true, username: true, displayName: true, lastLoginAt: true,
      participants: { select: { isWinner: true, dmgDealt: true, dmgTaken: true, survivedTicks: true } },
    },
    take: 200,
  });
  const playersAggregated = players.map(u => {
    const ps = u.participants;
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      lastLoginAt: u.lastLoginAt,
      matches: ps.length,
      wins: ps.filter(p => p.isWinner).length,
      dmgDealt: ps.reduce((s, p) => s + p.dmgDealt, 0),
      dmgTaken: ps.reduce((s, p) => s + p.dmgTaken, 0),
      survivedTicks: ps.reduce((s, p) => s + p.survivedTicks, 0),
    };
  });
  return {
    meta: { totalMatches: matches.length },
    players: playersAggregated,
    matches: matches.map(m => ({
      id: m.id,
      gameType: m.gameType,
      config: m.config,
      startedAt: m.startedAt.getTime(),
      endedAt: m.endedAt.getTime(),
      durationMs: m.durationMs,
      winnerId: m.winnerId,
      winnerName: m.winner?.displayName ?? null,
      participants: m.participants.map(p => ({
        userId: p.userId,
        displayName: p.displayName,
        characterId: p.characterId,
        dmgDealt: p.dmgDealt,
        dmgTaken: p.dmgTaken,
        survivedTicks: p.survivedTicks,
        isWinner: p.isWinner,
        isBot: p.isBot,
      })),
    })),
  };
}

// 給 leaderboard 用（top N by wins / matches）
export async function getLeaderboardFromDb(gameType, top = 20) {
  const prisma = getPrisma();
  const where = gameType ? { match: { gameType } } : {};
  const grouped = await prisma.matchParticipant.groupBy({
    by: ['userId'],
    where: { ...where, userId: { not: null } },
    _count: { _all: true },
    _sum: { dmgDealt: true, dmgTaken: true, survivedTicks: true },
  });
  const wins = await prisma.matchParticipant.groupBy({
    by: ['userId'],
    where: { ...where, isWinner: true, userId: { not: null } },
    _count: { _all: true },
  });
  const winsMap = new Map(wins.map(w => [w.userId, w._count._all]));
  const userIds = grouped.map(g => g.userId).filter(Boolean);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, username: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));
  const rows = grouped.map(g => {
    const u = userMap.get(g.userId);
    return {
      userId: g.userId,
      username: u?.username,
      displayName: u?.displayName,
      matches: g._count._all,
      wins: winsMap.get(g.userId) ?? 0,
      dmgDealt: g._sum.dmgDealt ?? 0,
      dmgTaken: g._sum.dmgTaken ?? 0,
      survivedTicks: g._sum.survivedTicks ?? 0,
    };
  });
  rows.sort((a, b) => b.wins - a.wins || b.matches - a.matches);
  return rows.slice(0, top);
}
