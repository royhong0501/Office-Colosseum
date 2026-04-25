// Admin 後台 endpoints。全部須 ADMIN role。
//   POST   /admin/users                   建帳號
//   GET    /admin/users                   列帳號
//   PATCH  /admin/users/:id                disabled / displayName / role
//   POST   /admin/users/:id/reset-password 重設密碼（同步 revoke 該 user 所有 active token）
//   GET    /admin/presence                 目前線上玩家

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '../db/prisma.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { revokeAllForUser } from '../services/blocklist.js';
import { listOnline } from '../services/presenceService.js';
import { PLAYER_NAME_MAX } from '@office-colosseum/shared';

const createSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(6).max(256),
  displayName: z.string().min(1).max(PLAYER_NAME_MAX).optional(),
  role: z.enum(['ADMIN', 'PLAYER']).optional(),
});

const updateSchema = z.object({
  disabled: z.boolean().optional(),
  displayName: z.string().min(1).max(PLAYER_NAME_MAX).optional(),
  role: z.enum(['ADMIN', 'PLAYER']).optional(),
});

const resetSchema = z.object({
  password: z.string().min(6).max(256),
});

export function buildAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.post('/users', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_input', detail: parsed.error.flatten() });
    const { username, password, displayName, role } = parsed.data;
    const exists = await getPrisma().user.findUnique({ where: { username } });
    if (exists) return res.status(409).json({ error: 'username_taken' });
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await getPrisma().user.create({
      data: {
        username, passwordHash,
        displayName: displayName ?? username,
        role: role ?? 'PLAYER',
        createdById: req.user.id,
      },
    });
    res.status(201).json(serialize(u));
  });

  router.get('/users', async (_req, res) => {
    const users = await getPrisma().user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ users: users.map(serialize) });
  });

  router.patch('/users/:id', async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_input' });
    const data = parsed.data;
    const u = await getPrisma().user.update({
      where: { id: req.params.id },
      data,
    }).catch(() => null);
    if (!u) return res.status(404).json({ error: 'not_found' });
    if (data.disabled === true) {
      // 帳號被停用：把該 user 所有 active jti 寫進 blocklist
      await revokeAllForUser(u.id).catch(() => {});
    }
    res.json(serialize(u));
  });

  router.post('/users/:id/reset-password', async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_input' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const u = await getPrisma().user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    }).catch(() => null);
    if (!u) return res.status(404).json({ error: 'not_found' });
    await revokeAllForUser(u.id).catch(() => {});
    res.json({ ok: true });
  });

  router.get('/presence', async (_req, res) => {
    const list = await listOnline().catch(() => []);
    res.json({ online: list });
  });

  return router;
}

function serialize(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    disabled: u.disabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt,
  };
}
