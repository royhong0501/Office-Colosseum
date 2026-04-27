// Auth endpoints：POST /auth/login、POST /auth/logout、GET /auth/me、PATCH /auth/me。
//
// login 過 rate limiter（IP + username 兩條 key），避免 brute-force。
// logout 把 jti 寫進 Redis blocklist；後續用該 token 都會被擋。

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '../db/prisma.js';
import { signToken, verifyToken } from './jwt.js';
import { requireAuth } from './middleware.js';
import { trackJti, blockJti } from '../services/blocklist.js';
import { consume, reset, RateLimitError } from '../services/rateLimiter.js';
import { PLAYER_NAME_MAX } from '@office-colosseum/shared';

const TOKEN_TTL_SEC = 60 * 60 * 24;  // 24h，需與 jwt.js 預設一致

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const updateMeSchema = z.object({
  displayName: z.string().min(1).max(PLAYER_NAME_MAX),
});

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export function buildAuthRouter() {
  const router = Router();

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_input' });
    const { username, password } = parsed.data;

    const ipKey = `rl:login:ip:${getClientIp(req)}`;
    const userKey = `rl:login:user:${username.toLowerCase()}`;
    try {
      await consume({ key: ipKey, limit: 10, windowSec: 60 });
      await consume({ key: userKey, limit: 5, windowSec: 300 });
    } catch (e) {
      if (e instanceof RateLimitError) {
        res.set('Retry-After', String(e.retryAfterSec));
        return res.status(423).json({ error: 'rate_limited', retryAfter: e.retryAfterSec });
      }
      throw e;
    }

    const user = await getPrisma().user.findUnique({ where: { username } });
    if (!user || user.disabled) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const { token, jti } = signToken(user);
    await trackJti(user.id, jti, TOKEN_TTL_SEC);
    await reset(userKey);  // 登入成功後解鎖 username
    await getPrisma().user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.cookie('oc_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: TOKEN_TTL_SEC * 1000,
    });
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, displayName: user.displayName },
    });
  });

  router.post('/logout', requireAuth, async (req, res) => {
    const { jti, exp } = req.tokenPayload;
    const remaining = Math.max(1, exp - Math.floor(Date.now() / 1000));
    await blockJti(jti, remaining);
    res.clearCookie('oc_token');
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    const u = req.user;
    res.json({ id: u.id, username: u.username, role: u.role, displayName: u.displayName });
  });

  // 給 chat dock 左側用：列出所有未停用的使用者（簡化版，不含 password / role 等敏感欄位）
  router.get('/users', requireAuth, async (_req, res) => {
    const users = await getPrisma().user.findMany({
      where: { disabled: false },
      select: { id: true, username: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: 500,
    });
    res.json({ users });
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_input' });
    const updated = await getPrisma().user.update({
      where: { id: req.user.id },
      data: { displayName: parsed.data.displayName },
    });
    res.json({ id: updated.id, displayName: updated.displayName });
  });

  return router;
}
