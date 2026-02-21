/**
 * Branded Decimal types - TDD: float yasak, tüm para/gram hesaplamaları
 * decimal.js ile yapılmalı.
 */

import DecimalConstructor from 'decimal.js';

/** Base Decimal instance type */
export type Decimal = InstanceType<typeof DecimalConstructor>;

/** Gram miktarı - NUMERIC(18,6) karşılığı */
export type Gram = Decimal & { readonly __brand: 'Gram' };

/** TRY tutarı / birim fiyat - NUMERIC(20,4) karşılığı */
export type TRYAmount = Decimal & { readonly __brand: 'TRYAmount' };

/** Oran / yüzde - NUMERIC(8,4) karşılığı */
export type Percent = Decimal & { readonly __brand: 'Percent' };

function brandGram(d: Decimal): Gram {
  return d as Gram;
}

function brandTRY(d: Decimal): TRYAmount {
  return d as TRYAmount;
}

function brandPercent(d: Decimal): Percent {
  return d as Percent;
}

/** String/number'dan Gram oluştur */
export function toGram(value: string | number | Decimal): Gram {
  return brandGram(new DecimalConstructor(value));
}

/** String/number'dan TRYAmount oluştur */
export function toTRY(value: string | number | Decimal): TRYAmount {
  return brandTRY(new DecimalConstructor(value));
}

/** String/number'dan Percent oluştur */
export function toPercent(value: string | number | Decimal): Percent {
  return brandPercent(new DecimalConstructor(value));
}

/** Gram × TRYAmount = TRYAmount */
export function gramTimesPrice(gram: Gram, pricePerGram: TRYAmount): TRYAmount {
  return brandTRY((gram as Decimal).times(pricePerGram as Decimal));
}

/** Gram + Gram = Gram */
export function addGram(a: Gram, b: Gram): Gram {
  return brandGram((a as Decimal).plus(b as Decimal));
}

/** Gram - Gram = Gram */
export function subGram(a: Gram, b: Gram): Gram {
  return brandGram((a as Decimal).minus(b as Decimal));
}
