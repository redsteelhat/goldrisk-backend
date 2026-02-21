/**
 * GoldItem service - A2: Manuel gram düzeltme
 * Adjustment Transaction zorunlu, direkt UPDATE yasak
 */

import pool from '../lib/db.js';
import { appendLedgerEntry } from './stock-ledger.service.js';
import { toGram, toTRY } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';

/** Manuel gram düzeltme - owner/manager only, adjustment + GoldItem update atomik */
export async function correctWeight(
  goldItemId: string,
  newActualWeightG: number | string,
  createdBy: string
): Promise<{ adjustment_id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const goldResult = await client.query(
      `SELECT id, product_id, branch_id, actual_weight_g, acquisition_price_g
       FROM gold_item WHERE id = $1 FOR UPDATE`,
      [goldItemId]
    );
    const gold = goldResult.rows[0];
    if (!gold) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found');
    }

    const oldWeight = toGram(gold.actual_weight_g);
    const newWeight = toGram(newActualWeightG);
    const delta = newWeight.minus(oldWeight);

    if (delta.isZero()) {
      await client.query('ROLLBACK');
      throw new Error('No change in weight');
    }

    const priceRow = await client.query(
      `SELECT id FROM daily_price WHERE gold_type = 'HAS' AND is_backdated = false ORDER BY recorded_at DESC LIMIT 1`
    );
    const dailyPriceId = priceRow.rows[0]?.id;
    if (!dailyPriceId) {
      await client.query('ROLLBACK');
      throw new Error('No active daily price');
    }

    const unitPrice = toTRY(gold.acquisition_price_g ?? 0);
    const totalAmount = delta.abs().times(unitPrice);

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, notes, created_by)
       VALUES ($1, 'adjustment', $2, $3::numeric, $4::numeric, 0, $5::numeric, $6, 'transfer', $7, $8)
       RETURNING id`,
      [
        gold.branch_id,
        goldItemId,
        decimalToPg(delta.abs()),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        dailyPriceId,
        `gram_correction: ${decimalToPg(oldWeight)} -> ${decimalToPg(newWeight)}`,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    const entryType = delta.greaterThan(0) ? 'debit' : 'credit';
    const qtyGram = toGram(delta.abs().toFixed(6));
    await appendLedgerEntry(
      {
        branch_id: gold.branch_id,
        product_id: gold.product_id,
        gold_item_id: goldItemId,
        entry_type: entryType,
        quantity_g: qtyGram,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'adjustment',
      },
      client
    );

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [createdBy]
    );
    await client.query(
      `UPDATE gold_item SET actual_weight_g = $1::numeric WHERE id = $2`,
      [decimalToPg(newWeight), goldItemId]
    );

    await client.query('COMMIT');
    return { adjustment_id: txnId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
