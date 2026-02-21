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

/** A1: Tartım farkı > eşik → AuditLog */
export async function logWeightDiscrepancy(
  userId: string,
  branchId: string,
  entityType: string,
  entityId: string,
  expectedG: string,
  actualG: string,
  thresholdG: string,
  context?: string,
  client?: import('pg').PoolClient
): Promise<void> {
  const q = client ? client.query.bind(client) : pool.query.bind(pool);
  const oldVal = { expected_g: expectedG, actual_g: actualG, threshold_g: thresholdG, context: context ?? 'weight_discrepancy' };
  const newVal = { adjustment_triggered: true };
  await q(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4::uuid, 'update', $5::jsonb, $6::jsonb)`,
    [userId, branchId, entityType, entityId, JSON.stringify(oldVal), JSON.stringify(newVal)]
  );
}
