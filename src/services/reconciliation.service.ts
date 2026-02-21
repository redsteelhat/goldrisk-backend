/**
 * Reconciliation service - Faz 7: Snapshot vs ledger, alert, gece job'ları
 */

import pool from '../lib/db.js';
import { createAdjustment } from './transaction.service.js';
import { toGram, toTRY } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';

/** Ledger bakiye: SUM(debit) - SUM(credit) per branch+product */
export async function getLedgerBalance(
  branchId: string,
  productId: string
): Promise<string> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(
       CASE WHEN entry_type = 'debit' THEN quantity_g ELSE -quantity_g END
     ), 0)::text AS balance
     FROM stock_ledger
     WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId]
  );
  return result.rows[0]?.balance ?? '0';
}

/** Sayım sonrası düzeltme - fark için inventory_gain veya inventory_loss (adjustment) */
export async function reconcileStock(
  branchId: string,
  productId: string,
  countG: number | string,
  unitPriceG: number | string,
  createdBy: string,
  sessionId?: string
): Promise<{ id: string; type: 'inventory_gain' | 'inventory_loss' | 'no_change' }> {
  const ledgerBalance = await getLedgerBalance(branchId, productId);
  const ledgerG = toGram(ledgerBalance);
  const countGram = toGram(countG);
  const diff = countGram.minus(ledgerG);

  if (diff.isZero()) {
    return { id: '', type: 'no_change' };
  }

  const entryType = diff.greaterThan(0) ? 'debit' : 'credit';
  const quantityG = toGram(diff.abs().toFixed(6));

  const { id } = await createAdjustment(
    {
      branch_id: branchId,
      product_id: productId,
      entry_type: entryType,
      quantity_g: quantityG,
      unit_price_g: toTRY(unitPriceG),
      notes: `reconciliation: ledger=${ledgerBalance} count=${countG} session=${sessionId ?? 'manual'}`,
    },
    createdBy
  );

  return {
    id,
    type: entryType === 'debit' ? 'inventory_gain' : 'inventory_loss',
  };
}

/** 7.2: Günlük stock_snapshot - branch+product bazlı ledger bakiye kaydı */
export async function takeStockSnapshot(
  snapshotDate: string
): Promise<{ inserted: number }> {
  const branchesProducts = await pool.query(
    `SELECT DISTINCT sl.branch_id, sl.product_id
     FROM stock_ledger sl
     ORDER BY sl.branch_id, sl.product_id`
  );
  if (branchesProducts.rows.length === 0) return { inserted: 0 };

  let inserted = 0;
  for (const row of branchesProducts.rows) {
    const balance = await getLedgerBalance(row.branch_id, row.product_id);
    const balG = toGram(balance);
    const priceRow = await pool.query(
      `SELECT unit_price_g FROM stock_ledger WHERE branch_id = $1 AND product_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [row.branch_id, row.product_id]
    );
    const unitPrice = priceRow.rows[0]?.unit_price_g ?? '0';
    const balanceTry = balG.times(unitPrice);

    await pool.query(
      `INSERT INTO stock_snapshot (branch_id, product_id, snapshot_date, balance_g, balance_try)
       VALUES ($1, $2, $3::date, $4::numeric, $5::numeric)
       ON CONFLICT (branch_id, product_id, snapshot_date) DO UPDATE
       SET balance_g = EXCLUDED.balance_g, balance_try = EXCLUDED.balance_try`,
      [row.branch_id, row.product_id, snapshotDate, decimalToPg(balG), decimalToPg(balanceTry)]
    );
    inserted++;
  }
  return { inserted };
}

/** 7.1: Snapshot vs ledger karşılaştırma - fark varsa alert oluştur */
export async function compareSnapshotVsLedger(
  branchId: string,
  snapshotDate: string
): Promise<{ alerts: Array<{ product_id: string; ledger_g: string; snapshot_g: string; diff_g: string }> }> {
  const snapshots = await pool.query(
    `SELECT product_id, balance_g FROM stock_snapshot
     WHERE branch_id = $1 AND snapshot_date = $2::date`,
    [branchId, snapshotDate]
  );
  const alerts: Array<{ product_id: string; ledger_g: string; snapshot_g: string; diff_g: string }> = [];
  for (const snap of snapshots.rows) {
    const ledger = await getLedgerBalance(branchId, snap.product_id);
    const ledgerG = toGram(ledger);
    const snapshotG = toGram(snap.balance_g);
    const diff = ledgerG.minus(snapshotG);
    if (!diff.isZero()) {
      const existing = await pool.query(
        `SELECT id FROM reconciliation_alert
         WHERE branch_id = $1 AND product_id = $2 AND snapshot_date = $3::date AND status = 'pending'`,
        [branchId, snap.product_id, snapshotDate]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO reconciliation_alert (branch_id, product_id, snapshot_date, ledger_balance_g, snapshot_balance_g, diff_g, status)
           VALUES ($1, $2, $3::date, $4::numeric, $5::numeric, $6::numeric, 'pending')`,
          [branchId, snap.product_id, snapshotDate, decimalToPg(ledgerG), decimalToPg(snapshotG), decimalToPg(diff)]
        );
      }
      alerts.push({
        product_id: snap.product_id,
        ledger_g: decimalToPg(ledgerG),
        snapshot_g: decimalToPg(snapshotG),
        diff_g: decimalToPg(diff),
      });
    }
  }
  return { alerts };
}

