/**
 * Transaction service - Sale, Purchase, atomik Ledger
 * TDD: Price Lock, GoldItem FOR UPDATE SKIP LOCKED, idempotency, MASAK
 */

import pool from '../lib/db.js';
import { lockPriceForTransaction } from './daily-price.service.js';
import { appendLedgerEntry } from './stock-ledger.service.js';
import { getEffectiveFireRate, calculateFireCost } from './fire-rate.service.js';
import { logWeightDiscrepancy } from './audit.service.js';
import { gramTimesPrice, toGram, toTRY, type Gram, type TRYAmount } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';
import type { GoldType } from './daily-price.service.js';

const WEIGHT_DISCREPANCY_THRESHOLD_G = 0.01;

export type PaymentMethod = 'cash' | 'pos' | 'transfer' | 'gold_exchange' | 'mixed';

export interface SaleInput {
  branch_id: string;
  gold_item_id: string;
  customer_id?: string;
  labor_amount?: TRYAmount | number;
  payment_method: PaymentMethod;
  client_request_id?: string;
  notes?: string;
}

export interface PurchaseInput {
  branch_id: string;
  product_id: string;
  quantity_g: Gram | number;
  unit_price_g: TRYAmount | number;
  labor_amount?: TRYAmount | number;
  payment_method: PaymentMethod;
  client_request_id?: string;
  notes?: string;
}

export interface ReturnInput {
  branch_id: string;
  parent_transaction_id: string;
  gold_item_id: string;
  quantity_g: Gram | number;
  labor_refund_amount?: TRYAmount | number;
  payment_method: PaymentMethod;
  client_request_id?: string;
  notes?: string;
}

export interface AdjustmentInput {
  branch_id: string;
  product_id: string;
  entry_type: 'debit' | 'credit';
  quantity_g: Gram | number;
  unit_price_g: TRYAmount | number;
  client_request_id?: string;
  notes?: string;
}

export interface ScrapInput {
  branch_id: string;
  gold_item_id: string;
  client_request_id?: string;
  notes?: string;
}

const MASAK_THRESHOLD = 20000;

/** Satış: GoldItem FOR UPDATE, Transaction + StockLedger credit atomik */
export async function createSale(
  input: SaleInput,
  goldType: GoldType,
  createdBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotency = await checkIdempotency(
      input.branch_id,
      input.client_request_id,
      client
    );
    if (idempotency) {
      await client.query('ROLLBACK');
      return { id: idempotency };
    }

    const priceRow = await lockPriceForTransaction(goldType, client);

    const goldResult = await client.query(
      `SELECT id, product_id, branch_id, actual_weight_g, acquisition_price_g
       FROM gold_item
       WHERE id = $1 AND status = 'in_stock'
       FOR UPDATE SKIP LOCKED`,
      [input.gold_item_id]
    );
    const gold = goldResult.rows[0];
    if (!gold) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found or not in_stock');
    }

    const quantityG = toGram(gold.actual_weight_g);
    const unitPrice = toTRY(priceRow.sell_price);
    const laborAmount = toTRY(input.labor_amount ?? 0);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);
    const totalAmountWithLabor = totalAmount.plus(laborAmount);

    const fireRate = await getEffectiveFireRate(gold.product_id, goldType);
    const fireCostStr =
      fireRate > 0
        ? calculateFireCost(gold.actual_weight_g, fireRate, gold.acquisition_price_g)
        : null;

    const masak =
      input.payment_method === 'cash' &&
      totalAmountWithLabor.toNumber() >= MASAK_THRESHOLD;

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, customer_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, masak_reported, fire_cost, notes, created_by)
       VALUES ($1, 'sale', $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8, $9::payment_method, $10, $11, $12::numeric, $13, $14)
       RETURNING id`,
      [
        input.branch_id,
        input.gold_item_id,
        input.customer_id ?? null,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(laborAmount),
        decimalToPg(totalAmountWithLabor),
        priceRow.id,
        input.payment_method,
        input.client_request_id ?? null,
        masak,
        fireCostStr,
        input.notes ?? null,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: gold.product_id,
        gold_item_id: input.gold_item_id,
        entry_type: 'credit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'sale',
      },
      client
    );

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [createdBy]
    );
    await client.query(
      `UPDATE gold_item SET status = 'sold' WHERE id = $1`,
      [input.gold_item_id]
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

/** Alış (gram bazlı): Transaction + StockLedger debit atomik */
export async function createPurchase(
  input: PurchaseInput,
  goldType: GoldType,
  createdBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotency = await checkIdempotency(
      input.branch_id,
      input.client_request_id,
      client
    );
    if (idempotency) {
      await client.query('ROLLBACK');
      return { id: idempotency };
    }

    const priceRow = await lockPriceForTransaction(goldType, client);

    const quantityG = toGram(input.quantity_g);
    const unitPrice = toTRY(input.unit_price_g);
    const laborAmount = toTRY(input.labor_amount ?? 0);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);
    const totalAmountWithLabor = totalAmount.plus(laborAmount);

    const masak =
      input.payment_method === 'cash' &&
      totalAmountWithLabor.toNumber() >= MASAK_THRESHOLD;

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, masak_reported, notes, created_by)
       VALUES ($1, 'purchase', $2::numeric, $3::numeric, $4::numeric, $5::numeric, $6, $7::payment_method, $8, $9, $10, $11)
       RETURNING id`,
      [
        input.branch_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(laborAmount),
        decimalToPg(totalAmountWithLabor),
        priceRow.id,
        input.payment_method,
        input.client_request_id ?? null,
        masak,
        input.notes ?? null,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: input.product_id,
        entry_type: 'debit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'purchase',
      },
      client
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

