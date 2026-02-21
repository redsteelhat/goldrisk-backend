/**
 * Audit service - login/logout AuditLog
 */

import pool from '../lib/db.js';
import { hashUserAgent } from './auth.service.js';

export async function logAuthEvent(
  userId: string,
  branchId: string,
  action: 'login' | 'logout',
  ipAddress?: string,
  userAgent?: string,
  sessionId?: string
): Promise<void> {
  const uaHash = userAgent ? hashUserAgent(userAgent) : null;

  await pool.query(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, ip_address, user_agent, session_id)
     VALUES ($1, $2, 'user', $1, $3, $4::inet, $5, $6)`,
    [userId, branchId, action, ipAddress ?? null, uaHash, sessionId ?? null]
  );
}
