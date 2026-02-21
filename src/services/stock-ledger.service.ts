/**
 * StockLedger service - debit/credit, Transaction ile atomik
 * Bakiye = SUM(debit) - SUM(credit)
 */

import type { PoolClient } from 'pg';
import { decimalToPg } from '../lib/pg-decimal.js';
import { toTRY, toGram } from '../types/decimal.js';
import type { Gram, TRYAmount } from '../types/decimal.js';

export type LedgerEntryType = 'debit' | 'credit';
export type LedgerReason =
  | 'purchase'
  | 'sale'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'fire'
  | 'scrap'
  | 'return';

export interface AppendLedgerInput {
  branch_id: string;
  product_id: string;
  gold_item_id?: string;
  entry_type: LedgerEntryType;
  quantity_g: Gram | string | number;
  unit_price_g: TRYAmount | string | number;
  transaction_id: string;
  reason: LedgerReason;
}

/** Önceki running_balance_g + yeni entry ile running_balance hesapla */
async function getNextRunningBalance(
  branchId: string,
  productId: string,
  entryType: LedgerEntryType,
  quantityG: string,
  client: PoolClient
): Promise<string> {
  const result = await client.query(
    `SELECT running_balance_g FROM stock_ledger
     WHERE branch_id = $1 AND product_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [branchId, productId]
  );
  const prev = toGram(result.rows[0]?.running_balance_g ?? '0');
  const qty = toGram(quantityG);
  const delta = entryType === 'debit' ? qty : qty.negated();
  const next = (prev as import('../types/decimal.js').Decimal)
    .plus(delta)
    .toFixed(6);
  return next;
}

/** Ledger satırı ekle (client transaction içinde çağrılmalı) */
export async function appendLedgerEntry(
  input: AppendLedgerInput,
  client: PoolClient
): Promise<void> {
  const qty = String(input.quantity_g);
  const priceVal =
    typeof input.unit_price_g === 'object' && input.unit_price_g !== null
      ? (input.unit_price_g as TRYAmount)
      : toTRY(input.unit_price_g);
  const price = decimalToPg(priceVal);

  const runningBalance = await getNextRunningBalance(
    input.branch_id,
    input.product_id,
    input.entry_type,
    qty,
    client
  );

  await client.query(
    `INSERT INTO stock_ledger (branch_id, product_id, gold_item_id, entry_type, quantity_g, unit_price_g, transaction_id, reason, running_balance_g)
     VALUES ($1, $2, $3, $4::ledger_entry_type, $5::numeric, $6::numeric, $7, $8::ledger_reason, $9::numeric)`,
    [
      input.branch_id,
      input.product_id,
      input.gold_item_id ?? null,
      input.entry_type,
      qty,
      price, // unit_price_g
      input.transaction_id,
      input.reason,
      runningBalance,
    ]
  );
}
