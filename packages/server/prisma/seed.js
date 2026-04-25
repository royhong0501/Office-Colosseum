// Seed：第一個 ADMIN 帳號。User 表為空時才建。
// 環境變數：ADMIN_INITIAL_USERNAME（預設 admin）、ADMIN_INITIAL_PASSWORD（必填）。

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_INITIAL_USERNAME || 'admin';
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    console.error('[seed] ADMIN_INITIAL_PASSWORD 未設定，中止 seed。');
    process.exit(1);
  }

  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`[seed] User 表已有 ${count} 筆，跳過 seed。`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      role: 'ADMIN',
      displayName: username,
    },
  });
  console.log(`[seed] 已建立首個 ADMIN：${user.username} (id=${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
