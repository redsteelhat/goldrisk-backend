/**
 * FireRate service - Fire oranı, Product override → global
 */

import pool from '../lib/db.js';
import { toGram, toPercent, toTRY } from '../types/decimal.js';
import { decimalToPg } from '../lib/pg-decimal.js';
import type { GoldType } from './daily-price.service.js';

/** Etkin Fire oranı: Product.fire_rate_id → global aktif FireRate */
export async function getEffectiveFireRate(
  productId: string,
  goldType: GoldType
): Promise<number> {
  const result = await pool.query(
    `SELECT fr.rate_percent
     FROM product p
     LEFT JOIN fire_rate fr ON fr.id = p.fire_rate_id
       AND (fr.valid_until IS NULL OR fr.valid_until >= CURRENT_DATE)
       AND (fr.valid_from <= CURRENT_DATE)
     WHERE p.id = $1 AND fr.id IS NOT NULL
     UNION ALL
     SELECT fr.rate_percent
     FROM fire_rate fr
     WHERE fr.scope = 'global'
       AND (fr.gold_type IS NULL OR fr.gold_type::text = $2)
       AND fr.valid_from <= CURRENT_DATE
       AND (fr.valid_until IS NULL OR fr.valid_until >= CURRENT_DATE)
     LIMIT 1`,
    [productId, goldType]
  );
  const row = result.rows[0];
  if (row) return Number(row.rate_percent);
  const global = await pool.query(
    `SELECT rate_percent FROM fire_rate
     WHERE scope = 'global' AND (gold_type IS NULL OR gold_type::text = $1)
       AND valid_from <= CURRENT_DATE AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
     ORDER BY valid_from DESC LIMIT 1`,
    [goldType]
  );
  return global.rows[0] ? Number(global.rows[0].rate_percent) : 0;
}

/** Fire maliyeti: quantity_g × (rate_percent/100) × unit_price_g */
export function calculateFireCost(
  quantityG: number | string,
  ratePercent: number,
  unitPricePerGram: number | string
): string {
  const qty = toGram(quantityG);
  const rate = toPercent(ratePercent).div(100);
  const price = toTRY(unitPricePerGram);
  const fireCost = (qty as import('../types/decimal.js').Decimal)
    .times(rate)
    .times(price);
  return decimalToPg(fireCost as import('../types/decimal.js').TRYAmount);
}
