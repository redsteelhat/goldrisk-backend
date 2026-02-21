/**
 * Transfer service - şube arası stok transferi
 * TDD: source credit + target debit atomik
 */

import pool from '../lib/db.js';
import { appendLedgerEntry } from './stock-ledger.service.js';
import { gramTimesPrice, toGram, toTRY } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';

export interface CreateTransferInput {
  source_branch_id: string;
  target_branch_id: string;
  gold_item_id: string;
  notes?: string;
}

/** transfer_request oluşturma */
export async function createTransferRequest(
  input: CreateTransferInput,
  createdBy: string
): Promise<{ id: string }> {
  const result = await pool.query(
    `INSERT INTO transfer_request (source_branch_id, target_branch_id, gold_item_id, quantity_g, status, created_by)
     SELECT $1, $2, $3, gi.actual_weight_g, 'pending', $4
     FROM gold_item gi
     WHERE gi.id = $3 AND gi.branch_id = $1 AND gi.status = 'in_stock'
     RETURNING id`,
    [input.source_branch_id, input.target_branch_id, input.gold_item_id, createdBy]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('GoldItem not found, not in source branch, or not in_stock');
  }
  return { id: row.id };
}

/** Source onay: credit (transfer_out), GoldItem status=transferred */
export async function approveTransfer(
  transferId: string,
  branchId: string,
  approvedBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tr = await client.query(
      `SELECT id, source_branch_id, target_branch_id, gold_item_id, quantity_g, status
       FROM transfer_request WHERE id = $1 FOR UPDATE`,
      [transferId]
    );
    const req = tr.rows[0];
    if (!req) {
      await client.query('ROLLBACK');
      throw new Error('Transfer request not found');
    }
    if (req.source_branch_id !== branchId) {
      await client.query('ROLLBACK');
      throw new Error('Only source branch can approve');
    }
    if (req.status !== 'pending') {
      await client.query('ROLLBACK');
      throw new Error('Transfer already approved or received');
    }

    const gold = await client.query(
      `SELECT product_id, actual_weight_g, acquisition_price_g FROM gold_item WHERE id = $1 AND status = 'in_stock' FOR UPDATE`,
      [req.gold_item_id]
    );
    const gi = gold.rows[0];
    if (!gi) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found or not in_stock');
    }

    const priceRow = await client.query(
      `SELECT id FROM daily_price WHERE gold_type = 'HAS' AND is_backdated = false ORDER BY recorded_at DESC LIMIT 1`
    );
    const dailyPriceId = priceRow.rows[0]?.id;
    if (!dailyPriceId) {
      await client.query('ROLLBACK');
      throw new Error('No active daily price');
    }

    const quantityG = toGram(req.quantity_g);
    const unitPrice = toTRY(gi.acquisition_price_g);
    const totalAmount = quantityG.times(unitPrice);

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, notes, created_by)
       VALUES ($1, 'transfer', $2, $3::numeric, $4::numeric, 0, $5::numeric, $6, 'transfer', 'transfer_out', $7)
       RETURNING id`,
      [
        req.source_branch_id,
        req.gold_item_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        dailyPriceId,
        approvedBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: req.source_branch_id,
        product_id: gi.product_id,
        gold_item_id: req.gold_item_id,
        entry_type: 'credit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'transfer_out',
      },
      client
    );

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [approvedBy]
    );
    await client.query(
      `UPDATE gold_item SET status = 'transferred' WHERE id = $1`,
      [req.gold_item_id]
    );

    await client.query(
      `UPDATE transfer_request SET status = 'approved', approved_at = NOW() WHERE id = $1`,
      [transferId]
    );

    await client.query('COMMIT');
    return { id: txnId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Target receive: debit (transfer_in), GoldItem branch_id güncelleme */
export async function receiveTransfer(
  transferId: string,
  branchId: string,
  receivedBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tr = await client.query(
      `SELECT id, source_branch_id, target_branch_id, gold_item_id, quantity_g, status
       FROM transfer_request WHERE id = $1 FOR UPDATE`,
      [transferId]
    );
    const req = tr.rows[0];
    if (!req) {
      await client.query('ROLLBACK');
      throw new Error('Transfer request not found');
    }
    if (req.target_branch_id !== branchId) {
      await client.query('ROLLBACK');
      throw new Error('Only target branch can receive');
    }
    if (req.status !== 'approved') {
      await client.query('ROLLBACK');
      throw new Error('Transfer must be approved first');
    }

    const gold = await client.query(
      `SELECT product_id, actual_weight_g, acquisition_price_g FROM gold_item WHERE id = $1 AND status = 'transferred' FOR UPDATE`,
      [req.gold_item_id]
    );
    const gi = gold.rows[0];
    if (!gi) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found or not transferred');
    }

    const priceRow = await client.query(
      `SELECT id FROM daily_price WHERE gold_type = 'HAS' AND is_backdated = false ORDER BY recorded_at DESC LIMIT 1`
    );
    const dailyPriceId = priceRow.rows[0]?.id;
    if (!dailyPriceId) {
      await client.query('ROLLBACK');
      throw new Error('No active daily price');
    }

    const quantityG = toGram(req.quantity_g);
    const unitPrice = toTRY(gi.acquisition_price_g);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, notes, created_by)
       VALUES ($1, 'transfer', $2, $3::numeric, $4::numeric, 0, $5::numeric, $6, 'transfer', 'transfer_in', $7)
       RETURNING id`,
      [
        req.target_branch_id,
        req.gold_item_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        dailyPriceId,
        receivedBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: req.target_branch_id,
        product_id: gi.product_id,
        gold_item_id: req.gold_item_id,
        entry_type: 'debit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'transfer_in',
      },
      client
    );

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [receivedBy]
    );
    await client.query(
      `UPDATE gold_item SET branch_id = $1, status = 'in_stock' WHERE id = $2`,
      [req.target_branch_id, req.gold_item_id]
    );

    await client.query(
      `UPDATE transfer_request SET status = 'received', received_at = NOW() WHERE id = $1`,
      [transferId]
    );

    await client.query('COMMIT');
    return { id: txnId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
