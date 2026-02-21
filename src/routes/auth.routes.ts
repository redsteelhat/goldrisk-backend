/**
 * Auth routes - login, logout
 */

import { Router, Request, Response } from 'express';
import { login } from '../services/auth.service.js';
import { logAuthEvent } from '../services/audit.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

/** POST /auth/login */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }

  const result = await login(email, password);
  if (!result) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const ip = req.ip ?? req.socket.remoteAddress;
  const ua = req.get('user-agent');

  await logAuthEvent(
    result.user.id,
    result.user.branch_id,
    'login',
    ip,
    ua,
    undefined
  );

  res.json({
    token: result.token,
    user: {
      id: result.user.id,
      branch_id: result.user.branch_id,
      email: result.user.email,
      full_name: result.user.full_name,
      role: result.user.role,
    },
  });
});

/** POST /auth/logout - AuditLog kaydı */
router.post(
  '/logout',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ip = req.ip ?? req.socket.remoteAddress;
    const ua = req.get('user-agent');

    await logAuthEvent(
      req.user.id,
      req.user.branch_id,
      'logout',
      ip,
      ua,
      undefined
    );

    res.json({ ok: true });
  }
);

/** GET /auth/me - mevcut kullanıcı */
router.get(
  '/me',
  authMiddleware,
  (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({
      id: req.user.id,
      branch_id: req.user.branch_id,
      email: req.user.email,
      full_name: req.user.full_name,
      role: req.user.role,
    });
  }
);

export default router;
