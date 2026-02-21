/**
 * PostgreSQL NUMERIC ↔ Decimal dönüşüm helper'ları
 * pg driver string döndürür; Decimal constructor string kabul eder.
 */

import DecimalConstructor from 'decimal.js';
import type { Gram, TRYAmount, Percent, Decimal } from '../types/decimal.js';

type PgNumeric = string | number | null;

export function pgToDecimal(value: PgNumeric): Decimal | null {
  if (value === null || value === undefined) return null;
  return new DecimalConstructor(String(value)) as Decimal;
}

export function pgToGram(value: PgNumeric): Gram | null {
  const d = pgToDecimal(value);
  return d ? (d as Gram) : null;
}

export function pgToTRY(value: PgNumeric): TRYAmount | null {
  const d = pgToDecimal(value);
  return d ? (d as TRYAmount) : null;
}

export function pgToPercent(value: PgNumeric): Percent | null {
  const d = pgToDecimal(value);
  return d ? (d as Percent) : null;
}

/** Decimal → PostgreSQL NUMERIC için string (query parametresi) */
export function decimalToPg(value: Decimal | Gram | TRYAmount | Percent): string {
  return (value as Decimal).toFixed();
}
