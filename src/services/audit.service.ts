/**
 * Audit service - AuditLog: login, logout, Transaction create, DailyPrice insert, export, MASAK report
 * KVKK: user_agent hash (SHA-256); müşteri PII yok, sadece customer_id
 */

import pool from '../lib/db.js';
import type { PoolClient } from 'pg';
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

/** Transaction create AuditLog */
export async function logTransactionCreate(
  userId: string,
  branchId: string,
  transactionId: string,
  type: string,
  summary: Record<string, unknown>,
  client?: PoolClient
): Promise<void> {
  const q = client ? client.query.bind(client) : pool.query.bind(pool);
  await q(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, new_value)
     VALUES ($1, $2, 'transaction', $3::uuid, 'create', $4::jsonb)`,
    [userId, branchId, transactionId, JSON.stringify({ type, ...summary })]
  );
}

/** DailyPrice insert AuditLog */
export async function logDailyPriceInsert(
  userId: string,
  branchId: string,
  dailyPriceId: string,
  goldType: string,
  buyPrice: string,
  sellPrice: string,
  isBackdated: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, new_value)
     VALUES ($1, $2, 'daily_price', $3::uuid, 'create', $4::jsonb)`,
    [
      userId,
      branchId,
      dailyPriceId,
      JSON.stringify({ gold_type: goldType, buy_price: buyPrice, sell_price: sellPrice, is_backdated: isBackdated }),
    ]
  );
}

/** Export AuditLog - veri dışa aktarma */
export async function logExport(
  userId: string,
  branchId: string,
  exportType: string,
  filters?: Record<string, unknown>,
  userAgent?: string
): Promise<void> {
  const uaHash = userAgent ? hashUserAgent(userAgent) : null;
  await pool.query(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, new_value, user_agent)
     VALUES ($1, $2, 'export', $1::uuid, 'export', $3::jsonb, $4)`,
    [userId, branchId, JSON.stringify({ export_type: exportType, filters: filters ?? {} }), uaHash]
  );
}

/** MASAK report AuditLog - rapor erişimi */
export async function logMasakReport(
  userId: string,
  branchId: string,
  filters: Record<string, unknown>,
  rowCount: number,
  userAgent?: string
): Promise<void> {
  const uaHash = userAgent ? hashUserAgent(userAgent) : null;
  await pool.query(
    `INSERT INTO audit_log (user_id, branch_id, entity_type, entity_id, action, new_value, user_agent)
     VALUES ($1, $2, 'masak_report', $1::uuid, 'masak_report', $3::jsonb, $4)`,
    [userId, branchId, JSON.stringify({ filters, row_count: rowCount }), uaHash]
  );
}