/** İade: parent_transaction_id zorunlu, quantity_g = gerçek tartım, labor_refund default 0 */
export async function createReturn(
  input: ReturnInput,
  createdBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotency = await checkIdempotency(
      input.branch_id,
      input.client_request_id,
      client
    );
    if (idempotency) {
      await client.query('ROLLBACK');
      return { id: idempotency };
    }

    const parentResult = await client.query(
      `SELECT id, gold_item_id, product_id, daily_price_id, unit_price_g, labor_amount
       FROM "transaction" WHERE id = $1 AND type = 'sale'`,
      [input.parent_transaction_id]
    );
    const parent = parentResult.rows[0];
    if (!parent) {
      await client.query('ROLLBACK');
      throw new Error('Parent transaction not found or not a sale');
    }
    if (parent.gold_item_id !== input.gold_item_id) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem does not match parent transaction');
    }

    const goldResult = await client.query(
      `SELECT id, product_id, branch_id FROM gold_item WHERE id = $1 AND status = 'sold'
       FOR UPDATE SKIP LOCKED`,
      [input.gold_item_id]
    );
    const gold = goldResult.rows[0];
    if (!gold) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found or not sold');
    }

    const quantityG = toGram(input.quantity_g);
    const unitPrice = toTRY(parent.unit_price_g);
    const laborRefund = toTRY(input.labor_refund_amount ?? 0);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);
    const totalAmountWithLabor = totalAmount.plus(laborRefund);

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, parent_transaction_id, client_request_id, notes, created_by)
       VALUES ($1, 'return', $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric, $7, $8::payment_method, $9, $10, $11, $12)
       RETURNING id`,
      [
        input.branch_id,
        input.gold_item_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(laborRefund),
        decimalToPg(totalAmountWithLabor),
        parent.daily_price_id,
        input.payment_method,
        input.parent_transaction_id,
        input.client_request_id ?? null,
        input.notes ?? null,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: gold.product_id,
        gold_item_id: input.gold_item_id,
        entry_type: 'debit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'return',
      },
      client
    );

    // A1: Tartım farkı > eşik → AuditLog (Return zaten actual_weight ile kayıtlı; ek adjustment stok çift sayımı yapar)
    const parentQty = toGram(parent.quantity_g);
    const diff = quantityG.minus(parentQty).abs();
    if (diff.greaterThan(WEIGHT_DISCREPANCY_THRESHOLD_G)) {
      await logWeightDiscrepancy(
        createdBy,
        input.branch_id,
        'gold_item',
        input.gold_item_id,
        decimalToPg(parentQty),
        decimalToPg(quantityG),
        String(WEIGHT_DISCREPANCY_THRESHOLD_G),
        'return',
        client
      );
    }

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [createdBy]
    );
    await client.query(
      `UPDATE gold_item SET status = 'returned' WHERE id = $1`,
      [input.gold_item_id]
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

/** Adjustment: manager onayı, ledger debit/credit */
export async function createAdjustment(
  input: AdjustmentInput,
  createdBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotency = await checkIdempotency(
      input.branch_id,
      input.client_request_id,
      client
    );
    if (idempotency) {
      await client.query('ROLLBACK');
      return { id: idempotency };
    }

    const priceRow = await client.query(
      `SELECT id FROM daily_price WHERE gold_type = 'HAS' AND is_backdated = false ORDER BY recorded_at DESC LIMIT 1`
    );
    const dailyPriceId = priceRow.rows[0]?.id;
    if (!dailyPriceId) {
      await client.query('ROLLBACK');
      throw new Error('No active daily price for adjustment');
    }

    const quantityG = toGram(input.quantity_g);
    const unitPrice = toTRY(input.unit_price_g);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, notes, created_by)
       VALUES ($1, 'adjustment', $2::numeric, $3::numeric, 0, $4::numeric, $5, 'transfer', $6, $7, $8)
       RETURNING id`,
      [
        input.branch_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        dailyPriceId,
        input.client_request_id ?? null,
        input.notes ?? null,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: input.product_id,
        entry_type: input.entry_type,
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'adjustment',
      },
      client
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

