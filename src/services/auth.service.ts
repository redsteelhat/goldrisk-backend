/**
 * Auth service - login, password verify, audit
 */

import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool, { type AuthUser } from '../lib/db.js';
import type { PoolClient } from 'pg';

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return jwt.sign(
    {
      sub: user.id,
      branch_id: user.branch_id,
      role: user.role,
      is_hq: user.is_headquarter,
      email: user.email,
    },
    secret,
    { expiresIn: '8h' }
  );
}

export function verifyToken(token: string): jwt.JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string') throw new Error('Invalid token');
  return decoded;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const result = await pool.query(
    `SELECT u.id, u.branch_id, u.email, u.full_name, u.role, u.password_hash,
            b.is_headquarter
     FROM "user" u
     JOIN branch b ON b.id = u.branch_id
     WHERE u.email = $1 AND u.is_active = true`,
    [email.toLowerCase().trim()]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    branch_id: row.branch_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    is_headquarter: row.is_headquarter,
  };
}

export async function login(
  email: string,
  password: string,
  client?: PoolClient
): Promise<{ token: string; user: AuthUser } | null> {
  const conn = client ?? await pool.connect();
  try {
    const result = await conn.query(
      `SELECT u.id, u.branch_id, u.email, u.full_name, u.role, u.password_hash,
              b.is_headquarter
       FROM "user" u
       JOIN branch b ON b.id = u.branch_id
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase().trim()]
    );
    const row = result.rows[0];
    if (!row) return null;

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) return null;

    const user: AuthUser = {
      id: row.id,
      branch_id: row.branch_id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      is_headquarter: row.is_headquarter,
    };

    const token = signToken(user);

    await conn.query(
      `UPDATE "user" SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    return { token, user };
  } finally {
    if (!client) conn.release();
  }
}

/** KVKK: user_agent hash (SHA-256) */
export function hashUserAgent(ua: string): string {
  return createHash('sha256').update(ua ?? '').digest('hex');
}
