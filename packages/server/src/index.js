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
import { replay as replayMatchFallback } from './services/matchFallbackQueue.js';
import * as matchService from './services/matchService.js';

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
// transports 只允許 websocket：
// 跳過 polling → ws 升級協商，避免雲端 reverse proxy 在某些網路環境把 ws 升級擋掉退回 long-poll
// （long-poll 會把單向延遲拉到 100ms+ 級別）。少數封 ws 的企業網路會連不上，trade-off 接受。
const io = new IOServer(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket'],
});
registerSocketHandlers(io);

// 暖機 Prisma client + 嘗試 replay 上次失敗的戰績寫入
getPrisma().$connect()
  .then(async () => {
    console.log('[db] prisma connected');
    try {
      const r = await replayMatchFallback(matchService.recordMatch);
      if (r.replayed || r.kept) {
        console.log(`[match-fallback] replay: ${r.replayed} synced, ${r.kept} kept for retry`);
      }
    } catch (e) {
      console.warn('[match-fallback] replay step failed:', e.message);
    }
  })
  .catch((e) => console.warn('[db] prisma connect failed:', e.message));

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Office Colosseum server on :${PORT}`);
});
