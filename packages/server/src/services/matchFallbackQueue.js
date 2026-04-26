// 戰績寫入失敗的 fallback queue。
// recordMatch throw 時把 payload append 到本地 ndjson；
// 啟動時 replay 整檔，成功的條目移除、失敗的留下下次再試。
//
// 為什麼用 ndjson 而非 JSON 陣列：append-only 寫入 atomic、不需要 lock 整檔。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PATH = path.resolve(__dirname, '../../data/match-fallback.ndjson');

export function getQueuePath() {
  return process.env.MATCH_FALLBACK_PATH || DEFAULT_PATH;
}

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 把失敗的 match payload 追加到 queue。任何寫入錯誤都吞掉並 log 給 stderr，
 * 不能讓 fallback 自己又拋例外把 caller 弄崩。
 */
export function enqueue(payload) {
  const file = getQueuePath();
  try {
    ensureDir(file);
    const entry = { ...payload, queuedAt: Date.now() };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[match-fallback] enqueue failed:', e.message);
    return false;
  }
}

export function readAll() {
  const file = getQueuePath();
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 損壞行直接丟掉 */ }
  }
  return out;
}

export function writeAll(entries) {
  const file = getQueuePath();
  if (entries.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  ensureDir(file);
  const text = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(file, text, 'utf8');
}

export function count() {
  return readAll().length;
}

/**
 * 嘗試 replay 整個 queue。recordFn 是 matchService.recordMatch 的 lookalike：
 *   - resolves 任何值 → 視為成功，從 queue 移除
 *   - throws → 留下下次再試
 *
 * 注意：recordMatch resolve `{skipped:true}` 也算成功——表示 server 端做了商業邏輯判斷
 * （例如玩家不夠真人不需要寫戰績），這不是錯誤、不該無限重試。
 */
export async function replay(recordFn) {
  const entries = readAll();
  if (entries.length === 0) return { replayed: 0, kept: 0 };
  const remaining = [];
  let replayed = 0;
  for (const entry of entries) {
    const { queuedAt: _q, ...payload } = entry;
    try {
      await recordFn(payload);
      replayed++;
    } catch (e) {
      console.warn('[match-fallback] replay entry failed:', e.message);
      remaining.push(entry);
    }
  }
  writeAll(remaining);
  return { replayed, kept: remaining.length };
}
