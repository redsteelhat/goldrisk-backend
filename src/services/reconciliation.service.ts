/**
 * Reconciliation service - A3: Sayım sonrası inventory_gain/loss
 */

import pool from '../lib/db.js';
import { createAdjustment } from './transaction.service.js';
import { toGram, toTRY } from '../types/decimal.js';

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
