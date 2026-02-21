/**
 * Production Fire service - B1: Üretim fire, B3: Fire stoktan düşüm
 * input credit, output debit, fire credit (reason='fire')
 */

import pool from '../lib/db.js';
import { lockPriceForTransaction } from './daily-price.service.js';
import { appendLedgerEntry } from './stock-ledger.service.js';
import { toGram, toTRY, type Gram, type TRYAmount } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';
import type { GoldType } from './daily-price.service.js';

export interface ProductionFireInput {
  branch_id: string;
  input_product_id: string;
  output_product_id: string;
  input_quantity_g: Gram | number;
  output_quantity_g: Gram | number;
  fire_quantity_g: Gram | number;
  unit_price_g: TRYAmount | number;
  gold_type: GoldType;
  client_request_id?: string;
  notes?: string;
}

/** B1/B3: Üretim fire - input credit, output debit, fire credit (reason='fire') */
export async function createProductionFire(
  input: ProductionFireInput,
  createdBy: string
): Promise<{ id: string }> {
  const inputQty = toGram(input.input_quantity_g);
  const outputQty = toGram(input.output_quantity_g);
  const fireQty = toGram(input.fire_quantity_g);
  const unitPrice = toTRY(input.unit_price_g);

  const expectedOutput = inputQty.minus(fireQty);
  if (!outputQty.equals(expectedOutput)) {
    throw new Error(
      `output_quantity_g (${decimalToPg(outputQty)}) must equal input - fire (${decimalToPg(expectedOutput)})`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const priceRow = await lockPriceForTransaction(input.gold_type, client);
    const totalAmount = (outputQty as import('../types/decimal.js').Decimal)
      .times(unitPrice as import('../types/decimal.js').Decimal);

    const notes = `production_fire: input=${decimalToPg(inputQty)} output=${decimalToPg(outputQty)} fire=${decimalToPg(fireQty)}` + (input.notes ? ` | ${input.notes}` : '');
    const txnResult = await client.query(
      `INSERT INTO "transaction" (branch_id, type, quantity_g, unit_price_g, labor_amount, total_amount, daily_price_id, payment_method, client_request_id, notes, created_by)
       VALUES ($1, 'adjustment', $2::numeric, $3::numeric, 0, $4::numeric, $5, 'transfer', $6, $7, $8)
       RETURNING id`,
      [
        input.branch_id,
        decimalToPg(outputQty),
        decimalToPg(unitPrice),
        decimalToPg(totalAmount),
        priceRow.id,
        input.client_request_id ?? null,
        notes,
        createdBy,
      ]
    );
    const txnId = txnResult.rows[0].id;

    // input credit (output kısmı): hammadde → ürüne dönüşen kısım
    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: input.input_product_id,
        entry_type: 'credit',
        quantity_g: outputQty,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'adjustment',
      },
      client
    );

    // B3: fire credit (reason='fire') - fire stoktan düşüm
    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: input.input_product_id,
        entry_type: 'credit',
        quantity_g: fireQty,
        unit_price_g: unitPrice,
        transaction_id: txnId,
        reason: 'fire',
      },
      client
    );

    // output debit: ürüne ekle
    await appendLedgerEntry(
      {
        branch_id: input.branch_id,
        product_id: input.output_product_id,
        entry_type: 'debit',
        quantity_g: outputQty,
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
