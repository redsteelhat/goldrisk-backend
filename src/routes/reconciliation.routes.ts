/**
 * Reconciliation routes - Faz 7
 */

import { Router, Request, Response } from 'express';
import pool from '../lib/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOwnerOrManager } from '../middleware/rbac.js';
import {
  takeStockSnapshot,
  compareSnapshotVsLedger,
  resolveReconciliationAlert,
  getTransferReconciliationStatus,
} from '../services/reconciliation.service.js';

const router = Router();

router.use(authMiddleware);

/** POST /reconciliation/snapshot - Günlük stock_snapshot (cron 00:00) */
router.post(
  '/snapshot',
  requireOwnerOrManager,
  async (req: Request, res: Response): Promise<void> => {
    const date = (req.body?.date ?? new Date().toISOString().slice(0, 10)) as string;
    takeStockSnapshot(date)
      .then(({ inserted }) => res.json({ snapshot_date: date, inserted }))
      .catch((err) => res.status(500).json({ error: (err as Error).message }));
  }
);

/** POST /reconciliation/compare - Snapshot vs ledger karşılaştırma */
router.post(
  '/compare',
  requireOwnerOrManager,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const branchId = (req.body?.branch_id ?? req.user.branch_id) as string;
    const snapshotDate = (req.body?.snapshot_date ?? new Date().toISOString().slice(0, 10)) as string;
    if (!req.user.is_headquarter && branchId !== req.user.branch_id) {
      res.status(403).json({ error: 'Cannot compare other branch' });
      return;
    }
    compareSnapshotVsLedger(branchId, snapshotDate)
      .then(({ alerts }) => res.json({ branch_id: branchId, snapshot_date: snapshotDate, alerts }))
      .catch((err) => res.status(500).json({ error: (err as Error).message }));
  }
);

/** POST /reconciliation/resolve-alert - Manager onayı ile adjustment */
router.post(
  '/resolve-alert',
  requireOwnerOrManager,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { alert_id, approved, unit_price_g } = req.body;
    if (!alert_id || approved == null) {
      res.status(400).json({ error: 'alert_id and approved required' });
      return;
    }
    const unitPrice = unit_price_g ?? 0;
    resolveReconciliationAlert(alert_id, unitPrice, approved, req.user.id)
      .then((result) => res.json(result))
      .catch((err) => res.status(400).json({ error: (err as Error).message }));
  }
);

/** GET /reconciliation/status - Transfer + alert durumu */
router.get(
  '/status',
  requireOwnerOrManager,
  async (_req: Request, res: Response): Promise<void> => {
    const transferStatus = await getTransferReconciliationStatus();
    const alerts = await pool.query(
      `SELECT id, branch_id, product_id, snapshot_date, ledger_balance_g, snapshot_balance_g, diff_g, status
       FROM reconciliation_alert WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100`
    );
    res.json({
      transfer: transferStatus,
      alerts_pending: alerts.rows,
    });
  }
);

/** GET /reconciliation/report - Reconciliation report + alert */
router.get(
  '/report',
  requireOwnerOrManager,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const branchId = req.query.branch_id as string | undefined;
    const effectiveBranch = branchId ?? (req.user.is_headquarter ? null : req.user.branch_id);
    const branchFilter = effectiveBranch ? 'WHERE branch_id = $1' : '';
    const params = effectiveBranch ? [effectiveBranch] : [];

    const alerts = await pool.query(
      `SELECT * FROM reconciliation_alert ${branchFilter}
       ORDER BY created_at DESC LIMIT 200`,
      params
    );
    const transfer = await getTransferReconciliationStatus();

    res.json({
      alerts: alerts.rows,
      transfer: transfer,
    });
  }
);

export default router;
