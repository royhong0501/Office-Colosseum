// 聊天訊息 sanitize（server 寫入前過一次）。
// React 預設會 escape JSX child 防 HTML 注入，但仍有以下風險：
//   1. ASCII 控制字元（NULL / 退格 / DEL 等）破壞 log / 終端機
//   2. Unicode bidi override（U+202A–U+202E、U+2066–U+2069）能反轉文字方向、混淆顯示
//   3. 零寬字元（U+200B–U+200F、U+FEFF）可繞過長度限制 / 偽裝 mention
//   4. 未正規化的組合字元（NFC）會讓相同視覺輸出有多種 byte 序列
//
// 此 helper 統一處理。回傳已 trim 的字串；空字串代表 sanitize 後沒內容。

const CTRL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;   // 保留 \t (\x09) \n (\x0A) \r (\x0D)
// 零寬 + bidi override + BOM。涵蓋：
//   U+200B–U+200F  零寬空格 / RLM / LRM 等
//   U+202A–U+202E  bidi embedding / override
//   U+2066–U+2069  bidi isolate
//   U+FEFF         BOM
const UNICODE_DANGEROUS_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

export function sanitizeChatContent(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw;
  // 先 NFC 正規化（避免 combining char tricks 與重複 byte 序列）
  try { s = s.normalize('NFC'); } catch { /* 老 runtime fallback */ }
  s = s.replace(CTRL_CHARS_RE, '');
  s = s.replace(UNICODE_DANGEROUS_RE, '');
  return s.trim();
}
