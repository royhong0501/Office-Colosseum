import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerSocketHandlers } from './socketHandlers.js';
import * as records from './records.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.get('/health', (_, res) => res.json({ ok: true }));

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));

// 戰績儲存路徑：可由 RECORDS_PATH 覆寫（Fly.io 可指向 volume 掛載點）
const recordsPath = process.env.RECORDS_PATH
  || path.resolve(__dirname, '../data/records.json');
records.init(recordsPath);
console.log(`[records] file: ${recordsPath}`);

const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: '*' } });
registerSocketHandlers(io);

const PORT = Number(process.env.PORT) || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Office Colosseum server on :${PORT}`);
});
