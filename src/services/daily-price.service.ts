/**
 * DailyPrice service - INSERT-only, price lock
 * TDD: Immutable fiyat log; Price Lock FOR UPDATE SKIP LOCKED
 */

import pool from '../lib/db.js';
import type { PoolClient } from 'pg';
import { toTRY, type TRYAmount } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';

export type GoldType =
  | 'HAS'
  | '22A'
  | '18A'
  | '14A'
  | '9A'
  | 'PLATINUM'
  | 'NONE';

export interface DailyPriceRow {
  id: string;
  recorded_at: Date;
  gold_type: GoldType;
  buy_price: string;
  sell_price: string;
  source: string;
  recorded_by: string | null;
  is_backdated: boolean;
  original_price_id: string | null;
}

export interface CreatePriceInput {
  gold_type: GoldType;
  buy_price: TRYAmount | string | number;
  sell_price: TRYAmount | string | number;
  source: string;
  recorded_by?: string;
  is_backdated?: boolean;
  original_price_id?: string;
}

/** INSERT-only fiyat kaydı */
export async function createPrice(
  input: CreatePriceInput,
  client?: PoolClient
): Promise<DailyPriceRow> {
  const conn = client ?? (await pool.connect());
  try {
    const buy = toTRY(input.buy_price);
    const sell = toTRY(input.sell_price);
    if (sell.lessThan(buy)) {
      throw new Error('sell_price must be >= buy_price');
    }

    const result = await conn.query(
      `INSERT INTO daily_price (recorded_at, gold_type, buy_price, sell_price, source, recorded_by, is_backdated, original_price_id)
       VALUES (NOW(), $1::gold_type, $2::numeric, $3::numeric, $4, $5, $6, $7)
       RETURNING id, recorded_at, gold_type, buy_price, sell_price, source, recorded_by, is_backdated, original_price_id`,
      [
        input.gold_type,
        decimalToPg(buy),
        decimalToPg(sell),
        input.source,
        input.recorded_by ?? null,
        input.is_backdated ?? false,
        input.original_price_id ?? null,
      ]
    );
    return result.rows[0] as DailyPriceRow;
  } finally {
    if (!client) conn.release();
  }
}

/** En güncel fiyat (backdated hariç) */
export async function getLatestPrice(
  goldType: GoldType,
  client?: PoolClient
): Promise<DailyPriceRow | null> {
  const conn = client ?? (await pool.connect());
  try {
    const result = await conn.query(
      `SELECT id, recorded_at, gold_type, buy_price, sell_price, source, recorded_by, is_backdated, original_price_id
       FROM daily_price
       WHERE gold_type = $1::gold_type AND is_backdated = false
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [goldType]
    );
    return (result.rows[0] as DailyPriceRow) ?? null;
  } finally {
    if (!client) conn.release();
  }
}

/**
 * Price Lock: Transaction başında fiyatı sabitle
 * SELECT ... FOR UPDATE SKIP LOCKED → eşzamanlı satışlarda farklı satır alınabilir
 */
export async function lockPriceForTransaction(
  goldType: GoldType,
  client: PoolClient
): Promise<DailyPriceRow> {
  const result = await client.query(
    `SELECT id, recorded_at, gold_type, buy_price, sell_price, source, recorded_by, is_backdated, original_price_id
     FROM daily_price
     WHERE gold_type = $1::gold_type AND is_backdated = false
     ORDER BY recorded_at DESC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [goldType]
  );
  const row = result.rows[0] as DailyPriceRow | undefined;
  if (!row) {
    throw new Error(`No active price for gold_type=${goldType}`);
  }
  return row;
}

/** Backdated düzeltme: yeni kayıt, original_price_id referansı */
export async function createBackdatedPrice(
  input: CreatePriceInput & { original_price_id: string },
  recordedBy: string
): Promise<DailyPriceRow> {
  return createPrice(
    {
      ...input,
      is_backdated: true,
      original_price_id: input.original_price_id,
      recorded_by: recordedBy,
    },
    undefined
  );
}