/** Fark varsa: manager onayı ile adjustment */
export async function resolveReconciliationAlert(
  alertId: string,
  unitPriceG: number | string,
  approved: boolean,
  createdBy: string
): Promise<{ adjustment_id?: string; status: string }> {
  const row = await pool.query(
    `SELECT id, branch_id, product_id, diff_g, status FROM reconciliation_alert
     WHERE id = $1 AND status = 'pending'`,
    [alertId]
  );
  const alert = row.rows[0];
  if (!alert) throw new Error('Alert not found or not pending');

  const diff = toGram(alert.diff_g);
  if (approved && !diff.isZero()) {
    const entryType = diff.greaterThan(0) ? 'debit' : 'credit';
    const qtyG = toGram(diff.abs().toFixed(6));
    const { id: txnId } = await createAdjustment(
      {
        branch_id: alert.branch_id,
        product_id: alert.product_id,
        entry_type: entryType,
        quantity_g: qtyG,
        unit_price_g: toTRY(unitPriceG),
        notes: `reconciliation_alert: alert_id=${alertId}`,
      },
      createdBy
    );
    await pool.query(
      `UPDATE reconciliation_alert SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), adjustment_transaction_id = $2 WHERE id = $3`,
      [createdBy, txnId, alertId]
    );
    return { adjustment_id: txnId, status: 'resolved' };
  }
  if (!approved) {
    await pool.query(
      `UPDATE reconciliation_alert SET status = 'rejected', resolved_by = $1, resolved_at = NOW() WHERE id = $2`,
      [createdBy, alertId]
    );
    return { status: 'rejected' };
  }
  return { status: 'resolved' };
}

/** 7.2: Cross-branch reconciliation - approve edilmiş ama receive edilmemiş transfer listesi */
export async function getTransferReconciliationStatus(): Promise<{
  pending_receive: number;
  received_today: number;
  pending_list: Array<{ id: string; source_branch_id: string; target_branch_id: string }>;
}> {
  const pending = await pool.query(
    `SELECT COUNT(*) AS c FROM transfer_request WHERE status = 'approved' AND received_at IS NULL`
  );
  const receivedToday = await pool.query(
    `SELECT COUNT(*) AS c FROM transfer_request WHERE status = 'received' AND received_at::date = CURRENT_DATE`
  );
  const pendingList = await pool.query(
    `SELECT id, source_branch_id, target_branch_id FROM transfer_request
     WHERE status = 'approved' AND received_at IS NULL ORDER BY approved_at ASC`
  );
  return {
    pending_receive: Number(pending.rows[0]?.c ?? 0),
    received_today: Number(receivedToday.rows[0]?.c ?? 0),
    pending_list: pendingList.rows,
  };
}
