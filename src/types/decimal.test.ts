import { describe, it, expect } from 'vitest';
import { toGram, toTRY, addGram, gramTimesPrice } from './decimal.js';

describe('Decimal branded types', () => {
  it('toGram creates Gram from string', () => {
    const g = toGram('4.5');
    expect(g.toFixed(6)).toBe('4.500000');
  });

  it('addGram adds two Grams', () => {
    const a = toGram('1.5');
    const b = toGram('2.25');
    const sum = addGram(a, b);
    expect(sum.toFixed(6)).toBe('3.750000');
  });

  it('gramTimesPrice calculates total TRY', () => {
    const gram = toGram('5');
    const price = toTRY('4825.50');
    const total = gramTimesPrice(gram, price);
    expect(total.toFixed(2)).toBe('24127.50');
  });
});
