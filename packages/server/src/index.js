import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registerSocketHandlers } from './socketHandlers.js';
import { buildAuthRouter } from './auth/routes.js';
import { buildAdminRouter } from './admin/routes.js';
import { getPrisma } from './db/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 啟動時偵測舊 records.json，改名為 archived 版本（戰績從此走 Postgres）
const legacyRecordsPath = process.env.RECORDS_PATH
  || path.resolve(__dirname, '../data/records.json');
try {
  if (fs.existsSync(legacyRecordsPath)) {
    const dst = legacyRecordsPath + '.archived-' + Date.now();
    fs.renameSync(legacyRecordsPath, dst);
    console.log(`[migrate] 舊 records.json 已封存為 ${dst}`);
  }
} catch (e) {
  console.warn('[migrate] archive 失敗:', e.message);
}

const app = express();
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_, res) => res.json({ ok: true }));

// API routes（auth / admin）— 需在 SPA fallback 之前掛載
app.use('/auth', buildAuthRouter());
app.use('/admin', buildAdminRouter());

// 靜態檔（client dist）+ SPA fallback。SPA fallback 用 regex 排除 /auth、/admin、/health。
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/(auth|admin|health|socket\.io)\/).*/, (_, res) =>
  res.sendFile(path.join(clientDist, 'index.html')),
);

const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: '*' } });
registerSocketHandlers(io);

// 暖機 Prisma client（避免第一個請求才連線）
getPrisma().$connect()
  .then(() => console.log('[db] prisma connected'))
  .catch((e) => console.warn('[db] prisma connect failed:', e.message));

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Office Colosseum server on :${PORT}`);
});
