/**
 * Reports routes - MASAK rapor, export
 */

import { Router, Request, Response } from 'express';
import pool from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { logMasakReport, logExport } from '../services/audit.service.js';

const router = Router();

router.use(authMiddleware);

/** GET /reports/masak - MASAK rapor (20.000+ TL nakit işlemler) */
router.get(
  '/masak',
  requireRole('owner', 'manager', 'auditor'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { branch_id, start_date, end_date } = req.query;
    const filters: Record<string, unknown> = {};
    if (branch_id) filters.branch_id = branch_id;
    if (start_date) filters.start_date = start_date;
    if (end_date) filters.end_date = end_date;

    const effectiveBranch = branch_id ?? (req.user.is_headquarter ? null : req.user.branch_id);
    const branchFilter = effectiveBranch ? `AND t.branch_id = $1` : '';
    const params: unknown[] = effectiveBranch ? [effectiveBranch] : [];
    const dateParams: string[] = [];
    if (start_date) {
      dateParams.push(`t.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      dateParams.push(`t.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }
    const dateClause = dateParams.length ? `AND ${dateParams.join(' AND ')}` : '';

    try {
      const result = await pool.query(
        `SELECT t.id, t.branch_id, t.type, t.quantity_g, t.unit_price_g, t.total_amount,
                t.payment_method, t.masak_reported, t.created_at, t.created_by
         FROM "transaction" t
         WHERE t.masak_reported = true ${branchFilter} ${dateClause}
         ORDER BY t.created_at DESC`,
        params
      );

      await logMasakReport(
        req.user.id,
        req.user.branch_id,
        filters,
        result.rows.length,
        req.get('user-agent')
      );

      res.json({ transactions: result.rows, count: result.rows.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

/** GET /reports/export - Transaction export (CSV) + AuditLog */
router.get(
  '/export',
  requireRole('owner', 'manager', 'auditor'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { format = 'json', start_date, end_date } = req.query;
    const filters: Record<string, unknown> = { format, start_date, end_date };

    const branchFilter = req.user.is_headquarter ? '' : `AND t.branch_id = $1`;
    const params: unknown[] = req.user.is_headquarter ? [] : [req.user.branch_id];
    const dateParams: string[] = [];
    if (start_date) {
      dateParams.push(`t.created_at >= $${params.length + 1}`);
      params.push(start_date);
    }
    if (end_date) {
      dateParams.push(`t.created_at <= $${params.length + 1}`);
      params.push(end_date);
    }
    const dateClause = dateParams.length ? `AND ${dateParams.join(' AND ')}` : '';

    try {
      const result = await pool.query(
        `SELECT t.*, b.name AS branch_name
         FROM "transaction" t
         JOIN branch b ON b.id = t.branch_id
         WHERE 1=1 ${branchFilter} ${dateClause}
         ORDER BY t.created_at DESC
         LIMIT 10000`,
        params
      );

      await logExport(
        req.user.id,
        req.user.branch_id,
        'transaction',
        filters,
        req.get('user-agent')
      );

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`
        );
        const headers = result.rows[0] ? Object.keys(result.rows[0]) : [];
        const csv = [
          headers.join(','),
          ...result.rows.map((r: Record<string, unknown>) =>
            headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')
          ),
        ].join('\n');
        res.send(csv);
        return;
      }

      res.json({ transactions: result.rows, count: result.rows.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

export default router;
