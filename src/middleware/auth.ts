/**
 * JWT auth middleware
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service.js';
import pool from '../lib/db.js';

export type AuthRequest = Request;

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
    return;
  }

  try {
    const payload = verifyToken(token) as { sub: string };

    const result = await pool.query(
      `SELECT u.id, u.branch_id, u.email, u.full_name, u.role,
              b.is_headquarter
       FROM "user" u
       JOIN branch b ON b.id = u.branch_id
       WHERE u.id = $1 AND u.is_active = true`,
      [payload.sub]
    );
    const row = result.rows[0];
    if (!row) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    req.user = {
      id: row.id,
      branch_id: row.branch_id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      is_headquarter: row.is_headquarter,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
