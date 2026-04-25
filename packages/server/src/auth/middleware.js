// Express middleware：requireAuth、requireAdmin。
// socket.io 的 connection middleware 也共用底層 verifyAndLoad。

import { verifyToken } from './jwt.js';
import { isBlocked } from '../services/blocklist.js';
import { getPrisma } from '../db/prisma.js';

function extractToken(req) {
  const hdr = req.headers.authorization || '';
  if (hdr.startsWith('Bearer ')) return hdr.slice(7).trim();
  // 也支援 cookie 中的 token（httpOnly 配置）
  const cookieHdr = req.headers.cookie || '';
  const m = /(?:^|;\s*)oc_token=([^;]+)/.exec(cookieHdr);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

// 共用：把 token 驗成 { user, payload }，否則 throw。
export async function verifyAndLoad(token) {
  if (!token) throw new Error('no_token');
  const payload = verifyToken(token);                            // throw on invalid/expired
  if (await isBlocked(payload.jti)) throw new Error('revoked');

  const user = await getPrisma().user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new Error('user_missing');
  if (user.disabled) throw new Error('user_disabled');
  return { user, payload };
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    const { user, payload } = await verifyAndLoad(token);
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'unauthorized', reason: e.message });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
