// JWT 簽 / 驗。jti 用於 logout / 帳號停用時寫進 Redis blocklist。
//
// payload = { sub: userId, jti, role, username, displayName, exp }
// 預設 24h 過期。

import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const DEFAULT_EXPIRES_IN = '24h';

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET 未設定或太短（< 16 字）');
  }
  return s;
}

export function buildJti() {
  return randomUUID();
}

export function signToken(user, opts = {}) {
  const jti = opts.jti || buildJti();
  const expiresIn = opts.expiresIn || DEFAULT_EXPIRES_IN;
  const token = jwt.sign(
    {
      sub: user.id,
      jti,
      role: user.role,
      username: user.username,
      displayName: user.displayName,
    },
    getSecret(),
    { expiresIn },
  );
  return { token, jti };
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());  // 失敗會 throw
}
