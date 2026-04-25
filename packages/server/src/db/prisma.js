// Prisma client singleton。
// 在測試環境若未設 DATABASE_URL，呼叫端應自行 mock 而非匯入此檔。

import { PrismaClient } from '@prisma/client';

let prisma = null;

export function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.PRISMA_LOG === '1' ? ['query', 'error', 'warn'] : ['error', 'warn'],
    });
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