/** Scrap: GoldItem status scrapped, ledger credit */
export async function createScrap(
  input: ScrapInput,
  createdBy: string
): Promise<{ id: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idempotency = await checkIdempotency(
      input.branch_id,
      input.client_request_id,
      client
    );
    if (idempotency) {
      await client.query('ROLLBACK');
      return { id: idempotency };
    }

    const goldResult = await client.query(
      `SELECT id, product_id, branch_id, actual_weight_g, acquisition_price_g
       FROM gold_item WHERE id = $1 AND status = 'in_stock' FOR UPDATE SKIP LOCKED`,
      [input.gold_item_id]
    );
    const gold = goldResult.rows[0];
    if (!gold) {
      await client.query('ROLLBACK');
      throw new Error('GoldItem not found or not in_stock');
    }

    const quantityG = toGram(gold.actual_weight_g);
    const unitPrice = toTRY(gold.acquisition_price_g);
    const totalAmount = gramTimesPrice(quantityG, unitPrice);

    const priceRow = await client.query(
      `SELECT id FROM daily_price WHERE gold_type = 'HAS' AND is_backdated = false ORDER BY recorded_at DESC LIMIT 1`
    );
    const dailyPriceId = priceRow.rows[0]?.id ?? null;
    if (!dailyPriceId) {
      await client.query('ROLLBACK');
      throw new Error('No active daily price');
    }

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, notes, created_by)
       VALUES ($1, 'scrap', $2, $3::numeric, $4::numeric, 0, $5::numeric, $6, 'transfer', $7, $8, $9)
       RETURNING id`,
      [
        input.branch_id,
        input.gold_item_id,
        decimalToPg(quantityG),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        dailyPriceId,
        input.client_request_id ?? null,
        input.notes ?? null,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: gold.product_id,
        gold_item_id: input.gold_item_id,
        entry_type: 'credit',
        quantity_g: quantityG,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'scrap',
      },
      client
    );

    await client.query(
      `SELECT set_config('app.current_user_id', $1, true)`,
      [createdBy]
    );
    await client.query(
      `UPDATE gold_item SET status = 'scrapped' WHERE id = $1`,
      [input.gold_item_id]
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

async function checkIdempotency(
  branchId: string,
  clientRequestId: string | undefined,
  client: import('pg').PoolClient
): Promise<string | null> {
  if (!clientRequestId) return null;
  const r = await client.query(
    `SELECT id FROM "transaction" WHERE branch_id = $1 AND client_request_id = $2`,
    [branchId, clientRequestId]
  );
  return r.rows[0]?.id ?? null;
}
