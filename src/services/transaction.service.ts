/**
 * Transaction service - Sale, Purchase, atomik Ledger
 * TDD: Price Lock, GoldItem FOR UPDATE SKIP LOCKED, idempotency, MASAK
 */

import pool from '../lib/db.js';
import { lockPriceForTransaction } from './daily-price.service.js';
import { appendLedgerEntry } from './stock-ledger.service.js';
import { gramTimesPrice, toGram, toTRY, type Gram, type TRYAmount } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';
import type { GoldType } from './daily-price.service.js';

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

    const masak =
      input.payment_method === 'cash' &&
      totalAmountWithLabor.toNumber() >= MASAK_THRESHOLD;

    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, gold_item_id, customer_id, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, masak_reported, notes, created_by)
       VALUES ($1, 'sale', $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8, $9::payment_method, $10, $11, $12, $13)
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
